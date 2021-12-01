const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");
const { formatEther, parseEther } = require("@ethersproject/units");

use(solidity);

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
    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
  });

  it("Deploy TestCurrency", async function () {
    ERC20 = await ethers.getContractFactory("TestCurrency");
    stackToken = await ERC20.deploy(parseEther("10000.0"));
    await stackToken.deployed();
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
  it("Deploy DarkMatter", async function () {
    GENERATION_MANAGER_ADDRESS = generationManager.address;
    MASTER_NODE_PRICE = 5;
    const DarkMatter = await ethers.getContractFactory("DarkMatter");
    darkMatter = await DarkMatter.deploy(
      GENERATION_MANAGER_ADDRESS,
      MASTER_NODE_PRICE
    );
    await darkMatter.deployed();
    console.log(darkMatter.address);
  });
   it("Deploy subscription", async function () {
    PAYMENT_TOKEN = usdt.address;
    STACK_TOKEN_FOR_PAYMENT = stackToken.address;
    GENERATION_MANAGER_ADDRESS = generationManager.address;
    MASTER_NODE_ADDRESS = darkMatter.address;
    ROUTER_ADDRESS = router.address;
    TAX_ADDRESS = tax.address;

    SUBSCRIPTION_PRICE = parseEther("100.0");
    BONUS_PECENT = 2000;
    TAX_REDUCTION_PERCENT = 2500; // 25% means: 1month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
    TAX_RESET_DEADLINE = 60 * 60 * 24 * 7; // 1 week

    const Subscription = await ethers.getContractFactory("Subscription");
    subscription = await Subscription.deploy(
      // PAYMENT_TOKEN,
      STACK_TOKEN_FOR_PAYMENT,
      GENERATION_MANAGER_ADDRESS,
      MASTER_NODE_ADDRESS,
      ROUTER_ADDRESS,
      TAX_ADDRESS,
      TAX_RESET_DEADLINE,
      SUBSCRIPTION_PRICE,
      BONUS_PECENT,
      TAX_REDUCTION_PERCENT
    );
    await subscription.deployed();
    await subscription.setPrice(SUBSCRIPTION_PRICE);
    await subscription.setBonusPercent(BONUS_PECENT);
    await subscription.setTaxReductionPercent(TAX_REDUCTION_PERCENT);
    await subscription.setTaxResetDeadline(TAX_RESET_DEADLINE);
    MONTH = (await subscription.MONTH()).toNumber();
  });

  it("Deploy StackOS NFT", async function () {
    NAME = "STACK OS NFT";
    SYMBOL = "SON";
    STACK_TOKEN_FOR_PAYMENT = stackToken.address;
    MASTER_NODE_ADDRESS = darkMatter.address;
    PRICE = parseEther("0.1");
    MAX_SUPPLY = 25;
    PRIZES = 10;
    AUCTIONED_NFTS = 10;
    VRF_COORDINATOR = coordinator.address;
    LINK_TOKEN = link.address;
    KEY_HASH =
      "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
    MINT_FEE = 2000;
    TRANSFER_DISCOUNT = 2000;
    TIMELOCK = 6442850;
    StackOS = await ethers.getContractFactory("StackOsNFT");
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
    await stackOsNFT.adjustAddressSettings(generationManager.address, router.address, subscription.address);
    await stackOsNFT.setMintFee(MINT_FEE);
  });

  it("Deploy StackOS NFT generation 2", async function () {
    stackOsNFTgen2 = await StackOS.deploy(
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
    await stackOsNFTgen2.deployed();
    await generationManager.add(stackOsNFTgen2.address);
    await stackOsNFTgen2.adjustAddressSettings(generationManager.address, router.address, subscription.address);
    await stackOsNFTgen2.setMintFee(MINT_FEE);
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

    // await router.addLiquidityETH(
    //   usdc.address,
    //   parseEther("4.3637"),
    //   parseEther("4.3637"),
    //   parseEther("1.0"),
    //   joe.address,
    //   deadline,
    //   { value: parseEther("10.0") }
    // );
  });

  it("Mint some StackNFT", async function () {
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 10);
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.partnerMint(6, usdt.address);
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

  it("Get DarkMatter ID (stack tokens used to create this dark matter)", async function () {
    let _stackIds = await darkMatter.ID(1);
    console.log("DarkMatterID:", _stackIds.map((g, i) => { return { generation: i, tokens: g.map(t => t.toNumber()) } }));
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

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
