import fs from "fs";
import path from "path";
import readline from "readline";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FILE_PATH =
  process.env.FILE || path.join(process.cwd(), "top_wallets.csv");
const DELIM = process.env.DELIM || ";";
const FID_CHUNK = parseInt(process.env.FID_CHUNK || "2000", 10);
const WALLET_CHUNK = parseInt(process.env.WALLET_CHUNK || "1000", 10);

function isHeader(line: string) {
  const l = line.trim().toLowerCase();
  return l.startsWith("fid" + DELIM) || (l.includes("fid") && l.includes("eth_address"));
}

function splitLine(line: string): [string | null, string | null] {
  const parts = line.split(DELIM);
  if (parts.length < 2) return [null, null];
  const fid = (parts[0] || "").trim();
  const addr = (parts[1] || "").trim();
  return [fid || null, addr || null];
}

function isValidEvmAddress(addr: string | null) {
  if (!addr) return false;
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

async function insertFidsFromFile(file: string) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  let buffer: Array<{ fid: string }> = [];
  let lineNo = 0;
  let total = 0;

  for await (const line of rl) {
    lineNo++;
    if (!line) continue;
    if (lineNo === 1 && isHeader(line)) continue;

    const [fidRaw] = splitLine(line);
    const fid = fidRaw && fidRaw.trim();
    if (!fid) continue;

    buffer.push({ fid });

    if (buffer.length >= FID_CHUNK) {
      const { error } = await supabase.from("users_fid").upsert(buffer, { onConflict: "fid" });
      if (error) {
        console.error("users_fid upsert error:", error.message);
        process.exit(1);
      }
      total += buffer.length;
      buffer = [];
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  if (buffer.length) {
    const { error } = await supabase.from("users_fid").upsert(buffer, { onConflict: "fid" });
    if (error) {
      console.error("users_fid upsert error:", error.message);
      process.exit(1);
    }
    total += buffer.length;
  }

  console.log(`FIDs processed: ${total}`);
}

async function insertWalletsFromFile(file: string) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  let buffer: Array<{ wallet_address: string; fid: string | null }> = [];
  let lineNo = 0;
  let total = 0;

  for await (const line of rl) {
    lineNo++;
    if (!line) continue;
    if (lineNo === 1 && isHeader(line)) continue;

    const [fidRaw, addrRaw] = splitLine(line);
    const fid = (fidRaw && fidRaw.trim()) || null;
    const addr = (addrRaw && addrRaw.trim()) || null;
    if (!addr || !isValidEvmAddress(addr)) continue;

    const wallet_address = addr.toLowerCase();
    buffer.push({ wallet_address, fid });

    if (buffer.length >= WALLET_CHUNK) {
      console.log(`writing chunk to wallets_status: ${buffer.length}`);
      const { error } = await supabase
        .from("wallets_status")
        .upsert(buffer, { onConflict: "wallet_address", ignoreDuplicates: true });
      if (error) {
        console.error("wallets_status upsert error:", error.message);
        process.exit(1);
      }
      total += buffer.length;
      buffer = [];
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  if (buffer.length) {
    console.log(`writing final chunk to wallets_status: ${buffer.length}`);
    const { error } = await supabase
      .from("wallets_status")
      .upsert(buffer, { onConflict: "wallet_address", ignoreDuplicates: true });
    if (error) {
      console.error("wallets_status upsert error:", error.message);
      process.exit(1);
    }
    total += buffer.length;
  }

  console.log(`Wallets processed: ${total}`);
}

async function main() {
  console.log("File:", FILE_PATH);
  if (!fs.existsSync(FILE_PATH)) {
    console.error("File not found:", FILE_PATH);
    process.exit(1);
  }

  console.time("phase:users_fid");
  await insertFidsFromFile(FILE_PATH);
  console.timeEnd("phase:users_fid");

  console.time("phase:wallets_status");
  await insertWalletsFromFile(FILE_PATH);
  console.timeEnd("phase:wallets_status");

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


