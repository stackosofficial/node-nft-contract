const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { print, setup, deployStackOS, setupLiquidity, deployStackOSBasic } = require("./utils");
const { parseEther } = require("ethers/lib/utils");

describe("DarkMatter integration with Royalty", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, dude, tax, DaoWallet, pepe] =
      await hre.ethers.getSigners();
    
    CYCLE_DURATION = 60*60*24*31;
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
      exchange,
    ] = await setup();

    await setupLiquidity()

  });

  it("Mint DarkMatter NFT", async function () {

    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 5);
    await usdt.approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.partnerMint(5, usdt.address);

    await stackOsNFT.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(0, [0, 1, 2, 3, 4]);
    await darkMatter.mint();

    expect(await stackOsNFT.balanceOf(darkMatter.address)).to.be.equal(5);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(0);
    expect(await darkMatter.balanceOf(owner.address)).to.be.equal(1);

  });
  it("Bank takes percent", async function () {
    await owner.sendTransaction({
        from: owner.address,
        to: royalty.address,
        value: parseEther("2.0")
    });
    expect(await bank.getBalance()).to.be.gt(parseEther("10000.19"))
    expect(await provider.getBalance(royalty.address)).to.equal(parseEther("1.8"))
  })
  it("Claim royalty for delegated NFTs", async function () { 
    await stackOsNFT.delegate(owner.address, [0]); 
    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parseEther("2.0")
    });
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");
    await royalty.claim(0, [0]);

    print((await owner.getBalance()), (await provider.getBalance(royalty.address)));
    await expect(royalty.claim(0, [0])).to.be.revertedWith("No royalty");
  });
  it("Mint 3rd DarkMatter NFT on stack generation 2", async function () {

    stackOsNFTGen2 = await deployStackOSBasic();
    await usdt.approve(stackOsNFTGen2.address, parseEther("100.0"));
    await stackOsNFTGen2.startSales();
    await provider.send("evm_increaseTime", [60 * 5]); 
    await stackOsNFTGen2.mint(5, usdt.address); 

    await stackOsNFTGen2.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(1, [0, 1, 2, 3, 4]);
    await darkMatter.mint()

    expect(await stackOsNFTGen2.balanceOf(darkMatter.address)).to.be.equal(5);
    expect(await stackOsNFTGen2.balanceOf(owner.address)).to.be.equal(0);
    expect(await darkMatter.balanceOf(owner.address)).to.be.equal(2);
  });
  it("Claim royalty for delegated NFTs (two generations)", async function () { 
    await stackOsNFTGen2.delegate(owner.address, [0]); 
    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parseEther("2.0")
    });
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");

    await royalty.claim(0, [0]);

    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parseEther("2.0")
    });
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");

    print((await owner.getBalance()), (await provider.getBalance(royalty.address)));
    await royalty.claim(0, [0]);
    await royalty.claim(1, [0]);

    print((await owner.getBalance()), (await provider.getBalance(royalty.address)));
    await expect(royalty.claim(0, [0])).to.be.revertedWith("No royalty");
    await expect(royalty.claim(1, [0])).to.be.revertedWith("No royalty");
  });
  
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});