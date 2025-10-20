import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { chain = 'base', batchSize = 1000, debugAddress } = await request.json().catch(() => ({}));
    const debugLc = typeof debugAddress === 'string' && debugAddress ? String(debugAddress).toLowerCase() : null;
    const debugInfo: any = debugLc
      ? { token: debugLc, inWhitelist: false, prevVolume: null, chunks: [], aggregatedVolume: 0, updatePath: null, computedRate: null }
      : null;

    const supabase = getSupabaseServerClient();

    // Load whitelist (+ previous total_volume_24h for rate calc)
    const { data: whitelistRows, error: whitelistError } = await supabase
      .from('whitelisted_tokens')
      .select('token_address,total_volume_24h');
    if (whitelistError) {
      return NextResponse.json(
        { success: false, error: `Failed to load whitelisted tokens: ${whitelistError.message}` },
        { status: 500 }
      );
    }

    const toNumber = (v: any) => {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const whitelistedAddresses: string[] = (whitelistRows || [])
      .map((r: any) => (r?.token_address || '').toLowerCase())
      .filter((s: string) => !!s);

    // Maps for case-preserving token and previous volume lookup
    const existingTokenMap = new Map<string, string>();          // lc -> original-cased token_address
    const existingVolumeMap = new Map<string, number>();         // lc -> previous total_volume_24h (number)

    (whitelistRows || []).forEach((r: any) => {
      const orig = String(r?.token_address || '');
      if (!orig) return;
      const lc = orig.toLowerCase();
      existingTokenMap.set(lc, orig);
      const prevVol = toNumber(r?.total_volume_24h ?? 0);
      existingVolumeMap.set(lc, prevVol);
    });

    if (debugInfo) {
      debugInfo.inWhitelist = existingTokenMap.has(debugLc!);
      debugInfo.prevVolume = existingVolumeMap.has(debugLc!) ? existingVolumeMap.get(debugLc!) : null;
      // eslint-disable-next-line no-console
    }

    if (whitelistedAddresses.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No whitelisted tokens', debug: debugInfo || undefined });
    }

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
      if (!resp.ok) {
        if (debugInfo && chunk.includes(debugLc!)) {
          // eslint-disable-next-line no-console
          console.log('[dexscreenr][debug] chunk with token failed', { status: resp.status, url });
        }
        continue;
      }

      const arr = await resp.json();
      const chunkSet = new Set(chunk.map(a => a.toLowerCase()));
      
      // Aggregate per-token (24h)
      type Agg = { count: number; volume: number; image_url?: string; };
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

        if (debugInfo && (baseAddr === debugLc || quoteAddr === debugLc)) {
          debugInfo.chunks.push({
            inChunk: chunkSet.has(debugLc!),
            baseAddr,
            quoteAddr,
            vol24,
            buys24,
            sells24,
            url,
          });
        }

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
        }
      }

      if (debugInfo && debugLc && agg[debugLc]) {
        debugInfo.aggregatedVolume += agg[debugLc].volume;
        // eslint-disable-next-line no-console
        console.log('[dexscreenr][debug] aggregated so far', { token: debugLc, addVolume: agg[debugLc].volume, total: debugInfo.aggregatedVolume });
      }

      const entries = Object.entries(agg); // [tokenLc, Agg]

      // Case-insensitive updates; compute total_volume_changing_rate using previous total_volume_24h
      const updates = entries
        .map(([lc, v]) => {
          const orig = existingTokenMap.get(lc);
          if (!orig) return null;
          const prev = toNumber(existingVolumeMap.get(lc) ?? 0);
          const rate = prev > 0 ? (v.volume - prev) / prev : null; // (new - prev) / prev
          if (debugInfo && lc === debugLc) {
            debugInfo.updatePath = 'update';
            debugInfo.computedRate = rate;
            // eslint-disable-next-line no-console
            console.log('[dexscreenr][debug] will update', { token: lc, prev, newVolume: v.volume, rate });
          }
          return { orig, ...v, rate };
        })
        .filter(Boolean) as Array<{ orig: string } & Agg & { rate: number | null }>;

      const inserts = entries
        .filter(([lc]) => !existingTokenMap.has(lc))
        .map(([lc, v]) => {
          if (debugInfo && lc === debugLc) {
            debugInfo.updatePath = 'insert';
            debugInfo.computedRate = null;
            // eslint-disable-next-line no-console
            console.log('[dexscreenr][debug] will insert (no prev volume -> rate null)', { token: lc, newVolume: v.volume });
          }
          return {
            token_address: lc,
            image_url: v.image_url ?? null,
            total_swaps_24h: v.count,
            total_volume_24h: v.volume,
            total_volume_changing_rate: null, // no previous volume -> no rate
            last_update: new Date().toISOString(),
          };
        });

      if (updates.length > 0) {
        await Promise.all(
          updates.map(u =>
            supabase
              .from('whitelisted_tokens')
              .update({
                image_url: u.image_url ?? undefined,
                total_swaps_24h: u.count,
                total_volume_24h: u.volume,
                total_volume_changing_rate: u.rate,
                last_update: new Date().toISOString(),
              })
              .eq('token_address', u.orig)
          )
        );
      }

      if (inserts.length > 0) {
        const { error: insertErr } = await supabase.from('whitelisted_tokens').insert(inserts);
        if (!insertErr) {
          for (const r of inserts) {
            existingTokenMap.set(r.token_address, r.token_address);
            existingVolumeMap.set(r.token_address, toNumber(r.total_volume_24h ?? 0));
          }
        }
      }

      updated += entries.length;
    }

    if (debugInfo) {
      // eslint-disable-next-line no-console
      console.log('[dexscreenr][debug] final', {
        token: debugInfo.token,
        inWhitelist: debugInfo.inWhitelist,
        prevVolume: debugInfo.prevVolume,
        aggregatedVolume: debugInfo.aggregatedVolume,
        updatePath: debugInfo.updatePath,
        computedRate: debugInfo.computedRate,
      });
    }

    return NextResponse.json({ success: true, updated, chain, timestamp: new Date().toISOString(), debug: debugInfo || undefined });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}