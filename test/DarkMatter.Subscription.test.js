const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { parseEther } = require("@ethersproject/units");
const { print, setup, deployStackOSBasic, setupLiquidity } = require("./utils");

describe("DarkMatter integration with Subscription", function () {

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer, van]= await hre.ethers.getSigners();
    router = await ethers.getContractAt(
      "IUniswapV2Router02", 
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
  });

  it("Deploy full SETUP", async function () {
    [
      stackToken,
      usdt,
      usdc,
      dai,
      link,
      weth,
      coordinator,
      generationManager,
      darkMatter,
      subscription,
      stackOsNFT,
      royalty,
      stableAcceptor,
    ] = await setup();
  
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
      parseEther("43637.0"),
      parseEther("43637.0"),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      dai.address,
      parseEther("43637.0"),
      parseEther("43637.0"),
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
    await stackOsNFT.partnerMint(5, usdt.address);

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

  it("Unable to withdraw foreign ids", async function () {
    await expect(subscription.connect(joe).withdraw(0, [4])).to.be.revertedWith("Not owner");
  });

  it("Unable to subscribe and withdraw on wrong generation id", async function () {
    await expect(
      subscription.subscribe(1337, 0, usdt.address)
    ).to.be.revertedWith("Generation doesn't exist");
    await expect(subscription.withdraw(1337, [0])).to.be.revertedWith(
      "Generation doesn't exist"
    );
  });

  it("Subscribe with usdt token", async function () {
    await usdt.approve(subscription.address, parseEther("5000.0"));
    await subscription.subscribe(0, 0, usdt.address);
  });
  it("Subscribe with dai coin", async function () {
    // await usdt.approve(subscription.address, parseEther("5000.0"));
    // await subscription.subscribe(0, 1, 4, usdt.address);

    await dai.approve(subscription.address, parseEther("5000.0"));
    await subscription.subscribe(0, 1, dai.address);
  });
  it("Take TAX for early withdrawal", async function () {
    await darkMatter.whitelist(owner.address);
    await darkMatter.transferFrom(owner.address, bob.address, 0);
    expect(await stackToken.balanceOf(bob.address)).to.equal(0);
    await subscription.connect(bob).withdraw(0, [0]); 
    print("bob: ", await stackToken.balanceOf(bob.address));
    print("tax: ", await stackToken.balanceOf(tax.address));
    // 599 Deposit. Withdraw 150 first month tax 75%
    expect(await stackToken.balanceOf(bob.address)).to.be.gt(parseEther("149"));
    expect(await stackToken.balanceOf(bob.address)).to.be.lt(parseEther("150"));

    await darkMatter.whitelist(bob.address);
    await darkMatter.connect(bob).transferFrom(bob.address, owner.address, 0);
  });


  it("Subscribe 3 months in a row", async function () {
    await usdt.approve(subscription.address, parseEther("5000.0"));
    await provider.send("evm_increaseTime", [MONTH]);
    await subscription.subscribe(0, 1, usdt.address);
    await provider.send("evm_increaseTime", [MONTH]);
    await subscription.subscribe(0, 1, usdt.address);
  });
  it("Unable to withdraw when low balance on bonus wallet", async function () {
    await expect(subscription.withdraw(0, [1])).to.be.revertedWith(
      "Not enough balance on bonus wallet"
    );
  });
 it("Withdraw", async function () {
    await stackToken.transfer(subscription.address, parseEther("5000.0"));

    await darkMatter.transferFrom(owner.address, bank.address, 0);
  
    expect(await stackToken.balanceOf(bank.address)).to.equal(0);
    print("bank: ", await stackToken.balanceOf(bank.address));

    await subscription.connect(bank).withdraw(0, [1]);
    expect(await stackToken.balanceOf(bank.address)).closeTo(
      parseEther("1324.710361"), 
      parseEther("0.000009")
    );

    print(
      "bank(before withdraw bonus): ",
      await stackToken.balanceOf(bank.address)
    );
    expect(await stackToken.balanceOf(bank.address)).closeTo(
      parseEther("1324.710367"), 
      parseEther("0.000009")
    );
    print(
      "bank(after withdraw bonus): ",
      await stackToken.balanceOf(bank.address)
    );

    print("tax: ", await stackToken.balanceOf(tax.address));
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

});