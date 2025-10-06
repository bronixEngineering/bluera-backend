import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();
    
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

    // Prepare request details
    const requests = [
      {
        name: 'ERC20 Transfers',
        url: transfersUrl,
        method: 'GET',
        headers: { 'X-API-Key': '[HIDDEN]' }
      },
      {
        name: 'Swaps',
        url: swapsUrl,
        method: 'GET',
        headers: { 'X-API-Key': '[HIDDEN]' }
      },
      {
        name: 'Net Worth',
        url: netWorthUrl,
        method: 'GET',
        headers: { 'X-API-Key': '[HIDDEN]' }
      },
      {
        name: 'Profitability',
        url: profitabilityUrl,
        method: 'GET',
        headers: { 'X-API-Key': '[HIDDEN]' }
      }
    ];

    // Parallel API calls with timing
    const startTime = Date.now();
    
    const [transfersRes, swapsRes, netWorthRes, profitabilityRes] = await Promise.all([
      fetch(transfersUrl, { headers }),
      fetch(swapsUrl, { headers }),
      fetch(netWorthUrl, { headers }),
      fetch(profitabilityUrl, { headers })
    ]);

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    const [transfers, swaps, netWorth, profitability] = await Promise.all([
      transfersRes.json(),
      swapsRes.json(),
      netWorthRes.json(),
      profitabilityRes.json()
    ]);

    // Prepare response details
    const responses = [
      {
        name: 'ERC20 Transfers',
        status: transfersRes.status,
        statusText: transfersRes.statusText,
        data: transfers,
        size: JSON.stringify(transfers).length
      },
      {
        name: 'Swaps',
        status: swapsRes.status,
        statusText: swapsRes.statusText,
        data: swaps,
        size: JSON.stringify(swaps).length
      },
      {
        name: 'Net Worth',
        status: netWorthRes.status,
        statusText: netWorthRes.statusText,
        data: netWorth,
        size: JSON.stringify(netWorth).length
      },
      {
        name: 'Profitability',
        status: profitabilityRes.status,
        statusText: profitabilityRes.statusText,
        data: profitability,
        size: JSON.stringify(profitability).length
      }
    ];

    return NextResponse.json({
      success: true,
      wallet: walletAddress,
      timing: {
        totalTime: `${totalTime}ms`,
        requestCount: 4
      },
      requests,
      responses,
      data: {
        transfers,
        swaps,
        netWorth,
        profitability
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
