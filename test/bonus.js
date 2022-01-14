const { ethers } = require("hardhat");
const { expect } = require("chai");
const { parseEther, formatEther } = require("@ethersproject/units");
const { deployStackOS, setup, deployStackOSBasic, print, setupDeployment, setupLiquidity } = require("./utils");

describe("Measure withdraw() and updateBonuses() gas", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, joe, tax, bank] = await hre.ethers.getSigners();

    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
  });

  it("Deploy full SETUP", async function () {
    await setup();
    await setupDeployment();

    MAX_SUPPLY = 100;
    stackOsNFTBasic = await deployStackOSBasic();
  });

  it("Add liquidity", async function () {
    await stackToken.approve(router.address, parseEther("100000000.0"));
    await usdt.approve(router.address, parseEther("100000000.0"));
    await usdc.approve(router.address, parseEther("100000000.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.addLiquidityETH(
      stackToken.address,
      parseEther("100000.0"),
      parseEther("100000.0"),
      parseEther("3.77"),
      joe.address,
      deadline,
      { value: parseEther("3.77") }
    );

    await router.addLiquidityETH(
      usdt.address,
      parseEther("43637.0"),
      parseEther("43637.0"),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      usdc.address,
      parseEther("43637.0"),
      parseEther("43637.0"),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });

  it("Transfer rewards to subscription contract", async function () {
    await stackToken.transfer(subscription.address, parseEther("1000000"));
  });

  it("Mint", async function () {
    await stackOsNFTBasic.startSales();

    await usdc.approve(stackOsNFTBasic.address, parseEther("100000.0"));
    for (let i = 0; i < 10; i++) {
      await provider.send("evm_mine"); 
      await provider.send("evm_increaseTime", [60 * 60]); 
      await stackOsNFTBasic.mint(10, usdc.address);
    }
  });

  it("Subscribe", async function () {
    TOKENS_NUM = 35;
    PERIODS_NUM = 25;
    await usdt.approve(subscription.address, ethers.constants.MaxUint256);
    for (let i = 0; i < PERIODS_NUM; i++) {
      for (let i = 0; i < TOKENS_NUM; i++) {
        await subscription.subscribe(1, i, parseEther("0"), usdt.address, false);
      }
      await provider.send("evm_increaseTime", [MONTH]);
      await provider.send("evm_mine");
    }
  });

  it("Withdraw", async function () {
    // 10 tokens = 5569688 (~13$ gas)
    let tokens = [...Array(TOKENS_NUM).keys()];
    await subscription.withdraw(1, tokens);
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});