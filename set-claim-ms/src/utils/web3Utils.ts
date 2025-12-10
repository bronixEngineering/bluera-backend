import Web3 from "web3";
import * as dotenv from "dotenv";

dotenv.config();


export default class Web3Utils {
  private web3: Web3;
  private contract: any;
  private account: any;
  private privateKey: string;
  contractAddress: string;

  /**
   * Initialize the NFT contract utilities
   * @param contractAddress - The address of the NFT contract
   * @param contractAbiJson - The ABI of the NFT contract
   */
  constructor(contractAddress: string, contractAbiJson: any) {
    // Initialize Web3 with provider URL from environment
    const PROVIDER_URL = process.env.RPC_URL || "";
    this.privateKey = process.env.CONTRACT_ADMIN_PK || "";
    this.contractAddress = contractAddress;

    // Create Web3 instance and contract
    this.web3 = new Web3(new Web3.providers.HttpProvider(PROVIDER_URL));
    this.contract = new this.web3.eth.Contract(
      contractAbiJson,
      this.contractAddress
    );

    // Create account from private key and add to wallet
    this.account = this.web3.eth.accounts.privateKeyToAccount(this.privateKey);
    this.web3.eth.accounts.wallet.add(this.account);
  }

  async setClaimableAmount(walletAddress: string, amount: number) {
    try {
      const from = this.account.address;
      const setClaimableTx = this.contract.methods
        .setClaimable(walletAddress, amount)
        .encodeABI();
      const gasEstimate = await this.web3.eth.estimateGas({
        from,
        to: this.contractAddress,
        data: setClaimableTx,
      });

      // Set gas price parameters for the transaction (EIP-1559 format)
      const maxPriorityFeePerGas = BigInt(this.web3.utils.toWei("2", "gwei"));
      const baseFee = BigInt(await this.web3.eth.getGasPrice());
      const maxFeePerGas = baseFee + maxPriorityFeePerGas;

      // Prepare transaction object
      const tx = {
        from,
        to: this.contractAddress,
        data: setClaimableTx,
        gas: gasEstimate,
        maxFeePerGas: maxFeePerGas.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      };

      // Sign and send the transaction
      const signed = await this.web3.eth.accounts.signTransaction(
        tx,
        this.privateKey
      );
      await this.web3.eth.sendSignedTransaction(signed.rawTransaction);
      return {
        isSuccess: true,
        message: "Claimable amount set successfully",
      };
    } catch (error) {
      console.error("Error setting claimable amount:", error);
      return {
        isSuccess: false,
        message: error,
      };
    }
  }
}
