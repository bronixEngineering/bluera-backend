import Web3, { ContractAbi } from "web3";
import fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

export default class Web3Utils {
  private web3: Web3;
  private contract: any;
  contractAddress: string;
  private creationTxnHash: string;

  constructor(
    contractAddress: string,
    contractAbiJson: ContractAbi,
    creationTxnHash: string
  ) {
    const PROVIDER_URL = process.env.RPC_URL || "";
    this.contractAddress = contractAddress;
    this.creationTxnHash = creationTxnHash;

    this.web3 = new Web3(new Web3.providers.HttpProvider(PROVIDER_URL));
    this.contract = new this.web3.eth.Contract(
      contractAbiJson,
      this.contractAddress
    );
  }

  async getPastEvents(fromBlockNumber: number, eventName: string) {
    try {
      const events = await this.contract.getPastEvents(eventName, {
        fromBlock: fromBlockNumber === 0 ? "earliest" : fromBlockNumber,
        toBlock: "latest",
      });
      return {
        events,
        isPaginated: false,
      };
    } catch (error) {
      // Check if the error is related to exceeding the block range
      if (
        error instanceof Error &&
        error.message.includes("exceed maximum block range")
      ) {
        const events = await this.getPastEventsWithPagination(
          fromBlockNumber,
          "latest",
          eventName
        );
        return {
          events,
          isPaginated: true,
        };
      }

      console.error("Error fetching past events:", error);
      return {
        events: [],
        isPaginated: false,
      };
    }
  }

  async getEarliestBlockNumber() {
    try {
      const receipt = await this.web3.eth.getTransactionReceipt(
        this.creationTxnHash
      );
      if (!receipt || !receipt.blockNumber) {
        console.error(
          "Transaction receipt not found or block number is undefined"
        );
        return 0;
      }
      return Number(receipt.blockNumber);
    } catch (error) {
      console.error("Error fetching earliest block number:", error);
      return 0;
    }
  }

  async getPastEventsWithPagination(
    fromBlockNumber: number,
    toBlockNumber: number | "latest",
    eventName: string,
    pageSize: number = 45000
  ) {
    try {
      let allEvents: any[] = [];
      let currentFromBlock = fromBlockNumber;
      let hasMoreEvents = true;

      // If toBlockNumber is 'latest', get the actual latest block number
      let actualToBlock: number;
      if (toBlockNumber === "latest") {
        actualToBlock = Number(await this.web3.eth.getBlockNumber());
      } else {
        actualToBlock = toBlockNumber;
      }

      while (hasMoreEvents) {
        // Calculate the end block for this batch
        const batchToBlock = Math.min(
          currentFromBlock + pageSize - 1,
          actualToBlock
        );

        // Exit the loop if we've processed all blocks
        if (currentFromBlock > actualToBlock) {
          hasMoreEvents = false;
          break;
        }

        try {
          const events = await this.contract.getPastEvents(eventName, {
            fromBlock: currentFromBlock,
            toBlock: batchToBlock,
          });

          allEvents = [...allEvents, ...events];

          // Move to the next batch
          currentFromBlock = batchToBlock + 1;

          // If we've reached the target block, exit the loop
          if (batchToBlock >= actualToBlock) {
            hasMoreEvents = false;
          }
        } catch (error) {
          console.error(
            `Error fetching events from ${currentFromBlock} to ${batchToBlock}:`,
            error
          );

          // If the page size is already small, we need to bubble up the error
          if (pageSize <= 1000) {
            throw new Error(
              `Failed to fetch events even with small page size: ${error}`
            );
          }

          // Reduce the page size and try again
          pageSize = Math.floor(pageSize / 2);
          console.log(`Reducing page size to ${pageSize} blocks`);
        }
      }

      return allEvents;
    } catch (error) {
      console.error("Error in paginated event fetching:", error);
      return [];
    }
  }
}
