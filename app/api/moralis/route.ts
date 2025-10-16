import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { walletAddress, include, fid } = await request.json();
    
    const apiKey = process.env.MORALIS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'MORALIS_API_KEY not found in environment' },
        { status: 500 }
      );
    }

    const baseUrl = 'https://deep-index.moralis.io/api/v2.2';
    const headers = { 'X-API-Key': apiKey };

    // Load whitelisted tokens from Supabase (used for filtering and balances)
    const supabase = getSupabaseServerClient();
    const { data: whitelistRows, error: whitelistError } = await supabase
      .from('whitelisted_tokens')
      .select('token_address');
    if (whitelistError) {
      return NextResponse.json(
        { error: `Failed to load whitelisted tokens: ${whitelistError.message}` },
        { status: 500 }
      );
    }
    const whitelistedAddresses: string[] = (whitelistRows || [])
      .map((r: any) => (r?.token_address || '').toLowerCase())
      .filter((s: string) => !!s);

    // Build URLs with proper encoding
    const transfersParams = new URLSearchParams({ chain: 'base' });
    for (const addr of whitelistedAddresses) {
      transfersParams.append('contract_addresses[]', addr);
    }
    const transfersUrl = `${baseUrl}/${walletAddress}/erc20/transfers?${transfersParams.toString()}`;
    const swapsUrl = `${baseUrl}/wallets/${walletAddress}/swaps?chain=base`;
    
    // Net Worth URL (minimal params for compatibility)
    const netWorthParams = new URLSearchParams();
    netWorthParams.append('chains[]', 'base');
    const netWorthUrl = `${baseUrl}/wallets/${walletAddress}/net-worth?${netWorthParams.toString()}`;

    
    const profitabilityUrl = `${baseUrl}/wallets/${walletAddress}/profitability/summary?days=30&chain=base`;
    const walletStatsUrl = `${baseUrl}/wallets/${walletAddress}/stats?chain=base`;
    
    // Token balances URL with optional token address filters
    let tokenBalancesUrl: string | null = null;
    if (Array.isArray(include) && include.includes('tokenBalances')) {
      const tbParams = new URLSearchParams({ chain: 'base' });
      for (const addr of whitelistedAddresses) tbParams.append('token_addresses[]', addr);
      tokenBalancesUrl = `${baseUrl}/wallets/${walletAddress}/tokens?${tbParams.toString()}`;
    }

    // Determine which endpoints to include
    const allowedKeys = ['transfers', 'swaps', 'netWorth', 'profitability', 'walletStats', 'tokenBalances'] as const;
    const includeSet = new Set(
      Array.isArray(include)
        ? include.filter((k: string) => allowedKeys.includes(k as any))
        : allowedKeys
    );

    const tasks: Array<{ key: 'transfers' | 'swaps' | 'netWorth' | 'profitability' | 'walletStats' | 'tokenBalances', name: string, url: string }>
      = [];
    if (includeSet.has('transfers')) tasks.push({ key: 'transfers', name: 'ERC20 Transfers', url: transfersUrl });
    if (includeSet.has('swaps')) tasks.push({ key: 'swaps', name: 'Swaps', url: swapsUrl });
    if (includeSet.has('netWorth')) tasks.push({ key: 'netWorth', name: 'Net Worth', url: netWorthUrl });
    if (includeSet.has('profitability')) tasks.push({ key: 'profitability', name: 'Profitability', url: profitabilityUrl });
    if (includeSet.has('walletStats')) tasks.push({ key: 'walletStats', name: 'Wallet Stats', url: walletStatsUrl });
    if (includeSet.has('tokenBalances') && tokenBalancesUrl) tasks.push({ key: 'tokenBalances', name: 'Token Balances', url: tokenBalancesUrl });

    // Prepare request details for UI
    const requests = tasks.map(t => ({
      name: t.name,
      url: t.url,
      method: 'GET',
      headers: { 'X-API-Key': '[HIDDEN]' }
    }));

    // Parallel API calls with timing
    const startTime = Date.now();
    
    const fetchResponses = await Promise.all(tasks.map(t => fetch(t.url, { headers })));

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    const parsed = await Promise.all(fetchResponses.map(r => r.json()));

    // Prepare response details
    const responses = fetchResponses.map((res, idx) => ({
      name: tasks[idx].name,
      status: res.status,
      statusText: res.statusText,
      data: parsed[idx],
      size: JSON.stringify(parsed[idx]).length
    }));

    // Build data object keyed by requested endpoints
    const data: Record<string, any> = {};
    tasks.forEach((t, idx) => { data[t.key] = parsed[idx]; });

    // Compute derived metrics for wallet stats if included
    if (includeSet.has('walletStats')) {
      const idx = tasks.findIndex(t => t.key === 'walletStats');
      if (idx !== -1) {
        const stats = parsed[idx] ?? {};

        const tokenTransfersTotal = Number(stats?.token_transfers?.total ?? 0);
        const totalActivity = (Number.isFinite(tokenTransfersTotal) ? tokenTransfersTotal : 0);
        data.walletStatsComputed = {
          tokenTransfersTotal: Number.isFinite(tokenTransfersTotal) ? tokenTransfersTotal : 0,
          totalActivity,
        };
      }
    }


    // Compute derived metrics for token balances if included (only usd_value is needed)
    if (includeSet.has('tokenBalances')) {
      const idx = tasks.findIndex(t => t.key === 'tokenBalances');
      if (idx !== -1) {
        const tb = parsed[idx] ?? {};
        const usdValues: number[] = Array.isArray(tb?.result)
          ? tb.result.map((r: any) => Number(r?.usd_value ?? 0)).map((v: number) => (Number.isFinite(v) ? v : 0))
          : [];
        const totalUsdValue = usdValues.reduce((sum, v) => sum + v, 0);
        data.tokenBalancesComputed = {
          usdValues,
          totalUsdValue,
        };
      }
    }

    // Compute how many whitelisted tokens are currently held by the wallet
    const heldWhitelistedTokens = (() => {
      try {
        if (!includeSet.has('tokenBalances')) return { count: 0, token_addresses: [] as string[] };
        const tb = data.tokenBalances;
        const arr = Array.isArray(tb?.result) ? tb.result : [];
        const wlSet = new Set(whitelistedAddresses);
        const heldList: string[] = [];
        for (const r of arr) {
          const addr = (r?.token_address || r?.address || '').toLowerCase();
          if (!wlSet.has(addr)) continue;
          const usd = typeof r?.usd_value === 'string' ? parseFloat(r.usd_value) : Number(r?.usd_value ?? 0);
          const bal = typeof r?.balance_formatted === 'string' ? parseFloat(r.balance_formatted) : Number(r?.balance_formatted ?? 0);
          if ((Number.isFinite(usd) && usd > 0) || (Number.isFinite(bal) && bal > 0)) heldList.push(addr);
        }
        const uniq = Array.from(new Set(heldList));
        return { count: uniq.length, token_addresses: uniq };
      } catch {
        return { count: 0, token_addresses: [] as string[] };
      }
    })();

    // Compute consolidated metrics for wallets_status
    const totalSwapVolume = (() => {
      const swaps = data.swaps;
      const arr = Array.isArray(swaps?.result) ? swaps.result : [];
      return arr.reduce((sum: number, s: any) => {
        const boughtUsd = (() => {
          const v = s?.bought?.usdAmount ?? 0;
          const n = typeof v === 'string' ? parseFloat(v) : Number(v);
          return Number.isFinite(n) ? Math.abs(n) : 0;
        })();
        const soldUsd = (() => {
          const v = s?.sold?.usdAmount ?? 0;
          const n = typeof v === 'string' ? parseFloat(v) : Number(v);
          return Number.isFinite(n) ? Math.abs(n) : 0;
        })();
        const totalValueUsd = (() => {
          const v = s?.totalValueUsd ?? s?.value_usd ?? 0;
          const n = typeof v === 'string' ? parseFloat(v) : Number(v);
          return Number.isFinite(n) ? Math.abs(n) : 0;
        })();
        // Use a single representative USD amount per swap to avoid double counting
        const representativeUsd = Math.max(boughtUsd, soldUsd, totalValueUsd);
        return sum + representativeUsd;
      }, 0);
    })();

    const netWorthUsd = (() => {
      const nw = data.netWorth;
      const total = nw?.total_networth_usd;
      const totalNum = typeof total === 'string' ? parseFloat(total) : Number(total ?? 0);
      if (Number.isFinite(totalNum) && totalNum > 0) return totalNum;
      const chains = Array.isArray(nw?.chains) ? nw.chains : [];
      const sum = chains.reduce((acc: number, c: any) => {
        const v = typeof c?.networth_usd === 'string' ? parseFloat(c.networth_usd) : Number(c?.networth_usd ?? 0);
        return acc + (Number.isFinite(v) ? v : 0);
      }, 0);
      return Number.isFinite(sum) ? sum : 0;
    })();

    const pnlUsd = (() => {
      const prof = data.profitability;
      const v = prof?.total_usd_pnl ?? prof?.total_realized_profit_usd ?? 0;
      const num = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(num) ? num : 0;
    })();

    // Prefer profitability summary's total_trade_volume when available; fallback to swaps-derived volume
    const totalTradeVolumeFromProfitability = (() => {
      const v = data?.profitability?.total_trade_volume ?? 0;
      const num = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(num) ? num : 0;
    })();
    const totalVolume = totalTradeVolumeFromProfitability > 0
      ? totalTradeVolumeFromProfitability
      : totalSwapVolume;
    const totalActivity = (() => {
      // Prefer counting unique swaps (each swap is a single tx)
      const swapsArr = Array.isArray(data?.swaps?.result) ? data.swaps.result : [];
      if (swapsArr.length > 0) {
        const set = new Set<string>();
        for (const s of swapsArr) {
          const h = String(s?.transactionHash || s?.hash || '');
          if (h) set.add(h);
        }
        return set.size;
      }
      // Fallback to unique transfer transaction hashes
      const transfersArr = Array.isArray(data?.transfers?.result) ? data.transfers.result : [];
      const set = new Set<string>();
      for (const t of transfersArr) {
        const h = String(t?.transaction_hash || t?.transactionHash || '');
        if (h) set.add(h);
      }
      return set.size;
    })();

    const walletsStatus = {
      wallet_address: walletAddress,
      total_tx_count: totalActivity,
      total_volume: totalVolume,
      net_worth: netWorthUsd,
      pnl: pnlUsd,
      fid: (typeof fid === 'number' && Number.isFinite(fid)) ? fid : null as number | null,
    };

    // Aggregate per-token stats and upsert into wallet_token_status
    let walletTokenStatus = { success: false as boolean, error: null as string | null, inserted: 0 };
    try {
      // Build holding USD map from tokenBalances (if included)
      const balancesByToken: Record<string, number> = (() => {
        if (!includeSet.has('tokenBalances')) return {};
        const tb = data.tokenBalances;
        const arr = Array.isArray(tb?.result) ? tb.result : [];
        const map: Record<string, number> = {};
        for (const r of arr) {
          const addr = (r?.token_address || r?.address || '').toLowerCase();
          const v = typeof r?.usd_value === 'string' ? parseFloat(r.usd_value) : Number(r?.usd_value ?? 0);
          if (addr) map[addr] = Number.isFinite(v) ? v : 0;
        }
        return map;
      })();

            // Build per-token counts and USD volume from ALL swap pages
      const wlSet = new Set(whitelistedAddresses);
      const transferCountsByToken: Record<string, number> = {};
      const usdVolumeByToken: Record<string, number> = {};
      const seenKeys = new Set<string>();

      const norm = (v: any) => String(v || '').toLowerCase();
      const getAddr = (side: any) =>
        norm(side?.address || side?.token?.address || side?.token_address || side?.contractAddress || side?.contract_address);
      const toUsd = (v: any) => {
        const n = typeof v === 'string' ? parseFloat(v) : Number(v);
        return Number.isFinite(n) ? Math.abs(n) : 0;
      };
      const getUsd = (side: any) => toUsd(side?.usdAmount ?? side?.usd_value ?? side?.valueUsd ?? side?.value_usd ?? 0);

      const processSwaps = (arr: any[]) => {
        for (const s of arr) {
          const txHash = String(s?.transactionHash || s?.hash || '');
          const boughtSide = s?.bought || s?.buy || s?.tokenIn;
          const soldSide  = s?.sold  || s?.sell || s?.tokenOut;
          const boughtAddr = getAddr(boughtSide);
          const soldAddr  = getAddr(soldSide);
          const boughtUsd = getUsd(boughtSide);
          const soldUsd   = getUsd(soldSide);

          for (const addr of [boughtAddr, soldAddr]) {
            if (!addr || !txHash || !wlSet.has(addr)) continue;
            const key = `${addr}:${txHash}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            transferCountsByToken[addr] = (transferCountsByToken[addr] || 0) + 1;
          }

          if (boughtAddr && wlSet.has(boughtAddr)) {
            usdVolumeByToken[boughtAddr] = (usdVolumeByToken[boughtAddr] || 0) + boughtUsd;
          }
          if (soldAddr && wlSet.has(soldAddr)) {
            usdVolumeByToken[soldAddr] = (usdVolumeByToken[soldAddr] || 0) + soldUsd;
          }
        }
      };

      // first page
      processSwaps(Array.isArray(data?.swaps?.result) ? data.swaps.result : []);

      // paginate up to 5 pages total (100 per page → max 500 swaps)
      let cursor: string | null = (data?.swaps?.cursor as string) || null;
      let pages = 1; // first page already processed

      while (cursor && pages < 5) {
        const url = new URL(`${baseUrl}/wallets/${walletAddress}/swaps`);
        url.searchParams.set('chain', 'base');
        url.searchParams.set('order', 'DESC');
        url.searchParams.set('limit', '100');
        url.searchParams.set('cursor', cursor);

        const resp = await fetch(url.toString(), { headers });
        if (!resp.ok) break;

        const page = await resp.json();
        processSwaps(Array.isArray(page?.result) ? page.result : []);
        cursor = (page?.cursor as string) || null;
        pages += 1;
      }
      console.log('transferCountsByToken', transferCountsByToken);
      console.log('usdVolumeByToken', usdVolumeByToken);

      const tokenAddresses = Array.from(new Set([
        ...Object.keys(transferCountsByToken),
        ...Object.keys(usdVolumeByToken),
        ...Object.keys(balancesByToken), // include tokens only held (no swaps/transfers)
      ]));
      if (tokenAddresses.length > 0) {
        const rows = tokenAddresses.map((addr) => ({
          wallet_address: walletAddress,
          token_address: addr,
          token_transfer_count: transferCountsByToken[addr] || 0,
          token_volume: usdVolumeByToken[addr] || 0, // USD volume from swaps
          holding_amount_usd: balancesByToken[addr] ?? 0,
        }));
        // No unique constraint present; do update-then-insert per row
        let processed = 0;
        for (const row of rows) {
          const { error: updErr, data: updData } = await supabase
            .from('wallet_token_status')
            .update({
              token_transfer_count: row.token_transfer_count,
              token_volume: row.token_volume,
              holding_amount_usd: row.holding_amount_usd,
            })
            .eq('wallet_address', row.wallet_address)
            .eq('token_address', row.token_address)
            .select('id');
          if (updErr) {
            walletTokenStatus = { success: false, error: updErr.message, inserted: processed };
            break;
          }
          if (Array.isArray(updData) && updData.length > 0) {
            processed += 1;
            continue;
          }
          const { error: insErr } = await supabase
            .from('wallet_token_status')
            .insert([row]);
          if (insErr) {
            walletTokenStatus = { success: false, error: insErr.message, inserted: processed };
            break;
          }
          processed += 1;
        }
        if (processed === rows.length) {
          walletTokenStatus = { success: true, error: null, inserted: processed };
        }
      } else {
        walletTokenStatus = { success: true, error: null, inserted: 0 };
      }
    } catch (e: any) {
      walletTokenStatus = { success: false, error: e?.message ?? 'Unknown error', inserted: 0 };
    }

    // Attempt Supabase upsert for wallets_status (non-fatal)
    let db = { success: false as boolean, error: null as string | null };
    let dbFid = { success: false as boolean, error: null as string | null };
    try {
      const { error: upsertError } = await supabase
        .from('wallets_status')
        .upsert([walletsStatus], { onConflict: 'wallet_address' });
      if (upsertError) db = { success: false, error: upsertError.message };
      else db = { success: true, error: null };

      if (typeof fid === 'number' && Number.isFinite(fid)) {
        const { error: fidError } = await supabase
          .from('users_fid')
          .upsert([{ fid }], { onConflict: 'fid' });
        if (fidError) dbFid = { success: false, error: fidError.message };
        else dbFid = { success: true, error: null };
      }
    } catch (e: any) {
      db = { success: false, error: e?.message ?? 'Unknown error' };
    }

    return NextResponse.json({
      success: true,
      wallet: walletAddress,
      timing: {
        totalTime: `${totalTime}ms`,
        requestCount: tasks.length
      },
      requests,
      responses,
      included: Array.from(includeSet),
      data,
      walletsStatus,
      db,
      dbFid,
      walletTokenStatus,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
