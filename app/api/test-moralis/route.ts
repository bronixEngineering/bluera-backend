import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { walletAddress, include, tokenAddresses } = await request.json();
    
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
    
    // Token balances URL with optional token address filters
    let tokenBalancesUrl: string | null = null;
    if (Array.isArray(include) && include.includes('tokenBalances')) {
      if (!Array.isArray(tokenAddresses) || tokenAddresses.length === 0) {
        return NextResponse.json(
          { error: 'tokenBalances requested but tokenAddresses is missing or empty' },
          { status: 400 }
        );
      }
      const tbParams = new URLSearchParams({ chain: 'base' });
      for (const addr of tokenAddresses) {
        if (typeof addr === 'string' && addr.trim()) {
          tbParams.append('token_addresses[]', addr.trim());
        }
      }
      tokenBalancesUrl = `${baseUrl}/wallets/${walletAddress}/tokens?${tbParams.toString()}`;
    }

    // Determine which endpoints to include
    const allowedKeys = ['transfers', 'swaps', 'netWorth', 'profitability', 'walletStats', 'tokenBalances'] as const;
    const includeSet = new Set(
      Array.isArray(include)
        ? include.filter((k: string) => allowedKeys.includes(k as any))
        : allowedKeys
    );

    const tasks: Array<{ key: 'transfers' | 'swaps' | 'netWorth' | 'profitability' | 'walletStats' | 'tokenBalances', name: string, url: string }>
      = [];
    if (includeSet.has('transfers')) tasks.push({ key: 'transfers', name: 'ERC20 Transfers', url: transfersUrl });
    if (includeSet.has('swaps')) tasks.push({ key: 'swaps', name: 'Swaps', url: swapsUrl });
    if (includeSet.has('netWorth')) tasks.push({ key: 'netWorth', name: 'Net Worth', url: netWorthUrl });
    if (includeSet.has('profitability')) tasks.push({ key: 'profitability', name: 'Profitability', url: profitabilityUrl });
    if (includeSet.has('walletStats')) tasks.push({ key: 'walletStats', name: 'Wallet Stats', url: walletStatsUrl });
    if (includeSet.has('tokenBalances') && tokenBalancesUrl) tasks.push({ key: 'tokenBalances', name: 'Token Balances', url: tokenBalancesUrl });

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

    // Compute derived metrics for token balances if included (only usd_value is needed)
    if (includeSet.has('tokenBalances')) {
      const idx = tasks.findIndex(t => t.key === 'tokenBalances');
      if (idx !== -1) {
        const tb = parsed[idx] ?? {};
        const usdValues: number[] = Array.isArray(tb?.result)
          ? tb.result.map((r: any) => Number(r?.usd_value ?? 0)).map((v: number) => (Number.isFinite(v) ? v : 0))
          : [];
        const totalUsdValue = usdValues.reduce((sum, v) => sum + v, 0);
        data.tokenBalancesComputed = {
          usdValues,
          totalUsdValue,
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
