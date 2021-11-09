const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");

use(solidity);

describe("Subscription", function () {

  const parseEther = ethers.utils.parseEther;
  const format = ethers.utils.formatEther;

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax]= await hre.ethers.getSigners();

    router = await ethers.getContractAt(
      "IUniswapV2Router02", 
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
    console.log(await router.factory());
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
    
    PAYMENT_TOKEN = usdt.address;
    STACK_TOKEN_FOR_PAYMENT = currency.address;
    STACKOS_NFT_ADDRESS = stackOsNFT.address;
    ROUTER_ADDRESS = router.address;
    TAX_ADDRESS = tax.address;

    SUBSCRIPTION_COST = parseEther("10.0");
    BONUS_PECENT = 2000;
    MONTHS_REQUIRED = 2;
    TAX_RESET_DEADLINE = 60*60*24*7; // 1 week

    const Subscription = await ethers.getContractFactory("Subscription");
    subscription = await Subscription.deploy(
      PAYMENT_TOKEN,
      STACK_TOKEN_FOR_PAYMENT,
      STACKOS_NFT_ADDRESS,
      ROUTER_ADDRESS,
      TAX_ADDRESS,
    );
    await subscription.deployed();
    await subscription.setCost(SUBSCRIPTION_COST);
    await subscription.setBonusPercent(BONUS_PECENT);
    await subscription.setMonthsRequired(MONTHS_REQUIRED);
    await subscription.setTaxResetDeadline(TAX_RESET_DEADLINE);
  });

  it("Mint some NFTs", async function () {
    await currency.transfer(partner.address, parseEther("100.0"));
    await stackOsNFT.startPartnerSales();
    
    await stackOsNFT.whitelistPartner(owner.address, 4);
    await currency.approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.partnerMint(4);
    
    await stackOsNFT.whitelistPartner(partner.address, 1);
    await currency.connect(partner).approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.connect(partner).partnerMint(1);
  });

  it("Unable to withdraw without subs and foreign ids", async function () {
    await expect(subscription.withdraw([0])).to.be.revertedWith(
      "No subscription"
    );
    await expect(subscription.withdraw([4])).to.be.revertedWith(
      "Not owner"
    );
  });

  it("Unable to subscribe for 0 months or foreign ids", async function () {
    await expect(subscription.subscribe([0], 0)).to.be.revertedWith(
      "Zero months not allowed"
    );
    await expect(subscription.subscribe([4], 1)).to.be.revertedWith(
      "Not owner"
    );
  });

  it("Add liquidity", async function () {
    await currency.approve(
      router.address,
      parseEther("1000.0")
    );
    await usdt.approve(
      router.address,
      parseEther("1000.0")
    );
    var deadline = Math.floor(Date.now() / 1000) + 1200;
    await router.addLiquidity(
      usdt.address,
      currency.address,
      parseEther("500.0"),
      parseEther("500.0"),
      0,
      0,
      joe.address,
      deadline
    );
  });

  it("Subscribe 1 month and 4 months in advance", async function () {
    await usdt.approve(
      subscription.address,
      parseEther("200.0")
    );
    await subscription.subscribe([0], 1);
    await subscription.subscribe([1], 4);
  });

  it("Unable to subscibe until next month", async function () {
    await expect(subscription.subscribe([0], 1)).to.be.revertedWith(
      "Too soon"
    );
    await expect(subscription.subscribe([1], 4)).to.be.revertedWith(
      "Too soon"
    );
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});