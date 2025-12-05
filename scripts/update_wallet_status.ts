import "dotenv/config";

// Run with: npm run update:wallet -- 0xabc... --chain base --maxPages 5 --maxTokens 10
// Requires env: BACKEND_URL, MORALIS_API_KEY (server), SUPABASE_* (server)

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  if (args[0] && !args[0].startsWith("--")) out.wallet = args[0];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
      out[key] = val;
      if (val !== "true") i++;
    }
  }
  return out;
}

function isValidEvmAddress(addr?: string) {
  return !!addr && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

async function main() {
  const { wallet, chain = "base", maxPages = "5", maxTokens = "10" } = parseArgs();
  const baseUrl = process.env.BACKEND_URL;
  if (!baseUrl) {
    console.error("Missing BACKEND_URL env");
    process.exit(1);
  }
  if (!isValidEvmAddress(wallet)) {
    console.error("Usage: npm run update:wallet -- 0x<40-hex> [--chain base] [--maxPages 5] [--maxTokens 10]");
    process.exit(1);
  }

  const body = {
    walletAddress: String(wallet),
    chain: String(chain),
    maxPages: Number(maxPages),
    maxTokens: Number(maxTokens),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(`${baseUrl}/api/wallet-status-moralis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok || !json?.success) {
      console.error("Request failed", { status: resp.status, error: json?.error });
      process.exit(1);
    }

    console.log("OK", {
      wallet: json.wallet,
      chain: json.chain,
      counts: json.counts,
      volume_daily: json.volume_daily,
      volume_weekly: json.volume_weekly,
      volume_monthly: json.volume_monthly,
      all_time_volume: json.all_time_volume,
      db: json.db,
      timestamp: json.timestamp,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    console.error("Error", e?.message || e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});