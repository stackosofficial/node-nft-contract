const { ethers, upgrades } = require("hardhat");
const { use, expect } = require("chai");
const { parseEther } = require("@ethersproject/units");
const { deployStackOS, setup, print } = require("./utils");

describe("Market", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer, dao, royaltyDistribution] =
      await hre.ethers.getSigners();
    MONTH = 60 * 60 * 24 * 30;
    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
  });

  it("Deploy full SETUP", async function () {
    [stackToken,
      usdt,
      usdc,
      dai,
      link,
      coordinator,
      generationManager,
      darkMatter,
      subscription,
      stackOsNFT] = await setup();
  });

  it("Deploy Market", async function () {
    GENERATION_MANAGER_ADDRESS = generationManager.address;
    DARK_MATTER_ADDRESS = darkMatter.address;
    DAO_ADDRESS = dao.address;
    ROYALTY_DISTRIBUTION_ADDRESS = royaltyDistribution.address;
    DAO_FEE = 1000;
    ROYALTY_FEE = 1000;
    const Market = await ethers.getContractFactory("Market");
    market = await upgrades.deployProxy(
      Market,
      [
        GENERATION_MANAGER_ADDRESS,
        DARK_MATTER_ADDRESS,
        DAO_ADDRESS,
        ROYALTY_DISTRIBUTION_ADDRESS,
        DAO_FEE,
        ROYALTY_FEE
      ]
    );
    await market.deployed();
  });

  it("Deploy StackOS NFT generation 2", async function () {
    stackOsNFTgen2 = await deployStackOS();
  });

  it("Add liquidity", async function () {
    await stackToken.approve(router.address, parseEther("100.0"));
    await usdt.approve(router.address, parseEther("100.0"));
    // await usdc.approve(router.address, parseEther("100.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.addLiquidityETH(
      stackToken.address,
      parseEther("100"),
      parseEther("100"),
      parseEther("3.77"),
      joe.address,
      deadline,
      { value: parseEther("3.77") }
    );

    await router.addLiquidityETH(
      usdt.address,
      parseEther("4.3637"),
      parseEther("4.3637"),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });

  it("Mint some StackNFT", async function () {
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 10);
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.partnerMint(6, usdt.address);
    await stackOsNFT.whitelist(owner.address);
    await stackOsNFT.transferFrom(owner.address, joe.address, 5);

    await stackOsNFTgen2.startPartnerSales();
    await stackOsNFTgen2.whitelistPartner(owner.address, 2);
    await usdt.approve(stackOsNFTgen2.address, parseEther("100.0"));
    await stackOsNFTgen2.partnerMint(2, usdt.address);
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
    await stackOsNFT.partnerMint(3, usdt.address);

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

  it("Buy DarkMatter", async function () {
    print("owner balance: ", await owner.getBalance());

    await expect(await market.connect(partner)
      .buyDarkMatter(0, { value: parseEther("100.0") }))
      .to.changeEtherBalances([owner, dao, royaltyDistribution], [parseEther("80"), parseEther("10"), parseEther("10")]);

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

  it("Buy StackNFT", async function () {
    print("owner balance: ", await owner.getBalance());

    await expect(await market.connect(partner)
      .buyStack(0, 5, { value: parseEther("100.0") }))
      .to.changeEtherBalances([joe, dao, royaltyDistribution], [parseEther("80"), parseEther("10"), parseEther("10")]);

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

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
