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
        console.error(`Error fetching contract abi`, selectError);
        return null;
      }

      if (!contract) {
        return null;
      }

      return contract;
    } catch (error) {
      console.log("ERROR FETCHING CONTRACT ABI: ", error);
      return null;
    }
  }

  async getLatestBlockNumberFromDb(eventName: string, contractAddress: string) {
    try {
      let { data: latestBlock, error: selectError } = await this.supabase
        .from("latest_block_numbers")
        .select("*")
        .eq("event_name", eventName)
        .eq("contract_address", contractAddress);

      if (selectError) {
        console.error(`Error fetching latest blocks`, selectError);
        return -1;
      }

      if (!latestBlock || latestBlock.length === 0) {
        const newLatestBlockDocument = {
          event_name: eventName,
          contract_address: contractAddress,
          block_number: 0,
        };
        const { data, error } = await this.supabase
          .from("latest_block_numbers")
          .insert(newLatestBlockDocument);
        if (error) {
          console.error(`Error inserting new latest block:`, error);
        }
        return 0;
      }

      return latestBlock[0].block_number;
    } catch (error) {
      console.log("ERROR FETCHING LATEST BLOCKS: ", error);
      return -1;
    }
  }

  async updateLatestBlockNumber(
    block_number: number,
    eventName: string,
    contractAddress: string
  ) {
    try {
      const { data, error } = await this.supabase
        .from("latest_block_numbers")
        .update({ block_number })
        .eq("event_name", eventName)
        .eq("contract_address", contractAddress)
        .single();

      if (error) {
        console.error(`Error updating latest block:`, error);
        return false;
      }

      return true;
    } catch (error) {
      console.log("ERROR UPDATING LATEST BLOCK: ", error);
      return false;
    }
  }

  async getWalletStatus(walletAddress: string) {
    try {
      const { data: walletStatus, error } = await this.supabase
        .from("wallets_status")
        .select("*")
        .eq("wallet_address", walletAddress)
        .single();

      if (error) {
        console.error(`Error fetching wallet status:`, error);
        return null;
      }

      if (!walletStatus) {
        console.log(`No wallet status found for address: ${walletAddress}`);
        return null;
      }

      return walletStatus;
    } catch (error) {
      console.log("ERROR FETCHING WALLET STATUS: ", error);
      return null;
    }
  }

  async getWalletTokenStatus(walletAddress: string) {
    try {
      const { data: walletTokenStatus, error } = await this.supabase
        .from("wallet_token_status")
        .select("*")
        .eq("wallet_address", walletAddress);

      if (error) {
        console.error(`Error fetching wallet token status:`, error);
        return null;
      }

      if (!walletTokenStatus || walletTokenStatus.length === 0) {
        console.log(`No wallet token status found for address: ${walletAddress}`);
        return null;
      }

      return walletTokenStatus;
    } catch (error) {
      console.log("ERROR FETCHING WALLET TOKEN STATUS: ", error);
      return null;
    }
  }

  async updateAuraCard(supabaseId: string, tokenId: number, metadata: any) {
    try {
      const { data, error } = await this.supabase
        .from("aura_card")
        .update({ minted: true, nft_id: tokenId, metadata: metadata })
        .eq("id", supabaseId)
        .select();

      if (error) {
        console.error(`Error updating aura card:`, error);
        return {
          isSuccess: false,
          errorMessage: String(error),
        };
      }

      if (!data || data.length === 0) {
        console.error(`No aura card found with id: ${supabaseId}`);
        return {
          isSuccess: false,
          errorMessage: `No aura card found with id: ${supabaseId}`,
        };
      }

      return {
        isSuccess: true,
        errorMessage: undefined,
      };
    } catch (error) {
      console.log("ERROR UPDATING AURA CARD: ", error);
      return {
        isSuccess: false,
        errorMessage: String(error),
      };
    }
  }
}
