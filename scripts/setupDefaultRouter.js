const { parseEther, parseUnits, formatEther } = require("ethers/lib/utils");
const hre = require("hardhat");
const { getImplementationAddress, getAdminAddress } = require('@openzeppelin/upgrades-core');
// const { upgrades } = require("hardhat");

async function main() {
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  // dfyn router 0xA102072A4C07F06EC3B4900FDC4C7B80b6c57429
  router = await ethers.getContractAt(
    "IUniswapV2Router02", 
    "0xA102072A4C07F06EC3B4900FDC4C7B80b6c57429"
  );
  // Exchange contract
  exchange = await ethers.getContractAt(
    "Exchange", 
    "0x9027CbbfaEe5DA5c2E948E617f8AE38b9b6a5AD0"
  );

  // Set FakeRouter in Exchange as router
  // exchangeOwner = await ethers.getSigner("0xa08554ada77d70d3d4a4e3d3aec7fb0d33409ad8");
  // await exchange.connect(exchangeOwner).setRouter(router.address);
  await exchange.setRouter(router.address);
  console.log("Exchange.router", await exchange.router());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
