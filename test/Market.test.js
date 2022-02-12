const { ethers, upgrades } = require("hardhat");
const { use, expect } = require("chai");
const { parseEther, parseUnits } = require("@ethersproject/units");
const { deployStackOS, setup, print, deployStackOSBasic, setupDeployment, setupLiquidity } = require("./utils");

describe("Market", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer, dao, royaltyDistribution] =
      await hre.ethers.getSigners();
  });

  it("Deploy full SETUP", async function () {
    await setup();
    await setupDeployment();
    await setupLiquidity();
    CYCLE_DURATION = (await royalty.cycleDuration()).toNumber();
  });

  it("Deploy StackOS NFT generation 2", async function () {
    stackOsNFTgen2 = await deployStackOSBasic();
  });

  it("Mint some StackNFT", async function () {
 
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 10);
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.partnerMint(6);
    await stackOsNFT.whitelist(owner.address);
    await stackOsNFT.transferFrom(owner.address, joe.address, 5);

    await stackToken.approve(stackOsNFTgen2.address, parseEther("100.0"));
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackOsNFTgen2.mint(2);
  });

  it("Deposit NFTs", async function () {
    await darkMatter.activate();
    await stackOsNFT.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(0, [0, 1, 2]);
    expect(await darkMatter.balanceOf(owner.address)).to.be.equal(0);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(2);
    expect(await stackOsNFT.balanceOf(darkMatter.address)).to.be.equal(3);
  });

  it("Mint DarkMatter", async function () {
    await darkMatter.deposit(0, [3, 4]);
    await darkMatter.mint();
    expect(await darkMatter.balanceOf(owner.address)).to.be.equal(1);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(0);
    expect(await stackOsNFT.balanceOf(darkMatter.address)).to.be.equal(5);
  });

  it("Two generations", async function () {
    await stackOsNFT.partnerMint(3);

    await stackOsNFT.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(0, [6, 7, 8]);
    await stackOsNFTgen2.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(1, [0, 1]);
    await darkMatter.mint();
    expect(await darkMatter.balanceOf(owner.address)).to.be.equal(2);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(0);
    expect(await stackOsNFT.balanceOf(darkMatter.address)).to.be.equal(8);
    expect(await stackOsNFTgen2.balanceOf(darkMatter.address)).to.be.equal(2);
  });

  it("List DarkMatter for sell", async function () {
    await darkMatter.approve(market.address, 0);
    await darkMatter.whitelist(market.address);
    await market.listDarkMatterNFT(0, parseEther("100.0"));
  });

  it("Should not be able to buy without enough MATIC paid", async function () {
    await expect(market.connect(partner)
        .buyDarkMatter(0, { value: parseEther("10.0") }))
        .to.be.revertedWith("Not enough MATIC");
  });

  it("Buy DarkMatter", async function () {
    print("owner balance: ", await owner.getBalance());

    await expect(await market.connect(partner)
      .buyDarkMatter(0, { value: parseEther("100.0") }))
      .to.changeEtherBalances(
        [owner, dao, royalty], 
        [parseEther("80"), parseEther("10"), parseEther("9")] // royalty also take fee, that's why 9
      );

    expect(await darkMatter.balanceOf(market.address)).to.be.equal(0);
    print("owner balance: ", await owner.getBalance());
  });

  it("List DarkMatter for sell", async function () {
    await darkMatter.connect(partner).setApprovalForAll(market.address, true);
    await market.connect(partner).listDarkMatterNFT(0, parseEther("100.0"));
  });

  it("Should not be able to delist by non-owner", async function () {
    await expect(market.connect(joe).deListDarkMatterNFT(0))
        .to.be.revertedWith('Not an owner');
  });

  it("Should be able to delist by owner", async function () {
    await market.connect(partner).deListDarkMatterNFT(0);
  });

  it("List StackNFT for sell again and remove approve for all", async function () {
    await market.connect(partner).listDarkMatterNFT(0, parseEther("100.0"));
    await darkMatter.connect(partner).setApprovalForAll(market.address, false);
  });

  it("Should be able to delist by anyone if no approval", async function () {
    await market.connect(joe).deListDarkMatterNFT(0);
  });

  it("List StackNFT for sell", async function () {
    await stackOsNFT.connect(joe).approve(market.address, 5);
    await stackOsNFT.whitelist(market.address);
    await market.connect(joe).listStackNFT(0, 5, parseEther("100.0"));
  });

  it("Should not be able to buy without enough MATIC paid", async function () {
    await expect(market.connect(partner)
        .buyStack(0, 5, { value: parseEther("10.0") }))
        .to.be.revertedWith("Not enough MATIC");
  });

  it("Buy StackNFT", async function () {
    print("owner balance: ", await owner.getBalance());

    await expect(await market.connect(partner)
      .buyStack(0, 5, { value: parseEther("100.0") }))
      .to.changeEtherBalances(
        [joe, dao, royalty], 
        [parseEther("80"), parseEther("10"), parseEther("9")]
      );

    expect(await stackOsNFT.balanceOf(market.address)).to.be.equal(0);
    print("owner balance: ", await owner.getBalance());
  });

  it("List StackNFT for sell", async function () {
    await stackOsNFT.connect(partner).setApprovalForAll(market.address, true);
    await market.connect(partner).listStackNFT(0, 5, parseEther("100.0"));
  });

  it("Should not be able to delist by non-owner", async function () {
    await expect(market.connect(joe).deListStackNFT(0, 5))
        .to.be.revertedWith('Not an owner');
  });

  it("Should be able to delist by owner", async function () {
    await market.connect(partner).deListStackNFT(0, 5);
  });

  it("List StackNFT for sell again and remove approve for all", async function () {
    await market.connect(partner).listStackNFT(0, 5, parseEther("100.0"));
    await stackOsNFT.connect(partner).setApprovalForAll(market.address, false);
  });

  it("Should be able to delist by anyone if no approval", async function () {
    await market.connect(joe).deListStackNFT(0, 5);
  });

  it("Royalty handle fees correctly", async function () {

    /*  
        Scenario, 2 generations
        Trade gen 0, fail to claim royalty by gen 1
        Trade gen 1, claim royalty by gen 1
    */

    // mint
    await stackOsNFT.whitelistPartner(owner.address, 10);
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.partnerMint(5); 

    await stackToken.approve(stackOsNFTgen2.address, parseEther("1000.0"));
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackOsNFTgen2.mint(10); 

    // sell to send fee
    await stackOsNFT.approve(market.address, 10);
    await stackOsNFTgen2.approve(market.address, 10);
    await stackOsNFTgen2.whitelist(market.address);
    await market.listStackNFT(0, 10, parseEther("100.0"));
    await market.buyStack(0, 10, { value: parseEther("100.0") });
    await market.listStackNFT(1, 10, parseEther("0.00001"));
    await market.buyStack(1, 10, { value: parseEther("0.00001") });

    // pass time, there is enough eth
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");

    // gen 1 should fail to claim gen 0
    await expect(royalty.claim(1, [10], [0])).to.be.revertedWith("Bad gen id");
    // gen 1 should claim gen 1
    await royalty.claim(1, [10], [1]);
    // gen 0 should claim gen 0 and 1
    await royalty.claim(0, [10], [0, 1]);
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
