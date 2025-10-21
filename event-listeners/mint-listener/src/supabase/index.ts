import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

class SupabaseService {
  private static instance: SupabaseClient;

  private constructor() {
    // Private constructor to prevent direct instantiation
  }

  public static getInstance(): SupabaseClient {
    if (!SupabaseService.instance) {
      const supabaseUrl = process.env.SUPABASE_URL || "";
      const supabaseKey = process.env.SUPABASE_KEY || "";

      if (!supabaseUrl || !supabaseKey) {
        throw new Error(
          "Supabase URL and Key must be set in the environment variables"
        );
      }

      SupabaseService.instance = createClient(supabaseUrl, supabaseKey);
    }

    return SupabaseService.instance;
  }
}

export default SupabaseService;
