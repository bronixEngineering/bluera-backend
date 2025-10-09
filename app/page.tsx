'use client';

import { useState } from 'react';

const TEST_WALLETS = [
  { fid: '569188', address: '0x9f25aef6871710d2b7f4717775c63764589f3e61' },
  { fid: '912281', address: '0x51a416e0ef70390720b08520a1ae58d4a7f4b90b' },
  { fid: '314665', address: '0x560c47ebf69791b0695cadf341de3663ff946ef6' },
  { fid: '808836', address: '0x9450089008dd3a9c76a88dd7aad85b61217c24bb' },
  { fid: '314392', address: '0x13ba90fc651faef556887139b6b1c6d7150d91cf' },
];

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selectedWallet, setSelectedWallet] = useState(TEST_WALLETS[0].address);
  const [customWallet, setCustomWallet] = useState('');
  const [activeDetail, setActiveDetail] = useState<string | null>(null);
  const [expandedResponses, setExpandedResponses] = useState<{[key: number]: boolean}>({});
  const [showFullRaw, setShowFullRaw] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [include, setInclude] = useState<{ transfers: boolean; swaps: boolean; netWorth: boolean; profitability: boolean; walletStats?: boolean; tokenBalances?: boolean }>(
    { transfers: true, swaps: true, netWorth: true, profitability: true }
  );
  const [tokenAddressesInput, setTokenAddressesInput] = useState('');
  const [fidInput, setFidInput] = useState('');

  const getIncludeArray = () => Object.entries(include)
    .filter(([_, v]) => v)
    .map(([k]) => k);

  const runTest = async () => {
    setLoading(true);
    setResults(null);
    setActiveDetail(null);
    setExpandedResponses({});
    setShowFullRaw(false);

    const walletToTest = customWallet || selectedWallet;
    const includeArr = getIncludeArray();
    const tokenAddresses = tokenAddressesInput
      .split(/[\s,\n]+/)
      .map(s => s.trim())
      .filter(s => s);
    const fid = fidInput && !isNaN(Number(fidInput)) ? Number(fidInput) : undefined;

    try {
      const response = await fetch('/api/test-moralis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: walletToTest, include: includeArr, tokenAddresses, fid }),
      });

      const data = await response.json();
      setResults(data);
    } catch (error: any) {
      setResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const toggleResponseExpansion = (index: number) => {
    setExpandedResponses(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const renderDetailModal = () => {
    if (!activeDetail || !results?.data) return null;

    const data = results.data[activeDetail];
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
          <div className="p-6 border-b flex justify-between items-center">
            <h3 className="text-xl font-semibold capitalize">{activeDetail} Details</h3>
            <button 
              onClick={() => setActiveDetail(null)}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
          <div className="p-6 overflow-auto max-h-[60vh]">
            {activeDetail === 'transfers' && (
              <div>
                <p className="mb-4 text-gray-600">
                  Total: {data?.result?.length || 0} transfers
                </p>
                <div className="space-y-3">
                  {data?.result?.slice(0, 10).map((transfer: any, idx: number) => (
                    <div key={idx} className="border rounded p-3 bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium">{transfer.token_symbol}</span>
                        <span className="text-sm text-gray-500">
                          {new Date(transfer.block_timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm">Amount: {transfer.value_decimal}</p>
                      <p className="text-xs text-gray-500">From: {transfer.from_address}</p>
                      <p className="text-xs text-gray-500">To: {transfer.to_address}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeDetail === 'swaps' && (
              <div>
                <p className="mb-4 text-gray-600">
                  Total: {data?.result?.length || 0} swaps
                </p>
                <div className="space-y-3">
                  {data?.result?.slice(0, 10).map((swap: any, idx: number) => (
                    <div key={idx} className="border rounded p-3 bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium">
                          {swap.token_0_symbol} → {swap.token_1_symbol}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(swap.block_timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm">Value: ${swap.value_usd || 'N/A'}</p>
                      <p className="text-xs text-gray-500">DEX: {swap.exchange || 'Unknown'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeDetail === 'netWorth' && (
              <div>
                <div className="mb-4">
                  <h4 className="font-semibold mb-2">Portfolio Breakdown</h4>
                  <p className="text-2xl font-bold text-blue-600 mb-2">
                    ${data?.total_networth_usd || '0'}
                  </p>
                </div>
                <div className="space-y-3">
                  {data?.tokens?.slice(0, 10).map((token: any, idx: number) => (
                    <div key={idx} className="border rounded p-3 bg-gray-50">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-medium">{token.symbol}</span>
                          <p className="text-sm text-gray-600">{token.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">${token.usd_value || '0'}</p>
                          <p className="text-sm text-gray-500">{token.balance_formatted}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeDetail === 'profitability' && (
              <div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-green-50 p-3 rounded">
                    <p className="text-sm text-gray-600">Total P&L</p>
                    <p className="text-xl font-bold text-green-600">
                      ${data?.total_usd_pnl || '0'}
                    </p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-sm text-gray-600">Total Trades</p>
                    <p className="text-xl font-bold text-blue-600">
                      {data?.total_trades || '0'}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {data?.result?.slice(0, 10).map((token: any, idx: number) => (
                    <div key={idx} className="border rounded p-3 bg-gray-50">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{token.token_symbol}</span>
                        <div className="text-right">
                          <p className={`font-medium ${parseFloat(token.usd_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${token.usd_pnl || '0'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {token.count_of_trades} trades
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    if (!results?.success || !results?.data) return null;

    const { transfers, swaps, netWorth, profitability, walletStats, walletStatsComputed, tokenBalances, tokenBalancesComputed } = results.data;
    const included = new Set(results.included ?? Object.keys(results.data));

    // Calculate swap metrics
    const swapResults = swaps?.result || [];
    const totalSwapVolume = swapResults.reduce((sum: number, swap: any) => sum + (parseFloat(swap.totalValueUsd) || 0), 0);
    const buySwaps = swapResults.filter((swap: any) => swap.transactionType === 'buy').length;
    const sellSwaps = swapResults.filter((swap: any) => swap.transactionType === 'sell').length;

    // Calculate transfer metrics
    const transferResults = transfers?.result || [];
    const uniqueTokens = new Set(transferResults.map((t: any) => t.token_symbol)).size;

    // Fix profitability metrics
    const totalPnL = profitability?.total_realized_profit_usd || '0';
    const totalTrades = profitability?.total_count_of_trades || 0;
    const profitPercentage = profitability?.total_realized_profit_percentage || 0;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Net Worth */}
        {included.has('netWorth') && (
        <div 
          className="bg-blue-50 border border-blue-200 rounded-lg p-4 cursor-pointer hover:bg-blue-100 transition-colors"
          onClick={() => setActiveDetail('netWorth')}
        >
          <h4 className="font-semibold text-blue-800 mb-2">💰 Net Worth</h4>
          <p className="text-2xl font-bold text-blue-900">
            ${parseFloat(netWorth?.total_networth_usd || '0').toLocaleString()}
          </p>
          <p className="text-sm text-blue-600">
            {netWorth?.tokens?.length || 0} tokens
          </p>
          <p className="text-xs text-blue-500 mt-1">Click to view details</p>
        </div>
        )}

        {/* Transfers */}
        {included.has('transfers') && (
        <div 
          className="bg-green-50 border border-green-200 rounded-lg p-4 cursor-pointer hover:bg-green-100 transition-colors"
          onClick={() => setActiveDetail('transfers')}
        >
          <h4 className="font-semibold text-green-800 mb-2">📤 Transfers</h4>
          <p className="text-2xl font-bold text-green-900">
            {transferResults.length}
          </p>
          <p className="text-sm text-green-600">
            {uniqueTokens} unique tokens
          </p>
          <p className="text-xs text-green-500 mt-1">Click to view details</p>
        </div>
        )}

        {/* Swaps */}
        {included.has('swaps') && (
        <div 
          className="bg-purple-50 border border-purple-200 rounded-lg p-4 cursor-pointer hover:bg-purple-100 transition-colors"
          onClick={() => setActiveDetail('swaps')}
        >
          <h4 className="font-semibold text-purple-800 mb-2">🔄 Swaps</h4>
          <p className="text-2xl font-bold text-purple-900">
            {swapResults.length}
          </p>
          <p className="text-sm text-purple-600">
            ${totalSwapVolume.toLocaleString()} volume
          </p>
          <p className="text-xs text-purple-500 mt-1">
            {buySwaps} buys, {sellSwaps} sells
          </p>
        </div>
        )}

        {/* Profitability - FIXED */}
        {included.has('profitability') && (
        <div 
          className="bg-orange-50 border border-orange-200 rounded-lg p-4 cursor-pointer hover:bg-orange-100 transition-colors"
          onClick={() => setActiveDetail('profitability')}
        >
          <h4 className="font-semibold text-orange-800 mb-2">📈 P&L (30d)</h4>
          <p className={`text-2xl font-bold ${
            parseFloat(totalPnL) >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            ${parseFloat(totalPnL).toLocaleString()}
          </p>
          <p className="text-sm text-orange-600">
            {totalTrades} trades ({profitPercentage.toFixed(2)}%)
          </p>
          <p className="text-xs text-orange-500 mt-1">Click to view details</p>
        </div>
        )}

        {/* Wallet Stats */}
        {included.has('walletStats') && (
        <div 
          className="bg-teal-50 border border-teal-200 rounded-lg p-4 cursor-pointer hover:bg-teal-100 transition-colors"
          onClick={() => setActiveDetail('walletStats')}
        >
          <h4 className="font-semibold text-teal-800 mb-2">🧮 Wallet Stats</h4>
          <p className="text-2xl font-bold text-teal-900">
            {walletStatsComputed?.totalActivity ?? 0}
          </p>
          <p className="text-sm text-teal-600">
            {walletStatsComputed?.transactionsTotal ?? 0} txn • {walletStatsComputed?.tokenTransfersTotal ?? 0} token transfers
          </p>
          <p className="text-xs text-teal-500 mt-1">Click to view details</p>
        </div>
        )}

        {/* Token Balances */}
        {included.has('tokenBalances') && (
        <div 
          className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 cursor-pointer hover:bg-yellow-100 transition-colors"
          onClick={() => setActiveDetail('tokenBalances')}
        >
          <h4 className="font-semibold text-yellow-800 mb-2">💵 Token Balances</h4>
          <p className="text-2xl font-bold text-yellow-900">
            ${Number(tokenBalancesComputed?.totalUsdValue ?? 0).toLocaleString()}
          </p>
          <p className="text-sm text-yellow-600">
            {Array.isArray(tokenBalancesComputed?.usdValues) ? tokenBalancesComputed?.usdValues.length : 0} tokens queried
          </p>
          <p className="text-xs text-yellow-500 mt-1">Click to view details</p>
        </div>
        )}
      </div>
    );
  };

  const renderRequestResponse = () => {
    if (!results?.success || !results?.requests || !results?.responses) return null;

    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">API Requests & Responses</h3>
          <div className="text-sm text-gray-600">
            Total Time: {results.timing?.totalTime} | Requests: {results.timing?.requestCount}
          </div>
        </div>
        
        <div className="space-y-6">
          {results.requests.map((req: any, idx: number) => {
            const res = results.responses[idx];
            const isExpanded = expandedResponses[idx];
            const jsonString = JSON.stringify(res.data, null, 2);
            const shouldTruncate = jsonString.length > 1000;
            const displayJson = isExpanded || !shouldTruncate ? jsonString : jsonString.substring(0, 1000);
            
            return (
              <div key={idx} className="border rounded-lg overflow-hidden">
                {/* Request Header */}
                <div className="bg-blue-50 p-4 border-b">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold text-blue-800">{req.name}</h4>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      res.status === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {res.status} {res.statusText}
                    </span>
                  </div>
                  <div className="text-sm">
                    <p><span className="font-medium">Method:</span> {req.method}</p>
                    <p><span className="font-medium">URL:</span> <code className="bg-white px-1 rounded text-xs break-all">{req.url}</code></p>
                    <p><span className="font-medium">Response Size:</span> {(res.size / 1024).toFixed(2)} KB</p>
                  </div>
                </div>

                {/* Response Preview */}
                <div className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Response Data:</span>
                    <div className="flex gap-2">
                      {shouldTruncate && (
                        <button
                          onClick={() => toggleResponseExpansion(idx)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          {isExpanded ? 'Show Less' : 'Show More'}
                        </button>
                      )}
                      <button
                        onClick={() => copyToClipboard(jsonString, idx)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          copiedIndex === idx 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {copiedIndex === idx ? '✓ Copied!' : '📋 Copy'}
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-3 rounded overflow-auto" style={{ maxHeight: isExpanded ? 'none' : '300px' }}>
                    <pre className="text-xs whitespace-pre-wrap">
                      {displayJson}
                      {shouldTruncate && !isExpanded && '\n\n... (truncated)'}
                    </pre>
                  </div>
                  
                  {/* Enhanced Quick Stats - FIXED */}
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    {res.data?.result && (
                      <div className="bg-blue-100 px-2 py-1 rounded">
                        📊 {res.data.result.length} results
                      </div>
                    )}
                    
                    {res.data?.page !== undefined && (
                      <div className="bg-gray-100 px-2 py-1 rounded">
                        📄 Page {res.data.page}
                      </div>
                    )}
                    
                    {res.data?.pageSize && (
                      <div className="bg-gray-100 px-2 py-1 rounded">
                        📏 Size {res.data.pageSize}
                      </div>
                    )}
                    
                    {res.data?.total_networth_usd && (
                      <div className="bg-green-100 px-2 py-1 rounded">
                        💰 ${parseFloat(res.data.total_networth_usd).toLocaleString()}
                      </div>
                    )}
                    
                    {/* FIXED: Use correct profitability field */}
                    {res.data?.total_realized_profit_usd !== undefined && (
                      <div className={`px-2 py-1 rounded ${
                        parseFloat(res.data.total_realized_profit_usd) >= 0 ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        📈 ${parseFloat(res.data.total_realized_profit_usd).toLocaleString()}
                      </div>
                    )}
                    
                    {res.data?.total_count_of_trades && (
                      <div className="bg-purple-100 px-2 py-1 rounded">
                        🔄 {res.data.total_count_of_trades} trades
                      </div>
                    )}

                    {res.data?.total_realized_profit_percentage && (
                      <div className={`px-2 py-1 rounded ${
                        parseFloat(res.data.total_realized_profit_percentage) >= 0 ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        📊 {parseFloat(res.data.total_realized_profit_percentage).toFixed(2)}%
                      </div>
                    )}

                    {/* Swaps specific stats */}
                    {req.name === 'Swaps' && res.data?.result && (
                      <>
                        <div className="bg-green-100 px-2 py-1 rounded">
                          📈 {res.data.result.filter((s: any) => s.transactionType === 'buy').length} buys
                        </div>
                        <div className="bg-red-100 px-2 py-1 rounded">
                          📉 {res.data.result.filter((s: any) => s.transactionType === 'sell').length} sells
                        </div>
                        <div className="bg-yellow-100 px-2 py-1 rounded">
                          💵 ${res.data.result.reduce((sum: number, s: any) => sum + (parseFloat(s.totalValueUsd) || 0), 0).toLocaleString()} volume
                        </div>
                      </>
                    )}

                    {/* Transfers specific stats */}
                    {req.name === 'ERC20 Transfers' && res.data?.result && (
                      <div className="bg-indigo-100 px-2 py-1 rounded">
                        🪙 {new Set(res.data.result.map((t: any) => t.token_symbol)).size} unique tokens
                      </div>
                    )}

                    {/* Profitability specific stats */}
                    {req.name === 'Profitability' && res.data && (
                      <>
                        <div className="bg-green-100 px-2 py-1 rounded">
                          📈 {res.data.total_buys || 0} buys
                        </div>
                        <div className="bg-red-100 px-2 py-1 rounded">
                          📉 {res.data.total_sells || 0} sells
                        </div>
                        <div className="bg-blue-100 px-2 py-1 rounded">
                          💰 ${parseFloat(res.data.total_trade_volume || '0').toLocaleString()} volume
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Bluera API Test Dashboard</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Moralis API - Comprehensive Test</h2>
          <p className="text-gray-600 mb-4">
            Tests: ERC20 Transfers, Swaps, Net Worth, Profitability (30 days)
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">Select Test Wallet:</label>
              <select 
                value={selectedWallet}
                onChange={(e) => setSelectedWallet(e.target.value)}
                className="w-full border rounded-lg p-2"
                disabled={customWallet !== ''}
              >
                {TEST_WALLETS.map((wallet) => (
                  <option key={wallet.address} value={wallet.address}>
                    FID: {wallet.fid} - {wallet.address}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Or Enter Custom Wallet:</label>
              <input
                type="text"
                value={customWallet}
                onChange={(e) => setCustomWallet(e.target.value)}
                placeholder="0x..."
                className="w-full border rounded-lg p-2"
              />
            </div>
          </div>

          {/* FID input */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">FID (optional):</label>
            <input
              type="text"
              value={fidInput}
              onChange={(e) => setFidInput(e.target.value)}
              placeholder="e.g. 569188"
              className="w-full border rounded-lg p-2"
            />
          </div>

          {customWallet && (
            <p className="text-sm text-blue-600 mb-4">
              Using custom wallet: {customWallet}
            </p>
          )}
          
          {/* Endpoint selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Select endpoints:</label>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={include.transfers} onChange={() => setInclude(prev => ({ ...prev, transfers: !prev.transfers }))} />
                Transfers
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={include.swaps} onChange={() => setInclude(prev => ({ ...prev, swaps: !prev.swaps }))} />
                Swaps
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={include.netWorth} onChange={() => setInclude(prev => ({ ...prev, netWorth: !prev.netWorth }))} />
                Net Worth
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={include.profitability} onChange={() => setInclude(prev => ({ ...prev, profitability: !prev.profitability }))} />
                Profitability
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={(include as any).walletStats ?? false} onChange={() => setInclude(prev => ({ ...(prev as any), walletStats: !((prev as any).walletStats ?? false) }))} />
                Wallet Stats
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={(include as any).tokenBalances ?? false} onChange={() => setInclude(prev => ({ ...(prev as any), tokenBalances: !((prev as any).tokenBalances ?? false) }))} />
                Token Balances
              </label>
            </div>
          </div>

          {(include as any).tokenBalances && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Token addresses (comma or newline separated):</label>
              <textarea
                value={tokenAddressesInput}
                onChange={(e) => setTokenAddressesInput(e.target.value)}
                placeholder="0x..., 0x..., 0x..."
                className="w-full border rounded-lg p-2 h-24"
              />
            </div>
          )}

          <button 
            onClick={runTest}
            disabled={loading || getIncludeArray().length === 0}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Testing...' : 'Run Comprehensive Test'}
          </button>
        </div>

        {results && results.success && renderSummary()}

        {/* Wallets Status summary card */}
        {results && results.success && results.walletsStatus && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Wallets Status (Saved to Supabase)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Wallet</div>
                <div className="font-mono text-xs break-all">{results.walletsStatus.wallet_address}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Total Tx Count</div>
                <div className="font-semibold">{results.walletsStatus.total_tx_count ?? 0}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Total Volume</div>
                <div className="font-semibold">${Number(results.walletsStatus.total_volume ?? 0).toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Net Worth</div>
                <div className="font-semibold">${Number(results.walletsStatus.net_worth ?? 0).toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">PnL</div>
                <div className={`font-semibold ${Number(results.walletsStatus.pnl ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  ${Number(results.walletsStatus.pnl ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="text-sm mt-3">
              <span className={`px-2 py-1 rounded ${results.db?.success ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {results.db?.success ? 'Saved to Supabase' : 'Not saved to Supabase'}
              </span>
              {!results.db?.success && results.db?.error && (
                <span className="ml-2 text-red-600">{results.db.error}</span>
              )}
            </div>
          </div>
        )}
        
        {results && results.success && renderRequestResponse()}

        {/* FID save status */}
        {results && results.dbFid && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">FID Save:</span>
              <span className={`px-2 py-1 rounded ${results.dbFid.success ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {results.dbFid.success ? 'Saved' : 'Not saved'}
              </span>
              {!results.dbFid.success && results.dbFid.error && (
                <span className="text-red-600">{results.dbFid.error}</span>
              )}
            </div>
          </div>
        )}

        {results && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Complete Raw Results</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(JSON.stringify(results, null, 2), -1)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    copiedIndex === -1 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {copiedIndex === -1 ? '✓ Copied!' : '📋 Copy All'}
                </button>
                <button
                  onClick={() => setShowFullRaw(!showFullRaw)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  {showFullRaw ? 'Show Less' : 'Show More'}
                </button>
              </div>
            </div>
            
            <div className="bg-gray-100 p-4 rounded overflow-auto" style={{ maxHeight: showFullRaw ? 'none' : '400px' }}>
              <pre className="text-sm">
                {showFullRaw 
                  ? JSON.stringify(results, null, 2)
                  : JSON.stringify(results, null, 2).substring(0, 2000) + '\n\n... (truncated)'
                }
              </pre>
            </div>
          </div>
        )}

        {results && results.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
            <p className="text-red-600">{results.error}</p>
          </div>
        )}
      </div>

      {renderDetailModal()}
    </main>
  );
}
