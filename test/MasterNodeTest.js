const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");
const { formatEther, parseEther } = require("@ethersproject/units");

use(solidity);

describe("MasterNode", function () {

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer]= await hre.ethers.getSigners();
    MONTH = 60*60*24*30;
    router = await ethers.getContractAt(
      "IUniswapV2Router02", 
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
  });

  it("Deploy TestCurrency", async function () {
    ERC20 = await ethers.getContractFactory("TestCurrency");
    currency = await ERC20.deploy(parseEther("10000.0"));
    await currency.deployed();
  })

  it("Deploy USDT", async function () {
    usdt = await ERC20.deploy(parseEther("10000.0"));
    await usdt.deployed();
  })

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

  it("Deploy StackOS NFT", async function () {
    NAME = "STACK OS NFT";
    SYMBOL = "SON";
    STACK_TOKEN_FOR_PAYMENT = currency.address;
    PRICE = parseEther("0.1");
    MAX_SUPPLY = 25;
    PRIZES = 10;
    AUCTIONED_NFTS = 10;
    VRF_COORDINATOR = coordinator.address;
    LINK_TOKEN = link.address;
    KEY_HASH =
      "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
    FEE = parseEther("0.1");
    TRANSFER_DISCOUNT = 2000;

    const StackOS = await ethers.getContractFactory("StackOsNFT");
    stackOsNFT = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      // VRF_COORDINATOR,
      // LINK_TOKEN,
      KEY_HASH,
      FEE,
      TRANSFER_DISCOUNT
    );
    await stackOsNFT.deployed();
  });

  it("Deploy GenerationManager", async function () {
    const GenerationManager = await ethers.getContractFactory("GenerationManager");
    generationManager = await GenerationManager.deploy(
      stackOsNFT.address
    );
    await generationManager.deployed();
    console.log(generationManager.address);
  });
  it("Deploy StackOS NFT generation 2", async function () {
    await generationManager.deployNextGen(      
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      // VRF_COORDINATOR,
      // LINK_TOKEN,
      KEY_HASH,
      FEE,
      TRANSFER_DISCOUNT
    );
    stackOsNFTgen2 = await ethers.getContractAt(
      "StackOsNFT",
      await generationManager.get(1)
    );
  });
  it("Deploy MasterNode", async function () {
    GENERATION_MANAGER_ADDRESS = generationManager.address;
    MASTER_NODE_PRICE = 5;
    const MasterNode = await ethers.getContractFactory("MasterNode");
    masterNode = await MasterNode.deploy(
      GENERATION_MANAGER_ADDRESS,
      MASTER_NODE_PRICE
    );
    await masterNode.deployed();
    console.log(masterNode.address);
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
  })

  it("Deposit NFTs", async function () {
    await stackOsNFT.setApprovalForAll(masterNode.address, true);
    await masterNode.deposit(0, [0, 1, 2]);
    expect(await masterNode.balanceOf(owner.address)).to.be.equal(0);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(2);
    expect(await stackOsNFT.balanceOf(masterNode.address)).to.be.equal(3);
  });

  it("Mint MasterNode", async function () {
    await masterNode.deposit(0, [3, 4]);
    await masterNode.mint();
    expect(await masterNode.balanceOf(owner.address)).to.be.equal(1);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(0);
    expect(await stackOsNFT.balanceOf(masterNode.address)).to.be.equal(5);
  });

  it("Two generations", async function () {
    await stackOsNFT.partnerMint(3);

    await stackOsNFT.setApprovalForAll(masterNode.address, true);
    await masterNode.deposit(0, [6, 7, 8]);
    await stackOsNFTgen2.setApprovalForAll(masterNode.address, true);
    await masterNode.deposit(1, [0, 1]);
    await masterNode.mint();
    expect(await masterNode.balanceOf(owner.address)).to.be.equal(2);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(0);
    expect(await stackOsNFT.balanceOf(masterNode.address)).to.be.equal(8);
    expect(await stackOsNFTgen2.balanceOf(masterNode.address)).to.be.equal(2);
  });

  it("Reverts", async function () {
    await expect(masterNode.deposit(1337, [3, 4])).to.be.revertedWith("Generation doesn't exist");
    await expect(masterNode.deposit(0, [5])).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    await expect(masterNode.mint()).to.be.revertedWith("Not enough deposited");
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

});