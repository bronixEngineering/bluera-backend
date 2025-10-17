import { task, logger } from "@trigger.dev/sdk/v3";

type Payload = {
  chain?: string;       
  batchSize?: number;   
  baseUrl?: string;     
};

export const dexscreenrRefresh = task({
  id: "ecosystem-token-heatmap",
  maxDuration: 300,
  run: async (payload: Payload = {}) => {
    const chain = String(payload.chain || "base");
    const batchSize = Number.isFinite(payload.batchSize) ? Number(payload.batchSize) : 20;
    const baseUrl = String(payload.baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
    const headers = { "Content-Type": "application/json" as const };

    logger.log("Calling /api/dexscreenr (will also update total_volume_changing_rate)", { chain, batchSize, baseUrl });
    
    const resp = await fetch(`${baseUrl}/api/dexscreenr`, {
      method: "POST",
      headers,
      body: JSON.stringify({ chain, batchSize }),
    }).catch(() => null);

    if (!resp) return { success: false, error: "network" };

    const json = await resp.json().catch(() => ({}));

    return {
      success: !!json?.success,
      status: (resp as any).status,
      result: json,
      timestamp: new Date().toISOString(),
    };
  },
});