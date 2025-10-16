import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { chain = 'base', batchSize = 20 } = await request.json().catch(() => ({}));

    const supabase = getSupabaseServerClient();

    // Load whitelist
    const { data: whitelistRows, error: whitelistError } = await supabase
      .from('whitelisted_tokens')
      .select('token_address');
    if (whitelistError) {
      return NextResponse.json(
        { success: false, error: `Failed to load whitelisted tokens: ${whitelistError.message}` },
        { status: 500 }
      );
    }

    const whitelistedAddresses: string[] = (whitelistRows || [])
      .map((r: any) => (r?.token_address || '').toLowerCase())
      .filter((s: string) => !!s);

    if (whitelistedAddresses.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No whitelisted tokens' });
    }

    // Build a map of existing token_address (original casing) keyed by lowercase
    const existingTokenMap = new Map<string, string>();
    (whitelistRows || []).forEach((r: any) => {
      const orig = String(r?.token_address || '');
      if (orig) existingTokenMap.set(orig.toLowerCase(), orig);
    });

    // Chunk addresses
    const chunks: string[][] = [];
    const bs = Math.max(1, Math.min(50, Number(batchSize) || 20));
    for (let i = 0; i < whitelistedAddresses.length; i += bs) {
      chunks.push(whitelistedAddresses.slice(i, i + bs));
    }

    let updated = 0;

    for (const chunk of chunks) {
      const path = chunk.join(',');
      const url = `https://api.dexscreener.com/tokens/v1/${chain}/${path}`;
      const resp = await fetch(url, { headers: { accept: 'application/json' } });
      if (!resp.ok) continue;

      const arr = await resp.json();
      const chunkSet = new Set(chunk.map(a => a.toLowerCase()));
      
      // Aggregate per-token (24h)
      type Agg = { count: number; volume: number; image_url?: string };
      const agg: Record<string, Agg> = {};
      const ensure = (addr: string) => (agg[addr] ||= { count: 0, volume: 0 });
      
      for (const item of Array.isArray(arr) ? arr : []) {
        const vol24 = Number(item?.volume?.h24 ?? 0) || 0;
        const buys24 = Number(item?.txns?.h24?.buys ?? 0) || 0;
        const sells24 = Number(item?.txns?.h24?.sells ?? 0) || 0;
        const cnt = buys24 + sells24;
      
        const baseAddr = String(item?.baseToken?.address || '').toLowerCase();
        const quoteAddr = String(item?.quoteToken?.address || '').toLowerCase();
        const imageUrl = String(item?.info?.imageUrl || '') || undefined;

      
        // Base token
        if (baseAddr && chunkSet.has(baseAddr)) {
          const slot = ensure(baseAddr);
          slot.count += cnt;
          slot.volume += Math.abs(vol24);
          if (imageUrl && !slot.image_url) slot.image_url = imageUrl; // only base has imageUrl reliably
        }
      
        // Quote token
        if (quoteAddr && chunkSet.has(quoteAddr)) {
          const slot = ensure(quoteAddr);
          slot.count += cnt;
          slot.volume += Math.abs(vol24);
          // don't overwrite image_url for quote (Dexscreener doesn't supply it reliably)
        }
      }
      
      const entries = Object.entries(agg); // [tokenLc, Agg]
      
      // Case-insensitive updates; insert lowercase for new tokens
      const updates = entries
        .map(([lc, v]) => {
          const orig = existingTokenMap.get(lc);
          return orig ? { orig, ...v } : null;
        })
        .filter(Boolean) as Array<{ orig: string } & Agg>;
      
      const inserts = entries
        .filter(([lc]) => !existingTokenMap.has(lc))
        .map(([lc, v]) => ({
          token_address: lc,
          image_url: v.image_url ?? null,
          total_swaps_24h: v.count,
          total_volume_24h: v.volume,
          last_update: new Date().toISOString(),
        }));
      
      if (updates.length > 0) {
        await Promise.all(
          updates.map(u =>
            supabase
              .from('whitelisted_tokens')
              .update({
                image_url: u.image_url ?? undefined,       // only set if present
                total_swaps_24h: u.count,
                total_volume_24h: u.volume,
                last_update: new Date().toISOString(),
              })
              .eq('token_address', u.orig)
          )
        );
      }
      
      if (inserts.length > 0) {
        const { error: insertErr } = await supabase.from('whitelisted_tokens').insert(inserts);
        if (!insertErr) {
          for (const r of inserts) existingTokenMap.set(r.token_address, r.token_address);
        }
      }
      
      updated += entries.length;
    }

    return NextResponse.json({ success: true, updated, chain, timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}