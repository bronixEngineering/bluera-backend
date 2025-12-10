import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// Use Dexscreener token-pairs API to resolve ticker (symbol) and imageUrl for a token address on a chain.

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/ANON_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Provide token addresses here (in any case); script normalizes to lowercase.
// You can also supply a comma-separated list via ADDRESSES env variable.
const DEFAULT_ADDRESSES: string[] = [
  "0x696f9436b67233384889472cd7cd58a6fb5df4f1",
  "0xc729777d0470f30612b1564fd96e8dd26f5814e3",
  "0x00000000a22c618fd6b4d7e9a335c4b96b189a38",
  "0x11dc28d01984079b7efe7763b533e6ed9e3722b9",
  "0xbf927b841994731c573bdf09ceb0c6b0aa887cdd",
  "0x227d920e20ebac8a40e7d6431b7d724bb64d7245",
  "0xf43eb8de897fbc7f2502483b2bef7bb9ea179229",
  "0x1111111111166b7fe7bd91427724b487980afc69",
  "0xc0634090f2fe6c6d75e61be2b949464abb498973",
  "0x1bc0c42215582d5a085795f4badbac3ff36d1bcb",
  "0xa4a2e2ca3fbfe21aed83471d28b6f65a233c6e00",
  "0xa1832f7f4e534ae557f9b5ab76de54b1873e498b",
  "0x9e6a46f294bb67c20f1d1e7afb0bbef614403b55",
  "0x532f27101965dd16442e59d40670faf5ebb142e4",
  "0xc08cd26474722ce93f4d0c34d16201461c10aa8c",
  "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4",
  "0x9cb41fd9dc6891bae8187029461bfaadf6cc0c69",
  "0x22af33fe49fd1fa80c7149773dde5890d3c76f3b",
  "0xb33ff54b9f7242ef1593d2c9bcd8f9df46c77935",
];
const ADDRESSES: string[] = (process.env.ADDRESSES || DEFAULT_ADDRESSES.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const PREFERRED_CHAIN = process.env.DEX_CHAIN || "base";
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 5));
const FETCH_TIMEOUT_MS = Math.max(1000, Number(process.env.FETCH_TIMEOUT_MS || 15000));

function isValidAddress(addr?: string) {
  return !!addr && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

type TokenPair = {
  chainId?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  info?: { imageUrl?: string; header?: string; openGraph?: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
};

async function fetchDexInfo(address: string): Promise<{ ticker: string | null; imageUrl: string | null }> {
  const addrLc = address.toLowerCase();
  const url = `https://api.dexscreener.com/token-pairs/v1/${PREFERRED_CHAIN}/${addrLc}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      // Fallback to CDN image path if API not available
      return { ticker: null, imageUrl: `https://cdn.dexscreener.com/cms/images/${addrLc}` };
    }
    const json: unknown = await resp.json();
    const arr: TokenPair[] = Array.isArray(json) ? (json as TokenPair[]) : [];
    if (arr.length === 0) {
      return { ticker: null, imageUrl: `https://cdn.dexscreener.com/cms/images/${addrLc}` };
    }
    // Prefer entries whose baseToken.address matches the queried token
    const matching = arr.filter(p => (p?.baseToken?.address || "").toLowerCase() === addrLc);
    const candidates = matching.length > 0 ? matching : arr;
    // Rank by liquidity then volume
    const best = candidates
      .map(p => ({
        p,
        score: (Number(p?.liquidity?.usd ?? 0) || 0) * 1.0 + (Number(p?.volume?.h24 ?? 0) || 0) * 0.001,
      }))
      .sort((a, b) => b.score - a.score)[0]?.p;

    const ticker = best?.baseToken?.symbol ?? null;
    const imageUrl = best?.info?.imageUrl ?? `https://cdn.dexscreener.com/cms/images/${addrLc}`;
    return { ticker, imageUrl };
  } catch {
    clearTimeout(timeoutId);
    return { ticker: null, imageUrl: `https://cdn.dexscreener.com/cms/images/${addrLc}` };
  }
}

async function upsertWhitelistRow(token_address: string, token_ticker: string | null, image_url: string | null) {
  const { error } = await supabase
    .from("whitelisted_tokens")
    .upsert(
      {
        token_address,
        token_ticker: token_ticker ?? null,
        image_url: image_url ?? null,
      },
      { onConflict: "token_address" }
    );
  if (error) throw new Error(error.message);
}

async function main() {
  const input = ADDRESSES.length > 0 ? ADDRESSES : [];
  const normalized = Array.from(
    new Set(
      input
        .map((a) => (a || "").trim())
        .filter(isValidAddress)
        .map((a) => a.toLowerCase())
    )
  );

  if (normalized.length === 0) {
    console.log(
      "No valid addresses provided. Supply via ADDRESSES env (comma-separated) or edit the script."
    );
    return;
  }

  console.log(`Processing ${normalized.length} addresses (preferred chain: ${PREFERRED_CHAIN})`);

  let index = 0;
  let ok = 0;
  let fail = 0;

  async function worker() {
    while (index < normalized.length) {
      const current = index++;
      const addr = normalized[current];
      try {
        const { ticker, imageUrl } = await fetchDexInfo(addr);
        await upsertWhitelistRow(addr, ticker, imageUrl);
        console.log(`[ok] ${addr} -> ticker=${ticker ?? "-"} image=${imageUrl ?? "-"}`);
        ok++;
      } catch (e: any) {
        console.error(`[fail] ${addr} -> ${e?.message || e}`);
        fail++;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, normalized.length) }, () => worker());
  await Promise.all(workers);

  console.log(`Done. ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


