const { ethers } = require("hardhat");
const { expect } = require("chai");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
const { deployStackOS, setup, deployStackOSBasic, print, setupDeployment, walletOfOwner } = require("./utils");

describe("StackOS NFT Basic", function () {

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, joe, tax, bank] = await hre.ethers.getSigners();
      
    provider = ethers.provider;
    parseusdt = (args) => parseUnits(args, 6);
    // parseUst = (args) => parseUnits(args, 18);
    // parseUniform = (args) => parseUnits(args, 18);

    usdt = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
    usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", usdt);

    usdtHolder = "0x0d0707963952f2fba59dd06f2b425ace40b492fe";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [usdtHolder],
    });
    usdtHolder = await ethers.getSigner(usdtHolder);
    await usdt.connect(usdtHolder).transfer(
      owner.address,
      parseusdt("5000000")
    );



    stackToken = "0x980111ae1b84e50222c8843e3a7a038f36fecd2b";
    stackToken = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", stackToken);

    stackTokenHolder = "0xa08554ada77d70d3d4a4e3d3aec7fb0d33409ad8";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [stackTokenHolder],
    });
    stackTokenHolder = await ethers.getSigner(stackTokenHolder);

    console.log(await stackToken.balanceOf(stackTokenHolder.address));
    await stackToken.connect(stackTokenHolder).transfer(
      owner.address,
      parseEther("5000000")
    );


    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0xa08554ada77d70d3d4a4e3d3aec7fb0d33409ad8"],
    });
    exchangeOwner = await ethers.getSigner("0xa08554ada77d70d3d4a4e3d3aec7fb0d33409ad8");

    exchange = await ethers.getContractAt("Exchange", "0x9027CbbfaEe5DA5c2E948E617f8AE38b9b6a5AD0");
    // quickswap router
    router = await ethers.getContractAt("IUniswapV2Router02", "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff");

    // quickswap = await ethers.getContractAt("IUniswapV2Router02", "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff");

    factory = await ethers.getContractAt("IUniswapV2Factory", await router.factory());

    pairAddr = await factory.getPair(usdt.address,     await router.WETH());
    pairUSD = await ethers.getContractAt("IUniswapV2Pair", pairAddr);

  });

  it("Deploy full SETUP", async function () {

    // GEN 9 (id 8)
    stackOsNFTBasic = await ethers.getContractAt(
      "StackOsNFTBasic",
      "0x62615ace553F6bB73fa6336cFEDc0B57C49D5642"
    )
  });

  it("change router in exchange contract", async function () {
    await exchange.connect(exchangeOwner).setRouter(router.address);
    console.log("router", await exchange.router());
  });

  it("Add liquidity", async function () {

    await network.provider.send("hardhat_setBalance", [
      owner.address.toString(),
      "0x21e19e0c9bab240000000000",
    ]);

    console.log(await provider.getBalance(owner.address));
    await stackToken.approve(router.address, parseEther("100000000.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.addLiquidityETH(
      stackToken.address,
      parseEther("17.0"),
      parseEther("0.0"),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("1.0") }
    );

    await router.addLiquidityETH(
      stackToken.address,
      parseEther("880561.0"),
      parseEther("0.0"),
      parseEther("49704.0"),
      joe.address,
      deadline,
      { value: parseEther("49704.0") }
    );

    
    let pairAddr = await factory.getPair(stackToken.address,     await router.WETH());
    pair = await ethers.getContractAt("IUniswapV2Pair", pairAddr);

  })

  it("Mint", async function () {

    await stackToken.approve(stackOsNFTBasic.address, parseEther("10000000.0"));

    console.log("getAmountsIn", await exchange.getAmountIn(
      parseusdt("10000"),
      usdt.address,
      stackToken.address,
    ));

    console.log("pair.reserves (stackos/weth)", await pair.getReserves());
    console.log("pair.reserves (usdt/weth)", await pairUSD.getReserves());


    swapAmount = parseEther("10000");
    // await usdt.approve(exchange.address, swapAmount);
    await stackToken.approve(exchange.address, swapAmount);
    // await exchange.swapExactTokensForTokens(
    //   swapAmount,
    //   stackToken.address,
    //   usdt.address,
    // );

    console.log("------ before swap ----------");
    console.log(await stackToken.balanceOf(owner.address));
    let oldBalance = await stackToken.balanceOf(owner.address);
    await stackOsNFTBasic.mint(50);
    let newBalance = await stackToken.balanceOf(owner.address);

    console.log("getAmountsIn", await exchange.getAmountIn(
      parseusdt("10000"),
      usdt.address,
      stackToken.address,
    ));

    // path = [
    //   stackToken.address,
    //   await router.WETH(),
    //   usdt.address
    // ]
    // console.log("router.getAmountsIn", await router.getAmountsIn(
    //   parseusdt("10000"),
    //   path
    // ));

    console.log("pair.reserves (stackos/weth)", await pair.getReserves());
    console.log("pair.reserves (usdt/weth)", await pairUSD.getReserves());

    console.log("stack tokens sended: %s", oldBalance.sub(newBalance));
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

});
