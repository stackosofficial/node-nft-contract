const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { parseEther, parseUnits } = require("@ethersproject/units");
const { print, setup } = require("./utils");

describe("DarkMatter doesn't corrupt Subscription logic", function () {

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer, van] = await hre.ethers.getSigners();
  });

  it("Deploy full SETUP", async function () {
    await setup();
  });
  it("Add liquidity", async function () {
    await stackToken.approve(router.address, parseEther("100000000.0"));
    await usdt.approve(router.address, parseEther("100000000.0"));
    await dai.approve(router.address, parseEther("100000000.0"));
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
      parseUnits("43637", await usdt.decimals()),
      parseUnits("43637", await usdt.decimals()),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      dai.address,
      parseUnits("43637", await dai.decimals()),
      parseUnits("43637", await dai.decimals()),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });
  it("Mint DarkMatter NFT", async function () {
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 5);
    await usdt.approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.partnerMint(5);

    await darkMatter.activate();
    await stackOsNFT.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(0, [0, 1, 2]);
    await expect(darkMatter.mint()).to.be.revertedWith("Not enough deposited");

    await stackOsNFT.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(0, [3, 4]);
    await darkMatter.mint()

    expect(await stackOsNFT.balanceOf(darkMatter.address)).to.be.equal(5);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(0);
    expect(await darkMatter.balanceOf(owner.address)).to.be.equal(1);

  });

  it("Subscribe with usdt token", async function () {
    await usdt.approve(sub0.address, parseEther("5000.0"));
    await sub0.subscribe(0, 0, parseEther("100"), usdt.address, false);
  });
  it("Subscribe with dai coin", async function () {
    await dai.approve(sub0.address, parseEther("5000.0"));
    await sub0.subscribe(0, 1, parseEther("100"), dai.address, false);
  });
  it("Take TAX for early withdrawal", async function () {
    await stackToken.transfer(sub0.address, parseEther("1000"));

    await darkMatter.whitelist(owner.address);
    await darkMatter.transferFrom(owner.address, bob.address, 0);
    expect(await stackToken.balanceOf(bob.address)).to.equal(0);
    await sub0.connect(bob).withdraw(0, [0]);
    print("bob: ", await stackToken.balanceOf(bob.address));
    print("tax: ", await stackToken.balanceOf(tax.address));
    // 599 Deposit. Withdraw 150 first month tax 75%
    expect(await stackToken.balanceOf(bob.address)).to.be.gt(parseEther("149"));
    expect(await stackToken.balanceOf(bob.address)).to.be.lt(parseEther("150"));

    await darkMatter.whitelist(bob.address);
    await darkMatter.connect(bob).transferFrom(bob.address, owner.address, 0);
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

});