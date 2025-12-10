// app/api/aura_card/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

function toNum(v: any): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function getProfitabilitySummary(baseUrl: string, headers: Record<string, string>, walletAddress: string, chain: string) {
  const url = `${baseUrl}/wallets/${walletAddress}/profitability/summary?chain=${chain}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return null;
  const json = await resp.json().catch(() => null);
  return json;
}

type Holding = { usd: number; symbol?: string | null };

async function getWalletHoldings(baseUrl: string, headers: Record<string, string>, walletAddress: string, chain: string) {
  // Moralis: /wallets/{address}/tokens (cursor'lı)
  const map = new Map<string, Holding>();
  let cursor: string | null = null;
  let pages = 0;

  do {
    const url = new URL(`${baseUrl}/wallets/${walletAddress}/tokens`);
    url.searchParams.set('chain', chain);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const resp = await fetch(url.toString(), { headers });
    if (!resp.ok) break;

    const json: any = await resp.json().catch(() => ({}));
    const arr: any[] = Array.isArray(json?.result) ? json.result : [];

    for (const t of arr) {
      const addr = String(t?.token_address || '').toLowerCase();
      if (!addr) continue;
      const usd = toNum(t?.usd_value ?? 0);
      const sym = t?.symbol ? String(t.symbol) : undefined;
      const prev = map.get(addr)?.usd ?? 0;
      if (usd > prev) map.set(addr, { usd, symbol: sym });
    }

    cursor = json?.cursor ? String(json.cursor) : null;
    pages += 1;
  } while (cursor && pages < 5);

  return map;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const walletAddress = String(body?.walletAddress || '').trim();
    const chain = String(body?.chain || 'base');

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json({ success: false, error: 'Invalid walletAddress' }, { status: 400 });
    }

    const apiKey = process.env.MORALIS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'MORALIS_API_KEY not set' }, { status: 500 });
    }

    const headers = { accept: 'application/json', 'X-API-Key': apiKey };
    const baseUrl = 'https://deep-index.moralis.io/api/v2.2';
    const supabase = getSupabaseServerClient();

    // 1) All-time metrics
    const summary = await getProfitabilitySummary(baseUrl, headers, walletAddress, chain);
    if (!summary) {
      return NextResponse.json({ success: false, error: 'Failed to fetch profitability summary' }, { status: 502 });
    }
    const all_time_volume = Math.abs(toNum(summary?.total_trade_volume ?? 0));
    const all_time_pnl = toNum(summary?.total_realized_profit_usd ?? 0);

    // 2) Holdings
    const holdings = await getWalletHoldings(baseUrl, headers, walletAddress, chain);

    // 3) Whitelist (token_address [+ token_symbol] varsa)
    let whitelistRows: Array<{ token_address: string; token_symbol?: string | null }> | null = null;
    let whitelistError: string | null = null;

    // Önce symbol ile dene
    {
      const { data, error } = await supabase
        .from('whitelisted_tokens')
        .select('token_address, token_symbol');
      if (!error) {
        whitelistRows = (data || []).map((r: any) => ({
          token_address: String(r?.token_address || ''),
          token_symbol: r?.token_symbol ?? null,
        }));
      } else {
        whitelistError = error.message;
      }
    }

    // Tablo şemasında token_symbol yoksa yalnızca address ile tekrar çek
    if (!whitelistRows) {
      const { data, error } = await supabase
        .from('whitelisted_tokens')
        .select('token_address');
      if (error) {
        return NextResponse.json({ success: false, error: `Failed to load whitelisted tokens: ${error.message}` }, { status: 500 });
      }
      whitelistRows = (data || []).map((r: any) => ({
        token_address: String(r?.token_address || ''),
        token_symbol: null,
      }));
    }

    // 4) Intersection + max holding token'ı bul
    let bestAddr: string | null = null;
    let bestUsd = 0;
    let bestTicker: string | null = null;

    const whitelistMap = new Map<string, { symbol?: string | null }>();
    for (const r of whitelistRows) {
      const lc = r.token_address?.toLowerCase();
      if (lc) whitelistMap.set(lc, { symbol: r.token_symbol ?? null });
    }

    for (const [addr, h] of holdings.entries()) {
      if (!whitelistMap.has(addr)) continue;
      if (h.usd > bestUsd) {
        bestUsd = h.usd;
        bestAddr = addr;
        // Öncelik: Supabase token_symbol -> Moralis symbol -> null
        bestTicker = whitelistMap.get(addr)?.symbol || h.symbol || null;
      }
    }

    const dbWallet = walletAddress.toLowerCase();

    // 5) aura_card insert (HER çağrıda yeni satır)
    const { error: auraInsErr } = await supabase
      .from('aura_card')
      .insert({
        wallet_address: dbWallet,
        all_time_volume,
        all_time_pnl,
        holder_tag: bestTicker ?? null,
        // network, created_at, minted: DB default
      });

    if (auraInsErr) {
      return NextResponse.json({ success: false, error: auraInsErr.message }, { status: 500 });
    }


    // eslint-disable-next-line no-console
    console.log('[aura_card]', {
        wallet: walletAddress,
        chain,
        all_time_volume,
        all_time_pnl,
        holder_tag: bestTicker ?? null,
        holder_tag_source: bestAddr ? 'whitelist∩holdings' : 'none',
        debug: {
          whitelistError: whitelistError || undefined,
          top_holding_usd: bestUsd,
          top_holding_address: bestAddr || undefined,
        },
        timestamp: new Date().toISOString(),
      });
  
      return NextResponse.json({
        success: true,
        wallet: walletAddress,
        chain,
        data: {
          all_time_volume,
          all_time_pnl,
          holder_tag: bestTicker ?? null,
          holder_tag_source: bestAddr ? 'whitelist∩holdings' : 'none',
        },
        debug: {
          whitelistError: whitelistError || undefined,
          top_holding_usd: bestUsd,
          top_holding_address: bestAddr || undefined,
        },
        timestamp: new Date().toISOString(),
      });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}