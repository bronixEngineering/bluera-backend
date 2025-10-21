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
}
