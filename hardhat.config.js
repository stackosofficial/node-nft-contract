require("dotenv").config();

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");
require('@openzeppelin/hardhat-upgrades');
require('hardhat-contract-sizer');

extendEnvironment((hre) => {
  // save deployment args in runtime, to simplify verification in deploy.js
  let oldDeploy = hre.ethers.ContractFactory.prototype.deploy;
  hre.ethers.ContractFactory.prototype.deploy = async function (...args) {
    let contract = await oldDeploy.call(this, ...args);
    contract.constructorArgs = args;
    return contract;
  }
});

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.2",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "istanbul",
          outputSelection: {
            "*": {
              "": ["ast"],
              "*": [
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
                "abi",
                "evm.bytecode.sourceMap",
                "evm.deployedBytecode.sourceMap",
                "metadata",
              ],
            },
          },
        },
      },
      {
        version: "0.8.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "istanbul",
          outputSelection: {
            "*": {
              "": ["ast"],
              "*": [
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
                "abi",
                "evm.bytecode.sourceMap",
                "evm.deployedBytecode.sourceMap",
                "metadata",
              ],
            },
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "istanbul",
          outputSelection: {
            "*": {
              "": ["ast"],
              "*": [
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
                "abi",
                "evm.bytecode.sourceMap",
                "evm.deployedBytecode.sourceMap",
                "metadata",
              ],
            },
          },
        },
      },
      {
        version: "0.4.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
        forking: {
          url: process.env.MATIC_URL, // must be archive node for next line to work
          blockNumber: 23715560, // block pinning gives x20 perfromance due to caching as stated on hardhat docs 
          enabled: true
        },
    },
    rinkeby: {
      url: process.env.RINKEBY_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    matic: {
      url: process.env.MATIC_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  mocha: {
    timeout: 600000,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    gasPrice: 5,
    coinmarketcap: process.env.CMC_KEY || undefined
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
