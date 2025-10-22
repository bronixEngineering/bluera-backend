import { task, schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabaseServerClient } from "@/lib/supabase";

export const walletStatusScheduled = schedules.task({
  id: "wallet-status-scheduled",
  cron: "0 1 * * *",
  run: async () => {
    const baseUrl = process.env.NODE_ENV === "production" 
      ? "https://your-production-domain.com" 
      : "http://localhost:3000";
    
    const headers = { "Content-Type": "application/json" as const };
    const supabase = getSupabaseServerClient();
    
    logger.log("Starting scheduled wallet status job", { baseUrl });
    
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
      
      // Process wallets in batches of 5 to avoid rate limits
      const batchSize = 5;
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
              const resp = await fetch(`${baseUrl}/api/wallet-status-moralis`, {
                method: "POST",
                headers,
                body: JSON.stringify({ 
                  walletAddress: wallet, 
                  chain: "base",
                  maxPages: 10 
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
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      logger.log("Wallet status job completed", {
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
      logger.error("Wallet status job failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
});

