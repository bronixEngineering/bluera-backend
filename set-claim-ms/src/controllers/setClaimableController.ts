import { Request, Response } from "express";
import Web3Utils from "../utils/web3Utils";
import SupabaseUtils from "../utils/supabaseUtils";
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
 * Sets claimable amount for a wallet address
 * 
 * Request body: { wallet: string, amount: number }
 */
export const setClaimable = async (req: Request, res: Response): Promise<void> => {
  try {
    const { wallet, amount } = req.body;

    // Validate request body
    if (!wallet || amount === undefined) {
      res.status(400).json({ 
        error: "Missing required fields: wallet and amount" 
      });
      return;
    }

    // Validate amount is a positive number
    if (typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ 
        error: "Amount must be a positive number" 
      });
      return;
    }

    // Initialize Web3Utils (cached after first call)
    const web3Utils = await initializeWeb3Utils();
    
    if (!web3Utils) {
      res.status(400).json({ 
        error: "Contract not found or not configured properly" 
      });
      return;
    }

    // Call setClaimableAmount
    const result = await web3Utils.setClaimableAmount(wallet, amount);

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

