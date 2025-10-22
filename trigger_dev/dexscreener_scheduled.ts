import { task, logger, schedules } from "@trigger.dev/sdk/v3";

export const dexscreenerScheduled = schedules.task({
  id: "dexscreener-scheduled",
  cron: "0 15 * * *",
  run: async (payload, { ctx }) => {
    const baseUrl = process.env.BACKEND_URL;
    
    const headers = { "Content-Type": "application/json" as const };

    logger.log("Starting scheduled Dexscreener job", { baseUrl });
    
    try {
      const resp = await fetch(`${baseUrl}/api/dexscreenr`, {
        method: "POST",
        headers,
        body: JSON.stringify({ 
          chain: "base", 
          batchSize: 20 
        }),
      });
      
      const json: any = await resp.json().catch(() => ({}));
      
      logger.log("Dexscreener job completed", {
        success: json?.success,
        updated: json?.updated,
        error: json?.error
      });
      
      return {
        success: json?.success || false,
        updated: json?.updated || 0,
        error: json?.error || null,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("Dexscreener job failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
});