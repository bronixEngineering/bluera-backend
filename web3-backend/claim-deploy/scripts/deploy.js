const { ethers, upgrades } = require("hardhat");

async function main() {
  // Deploy edilecek reward token adresi (örnek: USDC)
  const REWARD_TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
  
  // Owner address (deploy eden kişi)
  const [deployer] = await ethers.getSigners();
  const OWNER_ADDRESS = deployer.address;
  
  console.log("Deploying BlueraClaimContract (Upgradeable)...");
  console.log("Deployer:", OWNER_ADDRESS);
  console.log("Reward Token:", REWARD_TOKEN_ADDRESS);

  const BlueraClaimContract = await ethers.getContractFactory("BlueraClaimContract");
  
  // Upgradeable proxy ile deploy et
  const claimContract = await upgrades.deployProxy(
    BlueraClaimContract,
    [REWARD_TOKEN_ADDRESS, OWNER_ADDRESS],
    { 
      initializer: "initialize",
      kind: "uups" // UUPS (Universal Upgradeable Proxy Standard) kullan
    }
  );

  await claimContract.waitForDeployment();
  const address = await claimContract.getAddress();

  console.log("\n=== Deployment Info ===");
  console.log("Proxy Contract Address:", address);
  console.log("Reward Token:", await claimContract.rewardToken());
  console.log("Owner:", await claimContract.owner());
  
  // Implementation contract adresini al
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(address);
  console.log("Implementation Address:", implementationAddress);
  
  console.log("\n✅ Deployment completed successfully!");
  console.log("\n📝 Save these addresses:");
  console.log(`   Proxy: ${address}`);
  console.log(`   Implementation: ${implementationAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });