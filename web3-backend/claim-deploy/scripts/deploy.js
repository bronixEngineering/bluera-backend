const { ethers } = require("hardhat");

async function main() {
  // Deploy edilecek reward token adresi (örnek: USDC)
  const REWARD_TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
  
  console.log("Deploying BlueraClaimContract...");
  console.log("Reward Token:", REWARD_TOKEN_ADDRESS);

  const BlueraClaimContract = await ethers.getContractFactory("BlueraClaimContract");
  const claimContract = await BlueraClaimContract.deploy(REWARD_TOKEN_ADDRESS);

  await claimContract.waitForDeployment();
  const address = await claimContract.getAddress();

  console.log("BlueraClaimContract deployed to:", address);
  console.log("Reward Token:", await claimContract.rewardToken());
  console.log("Owner:", await claimContract.owner());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });