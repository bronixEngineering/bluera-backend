import { task, logger } from "@trigger.dev/sdk/v3";
import { getSupabaseServerClient } from "@/lib/supabase";

type Payload = {
  chain?: string;        // default: "base"
  hours?: number;        // default: 24 (1..168)
  maxPages?: number;     // default: 3 (1..10)
  concurrency?: number;  // default: 5
  baseUrl?: string;      // default: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  debug?: boolean;       // pass-through to endpoint
};

export const walletTokenStatusRefresh = task({
  id: "wallet-token-status-moralis-refresh",
  maxDuration: 900,
  run: async (payload: Payload = {}) => {
    const chain = String(payload.chain || "base");
    const hours = Number.isFinite(payload.hours) ? Math.max(1, Math.min(168, Number(payload.hours))) : 24;
    const maxPages = Number.isFinite(payload.maxPages) ? Math.max(1, Math.min(10, Number(payload.maxPages))) : 3;
    const concurrency = Math.max(1, Number(payload.concurrency) || 5);
    const baseUrl = String(payload.baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
    const debug = !!payload.debug;

    const headers = { "Content-Type": "application/json" as const };
    const supabase = getSupabaseServerClient();

    const { data: rows, error } = await supabase
      .from("wallets_status")
      .select("wallet_address")
      .not("wallet_address", "is", null);

    if (error) return { success: false, error: error.message };

    const wallets: string[] = Array.from(
      new Set((rows || []).map((r: any) => String(r.wallet_address || "").toLowerCase()).filter(Boolean))
    );
    if (wallets.length === 0) return { success: true, wallets: 0, ok: 0, fail: 0 };

    logger.log("Triggering /api/wallet-token-status-moralis", {
      count: wallets.length, chain, hours, maxPages, baseUrl, concurrency,
    });

    const chunks: string[][] = [];
    for (let i = 0; i < wallets.length; i += concurrency) {
      chunks.push(wallets.slice(i, i + concurrency));
    }

    let ok = 0, fail = 0;
    const perWallet: Array<{ wallet: string; success: boolean; status?: number; error?: string; updated?: number; processed?: number }> = [];

    for (const group of chunks) {
      const results = await Promise.allSettled(
        group.map(async (wallet) => {
          const resp = await fetch(`${baseUrl}/api/wallet-token-status-moralis`, {
            method: "POST",
            headers,
            body: JSON.stringify({ walletAddress: wallet, chain, hours, maxPages, debug }),
          }).catch(() => null);

          if (!resp) return { wallet, success: false, status: 0, error: "network" };
          const json: any = await resp.json().catch(() => ({}));
          const success = !!json?.success;
          return {
            wallet,
            success,
            status: (resp as any).status,
            error: success ? undefined : json?.error,
            updated: json?.updated,
            processed: json?.processed,
          };
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