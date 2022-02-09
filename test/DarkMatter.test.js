const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { parseEther, parseUnits } = require("@ethersproject/units");
const { deployStackOS, setup, print, setupLiquidity } = require("./utils");

describe("DarkMatter", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer] =
      await hre.ethers.getSigners();
    MONTH = 60 * 60 * 24 * 30;
  });

  it("Deploy full SETUP", async function () {
    await setup();
    await setupLiquidity();
  });

  it("Deploy StackOS NFT generation 2", async function () {
    // fake gen 2
    stackOsNFTgen2 = await deployStackOS();
  });

  it("Mint some StackNFT", async function () {
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 10);
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.partnerMint(6);
    await stackOsNFT.whitelist(owner.address);
    await stackOsNFT.transferFrom(owner.address, joe.address, 5);

    await stackOsNFTgen2.startPartnerSales();
    await stackOsNFTgen2.whitelistPartner(owner.address, 2);
    await usdt.approve(stackOsNFTgen2.address, parseEther("100.0"));
    await stackOsNFTgen2.partnerMint(2);
  });

  it("Unable to deposit when inactive", async function () {
    await expect(darkMatter.deposit(0, [0, 1, 2])).to.be.revertedWith(
      "Inactive"
    );
  });

  it("Activate DarkMatter contract", async function () {
    await darkMatter.activate();
  });

  it("Deposit NFTs", async function () {
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

  it("Get DarkMatter ID (stack tokens used to create this dark matter)", async function () {
    let _stackIds = await darkMatter.ID(1);
    print("DarkMatterID:", _stackIds.map((g, i) => { return { generation: i, tokens: g.map(t => t.toNumber()) } }));
  });

  it("Reverts", async function () {
    await expect(darkMatter.deposit(1337, [3, 4])).to.be.revertedWith(
      "Generation doesn't exist"
    );
    await expect(darkMatter.deposit(0, [5])).to.be.revertedWith(
      "ERC721: transfer caller is not owner nor approved"
    );
    await expect(darkMatter.mint()).to.be.revertedWith("Not enough deposited");
  });

  it("Unable to transfer when not whitelisted", async function () {
    await expect(
      darkMatter.transferFrom(owner.address, joe.address, 0)
    ).to.be.revertedWith(
      "Not whitelisted for transfers"
    )
  });

  it("Whitelist address and transfer from it", async function () {
    await darkMatter.whitelist(owner.address);
    await darkMatter.transferFrom(owner.address, joe.address, 0);
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
