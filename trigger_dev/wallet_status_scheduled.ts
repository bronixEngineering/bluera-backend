import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabaseServerClient } from "@/lib/supabase";
import { walletStatusWorker } from "./wallet_status_worker";

export const walletStatusScheduled = schedules.task({
  id: "wallet-status-scheduled",
  cron: "0 11 * * *",
  run: async () => {
    const supabase = getSupabaseServerClient();
    
    logger.log("Starting scheduled wallet status enqueue");
    
    try {
      // Load all wallets from wallets_status table
      const { data: rows, error } = await supabase
        .from("wallets_status")
        .select("wallet_address")
        .not("wallet_address", "is", null);
      
      if (error) {
        logger.error("Failed to load wallets", { error: error.message });
        return { success: false, error: error.message };
      }

      const wallets: string[] = Array.from(
        new Set((rows || []).map((r: any) => String(r.wallet_address || "").toLowerCase()).filter(Boolean))
      );
      
      if (wallets.length === 0) {
        return { success: true, enqueued: 0, message: "No wallets to enqueue" };
      }

      // Env-tuneable controls
      const LIMIT = Number(process.env.WALLET_ENQUEUE_LIMIT || 2000);     // max wallets per run
      const BATCH = Number(process.env.WALLET_ENQUEUE_BATCH || 100);      // per batch trigger count
      const DELAY_MS = Number(process.env.WALLET_ENQUEUE_DELAY_MS || 500);
      const SHARD_TOTAL = Number(process.env.WALLET_SHARD_TOTAL || 1);
      const SHARD_INDEX = Number(process.env.WALLET_SHARD_INDEX || 0);

      // Simple string hash for client-side sharding
      function hashStr(s: string) {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return Math.abs(h);
      }
      const sharded = SHARD_TOTAL > 1
        ? wallets.filter(w => (hashStr(w) % SHARD_TOTAL) === SHARD_INDEX)
        : wallets;

      const toEnqueue = sharded.slice(0, LIMIT);

      // Enqueue wallets in chunks with dedupe
      let enqueued = 0;
      for (let i = 0; i < toEnqueue.length; i += BATCH) {
        const chunk = toEnqueue.slice(i, i + BATCH);
        await Promise.allSettled(
          chunk.map((w) => walletStatusWorker.trigger({ walletAddress: w }))
        );
        enqueued += chunk.length;
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
      
      logger.log("Wallet status enqueue completed", { enqueued });
      
      return {
        success: true,
        enqueued,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("Wallet status enqueue failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
});

