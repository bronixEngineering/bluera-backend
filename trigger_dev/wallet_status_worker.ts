import { task, logger } from "@trigger.dev/sdk/v3";

export const walletStatusWorker = task({
  id: "wallet-status-worker",
  run: async (payload: { walletAddress: string }) => {
    const baseUrl = process.env.BACKEND_URL;
    const headers = { "Content-Type": "application/json" as const };

    if (!payload?.walletAddress) {
      logger.error("Missing walletAddress in payload");
      return { success: false, error: "Missing walletAddress" };
    }

    try {
      const resp = await fetch(`${baseUrl}/api/wallet-status-moralis`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          walletAddress: payload.walletAddress,
          chain: "base",
          // keep these conservative; API clamps them (pages: 1..20, tokens: 1..50)
          maxPages: 5,
          maxTokens: 10,
        }),
      });

      const json: any = await resp.json().catch(() => ({}));
      const success = !!json?.success;

      logger.log("walletStatusWorker done", {
        wallet: payload.walletAddress,
        success,
        error: success ? undefined : json?.error,
      });

      return { success, error: success ? null : json?.error };
    } catch (error: any) {
      logger.error("walletStatusWorker failed", { wallet: payload.walletAddress, error: error.message });
      return { success: false, error: error.message };
    }
  },
});


