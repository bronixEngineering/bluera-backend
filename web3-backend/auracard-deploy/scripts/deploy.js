const { ethers, upgrades } = require("hardhat");

async function main() {
  const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const PAYMENT_COLLECTOR = "0x74eA364862cD0C7DbF09aFf8c421C2CCe37ADd40"; // Your address

  console.log("Deploying AuraCard NFT Contract...");
  
  const AuraCardNFTContract = await ethers.getContractFactory("AuraCardNFTContract");
  
  const auracard = await upgrades.deployProxy(
    AuraCardNFTContract,
    [USDC_ADDRESS, PAYMENT_COLLECTOR],
    { initializer: "initialize" }
  );

  await auracard.waitForDeployment();
  
  const proxyAddress = await auracard.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  
  console.log("Proxy Contract Address:", proxyAddress);
  console.log("Implementation Contract Address:", implementationAddress);
  
  // ABI'yi kaydet
  const fs = require("fs");
  const contractArtifact = await ethers.getContractFactory("AuraCardNFTContract");
  fs.writeFileSync(
    "../ABI/auracardABI.json", 
    JSON.stringify(contractArtifact.interface.format("json"), null, 2)
  );
  
  console.log("ABI saved to ../ABI/auracardABI.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});