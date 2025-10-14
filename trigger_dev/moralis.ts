import { task } from "@trigger.dev/sdk/v3";
import { getSupabaseServerClient } from "@/lib/supabase";

type Payload = {
  walletAddress: string;
};

export const moralisJob = task({
  id: "moralis-refresh",
  maxDuration: 300,
  run: async (payload: Payload) => {
    const { walletAddress } = payload ?? ({} as Payload);

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return { success: false, error: "Invalid walletAddress" };
    }

    const apiKey = process.env.MORALIS_API_KEY;
    if (!apiKey) {
      return { success: false, error: "MORALIS_API_KEY not set" };
    }

    const baseUrl = "https://deep-index.moralis.io/api/v2.2";
    const headers = { "X-API-Key": apiKey };
    const supabase = getSupabaseServerClient();

    // Load whitelist
    const { data: whitelistRows, error: whitelistError } = await supabase
      .from("whitelisted_tokens")
      .select("token_address");
    if (whitelistError) {
      return { success: false, error: `Failed to load whitelisted tokens: ${whitelistError.message}` };
    }
    const whitelistedAddresses: string[] = (whitelistRows || [])
      .map((r: any) => (r?.token_address || "").toLowerCase())
      .filter((s: string) => !!s);

    // Build Moralis URLs (run all endpoints)
    const transfersParams = new URLSearchParams({ chain: "base" });
    for (const addr of whitelistedAddresses) transfersParams.append("contract_addresses[]", addr);
    const transfersUrl = `${baseUrl}/${walletAddress}/erc20/transfers?${transfersParams.toString()}`;

    const swapsUrl = `${baseUrl}/wallets/${walletAddress}/swaps?chain=base`;

    const netWorthParams = new URLSearchParams();
    netWorthParams.append("chains[]", "base");
    const netWorthUrl = `${baseUrl}/wallets/${walletAddress}/net-worth?${netWorthParams.toString()}`;

    const profitabilityUrl = `${baseUrl}/wallets/${walletAddress}/profitability/summary?days=30&chain=base`;
    const walletStatsUrl = `${baseUrl}/wallets/${walletAddress}/stats?chain=base`;

    // Token balances (always include)
    const tbParams = new URLSearchParams({ chain: "base" });
    for (const addr of whitelistedAddresses) tbParams.append("token_addresses[]", addr);
    const tokenBalancesUrl = `${baseUrl}/wallets/${walletAddress}/tokens?${tbParams.toString()}`;

    const tasks: Array<{ key: "transfers" | "swaps" | "netWorth" | "profitability" | "walletStats" | "tokenBalances"; url: string }> = [
      { key: "transfers", url: transfersUrl },
      { key: "swaps", url: swapsUrl },
      { key: "netWorth", url: netWorthUrl },
      { key: "profitability", url: profitabilityUrl },
      { key: "walletStats", url: walletStatsUrl },
      { key: "tokenBalances", url: tokenBalancesUrl },
    ];

    // Fetch Moralis
    const startTime = Date.now();
    const fetchResponses = await Promise.all(tasks.map(t => fetch(t.url, { headers })));
    const parsed = await Promise.all(fetchResponses.map(r => r.json()));
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    const data: Record<string, any> = {};
    tasks.forEach((t, idx) => { data[t.key] = parsed[idx]; });

    // Derived: walletStats
    {
      const stats = data.walletStats ?? {};
      const tokenTransfersTotal = Number(stats?.token_transfers?.total ?? 0);
      const totalActivity = Number.isFinite(tokenTransfersTotal) ? tokenTransfersTotal : 0;
      data.walletStatsComputed = {
        tokenTransfersTotal: Number.isFinite(tokenTransfersTotal) ? tokenTransfersTotal : 0,
        totalActivity,
      };
    }

    // Derived: tokenBalances
    {
      const tb = data.tokenBalances ?? {};
      const usdValues: number[] = Array.isArray(tb?.result)
        ? tb.result.map((r: any) => Number(r?.usd_value ?? 0)).map((v: number) => (Number.isFinite(v) ? v : 0))
        : [];
      const totalUsdValue = usdValues.reduce((sum, v) => sum + v, 0);
      data.tokenBalancesComputed = { usdValues, totalUsdValue };
    }

    // Held whitelisted tokens
    const heldWhitelistedTokens = (() => {
      try {
        const tb = data.tokenBalances;
        const arr = Array.isArray(tb?.result) ? tb.result : [];
        const wlSet = new Set(whitelistedAddresses);
        const heldList: string[] = [];
        for (const r of arr) {
          const addr = (r?.token_address || r?.address || "").toLowerCase();
          if (!wlSet.has(addr)) continue;
          const usd = typeof r?.usd_value === "string" ? parseFloat(r.usd_value) : Number(r?.usd_value ?? 0);
          const bal = typeof r?.balance_formatted === "string" ? parseFloat(r.balance_formatted) : Number(r?.balance_formatted ?? 0);
          if ((Number.isFinite(usd) && usd > 0) || (Number.isFinite(bal) && bal > 0)) heldList.push(addr);
        }
        const uniq = Array.from(new Set(heldList));
        return { count: uniq.length, token_addresses: uniq };
      } catch {
        return { count: 0, token_addresses: [] as string[] };
      }
    })();

    // Dexscreener 24h aggregation → update whitelisted_tokens
    let tokenSwapTotalsUpdate: { success: boolean; updated: number; error?: string } = { success: true, updated: 0 };
    try {
      const existingTokenMap = new Map<string, string>();
      (whitelistRows || []).forEach((r: any) => {
        const orig = String(r?.token_address || "");
        if (orig) existingTokenMap.set(orig.toLowerCase(), orig);
      });

      const batchSize = 20;
      const addrChunks: string[][] = [];
      for (let i = 0; i < whitelistedAddresses.length; i += batchSize) {
        addrChunks.push(whitelistedAddresses.slice(i, i + batchSize));
      }

      let updated = 0;

      for (const chunk of addrChunks) {
        const path = chunk.join(",");
        const url = `https://api.dexscreener.com/tokens/v1/base/${path}`;
        const resp = await fetch(url, { headers: { accept: "application/json" } });
        if (!resp.ok) continue;

        const arr = await resp.json();
        const chunkSet = new Set(chunk.map(a => a.toLowerCase()));

        const agg: Record<string, { count: number; volume: number }> = {};
        const ensure = (addr: string) => (agg[addr] ||= { count: 0, volume: 0 });

        for (const item of Array.isArray(arr) ? arr : []) {
          const vol24 = Number(item?.volume?.h24 ?? 0) || 0;
          const buys24 = Number(item?.txns?.h24?.buys ?? 0) || 0;
          const sells24 = Number(item?.txns?.h24?.sells ?? 0) || 0;
          const cnt = buys24 + sells24;

          const addrs = [
            String(item?.baseToken?.address || "").toLowerCase(),
            String(item?.quoteToken?.address || "").toLowerCase(),
          ];

          for (const tok of addrs) {
            if (!tok || !chunkSet.has(tok)) continue;
            const slot = ensure(tok);
            slot.count += cnt;
            slot.volume += Math.abs(vol24);
          }
        }

        const entries = Object.entries(agg);

        const updates = entries
          .map(([lc, v]) => {
            const orig = existingTokenMap.get(lc);
            return orig ? { orig, ...v } : null;
          })
          .filter(Boolean) as Array<{ orig: string; count: number; volume: number }>;

        const inserts = entries
          .filter(([lc]) => !existingTokenMap.has(lc))
          .map(([lc, v]) => ({
            token_address: lc,
            total_swaps: v.count,
            total_volume: v.volume,
            last_update: new Date().toISOString(),
          }));

        if (updates.length > 0) {
          await Promise.all(
            updates.map(u =>
              supabase
                .from("whitelisted_tokens")
                .update({
                  total_swaps: u.count,
                  total_volume: u.volume,
                  last_update: new Date().toISOString(),
                })
                .eq("token_address", u.orig)
            )
          );
        }

        if (inserts.length > 0) {
          const { error: insertErr } = await supabase.from("whitelisted_tokens").insert(inserts);
          if (insertErr) {
            tokenSwapTotalsUpdate = { success: false, updated, error: insertErr.message };
            break;
          }
          for (const r of inserts) existingTokenMap.set(r.token_address, r.token_address);
        }

        updated += entries.length;
      }

      if (tokenSwapTotalsUpdate.success) tokenSwapTotalsUpdate = { success: true, updated };
    } catch (e: any) {
      tokenSwapTotalsUpdate = { success: false, updated: 0, error: e?.message ?? "Unknown error" };
    }

    // Wallet-level metrics
    const totalSwapVolume = (() => {
      const swaps = data.swaps;
      const arr = Array.isArray(swaps?.result) ? swaps.result : [];
      return arr.reduce((sum: number, s: any) => {
        const boughtUsd = (() => {
          const v = s?.bought?.usdAmount ?? 0;
          const n = typeof v === "string" ? parseFloat(v) : Number(v);
          return Number.isFinite(n) ? Math.abs(n) : 0;
        })();
        const soldUsd = (() => {
          const v = s?.sold?.usdAmount ?? 0;
          const n = typeof v === "string" ? parseFloat(v) : Number(v);
          return Number.isFinite(n) ? Math.abs(n) : 0;
        })();
        const totalValueUsd = (() => {
          const v = s?.totalValueUsd ?? s?.value_usd ?? 0;
          const n = typeof v === "string" ? parseFloat(v) : Number(v);
          return Number.isFinite(n) ? Math.abs(n) : 0;
        })();
        const representativeUsd = Math.max(boughtUsd, soldUsd, totalValueUsd);
        return sum + representativeUsd;
      }, 0);
    })();

    const netWorthUsd = (() => {
      const nw = data.netWorth;
      const total = nw?.total_networth_usd;
      const totalNum = typeof total === "string" ? parseFloat(total) : Number(total ?? 0);
      if (Number.isFinite(totalNum) && totalNum > 0) return totalNum;
      const chains = Array.isArray(nw?.chains) ? nw.chains : [];
      const sum = chains.reduce((acc: number, c: any) => {
        const v = typeof c?.networth_usd === "string" ? parseFloat(c.networth_usd) : Number(c?.networth_usd ?? 0);
        return acc + (Number.isFinite(v) ? v : 0);
      }, 0);
      return Number.isFinite(sum) ? sum : 0;
    })();

    const pnlUsd = (() => {
      const prof = data.profitability;
      const v = prof?.total_usd_pnl ?? prof?.total_realized_profit_usd ?? 0;
      const num = typeof v === "string" ? parseFloat(v) : Number(v);
      return Number.isFinite(num) ? num : 0;
    })();

    const swapsArr = Array.isArray(data?.swaps?.result) ? data.swaps.result : [];
    const totalActivity = (() => {
      if (swapsArr.length > 0) {
        const set = new Set<string>();
        for (const s of swapsArr) {
          const h = String(s?.transactionHash || s?.hash || "");
          if (h) set.add(h);
        }
        return set.size;
      }
      const transfersArr = Array.isArray(data?.transfers?.result) ? data.transfers.result : [];
      const set = new Set<string>();
      for (const t of transfersArr) {
        const h = String(t?.transaction_hash || t?.transactionHash || "");
        if (h) set.add(h);
      }
      return set.size;
    })();

    const totalTradeVolumeFromProfitability = (() => {
      const v = data?.profitability?.total_trade_volume ?? 0;
      const num = typeof v === "string" ? parseFloat(v) : Number(v);
      return Number.isFinite(num) ? num : 0;
    })();
    const totalVolume = totalTradeVolumeFromProfitability > 0 ? totalTradeVolumeFromProfitability : totalSwapVolume;

    const walletsStatus = {
      wallet_address: walletAddress,
      total_tx_count: totalActivity,
      total_volume: totalVolume,
      net_worth: netWorthUsd,
      pnl: pnlUsd,
      fid: null as number | null,
    };

    // Persist wallet-level status
    let db = { success: false as boolean, error: null as string | null };
    try {
      const { error: upsertError } = await supabase
        .from("wallets_status")
        .upsert([walletsStatus], { onConflict: "wallet_address" });
      db = upsertError ? { success: false, error: upsertError.message } : { success: true, error: null };
    } catch (e: any) {
      db = { success: false, error: e?.message ?? "Unknown error" };
    }

    return {
      success: true,
      wallet: walletAddress,
      timing: { totalTime: `${totalTime}ms`, requestCount: tasks.length },
      dataKeys: Object.keys(data),
      walletsStatus,
      db,
      heldWhitelistedTokens,
      tokenSwapTotalsUpdate,
      timestamp: new Date().toISOString(),
    };
  },
});