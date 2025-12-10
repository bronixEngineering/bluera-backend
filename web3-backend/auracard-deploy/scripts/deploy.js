const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Base USDC adresi
  const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  
  // Payment collector adresi (deploy eden kişi veya belirlediğin adres)
  const [deployer] = await ethers.getSigners();
  const PAYMENT_COLLECTOR = process.env.PAYMENT_COLLECTOR || deployer.address;

  console.log("Deploying AuraCard NFT Contract (Upgradeable)...");
  console.log("Deployer:", deployer.address);
  console.log("Payment Token (USDC):", USDC_ADDRESS);
  console.log("Payment Collector:", PAYMENT_COLLECTOR);
  
  const AuraCardNFTContract = await ethers.getContractFactory("AuraCardNFTContract");
  
  // Upgradeable proxy ile deploy et
  const auracard = await upgrades.deployProxy(
    AuraCardNFTContract,
    [USDC_ADDRESS, PAYMENT_COLLECTOR],
    { 
      initializer: "initialize",
      kind: "uups" // UUPS (Universal Upgradeable Proxy Standard) kullan
    }
  );

  await auracard.waitForDeployment();
  
  const proxyAddress = await auracard.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  
  console.log("\n=== Deployment Info ===");
  console.log("Proxy Contract Address:", proxyAddress);
  console.log("Implementation Contract Address:", implementationAddress);
  console.log("Payment Token:", await auracard.paymentToken());
  console.log("Payment Collector:", await auracard.paymentCollector());
  console.log("First Mint Price:", await auracard.firstMintUsdCents(), "cents");
  console.log("Subsequent Mint Price:", await auracard.subsequentMintUsdCents(), "cents");
  console.log("Owner:", await auracard.owner());
  
  // ABI'yi kaydet
  const contractArtifact = await ethers.getContractFactory("AuraCardNFTContract");
  const abiPath = path.join(__dirname, "../ABI/auracardABI.json");
  fs.writeFileSync(
    abiPath, 
    JSON.stringify(contractArtifact.interface.format("json"), null, 2)
  );
  
  console.log("\n✅ Deployment completed successfully!");
  console.log("📝 ABI saved to:", abiPath);
  console.log("\n💡 Save these addresses:");
  console.log(`   Proxy: ${proxyAddress}`);
  console.log(`   Implementation: ${implementationAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});