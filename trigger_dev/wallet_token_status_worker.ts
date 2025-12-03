import { task, logger } from "@trigger.dev/sdk/v3";

export const walletTokenStatusWorker = task({
  id: "wallet-token-status-worker",
  run: async (payload: { walletAddress: string; hours?: number }) => {
    const baseUrl = process.env.BACKEND_URL;
    const headers = { "Content-Type": "application/json" as const };

    if (!payload?.walletAddress) {
      logger.error("Missing walletAddress in payload");
      return { success: false, error: "Missing walletAddress" };
    }

    try {
      const resp = await fetch(`${baseUrl}/api/wallet-token-status-moralis`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          walletAddress: payload.walletAddress,
          hours: payload.hours ?? 24,
          maxPages: 5,
        }),
      });

      const json: any = await resp.json().catch(() => ({}));
      const success = !!json?.success;

      logger.log("walletTokenStatusWorker done", {
        wallet: payload.walletAddress,
        success,
        error: success ? undefined : json?.error,
      });

      return { success, error: success ? null : json?.error };
    } catch (error: any) {
      logger.error("walletTokenStatusWorker failed", { wallet: payload.walletAddress, error: error.message });
      return { success: false, error: error.message };
    }
  },
});


