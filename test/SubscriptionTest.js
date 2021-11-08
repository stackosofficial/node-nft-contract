const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");

describe("Subscription", function () {

  const parse = ethers.utils.parseEther;
  const format = ethers.utils.formatEther;

  it("Defining Generals", async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, dude]= await hre.ethers.getSigners();
  });
  it("Deploy TestCurrency", async function () {
    const ERC20 = await ethers.getContractFactory("TestCurrency");
    currency = await ERC20.deploy(parse("1000.0"));
    await currency.deployed();
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
    PRICE = parse("0.1");
    MAX_SUPPLY = 25;
    PRIZES = 10;
    AUCTIONED_NFTS = 10;
    VRF_COORDINATOR = coordinator.address;
    LINK_TOKEN = link.address;
    KEY_HASH =
      "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
    FEE = parse("0.1");

    const StackOS = await ethers.getContractFactory("StackOsNFT");
    stackOsNFT = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      VRF_COORDINATOR,
      LINK_TOKEN,
      KEY_HASH,
      FEE
    );
    await stackOsNFT.deployed();
 
  });
  it("Deploy subscription", async function () {
    
    STACKOS_NFT_ADDRESS = stackOsNFT.address;
    MIN_CYCLE_ETHER = parse("1");
    DEPOSIT_FEE_ADDRESS = bank.address;
    DEPOSIT_FEE_PERCENT = 1000;
    
    const Royalty = await ethers.getContractFactory("Royalty");
    royalty = await Royalty.deploy(
      STACKOS_NFT_ADDRESS,
      MIN_CYCLE_ETHER,
      DEPOSIT_FEE_ADDRESS,
    );
    await royalty.deployed();
    await royalty.setFeePercent(DEPOSIT_FEE_PERCENT);
  });
  it("Mint some NFTs", async function () {
    await currency.transfer(partner.address, parse("100.0"));
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(partner.address, 3);
    await currency.connect(partner).approve(stackOsNFT.address, parse("10.0"));
    await stackOsNFT.connect(partner).partnerMint(3);
  })
});