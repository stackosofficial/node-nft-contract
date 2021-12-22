const { ethers } = require("hardhat");
const { expect } = require("chai");
const { parseEther, formatEther } = require("@ethersproject/units");
const { deployStackOS, setup, deployStackOSBasic, print } = require("./utils");

describe("Sub0", function () {
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

  it("Mint for usdc", async function () {
    await stackOsNFTBasic.startSales();

    await usdc.approve(stackOsNFTBasic.address, parseEther("100.0"));
    // pass some time, so that enough tokens dripped
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackOsNFTBasic.mint(4, usdc.address);
  });

  it("Mint for usdt", async function () {
    await usdt.approve(stackOsNFTBasic.address, parseEther("100.0"));
    await expect(() => stackOsNFTBasic.mint(1, usdt.address))
      .to.changeTokenBalance(stackToken, bank, "90627646028740518"); 
  });

  it("Subscribe", async function () {
    await usdt.approve(sub0.address, parseEther("100.0"));
    await sub0.subscribe(1, 0, usdt.address, false);
  });
  it("Unable to withdraw when no subs in period", async function () {
    await expect(sub0.withdraw2(1, [0], [0])).to.be.revertedWith(
      "No subs in period"
    );
  });
  it("Unable to withdraw when period not ended", async function () {
    await expect(sub0.withdraw2(1, [0], [1])).to.be.revertedWith(
      "Period not ended"
    );
  });
  it("End period, mint to send fee, and withdraw this fee", async function () {
    await provider.send("evm_increaseTime", [MONTH]); // start period 2

    await stackOsNFTBasic.mint(1, usdc.address); // send mint fee
    print("owner stack:", await stackToken.balanceOf(owner.address));
    await expect(() => sub0.withdraw2(1, [0], [1])) // 1 claimer receives all
      .to.changeTokenBalance(stackToken, owner, "29846823230785611");
    await stackOsNFTBasic.mint(1, usdc.address); // again send to the same period
    await expect(() => sub0.withdraw2(1, [0], [1])) // again 1 claimer
      .to.changeTokenBalance(stackToken, owner, "29846327615160887");
    await expect(() => sub0.withdraw2(1, [0], [1])) // claim 0 as no fees
      .to.changeTokenBalance(stackToken, owner, "0");
    print("owner stack:", await stackToken.balanceOf(owner.address));
  });
  it("Subscribe in 2 period for 2 tokens, send one to joe", async function () {
    await usdt.approve(sub0.address, parseEther("100.0"));
    await sub0.subscribe(1, 0, usdt.address, false);
    await usdt.approve(sub0.address, parseEther("100.0"));
    await sub0.subscribe(1, 1, usdt.address, false);
    await stackOsNFTBasic.whitelist(owner.address);
    await stackOsNFTBasic.transferFrom(owner.address, joe.address, 1);
  });
  it("End period 2, mint to send fee, withdraw on multiple account", async function () {
    await provider.send("evm_increaseTime", [MONTH]);
    await stackOsNFTBasic.mint(1, usdc.address);
    await expect(() => sub0.withdraw2(1, [0], [2]))
      .to.changeTokenBalance(stackToken, owner, "14573417520805722");
    await provider.send("evm_increaseTime", [MONTH]); // enter 4 period, should be able to withdraw for 2
    await expect(() => sub0.connect(joe).withdraw2(1, [1], [2]))
      .to.changeTokenBalance(stackToken, joe, "14573417520805722");
  });
  it("Unable to withdraw foreign reward", async function () {
    await expect(sub0.withdraw2(1, [1], [2])).to.be.revertedWith(
      "Not owner"
    );
  });
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});