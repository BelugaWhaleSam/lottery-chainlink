const { expect, assert } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } =
  require("../../helper-hardhat-config");

// only run on development chains that is the local network
!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery unit test", function () {
      let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval;
      const chainId = network.config.chainId;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        lottery = await ethers.getContract("Lottery", deployer);
        interval = await lottery.getInterval();
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        lotteryEntranceFee = await lottery.getEntranceFee();
      });

      describe("constructor", function () {
        it("Initiliazes the lottery correctly", async function () {
          const lotteryState = await lottery.getRaffleState();
          const lotteryInterval = await lottery.getInterval();
          assert.equal(lotteryState.toString(), "0");
          assert.equal(
            lotteryInterval.toString(),
            networkConfig[chainId]["interval"]
          );
        });
      });

      describe("enterLottery", function () {
        it("reverts when you don't pay enough", async function () {
          await expect(lottery.enterLottery()).to.be.revertedWith(
            "Lottery__NotEnoughETHEntered"
          );
        });

        it("records players when they enter", async function () {
          const { deployer } = await getNamedAccounts();
          // we pass value in payable functions
          await lottery.enterLottery({ value: lotteryEntranceFee });
          const playerFromContract = await lottery.getPlayer(0);
          assert.equal(playerFromContract, deployer);
        });

        it("emits event on enter", async function () {
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.emit(lottery, "LotteryEnter");
        });

        it("doesnt allow entrance when lottery is calculating", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          // we pretend to be a keeper for a second
          await lottery.performUpkeep([]); // changes the state to calculating for our comparison below
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.be.revertedWith(
            // is reverted as raffle is calculating
            "Raffle__NotOpen"
          );
        });
      });

      describe("checkUpkeep", function () {
        it("returns false if people haven't sent any ETH", async function () {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          // callStatic is used to call a function without sending a transaction
          // It just simulates the transaction and returns the result
          const { upKeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert(!upKeepNeeded); // should return true since we havent sent any ETH and upKeppNeeded is false
        });

        it("return false if lottery isn't open", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          await lottery.performUpkeep([]);
          const lotteryState = await lottery.getRaffleState();
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x");
          // assert.equal(lotteryState.toString(), "1")
          // assert.equal(upkeepNeeded, false)
          assert.equal(lotteryState.toString() == "1", upkeepNeeded == false);
        });
        it("returns false if enough time hasn't passed", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 5,
          ]); // use a higher number here if this test fails
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(!upkeepNeeded);
        });
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(upkeepNeeded);
        });
      });

      describe("performUpkeep", function () {
        it("it can only run if checkupkeep is true", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const tx = await lottery.performUpkeep("0x");
          assert(tx);
        });

        it("reverts when checkupkeep is false", async function () {
          expect(lottery.performUpkeep([])).to.be.revertedWith(
            "Raffle__UpkeepNotNeeded"
          );
        });
        it("updates the lottery state, emits and event, and calls vrf coordinator", async function () {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const txResponse = await lottery.performUpkeep("0x");
          const txReceipt = await txResponse.wait(1);
          // second event is the one we want, since the first is the vrf requestRandomWords
          const requestId = txReceipt.events[1].args.requestId;
          const lotteryState = await lottery.getRaffleState();
          assert(requestId.toNumber() > 0);
          assert.equal(lotteryState.toString(), "1");
        });
      });
      describe("fulfillRandomWords", function () {
        beforeEach(async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
        });
        it("can only be called after performupkeep", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address) // reverts if not fulfilled
          ).to.be.revertedWith("nonexistent request");
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address) // reverts if not fulfilled
          ).to.be.revertedWith("nonexistent request");
        });

        it("picks a winner, resets the lottery, and sends the money", async function () {
          const additionalEntrants = 3;
          const startingAccountIndex = 1; // new account starts from index 1 since deployer occupies index 0
          const accounts = await ethers.getSigners();
          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalEntrants;
            i++
          ) {
            const accountConnectedLottery = lottery.connect(accounts[i]);
            await accountConnectedLottery.enterLottery({
              value: lotteryEntranceFee,
            });
          }
          const startingTimeStamp = await lottery.getLatestTimeStamp();

          // wait for winner to get picked emitted event and fulfillRandomWords to be called
          // once emitted then only perform the anonymous function
          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", async () => {
              console.log("Found the event");
              try {
                console.log(accounts[2].address);
                console.log(accounts[0].address);
                console.log(accounts[1].address);
                console.log(accounts[3].address);

                const recentWinner = await lottery.getRecentWinner();
                console.log(recentWinner);
                const lotteryState = await lottery.getRaffleState();
                const endingTimeStamp = await lottery.getLatestTimeStamp();
                const numPlayers = await lottery.getNumberOfPlayers();
                const winnerEndingBalance = await accounts[1].getBalance();

                // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance
                    .add(
                      lotteryEntranceFee
                        .mul(additionalEntrants)
                        .add(lotteryEntranceFee)
                    )
                    .toString()
                );

                assert.equal(numPlayers.toString(), "0");
                assert.equal(lotteryState.toString(), "0");
                assert(endingTimeStamp > startingTimeStamp);
              } catch (e) {
                reject(e);
              }
              resolve();
            });
            // all the functions that will emit are written here
            // since if we write those outside the promise
            // we wont be able to listen the event and promise by the listener
            const tx = await lottery.performUpkeep([]); // Mocking chainlink keepers
            const txReceipt = await tx.wait(1);
            const winnerStartingBalance = await accounts[1].getBalance();
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              // Mocking chainlink VRF
              txReceipt.events[1].args.requestId,
              lottery.address
            );
          });
        });
      });
    });
