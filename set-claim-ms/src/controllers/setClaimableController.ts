import { Request, Response } from "express";
import Web3Utils from "../utils/web3Utils";
import SupabaseUtils from "../utils/supabaseUtils";
import { DEFAULT_SET_CLAIMABLE_AMOUNT } from "../utils/constants";
import * as dotenv from "dotenv";

dotenv.config();

// Initialize SupabaseUtils once at module level
const supabaseUtils = new SupabaseUtils();

// Cache for Web3Utils instance
let web3UtilsInstance: Web3Utils | null = null;

/**
 * Initialize Web3Utils with contract ABI from database
 * This is called once and cached for subsequent requests
 */
async function initializeWeb3Utils(): Promise<Web3Utils | null> {
  if (web3UtilsInstance) {
    return web3UtilsInstance;
  }

  const contractAddress = process.env.CLAIM_CONTRACT_ADDRESS || "";
  
  if (!contractAddress) {
    console.error("CLAIM_CONTRACT_ADDRESS not set in environment variables");
    return null;
  }

  // Fetch contract details from database
  const contract = await supabaseUtils.getContract(contractAddress);
  
  if (!contract || !contract.abi) {
    console.error("Contract or ABI not found in database");
    return null;
  }

  // Initialize and cache Web3Utils instance
  web3UtilsInstance = new Web3Utils(contractAddress, contract.abi);
  return web3UtilsInstance;
}

/**
 * POST /api/set-claimable
 * Sets claimable amount for a wallet address using the default amount
 * Handles Supabase webhook payloads from farcaster_notifications table
 * 
 * Request body: Supabase webhook payload with record.fid
 */
export const setClaimable = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, table, record } = req.body;

    // Validate webhook payload structure
    if (!record || !record.fid) {
      res.status(400).json({ 
        error: "Missing required field: record.fid" 
      });
      return;
    }

    // Extract fid from webhook payload
    const fid = record.fid;

    // Check mindshare from Inflynce API
    try {
      const inflynceResponse = await fetch(
        `https://api.inflynce.com/api/v1/mindshare/user/${fid}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${process.env.INFLYNCE_API_KEY}`
          }
        }
      );

      if (!inflynceResponse.ok) {
        console.error(`Inflynce API error: ${inflynceResponse.status} ${inflynceResponse.statusText}`);
        res.status(500).json({ 
          error: "Failed to fetch mindshare data",
          message: `Inflynce API returned status ${inflynceResponse.status}`
        });
        return;
      }

      const inflynceData = await inflynceResponse.json();
      console.log("Inflynce API Response Data:", JSON.stringify(inflynceData, null, 2));

      // Extract mindshare value
      const mindshare = inflynceData.data?.[0]?.mindshare;
      
      if (mindshare === undefined || mindshare === null) {
        console.error(`No mindshare data found for fid: ${fid}`);
        res.status(500).json({ 
          error: "No mindshare data found",
          message: `Could not retrieve mindshare for fid: ${fid}`
        });
        return;
      }

      console.log(`Mindshare for fid ${fid}: ${mindshare}`);

      // Check if mindshare is below threshold
      if (mindshare < 0.00001) {
        console.log(`Mindshare too low for fid ${fid}: ${mindshare} < 0.00001. No action taken.`);
        res.status(200).json({ 
          message: "Mindshare too low, no action taken",
          fid: fid,
          mindshare: mindshare
        });
        return;
      }

      console.log(`Mindshare check passed for fid ${fid}: ${mindshare} >= 0.00001. Processing request.`);
    } catch (error) {
      console.error("Error fetching mindshare from Inflynce API:", error);
      res.status(500).json({ 
        error: "Failed to check mindshare",
        message: error instanceof Error ? error.message : "Unknown error"
      });
      return;
    }

    // Fetch wallet addresses from database using fid
    const walletAddresses = await supabaseUtils.getWalletAddressByFid(fid);

    if (!walletAddresses || walletAddresses.length === 0) {
      console.error(`No wallets found for fid: ${fid}`);
      res.status(400).json({ 
        error: `No wallets found for fid: ${fid}` 
      });
      return;
    }

    // Log webhook details for debugging
    console.log(`Processing webhook: type=${type}, table=${table}, fid=${fid}, wallets=${walletAddresses.length}`);

    // Initialize Web3Utils (cached after first call)
    const web3Utils = await initializeWeb3Utils();
    
    if (!web3Utils) {
      res.status(400).json({ 
        error: "Contract not found or not configured properly" 
      });
      return;
    }

    // Process each wallet
    let successful = 0;
    let failed = 0;
    let alreadyProcessed = 0;

    for (const walletAddress of walletAddresses) {
      console.log(`Processing wallet: ${walletAddress}`);
      
      // Check if wallet already exists in claimable_addresses
      const exists = await supabaseUtils.checkWalletExists(walletAddress);
      if (exists) {
        console.log(`Wallet already processed, skipping: ${walletAddress}`);
        alreadyProcessed++;
        continue;
      }
      
      try {
        // Call setClaimableAmount with default amount
        const result = await web3Utils.setClaimableAmount(walletAddress, DEFAULT_SET_CLAIMABLE_AMOUNT);

        if (result.isSuccess) {
          // Insert into claimable_addresses table
          try {
            await supabaseUtils.insertClaimableAddress(walletAddress);
          } catch (error) {
            console.error(`Error inserting into claimable_addresses for ${walletAddress}:`, error);
            // Continue anyway - don't fail the request
          }
          
          console.log(`Successfully processed wallet: ${walletAddress}`);
          successful++;
        } else {
          console.error(`Failed to process wallet: ${walletAddress}`, result.message);
          failed++;
        }
      } catch (error) {
        console.error(`Error processing wallet ${walletAddress}:`, error);
        failed++;
      }
    }

    const total = walletAddresses.length;
    const messageParts = [`${successful} successful`, `${failed} failed`];
    if (alreadyProcessed > 0) {
      messageParts.push(`${alreadyProcessed} already processed`);
    }
    
    res.status(200).json({
      message: `Processed ${total} wallet(s): ${messageParts.join(', ')}`,
      total: total,
      successful: successful,
      failed: failed,
      already_processed: alreadyProcessed
    });
  } catch (error) {
    console.error("Error in setClaimable:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

