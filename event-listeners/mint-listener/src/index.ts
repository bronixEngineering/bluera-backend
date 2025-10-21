import Web3Utils from "./web3Utils";
import SupabaseUtils from "./supabaseUtils";
import * as dotenv from "dotenv";

dotenv.config();

const eventName = "Minted";
const contractAddress = process.env.NFT_CONTRACT_ADDRESS || "";
let isWeb3Initialized = false;

let web3Utils: Web3Utils;
const supabaseUtils = new SupabaseUtils();

async function initWeb3Client() {
  const contract = await supabaseUtils.getContract(contractAddress);
  if (!contract) {
    console.error("Contract not found in the database");
    return;
  }
  web3Utils = new Web3Utils(
    contractAddress,
    contract.abi,
    contract.creation_txn_hash
  );
  isWeb3Initialized = true;
}

async function updateLatestBlockNumber(newValue: number) {
  const isUpdated = await supabaseUtils.updateLatestBlockNumber(
    newValue,
    eventName,
    web3Utils.contractAddress
  );
  return isUpdated;
}

function toTimestamptz(seconds: bigint): string {
  // multiply by 1000 to go from seconds → milliseconds
  const ms = Number(seconds) * 1000;
  const date = new Date(ms);
  return date.toISOString(); // e.g. "2025-06-09T14:08:02.000Z"
}

async function main() {
  if (!isWeb3Initialized) await initWeb3Client();
  if (!web3Utils) {
    console.error("Web3 client not initialized");
    return;
  }
  console.log("STARTED");
  const startTime = Date.now(); // Start timing

  let fromBlockNumber = await supabaseUtils.getLatestBlockNumberFromDb(
    eventName,
    web3Utils.contractAddress
  );

  if (fromBlockNumber === -1 || fromBlockNumber === 0) {
    fromBlockNumber = await web3Utils.getEarliestBlockNumber();
    if (fromBlockNumber !== 0) await updateLatestBlockNumber(fromBlockNumber);
  }

  if (fromBlockNumber === 0) {
    console.error("No valid fromBlockNumber found, exiting.");
    const endTime = Date.now(); // End timing
    console.log(`COMPLETED in ${endTime - startTime} ms`);
    return;
  }

  console.log(`Fetching events from block number: ${fromBlockNumber}`);

  const pastEventsResp = await web3Utils.getPastEvents(
    fromBlockNumber,
    eventName
  );

  let latestBlockNumber = 0;
  for (const event of pastEventsResp.events) {
    // const returns = event.returnValues;
    const minterAddress = event.returnValues.minter;
    const tokenId = Number(event.returnValues.tokenId);
    const supabaseId = event.returnValues.supabase_uuid;
    const blocknumber = Number(event.blockNumber);

    const updateResult = await supabaseUtils.updateAuraCard(supabaseId, tokenId);
    if (!updateResult.isSuccess) {
      console.error(`Error updating aura card: ${updateResult.errorMessage}`);
      continue;
    }

    latestBlockNumber = blocknumber;
  }


  if (latestBlockNumber !== 0) {
    const isUpdated = await updateLatestBlockNumber(latestBlockNumber + 1);
  }

  const endTime = Date.now(); // End timing
  console.log(`COMPLETED in ${endTime - startTime} ms`);
}

// Start the main event processing loop after a 35 second delay
setTimeout(async () => {
  // Define a function to run main() and schedule itself again after 30000ms
  const run = async () => {
    await main(); // Process events
    setTimeout(run, 30000); // Schedule the next run after 30000ms (30 seconds)
  };
  run(); // Start the loop
}, 35000); // Initial delay of 35000ms (35 second) before starting
