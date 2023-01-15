# lottery-chainlink

<h3>Introduction</h3>

- Lottery contracts written in solidity with various functionality where people can enter the lottery and win lottery in some given elapsed time.

- Various staging and unit tests are written to test each functionality of the contract and events emitted with gas usage using chai-mocha library.
- Also, I've provided with the mock deploy scripts to the local testnet and main deploy scripts to the actual goerli testnet.
- I have implemented the chainlink VRF Randomness using the chainlink keepUp and performkeepUp to get truly decentralised random number using subId.
- Also deployed the smart contract on the goerli testnet with some contract address, also verified programitcally on the Etherscan using its API_KEY.

<h3>Tech-Stack used</h3>

- Hardhat Ethereum development environment

- Solidity for writing smart contracts
- Assertion tests in chai-mocha
- Used Alchemy as the RPC node provider, and various other API such as Etherscan for verifying contract, CoinmarketCap for gas-usage
- Used solidity coverage to check if all the functionalities lines are covered in the tests.


