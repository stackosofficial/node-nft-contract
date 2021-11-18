const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");
const { formatEther, parseEther } = require("@ethersproject/units");

use(solidity);

describe("BlackMatter", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer] =
      await hre.ethers.getSigners();
    MONTH = 60 * 60 * 24 * 30;
    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
  });

  it("Deploy TestCurrency", async function () {
    ERC20 = await ethers.getContractFactory("TestCurrency");
    currency = await ERC20.deploy(parseEther("10000.0"));
    await currency.deployed();
  });

  it("Deploy USDT", async function () {
    usdt = await ERC20.deploy(parseEther("10000.0"));
    await usdt.deployed();
  });

  it("Deploy fake LINK", async function () {
    const ERC20_2 = await ethers.getContractFactory("LinkToken");
    link = await ERC20_2.deploy();
    await link.deployed();
    console.log(link.address);
  });

  it("Deploy VRF Coordinator", async function () {
    const Coordinator = await ethers.getContractFactory("VRFCoordinatorMock");
    coordinator = await Coordinator.deploy(link.address);
    await coordinator.deployed();
    console.log(coordinator.address);
  });

  it("Deploy GenerationManager", async function () {
    const GenerationManager = await ethers.getContractFactory(
      "GenerationManager"
    );
    generationManager = await GenerationManager.deploy();
    await generationManager.deployed();
    console.log(generationManager.address);
  });
  it("Deploy BlackMatter", async function () {
    GENERATION_MANAGER_ADDRESS = generationManager.address;
    MASTER_NODE_PRICE = 5;
    const BlackMatter = await ethers.getContractFactory("BlackMatter");
    blackMatter = await BlackMatter.deploy(
      GENERATION_MANAGER_ADDRESS,
      MASTER_NODE_PRICE
    );
    await blackMatter.deployed();
    console.log(blackMatter.address);
  });
  it("Deploy StackOS NFT", async function () {
    NAME = "STACK OS NFT";
    SYMBOL = "SON";
    STACK_TOKEN_FOR_PAYMENT = currency.address;
    MASTER_NODE_ADDRESS = blackMatter.address;
    PRICE = parseEther("0.1");
    MAX_SUPPLY = 25;
    PRIZES = 10;
    AUCTIONED_NFTS = 10;
    VRF_COORDINATOR = coordinator.address;
    LINK_TOKEN = link.address;
    KEY_HASH =
      "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
    TRANSFER_DISCOUNT = 2000;
    TIMELOCK = 6442850;
    const StackOS = await ethers.getContractFactory("StackOsNFT");
    stackOsNFT = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      KEY_HASH,
      TRANSFER_DISCOUNT,
      TIMELOCK
    );
    await stackOsNFT.deployed();
    await generationManager.add(stackOsNFT.address);
  });

  it("Deploy StackOS NFT generation 2", async function () {
    await generationManager.deployNextGen(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      KEY_HASH,
      TRANSFER_DISCOUNT,
      TIMELOCK
    );
    stackOsNFTgen2 = await ethers.getContractAt(
      "StackOsNFT",
      await generationManager.get(1)
    );
  });

  it("Mint some StackNFT", async function () {
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 10);
    await currency.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.partnerMint(6);
    await stackOsNFT.transferFrom(owner.address, joe.address, 5);

    await stackOsNFTgen2.startPartnerSales();
    await stackOsNFTgen2.whitelistPartner(owner.address, 2);
    await currency.approve(stackOsNFTgen2.address, parseEther("100.0"));
    await stackOsNFTgen2.partnerMint(2);
  });

  it("Deposit NFTs", async function () {
    await stackOsNFT.setApprovalForAll(blackMatter.address, true);
    await blackMatter.deposit(0, [0, 1, 2]);
    expect(await blackMatter.balanceOf(owner.address)).to.be.equal(0);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(2);
    expect(await stackOsNFT.balanceOf(blackMatter.address)).to.be.equal(3);
  });

  it("Mint BlackMatter", async function () {
    await blackMatter.deposit(0, [3, 4]);
    await blackMatter.mint();
    expect(await blackMatter.balanceOf(owner.address)).to.be.equal(1);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(0);
    expect(await stackOsNFT.balanceOf(blackMatter.address)).to.be.equal(5);
  });

  it("Two generations", async function () {
    await stackOsNFT.partnerMint(3);

    await stackOsNFT.setApprovalForAll(blackMatter.address, true);
    await blackMatter.deposit(0, [6, 7, 8]);
    await stackOsNFTgen2.setApprovalForAll(blackMatter.address, true);
    await blackMatter.deposit(1, [0, 1]);
    await blackMatter.mint();
    expect(await blackMatter.balanceOf(owner.address)).to.be.equal(2);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(0);
    expect(await stackOsNFT.balanceOf(blackMatter.address)).to.be.equal(8);
    expect(await stackOsNFTgen2.balanceOf(blackMatter.address)).to.be.equal(2);
  });

  it("Reverts", async function () {
    await expect(blackMatter.deposit(1337, [3, 4])).to.be.revertedWith(
      "Generation doesn't exist"
    );
    await expect(blackMatter.deposit(0, [5])).to.be.revertedWith(
      "ERC721: transfer caller is not owner nor approved"
    );
    await expect(blackMatter.mint()).to.be.revertedWith("Not enough deposited");
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
