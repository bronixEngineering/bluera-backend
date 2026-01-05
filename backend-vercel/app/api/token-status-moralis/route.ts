import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { chain = 'base', batchSize = 5, debugAddress } = await request.json().catch(() => ({}));
    const debugLc = typeof debugAddress === 'string' && debugAddress ? String(debugAddress).toLowerCase() : null;
    const debugInfo: any = debugLc
      ? { token: debugLc, inWhitelist: false, prevVolume: null, prevSwaps: null, aggregatedVolume: 0, aggregatedSwaps: 0, updatePath: null, computedRate: null, computedSwapRate: null }
      : null;

    const supabase = getSupabaseServerClient();

    // Load whitelist (+ previous totals for rate calc)
    const { data: whitelistRows, error: whitelistError } = await supabase
      .from('whitelisted_tokens')
      .select('token_address,total_volume_24h,total_swaps_24h');
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
    const existingTokenMap = new Map<string, string>();
    const existingVolumeMap = new Map<string, number>();
    const existingSwapsMap = new Map<string, number>();

    (whitelistRows || []).forEach((r: any) => {
      const orig = String(r?.token_address || '');
      if (!orig) return;
      const lc = orig.toLowerCase();
      existingTokenMap.set(lc, orig);
      const prevVol = toNumber(r?.total_volume_24h ?? 0);
      existingVolumeMap.set(lc, prevVol);
      const prevSwaps = toNumber(r?.total_swaps_24h ?? 0);
      existingSwapsMap.set(lc, prevSwaps);
    });

    if (debugInfo) {
      debugInfo.inWhitelist = existingTokenMap.has(debugLc!);
      debugInfo.prevVolume = existingVolumeMap.has(debugLc!) ? existingVolumeMap.get(debugLc!) : null;
      debugInfo.prevSwaps = existingSwapsMap.has(debugLc!) ? existingSwapsMap.get(debugLc!) : null;
    }

    if (whitelistedAddresses.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No whitelisted tokens', debug: debugInfo || undefined });
    }

    const apiKey = process.env.MORALIS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'MORALIS_API_KEY not set' }, { status: 500 });
    }

    const headers = { 
      accept: 'application/json', 
      'X-API-Key': apiKey 
    };

    let updated = 0;
    const batchSizeNum = Math.max(1, Math.min(5, Number(batchSize) || 3));

    // Process tokens in batches
    for (let i = 0; i < whitelistedAddresses.length; i += batchSizeNum) {
      const batch = whitelistedAddresses.slice(i, i + batchSizeNum);
      
      // Process each token individually
      for (const tokenAddress of batch) {
        try {
          const url = `https://deep-index.moralis.io/api/v2.2/tokens/${tokenAddress}/analytics?chain=${chain}`;
          
          const resp = await fetch(url, { headers });
          
          if (!resp.ok) {
            const errorText = await resp.text();
            if (debugInfo && tokenAddress === debugLc) {
              debugInfo.error = `API Error: ${resp.status} - ${errorText}`;
            }
            continue;
          }

          const data = await resp.json();
          
          // Extract 24h data from the new API response structure
          const buyVolume24h = toNumber(data?.totalBuyVolume?.["24h"] ?? 0);
          const sellVolume24h = toNumber(data?.totalSellVolume?.["24h"] ?? 0);
          const vol24 = buyVolume24h + sellVolume24h;
          
          const buys24 = toNumber(data?.totalBuys?.["24h"] ?? 0);
          const sells24 = toNumber(data?.totalSells?.["24h"] ?? 0);
          const totalSwaps24h = buys24 + sells24;

          // Extract additional data from the new API response
          const usdPrice = data?.usdPrice ? String(data.usdPrice) : null;
          const totalLiquidityUsd = data?.totalLiquidityUsd ? String(data.totalLiquidityUsd) : null;
          const totalFullyDilutedValuation = data?.totalFullyDilutedValuation ? String(data.totalFullyDilutedValuation) : null;
          
          // Extract price percent changes as JSONB
          const pricePercentChange = data?.pricePercentChange ? {
            "5m": toNumber(data.pricePercentChange["5m"]),
            "1h": toNumber(data.pricePercentChange["1h"]),
            "6h": toNumber(data.pricePercentChange["6h"]),
            "24h": toNumber(data.pricePercentChange["24h"])
          } : null;

          if (debugInfo && tokenAddress === debugLc) {
            debugInfo.aggregatedVolume = vol24;
            debugInfo.aggregatedSwaps = totalSwaps24h;
            debugInfo.processedData = {
              buyVolume24h,
              sellVolume24h,
              vol24,
              buys24,
              sells24,
              totalSwaps24h,
              usdPrice,
              totalLiquidityUsd,
              totalFullyDilutedValuation,
              pricePercentChange
            };
          }

          // Skip if no volume data
          if (vol24 === 0) {
            continue;
          }

          const orig = existingTokenMap.get(tokenAddress);
          if (!orig) {
            continue;
          }

          const prevVol = toNumber(existingVolumeMap.get(tokenAddress) ?? 0);
          const volumeRate = prevVol > 0 ? (vol24 - prevVol) / prevVol : null;

          const prevSwaps = toNumber(existingSwapsMap.get(tokenAddress) ?? 0);
          const swapsRate = prevSwaps > 0 ? (totalSwaps24h - prevSwaps) / prevSwaps : null;

          if (debugInfo && tokenAddress === debugLc) {
            debugInfo.computedRate = volumeRate;
            debugInfo.computedSwapRate = swapsRate;
          }

          // Update database with new schema
          const { error: updateErr } = await supabase
            .from('whitelisted_tokens')
            .update({
              total_swaps_24h: totalSwaps24h,
              total_volume_24h: vol24,
              total_volume_changing_rate: volumeRate,
              total_swap_changing_rate: swapsRate,
              last_update: new Date().toISOString(),
              usd_price: usdPrice,
              total_liquidity_usd: totalLiquidityUsd,
              total_fully_diluted_valuation: totalFullyDilutedValuation,
              price_percent_change: pricePercentChange,
              // Note: token_ticker, token_type, image_url are not provided by Moralis API
              // These would need to be set separately or through a different data source
            })
            .eq('token_address', orig);

          if (!updateErr) {
            updated += 1;
            // Update local maps for rate calculations
            existingVolumeMap.set(tokenAddress, vol24);
            existingSwapsMap.set(tokenAddress, totalSwaps24h);
          }

        } catch (error: any) {
          if (debugInfo && tokenAddress === debugLc) {
            debugInfo.error = error.message;
          }
          continue;
        }
      }

      // Delay between batches to avoid rate limits
      if (i + batchSizeNum < whitelistedAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return NextResponse.json({ 
      success: true, 
      updated, 
      chain, 
      timestamp: new Date().toISOString(), 
      debug: debugInfo || undefined 
    });
  } catch (e: any) {
    console.error('Fatal error:', e);
    return NextResponse.json({ success: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}