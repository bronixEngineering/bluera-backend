import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { chain = 'base', maxPages = 10, concurrency = 5, includeDex = true } = await request.json().catch(() => ({}));
    const origin = new URL(request.url).origin;
    const supabase = getSupabaseServerClient();

    // 1) Load wallets
    const { data: rows, error } = await supabase
      .from('wallets_status') // note: table is wallets_status
      .select('wallet_address')
      .not('wallet_address', 'is', null);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const wallets: string[] = Array.from(
      new Set((rows || []).map((r: any) => String(r.wallet_address || '').toLowerCase()).filter(Boolean))
    );
    if (wallets.length === 0) {
      return NextResponse.json({ success: true, message: 'No wallets in wallets_status', triggered: 0 });
    }

    // 2) Trigger Dexscreener once (optional)
    let dex = { success: false, updated: 0 };
    if (includeDex) {
      const resp = await fetch(`${origin}/api/dexscreenr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain }),
      });
      dex = await resp.json().catch(() => ({ success: false, updated: 0 }));
    }

    // 3) Trigger Moralis volume+pnl for each wallet with simple concurrency
    const chunks: string[][] = [];
    for (let i = 0; i < wallets.length; i += Math.max(1, Number(concurrency) || 5)) {
      chunks.push(wallets.slice(i, i + Math.max(1, Number(concurrency) || 5)));
    }

    let ok = 0, fail = 0;
    for (const group of chunks) {
      const results = await Promise.allSettled(group.map((w) =>
        fetch(`${origin}/api/moralis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: w, chain, maxPages }),
        }).then(r => r.json())
      ));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.success) ok += 1;
        else fail += 1;
      }
    }

    return NextResponse.json({
      success: true,
      wallets: wallets.length,
      moralis: { ok, fail },
      dex,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}