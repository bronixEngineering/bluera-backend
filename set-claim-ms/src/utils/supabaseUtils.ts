import SupabaseService from "../supabase";
import * as dotenv from "dotenv";

dotenv.config();

export default class SupabaseUtils {
  private supabase: any;

  constructor() {
    this.supabase = SupabaseService.getInstance();
  }

  async getContract(contractAddress: string) {
    try {
      const { data: contract, error: selectError } = await this.supabase
        .from("contracts")
        .select("*")
        .eq("address", contractAddress)
        .single();

      if (selectError) {
        console.error(`Error fetching contract`, selectError);
        return null;
      }

      if (!contract) {
        return null;
      }

      return contract;
    } catch (error) {
      console.log("ERROR FETCHING CONTRACT: ", error);
      return null;
    }
  }

  async getWalletAddressByFid(fid: string) {
    try {
      const { data: wallets, error: selectError } = await this.supabase
        .from("wallets_status")
        .select("wallet_address")
        .eq("fid", fid);

      if (selectError) {
        console.error(`Error fetching wallet addresses for fid: ${fid}`, selectError);
        return null;
      }

      if (!wallets || wallets.length === 0) {
        console.log(`No wallets found for fid: ${fid}`);
        return null;
      }

      console.log(`Found ${wallets.length} wallet(s) for fid: ${fid}`);
      return wallets.map((w: any) => w.wallet_address);
    } catch (error) {
      console.error("ERROR FETCHING WALLET ADDRESSES: ", error);
      return null;
    }
  }

  async checkWalletExists(walletAddress: string) {
    try {
      const { data, error } = await this.supabase
        .from("claimable_addresses")
        .select("wallet_address")
        .eq("wallet_address", walletAddress)
        .single();

      if (error) {
        // If error code is PGRST116, it means no rows found (doesn't exist)
        if (error.code === "PGRST116") {
          return false;
        }
        console.error(`Error checking if wallet exists in claimable_addresses:`, error);
        return false;
      }

      return data !== null;
    } catch (error) {
      console.error("ERROR CHECKING WALLET EXISTS: ", error);
      return false;
    }
  }

  async insertClaimableAddress(walletAddress: string) {
    try {
      const { error: insertError } = await this.supabase
        .from("claimable_addresses")
        .insert({
          wallet_address: walletAddress,
        });

      if (insertError) {
        // Check if it's a duplicate key error (code 23505 is unique violation)
        if (insertError.code === "23505") {
          console.error(`Wallet address already exists in claimable_addresses: ${walletAddress}`);
        } else {
          console.error(`Error inserting into claimable_addresses:`, insertError);
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error("ERROR INSERTING INTO CLAIMABLE_ADDRESSES: ", error);
      return false;
    }
  }
}
