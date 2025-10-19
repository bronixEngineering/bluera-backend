import { task, logger } from "@trigger.dev/sdk/v3";
import { getSupabaseServerClient } from "@/lib/supabase";

type Payload = {
  chain?: string;        // default: "base"
  maxPages?: number;     // default: 5 (1..10)
  baseUrl?: string;      // default: http://localhost:3000 (override in cloud)
  concurrency?: number;  // default: 5
};

export const refreshWalletsFromStatus = task({
  id: "wallets-status-moralis-refresh",
  maxDuration: 900,
  run: async (payload: Payload = {}) => {
    const chain = String(payload.chain || "base");
    const maxPages = Number.isFinite(payload.maxPages) ? Math.max(1, Math.min(10, Number(payload.maxPages))) : 5;
    const baseUrl = "http://localhost:3000"
    const concurrency = Math.max(1, Number(payload.concurrency) || 5);
    const headers = { "Content-Type": "application/json" as const };

    const supabase = getSupabaseServerClient();

    // 1) Load wallets
    const { data: rows, error } = await supabase
      .from("wallets_status")
      .select("wallet_address")
      .not("wallet_address", "is", null);

    if (error) return { success: false, error: error.message };

    const wallets: string[] = Array.from(
      new Set((rows || []).map((r: any) => String(r.wallet_address || "").toLowerCase()).filter(Boolean))
    );

    console.log("wallets", wallets);

    if (wallets.length === 0) return { success: true, wallets: 0, ok: 0, fail: 0 };

    logger.log("Triggering /api/wallet-status-moralis for wallets", {
      count: wallets.length, chain, maxPages, baseUrl, concurrency,
    });

    // 2) Batch by concurrency
    const chunks: string[][] = [];
    for (let i = 0; i < wallets.length; i += concurrency) {
      chunks.push(wallets.slice(i, i + concurrency));
    }

    let ok = 0, fail = 0;
    const perWallet: Array<{ wallet: string; success: boolean; status?: number; error?: string }> = [];

    // 3) Fan out calls
    for (const group of chunks) {
      const results = await Promise.allSettled(
        group.map(async (wallet) => {
          const resp = await fetch(`${baseUrl}/api/wallet-status-moralis`, {
            method: "POST",
            headers,
            body: JSON.stringify({ walletAddress: wallet, chain, maxPages }),
          }).catch(() => null);
          console.log("resp", resp);

          if (!resp) return { wallet, success: false, status: 0, error: "network" };
          const json: any = await resp.json().catch(() => ({}));
          const success = !!json?.success;
          return { wallet, success, status: (resp as any).status, error: success ? undefined : json?.error };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          perWallet.push(r.value);
          if (r.value.success) ok += 1; else fail += 1;
        } else {
          fail += 1;
        }
      }
    }

    return {
      success: true,
      wallets: wallets.length,
      ok,
      fail,
      perWallet,
      timestamp: new Date().toISOString(),
    };
  },
});