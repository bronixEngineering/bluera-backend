import { task } from "@trigger.dev/sdk/v3";
import { getSupabaseServerClient } from "@/lib/supabase";

type Payload = {
  walletAddress: string;
  chain?: string;
  fid?: string;         // optional
  maxPages?: number;    // optional (default 10, max 10)
};

type VolumeBuckets = {
  day: Map<string, number>;
  week: Map<string, number>;
  month: Map<string, number>;
};

function fromDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function addToBucket(map: Map<string, number>, hash: string, usd: number) {
  const prev = map.get(hash) ?? 0;
  if (usd > prev) map.set(hash, Math.abs(usd)); // avoid double-counting same tx across tokens
}

function parseUsd(v: any): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

async function getProfitUsd(days: number, baseUrl: string, headers: Record<string, string>, walletAddress: string, chain: string) {
  const url = `${baseUrl}/wallets/${walletAddress}/profitability/summary?days=${days}&chain=${chain}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return 0;
  const json = await resp.json().catch(() => ({}));
  const v = json?.total_realized_profit_usd ?? json?.total_usd_pnl ?? 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const volumeJob = task({
  id: "wallet-volume-refresh",
  maxDuration: 600, // 10m
  run: async (payload: Payload) => {
    const walletAddress = String(payload?.walletAddress || "").trim();
    const chain = String(payload?.chain || "base");
    const fid = payload?.fid ? String(payload.fid) : undefined;
    const maxPages = Number.isFinite(payload?.maxPages) ? Math.max(1, Math.min(10, Number(payload.maxPages))) : 10;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return { success: false, error: "Invalid walletAddress" };
    }

    const apiKey = process.env.MORALIS_API_KEY;
    if (!apiKey) return { success: false, error: "MORALIS_API_KEY not set" };

    const headers = { "X-API-Key": apiKey, accept: "application/json" };
    const baseUrl = "https://deep-index.moralis.io/api/v2.2";
    const supabase = getSupabaseServerClient();

    // Load token filter (whitelisted)
    const { data: wl, error: wlErr } = await supabase
      .from("whitelisted_tokens")
      .select("token_address");
    if (wlErr) return { success: false, error: `Failed to load tokens: ${wlErr.message}` };

    const tokenAddresses: string[] = (wl || [])
      .map((r: any) => String(r?.token_address || "").toLowerCase())
      .filter(Boolean);

    // Time windows
    const now = new Date();
    const from30d = fromDaysAgo(30);
    const from7d = fromDaysAgo(7);
    const from1d = fromDaysAgo(1);

    const buckets: VolumeBuckets = {
      day: new Map(),
      week: new Map(),
      month: new Map(),
    };

    // Fetch monthly window per token and bucket into day/week/month
    for (const token of tokenAddresses) {
      const url = new URL(`${baseUrl}/wallets/${walletAddress}/swaps`);
      url.searchParams.set("chain", chain);
      url.searchParams.set("tokenAddress", token);
      url.searchParams.set("order", "DESC");
      url.searchParams.set("from_date", from30d.toISOString());

      let cursor: string | null = null;
      let pages = 0;

      while (pages < maxPages) {
        const pageUrl = new URL(url.toString());
        if (cursor) pageUrl.searchParams.set("cursor", cursor);

        const resp = await fetch(pageUrl.toString(), { headers }).catch(() => null);
        if (!resp || !resp.ok) break;

        const json: any = await resp.json().catch(() => ({}));
        const arr: any[] = Array.isArray(json?.result) ? json.result : [];
        if (arr.length === 0) break;

        for (const s of arr) {
          const ts = new Date(String(s?.blockTimestamp || s?.block_timestamp || now)).getTime();
          if (!Number.isFinite(ts) || ts < from30d.getTime() || ts > now.getTime()) continue;

          const usd = parseUsd(s?.totalValueUsd ?? s?.value_usd ?? 0);
          if (usd <= 0) continue;

          const hash = String(s?.transactionHash || s?.hash || "");
          if (!hash) continue;

          addToBucket(buckets.month, hash, usd);
          if (ts >= from7d.getTime()) addToBucket(buckets.week, hash, usd);
          if (ts >= from1d.getTime()) addToBucket(buckets.day, hash, usd);
        }

        cursor = json?.cursor ? String(json.cursor) : null;
        pages += 1;
        if (!cursor) break;
      }
    }

    const volume_daily = Array.from(buckets.day.values()).reduce((a, b) => a + b, 0);
    const volume_weekly = Array.from(buckets.week.values()).reduce((a, b) => a + b, 0);
    const volume_monthly = Array.from(buckets.month.values()).reduce((a, b) => a + b, 0);

    // PnL (weekly / monthly)
    const [weekly_pnl, monthly_pnl] = await Promise.all([
      getProfitUsd(7, baseUrl, headers, walletAddress, chain),
      getProfitUsd(30, baseUrl, headers, walletAddress, chain),
    ]);

    // Upsert wallets_status
    const row: any = {
      wallet_address: walletAddress,
      volume_daily,
      volume_weekly,
      volume_monthly,
      weekly_pnl,
      monthly_pnl,
    };
    if (fid) row.fid = fid;

    const { error: upErr } = await supabase
      .from("wallets_status")
      .upsert([row], { onConflict: "wallet_address" });

    return {
      success: !upErr,
      error: upErr?.message ?? null,
      wallet: walletAddress,
      chain,
      volume_daily,
      volume_weekly,
      volume_monthly,
      weekly_pnl,
      monthly_pnl,
      counts: {
        txs_day: buckets.day.size,
        txs_week: buckets.week.size,
        txs_month: buckets.month.size,
      },
      timestamp: new Date().toISOString(),
    };
  },
});