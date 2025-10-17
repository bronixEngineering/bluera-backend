// app/api/wallet-token-status-moralis/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

type SwapItem = {
  transactionHash?: string;
  transactionType?: string; // 'buy' | 'sell'
  totalValueUsd?: number | string;
  blockTimestamp?: string;
  block_timestamp?: string;
};

function fromHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function toNum(v: any): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const walletAddress = String(body?.walletAddress || '').trim();
    const chain = String(body?.chain || 'base');
    const hours = Number.isFinite(body?.hours) ? Math.max(1, Math.min(168, Number(body.hours))) : 24;
    const maxPages = Number.isFinite(body?.maxPages) ? Math.max(1, Math.min(10, Number(body.maxPages))) : 5;
    const debugEnabled = !!body?.debug;
    const debugToken = body?.debugToken ? String(body.debugToken).toLowerCase() : null;

    const debug: any = { input: { walletAddress, chain, hours, maxPages, debugToken }, steps: [], errors: [] };
    const log = (...args: any[]) => { if (debugEnabled) console.log('[WTS]', ...args); };
    const err = (...args: any[]) => { console.error('[WTS][ERR]', ...args); debug.errors.push(args.map(String).join(' ')); };

    log('request-received', debug.input);

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      err('invalid-walletAddress');
      return NextResponse.json({ success: false, error: 'Invalid walletAddress', debug }, { status: 400 });
    }

    const apiKey = process.env.MORALIS_API_KEY;
    if (!apiKey) {
      err('missing-MORALIS_API_KEY');
      return NextResponse.json({ success: false, error: 'MORALIS_API_KEY not set', debug }, { status: 500 });
    }
    const headers = { accept: 'application/json', 'X-API-Key': apiKey };
    const baseUrl = 'https://deep-index.moralis.io/api/v2.2';

    // Supabase client
    let supabase;
    try {
      supabase = getSupabaseServerClient();
    } catch (e: any) {
      err('supabase-client-error', e?.message);
      return NextResponse.json({ success: false, error: e?.message || 'supabase init failed', debug }, { status: 500 });
    }

    // 1) Whitelist
    const { data: wl, error: wlErr } = await supabase
      .from('whitelisted_tokens')
      .select('token_address');
    if (wlErr) {
      err('whitelist-load-failed', wlErr.message);
      return NextResponse.json({ success: false, error: `Failed to load whitelisted tokens: ${wlErr.message}`, debug }, { status: 500 });
    }

    const tokenAddresses: string[] = (wl || [])
      .map((r: any) => String(r?.token_address || '').toLowerCase())
      .filter(Boolean);

    log('whitelist-size', tokenAddresses.length);

    if (tokenAddresses.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No whitelisted tokens', debug });
    }

    const walletLc = walletAddress.toLowerCase();
    const fromDate = fromHoursAgo(hours);

    // 2) Holdings (tokens)
    const holdingUsdMap = new Map<string, number>();
    let cursor: string | null = null;
    let pagesTokens = 0;
    try {
      do {
        const url = new URL(`${baseUrl}/wallets/${walletAddress}/tokens`);
        url.searchParams.set('chain', chain);
        url.searchParams.set('limit', '100');
        if (cursor) url.searchParams.set('cursor', cursor);

        const resp = await fetch(url.toString(), { headers });
        if (!resp.ok) {
          err('holdings-fetch-not-ok', resp.status);
          break;
        }

        const json: any = await resp.json().catch(() => ({}));
        const arr: any[] = Array.isArray(json?.result) ? json.result : [];
        for (const t of arr) {
          const addr = String(t?.token_address || '').toLowerCase();
          if (!addr) continue;
          holdingUsdMap.set(addr, toNum(t?.usd_value ?? 0));
        }

        cursor = json?.cursor ? String(json.cursor) : null;
        pagesTokens += 1;
      } while (cursor && pagesTokens < 5);
    } catch (e: any) {
      err('holdings-fetch-exception', e?.message);
    }
    log('holdings-collected', { uniqueTokens: holdingUsdMap.size, pagesTokens });

    // 3) Iterate whitelisted tokens
    const results: Array<{
      token: string;
      count: number;
      volume: number;
      holding_usd: number;
      updated: boolean;
      upErr?: string | null;
      insErr?: string | null;
    }> = [];

    let processed = 0;
    for (const token of tokenAddresses) {
      // daraltma: sadece debugToken ise logla
      const traceThis = debugEnabled && (!debugToken || debugToken === token);

      const swapsUrl = new URL(`${baseUrl}/wallets/${walletAddress}/swaps`);
      swapsUrl.searchParams.set('chain', chain);
      swapsUrl.searchParams.set('order', 'DESC');
      swapsUrl.searchParams.set('tokenAddress', token);
      swapsUrl.searchParams.set('from_date', fromDate.toISOString());

      let pages = 0;
      let cur: string | null = null;
      let count = 0;
      let volume = 0;

      while (pages < maxPages) {
        const pageUrl = new URL(swapsUrl.toString());
        if (cur) pageUrl.searchParams.set('cursor', cur);

        let resp: Response;
        try {
          resp = await fetch(pageUrl.toString(), { headers });
        } catch (e: any) {
          if (traceThis) err('swaps-fetch-network', e?.message, { token });
          break;
        }
        if (!resp.ok) {
          if (traceThis) err('swaps-fetch-not-ok', resp.status, { token });
          break;
        }

        let json: any;
        try {
          json = await resp.json();
        } catch (e: any) {
          if (traceThis) err('swaps-json-parse', e?.message, { token });
          break;
        }

        const arr: SwapItem[] = Array.isArray(json?.result) ? json.result : [];
        if (arr.length === 0) break;

        for (const s of arr) {
          const v = toNum((s as any)?.totalValueUsd ?? 0);
          if (v > 0) volume += Math.abs(v);
          count += 1;
        }

        cur = json?.cursor ? String(json.cursor) : null;
        pages += 1;
        if (!cur) break;
      }

      if (traceThis) log('token-aggregate', { token, count, volume });

      // API null/empty ise bu tokenı atla (yazma yok)
      if (count === 0) {
        results.push({ token, count, volume, holding_usd: holdingUsdMap.get(token) ?? 0, updated: false });
        continue;
      }

      const holdingUsd = holdingUsdMap.get(token) ?? 0;
      console.log("holdingUsd", holdingUsd);
      const updateFields = { token_transfer_count: count, token_volume: volume, holding_amount_usd: holdingUsd };
      console.log("updateFields", updateFields);
      // Update
      const { data: upd, error: upErr } = await supabase
        .from('wallet_token_status')
        .update(updateFields)
        .eq('wallet_address', walletLc)
        .eq('token_address', token)
        .select('id');

      if (upErr) {
        if (traceThis) err('supabase-update-error', upErr.message, { token, walletLc });
        // Insert dene
        const { error: insErr } = await supabase.from('wallet_token_status').insert({
          wallet_address: walletLc,
          token_address: token,
          ...updateFields,
        });
        if (insErr) {
          if (traceThis) err('supabase-insert-error', insErr.message, { token, walletLc });
          results.push({ token, count, volume, holding_usd: holdingUsd, updated: false, upErr: upErr.message, insErr: insErr.message });
        } else {
          if (traceThis) log('supabase-insert-ok', { token });
          results.push({ token, count, volume, holding_usd: holdingUsd, updated: true, upErr: upErr.message, insErr: null });
        }
      } else {
        if (!upd || upd.length === 0) {
          // Row yoksa insert
          const { error: insErr } = await supabase.from('wallet_token_status').insert({
            wallet_address: walletLc,
            token_address: token,
            ...updateFields,
          });
          if (insErr) {
            if (traceThis) err('supabase-insert-after-empty-update-error', insErr.message, { token, walletLc });
            results.push({ token, count, volume, holding_usd: holdingUsd, updated: false, insErr: insErr.message });
          } else {
            if (traceThis) log('supabase-insert-after-empty-update-ok', { token });
            results.push({ token, count, volume, holding_usd: holdingUsd, updated: true });
          }
        } else {
          if (traceThis) log('supabase-update-ok', { token, updatedRows: upd.length });
          results.push({ token, count, volume, holding_usd: holdingUsd, updated: true });
        }
      }

      processed += 1;
      // Çok gürültüyse sadece ilk birkaç tokenı izlemek için break eklenebilir.
    }

    const updated = results.filter(r => r.updated).length;
    log('done', { processed, updated });

    return NextResponse.json({
      success: true,
      wallet: walletAddress,
      chain,
      hours,
      updated,
      processed: results.length,
      results,
      debug: debugEnabled ? debug : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[WTS][FATAL]', e?.message);
    return NextResponse.json({ success: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}