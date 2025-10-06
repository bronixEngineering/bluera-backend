import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from('whitelisted_tokens')
      .select('token_address, token_name, token_ticker, token_decimals');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tokenAddresses = (data || []).map((row) => row.token_address);

    return NextResponse.json({
      success: true,
      count: tokenAddresses.length,
      token_addresses: tokenAddresses,
      data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


