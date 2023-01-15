const { expect, assert } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } =
  require("../../helper-hardhat-config");

// Dont run this test on the local network
// run only on testnet and mainnet

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery unit test", function () {
      let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        lottery = await ethers.getContract("Lottery", deployer);
        lotteryEntranceFee = await lottery.getEntranceFee();
      });

      describe("fulfillRandomWords", function () {
        it("Works with chainlink keepers and chainlink VRF, we get a random winner", async function () {
          const startingTimeStamp = await lottery.getLatestTimeStamp();
          const accounts = await ethers.getSigners();

          await new Promise(async (resolve, reject) => {
            // Listen for the WinnerPicked event
            lottery.once("WinnerPicked", async () => {
              console.log("WinnerPicked event emitted");
              try {
                const recentWinner = await lottery.recentWinner();
                const lotteryState = await lottery.lotteryState();
                const winnerEndingBalance = await accounts[0].getBalance();

                // check if the players array is reset
                await expect(lottery.getNumberOfPlayers(0)).to.be.reverted;
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(lotteryState, 0);
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(lotteryEntranceFee).toString()
                );
                assert(endingTimeStamp > startingTimeStamp);
                resolve();
              } catch (e) {
                reject(e);
              }
            });
            // Enter the Raffle
            await lottery.enterLottery({ value: lotteryEntranceFee });
            const winnerStartingBalance = await accounts[0].getBalance();
          });
        });
      });
    });
