const { ethers } = require("hardhat");
const { expect } = require("chai");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
const { deployStackOS, setup, deployStackOSBasic, print, setupDeployment } = require("./utils");

describe("Active subs reward", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, joe, tax, bank] = await hre.ethers.getSigners();

  });

  it("Deploy full SETUP", async function () {
    await setup();
    await setupDeployment();
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
      // parseEther("43637.0"),
      // parseEther("43637.0"),
      parseUnits("43637", await usdt.decimals()),
      parseUnits("43637", await usdt.decimals()),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      usdc.address,
      // parseEther("43637.0"),
      // parseEther("43637.0"),
      parseUnits("43637", await usdc.decimals()),
      parseUnits("43637", await usdc.decimals()),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });

  it("Mint (gen 2)", async function () {

    await stackToken.approve(stackOsNFTBasic.address, parseEther("100.0"));
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackOsNFTBasic.mint(4);
  });

  it("Partners mint for usdt (gen 1)", async function () {
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 100);
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.partnerMint(2);
  });

  it("Lock subscription contract to generation 1", async function () {
    await sub0.setOnlyFirstGeneration();
  });

  it("Subscribe", async function () {
    await usdt.approve(sub0.address, parseEther("100.0"));
    await sub0.subscribe(0, 0, parseEther("100"), usdt.address, false);
  });

  it("Unable to use contract from generation >1", async function () {
    await expect(sub0.subscribe(1, 0, parseEther("100"), usdt.address, false)).to.be.revertedWith(
      "Generaion should be 0"
    );
    await expect(sub0.withdraw2(1, [0], [0])).to.be.revertedWith(
      "Generaion should be 0"
    );
  });
  it("Unable to withdraw when no subs in period", async function () {
    await expect(sub0.withdraw2(0, [0], [0])).to.be.revertedWith(
      "No subs in period"
    );
  });
  it("Unable to withdraw when period not ended", async function () {
    await expect(sub0.withdraw2(0, [0], [1])).to.be.revertedWith(
      "Period not ended"
    );
  });
  it("End period, mint to send fee, and withdraw this fee", async function () {
    await provider.send("evm_increaseTime", [MONTH]); // start period 2
    
    await stackOsNFTBasic.mint(1);
    print("owner stack:", await stackToken.balanceOf(owner.address));
    await expect(() => sub0.withdraw2(0, [0], [1])) // 1 claimer receives all
      .to.changeTokenBalance(stackToken, owner, "5000000000000000");

    await stackOsNFTBasic.mint(1);
    await expect(() => sub0.withdraw2(0, [0], [1])) // again 1 claimer
      .to.changeTokenBalance(stackToken, owner, "5000000000000000");
    await expect(() => sub0.withdraw2(0, [0], [1])) // claim 0 as no fees
      .to.changeTokenBalance(stackToken, owner, "0");
    print("owner stack:", await stackToken.balanceOf(owner.address));
  });

  it("Unable to withdraw when token not subscribed in target period", async function () {
    await expect(sub0.withdraw2(0, [1], [1])).to.be.revertedWith(
      "Was not subscribed"
    );
  });
  it("Subscribe in 2 period for 2 tokens, send one to joe", async function () {
    await usdt.approve(sub0.address, parseEther("100.0"));
    await sub0.subscribe(0, 0, parseEther("100"), usdt.address, false);
    await usdt.approve(sub0.address, parseEther("100.0"));
    await sub0.subscribe(0, 1, parseEther("100"), usdt.address, false);
    await stackOsNFT.whitelist(owner.address);
    await stackOsNFT.transferFrom(owner.address, joe.address, 1);
  });
  it("End period 2, mint to send fee, withdraw on multiple account", async function () {
    await provider.send("evm_increaseTime", [MONTH]);
    await stackOsNFTBasic.mint(1);
    await expect(() => sub0.withdraw2(0, [0], [2]))
      .to.changeTokenBalance(stackToken, owner, "2500000000000000");
    await provider.send("evm_increaseTime", [MONTH]); // enter 4 period, should be able to withdraw for 2
    expect(await sub0.pendingReward(0, [1], [2])).to.be.equal("2500000000000000");
    await expect(() => sub0.connect(joe).withdraw2(0, [1], [2]))
      .to.changeTokenBalance(stackToken, joe, "2500000000000000");
  });
  it("Unable to withdraw foreign reward", async function () {
    await expect(sub0.withdraw2(0, [1], [2])).to.be.revertedWith(
      "Not owner"
    );
  });
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});