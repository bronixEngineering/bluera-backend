import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { walletAddress, include } = await request.json();
    
    const apiKey = process.env.MORALIS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'MORALIS_API_KEY not found in environment' },
        { status: 500 }
      );
    }

    const baseUrl = 'https://deep-index.moralis.io/api/v2.2';
    const headers = { 'X-API-Key': apiKey };

    // Build URLs with proper encoding
    const transfersUrl = `${baseUrl}/${walletAddress}/erc20/transfers?chain=base`;
    const swapsUrl = `${baseUrl}/wallets/${walletAddress}/swaps?chain=base`;
    
    // Net Worth URL with proper array parameter encoding
    const netWorthParams = new URLSearchParams({
      'exclude_spam': 'true',
      'exclude_unverified_contracts': 'true',
      'max_token_inactivity': '1',
      'min_pair_side_liquidity_usd': '1000'
    });
    netWorthParams.append('chains[]', 'base');
    const netWorthUrl = `${baseUrl}/wallets/${walletAddress}/net-worth?${netWorthParams.toString()}`;
    
    const profitabilityUrl = `${baseUrl}/wallets/${walletAddress}/profitability/summary?days=30&chain=base`;
    const walletStatsUrl = `${baseUrl}/wallets/${walletAddress}/stats?chain=base`;

    // Determine which endpoints to include
    const allowedKeys = ['transfers', 'swaps', 'netWorth', 'profitability', 'walletStats'] as const;
    const includeSet = new Set(
      Array.isArray(include)
        ? include.filter((k: string) => allowedKeys.includes(k as any))
        : allowedKeys
    );

    const tasks: Array<{ key: 'transfers' | 'swaps' | 'netWorth' | 'profitability' | 'walletStats', name: string, url: string }>
      = [];
    if (includeSet.has('transfers')) tasks.push({ key: 'transfers', name: 'ERC20 Transfers', url: transfersUrl });
    if (includeSet.has('swaps')) tasks.push({ key: 'swaps', name: 'Swaps', url: swapsUrl });
    if (includeSet.has('netWorth')) tasks.push({ key: 'netWorth', name: 'Net Worth', url: netWorthUrl });
    if (includeSet.has('profitability')) tasks.push({ key: 'profitability', name: 'Profitability', url: profitabilityUrl });
    if (includeSet.has('walletStats')) tasks.push({ key: 'walletStats', name: 'Wallet Stats', url: walletStatsUrl });

    // Prepare request details for UI
    const requests = tasks.map(t => ({
      name: t.name,
      url: t.url,
      method: 'GET',
      headers: { 'X-API-Key': '[HIDDEN]' }
    }));

    // Parallel API calls with timing
    const startTime = Date.now();
    
    const fetchResponses = await Promise.all(tasks.map(t => fetch(t.url, { headers })));

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    const parsed = await Promise.all(fetchResponses.map(r => r.json()));

    // Prepare response details
    const responses = fetchResponses.map((res, idx) => ({
      name: tasks[idx].name,
      status: res.status,
      statusText: res.statusText,
      data: parsed[idx],
      size: JSON.stringify(parsed[idx]).length
    }));

    // Build data object keyed by requested endpoints
    const data: Record<string, any> = {};
    tasks.forEach((t, idx) => { data[t.key] = parsed[idx]; });

    // Compute derived metrics for wallet stats if included
    if (includeSet.has('walletStats')) {
      const idx = tasks.findIndex(t => t.key === 'walletStats');
      if (idx !== -1) {
        const stats = parsed[idx] ?? {};
        const transactionsTotal = Number(stats?.transactions?.total ?? 0);
        const tokenTransfersTotal = Number(stats?.token_transfers?.total ?? 0);
        const totalActivity = (Number.isFinite(transactionsTotal) ? transactionsTotal : 0)
          + (Number.isFinite(tokenTransfersTotal) ? tokenTransfersTotal : 0);
        data.walletStatsComputed = {
          transactionsTotal: Number.isFinite(transactionsTotal) ? transactionsTotal : 0,
          tokenTransfersTotal: Number.isFinite(tokenTransfersTotal) ? tokenTransfersTotal : 0,
          totalActivity,
        };
      }
    }

    return NextResponse.json({
      success: true,
      wallet: walletAddress,
      timing: {
        totalTime: `${totalTime}ms`,
        requestCount: tasks.length
      },
      requests,
      responses,
      included: Array.from(includeSet),
      data,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
