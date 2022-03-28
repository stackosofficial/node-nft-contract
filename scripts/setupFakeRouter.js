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

  // Deploy FakeRouter
  const FakeRouter = await ethers.getContractFactory("FakeRouter");
  // Set dfyn router in FakeRouter 
  fakeRouter = await FakeRouter.deploy(
    router.address,
  );
  await fakeRouter.deployed();
  console.log("FakeRouter", fakeRouter.address);

  // Set FakeRouter in Exchange as router
  // exchangeOwner = await ethers.getSigner("0xa08554ada77d70d3d4a4e3d3aec7fb0d33409ad8");
  // await exchange.connect(exchangeOwner).setRouter(fakeRouter.address);
  await exchange.setRouter(fakeRouter.address);

  console.log("Exchange.router", await exchange.router());
  console.log("FakeRouter.router", await fakeRouter.router());

  // vvvvvvvvvvvvvvvvvvvvvvvvv SETUP PATHS IN FAKE ROUTER vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
  // stables from stableAcceptor
  USDT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
  USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  DAI = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
  UST = "0x692597b009d13C4049a947CAB2239b7d6517875F";
  
  STACK = "0x980111ae1b84e50222c8843e3a7a038f36fecd2b";
  WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"; // ETH
  WMATIC = "0x4c28f48448720e9000907bc2611f73022fdce1fa"; // dfyn's WETH()

  // see 'note' file to understand what paths we need to define
  await fakeRouter.setPath(USDT, STACK, [USDT, USDC, STACK]);
  await fakeRouter.setPath(STACK, USDT, [STACK, USDC, USDT]);

  // other stables used in mintForUsd and subsription
  await fakeRouter.setPath(USDC, STACK, [USDC, STACK]);
  await fakeRouter.setPath(DAI, STACK, [DAI, USDT, USDC, STACK]);
  await fakeRouter.setPath(UST, STACK, [UST, USDT, USDC, STACK]);

  // paths for getAmounts to work in SwapETH.. functions to work
  await fakeRouter.setPath(WMATIC, WETH, [WMATIC, WETH]);
  await fakeRouter.setPath(WMATIC, STACK, [WMATIC, STACK]);

  // vvvvvvvvvvvvvvvvvvvvvvvvv VERIFICATION vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
  console.log("  - Verification will start in a minute...\n");
  await delay(46000);

  let deployedContracts = [
    fakeRouter
  ];

  for (let i = 0; i < deployedContracts.length; i++) {
    try {
      const contract = deployedContracts[i];
      await hre.run("verify:verify", {
        address: contract.address,
        constructorArguments: contract.constructorArgs,
      });
    } catch (error) {
      console.log(error)
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
