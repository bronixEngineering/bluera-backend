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
 * Handles Supabase webhook payloads from claimable_addresses table
 * 
 * Request body: Supabase webhook payload with record.wallet_address
 */
export const setClaimable = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, table, record } = req.body;

    // Validate webhook payload structure
    if (!record || !record.wallet_address) {
      res.status(400).json({ 
        error: "Missing required field: record.wallet_address" 
      });
      return;
    }

    // Extract wallet address from webhook payload
    const walletAddress = record.wallet_address;

    // Log webhook details for debugging
    console.log(`Processing webhook: type=${type}, table=${table}, wallet=${walletAddress}`);

    // Initialize Web3Utils (cached after first call)
    const web3Utils = await initializeWeb3Utils();
    
    if (!web3Utils) {
      res.status(400).json({ 
        error: "Contract not found or not configured properly" 
      });
      return;
    }

    // Call setClaimableAmount with default amount
    const result = await web3Utils.setClaimableAmount(walletAddress, DEFAULT_SET_CLAIMABLE_AMOUNT);

    // Return result as-is
    if (result.isSuccess) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error("Error in setClaimable:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

