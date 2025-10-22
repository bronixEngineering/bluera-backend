// web3-backend/auracard-deploy/test/mint.spec.js
require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

describe('AuraCard mint (Base)', function () {
  this.timeout(0);

  it('approves USDC on USDC contract and calls mint(string) on proxy', async function () {
    // REQUIRED: .env -> PRIVATE_KEY must be configured in hardhat network accounts
    const PROXY_ADDRESS = '0x63d3E312A9B287D9103d88b674b3B3A36B14E8e2'; // your proxy
    const USDC_ADDRESS  = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC
    const MEMO_ID       = 'db83e744-e43d-47e0-9ce4-802fd0a802d6';

    const [signer] = await ethers.getSigners();
    const from = await signer.getAddress();
    console.log('Signer:', from);

    // Minimal ERC20 ABI for approve/balance/allowance
    const erc20Abi = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function allowance(address owner, address spender) external view returns (uint256)',
      'function balanceOf(address account) external view returns (uint256)',
      'function decimals() external view returns (uint8)',
      'function symbol() external view returns (string)',
    ];

    // Load AuraCard ABI saved during deploy
    const auracardAbiPath = path.join(__dirname, '..', 'ABI', 'auracardABI.json');
    const auracardAbi = JSON.parse(fs.readFileSync(auracardAbiPath, 'utf8'));

    const usdc = new ethers.Contract(USDC_ADDRESS, erc20Abi, signer);
    const aura = new ethers.Contract(PROXY_ADDRESS, auracardAbi, signer);

    // First mint price = 1 cent; contract uses 1 cent = 10_000 units (USDC 6 decimals)
    const amount = 100000n; 

    console.log('Approving USDC to proxy...');
    const txA = await usdc.approve(PROXY_ADDRESS, amount);
    await txA.wait();
    console.log('Approve tx:', txA.hash);

    // Add this small test or a second `it(...)` block in web3-backend/auracard-deploy/test/mint.spec.js
// Add this small test or a second `it(...)` block in web3-backend/auracard-deploy/test/mint.spec.js

    // Call mint(string)
    console.log('Calling mint...');
    const tx = await aura.mint(MEMO_ID);
    const rcpt = await tx.wait();
    console.log('Mint tx:', tx.hash);

    // Optional: check Minted event
    const mintedSig = ethers.id('Minted(address,uint256,uint256,bool,string)');
    const found = (rcpt.logs || []).some(l => l.topics && l.topics[0] === mintedSig);
    console.log('Minted event found:', found);
  });
});