import { logger, schedules } from "@trigger.dev/sdk/v3";
import { getSupabaseServerClient } from "@/lib/supabase";

export const walletTokenStatusScheduled = schedules.task({
  id: "wallet-token-status-scheduled",
  maxDuration: 1800, // 30 minutes
  cron: "0 11 * * *", 
  run: async () => {
    const baseUrl = process.env.BACKEND_URL;
    const headers = { "Content-Type": "application/json" as const };
    const supabase = getSupabaseServerClient();
    
    logger.log("Starting scheduled wallet token status job", { baseUrl });
    
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
      
      logger.log("Processing wallets", { count: wallets.length });
      
      if (wallets.length === 0) {
        return { success: true, wallets: 0, message: "No wallets to process" };
      }
      
      // Process wallets in batches of 3 to avoid rate limits
      const batchSize = 3;
      const batches: string[][] = [];
      for (let i = 0; i < wallets.length; i += batchSize) {
        batches.push(wallets.slice(i, i + batchSize));
      }
      
      let successCount = 0;
      let failCount = 0;
      const results: Array<{ wallet: string; success: boolean; error?: string }> = [];
      
      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map(async (wallet) => {
            try {
              const resp = await fetch(`${baseUrl}/api/wallet-token-status-moralis`, {
                method: "POST",
                headers,
                body: JSON.stringify({ 
                  walletAddress: wallet, 
                  hours: 24,
                  maxPages: 5
                }),
              });
              
              const json: any = await resp.json().catch(() => ({}));
              const success = !!json?.success;
              
              return { wallet, success, error: success ? undefined : json?.error };
            } catch (error: any) {
              return { wallet, success: false, error: error.message };
            }
          })
        );
        
        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            results.push(result.value);
            if (result.value.success) successCount++; else failCount++;
          } else {
            failCount++;
          }
        }
        
        // Small delay between batches to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      logger.log("Wallet token status job completed", {
        total: wallets.length,
        success: successCount,
        failed: failCount
      });
      
      return {
        success: true,
        total: wallets.length,
        successCount,
        failCount,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("Wallet token status job failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
});
