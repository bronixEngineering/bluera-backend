import { task, logger } from "@trigger.dev/sdk/v3";

type Payload = {
  wallets?: string[];
  chain?: string;
  includeDex?: boolean;   // default: true
  useRefresh?: boolean;   // if true, call /api/refresh instead of per-wallet /api/moralis
  maxPages?: number;      // passed to /api/moralis or /api/refresh
  baseUrl?: string;       // override Next server URL
};

export const testEndpoints = task({
  id: "test-endpoints",
  maxDuration: 900,
  run: async (payload: Payload = {}) => {
    const chain = String(payload.chain || "base");
    const includeDex = payload.includeDex !== false;
    const useRefresh = !!payload.useRefresh;
    const maxPages = Number.isFinite(payload.maxPages) ? Math.max(1, Math.min(10, Number(payload.maxPages))) : 5;
    const baseUrl = String(payload.baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
    const headers = { "Content-Type": "application/json" as const };

    logger.log("Starting test-endpoints", { chain, includeDex, useRefresh, maxPages, baseUrl });

    // 1) Optionally refresh Dexscreener-derived token stats
    let dex: any = { success: false };
    if (includeDex) {
      const r = await fetch(`${baseUrl}/api/dexscreenr`, {
        method: "POST",
        headers,
        body: JSON.stringify({ chain }),
      }).catch(() => null);
      dex = (await r?.json().catch(() => ({}))) ?? { success: false };
    }

    // 2a) Refresh using DB wallets via coordinator
    if (useRefresh) {
      const resp = await fetch(`${baseUrl}/api/refresh`, {
        method: "POST",
        headers,
        body: JSON.stringify({ chain, maxPages, includeDex: false }),
      }).catch(() => null);
      const refresh = (await resp?.json().catch(() => ({}))) ?? {};
      return {
        success: true,
        mode: "refresh",
        dex,
        refresh,
        timestamp: new Date().toISOString(),
      };
    }

    // 2b) Or refresh per provided wallets via /api/moralis
    const wallets =
      Array.isArray(payload.wallets) && payload.wallets.length > 0
        ? payload.wallets
        : ["0xcB1C1FdE09f811B294172696404e88E658659905"];

    let ok = 0, fail = 0;
    const results = await Promise.allSettled(
      wallets.map((w) =>
        fetch(`${baseUrl}/api/moralis`, {
          method: "POST",
          headers,
          body: JSON.stringify({ walletAddress: w, chain, maxPages }),
        }).then((r) => r.json())
      )
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value?.success) ok += 1;
      else fail += 1;
    }

    return {
      success: true,
      mode: "per-wallet",
      wallets: wallets.length,
      moralis: { ok, fail },
      dex,
      timestamp: new Date().toISOString(),
    };
  },
});