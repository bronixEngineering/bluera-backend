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
        console.error(`Error fetching wallet address for fid: ${fid}`, selectError);
        return null;
      }

      if (!wallets || wallets.length === 0) {
        console.log(`No wallet found for fid: ${fid}`);
        return null;
      }

      if (wallets.length > 1) {
        console.log(`Multiple wallets found for fid: ${fid}, taking the first one`);
      } else {
        console.log(`Wallet found for fid: ${fid}`);
      }

      return wallets[0].wallet_address;
    } catch (error) {
      console.error("ERROR FETCHING WALLET ADDRESS: ", error);
      return null;
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
