const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");

describe("DarkMatter integration with Royalty", function () {
  const parseEther = ethers.utils.parseEther;
  const format = ethers.utils.formatEther;
  const CYCLE_DURATION = 60*60*24*31;
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, dude, tax, DaoWallet, pepe] =
      await hre.ethers.getSigners();
    
    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
  });
  it("Deploy TestCurrency", async function () {
    const ERC20 = await ethers.getContractFactory("TestCurrency");
    stackToken = await ERC20.deploy(parseEther("1000.0"));
    await stackToken.deployed();

    const ERC20_2 = await ethers.getContractFactory("TestCurrency");
    usdt = await ERC20_2.deploy(parseEther("1000.0"));
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
  it("Deploy GenerationManager", async function () {
    const GenerationManager = await ethers.getContractFactory("GenerationManager");
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
    FEE = parseEther("0.1");
    TRANSFER_DISCOUNT = 2000;

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
      // VRF_COORDINATOR,
      // LINK_TOKEN,
      KEY_HASH,
      FEE,
      TRANSFER_DISCOUNT
    );
    await stackOsNFT.deployed();
    await generationManager.add(stackOsNFT.address);
  });
  it("Deploy subscription", async function () {
    PAYMENT_TOKEN = usdt.address;
    STACK_TOKEN_FOR_PAYMENT = stackToken.address;
    GENERATION_MANAGER_ADDRESS = generationManager.address;
    MASTER_NODE_ADDRESS = darkMatter.address;
    ROUTER_ADDRESS = router.address;
    TAX_ADDRESS = tax.address;

    SUBSCRIPTION_PRICE = parseEther("10.0");
    BONUS_PECENT = 2000;
    TAX_REDUCTION_PERCENT = 2500; // 25% means: 1month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
    TAX_RESET_DEADLINE = 60 * 60 * 24 * 7; // 1 week

    const Subscription = await ethers.getContractFactory("Subscription");
    subscription = await Subscription.deploy(
      PAYMENT_TOKEN,
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
  it("Deploy royalty", async function () {
    
    GENERATION_MANAGER_ADDRESS = generationManager.address;
    MASTER_NODE_ADDRESS = darkMatter.address;
    DEPOSIT_FEE_ADDRESS = bank.address;
    MIN_CYCLE_ETHER = parseEther("1");
    DEPOSIT_FEE_PERCENT = 1000;
    
    const Royalty = await ethers.getContractFactory("Royalty");
    royalty = await Royalty.deploy(
      usdt.address,
      ROUTER_ADDRESS,
      GENERATION_MANAGER_ADDRESS,
      MASTER_NODE_ADDRESS,
      subscription.address,
      DEPOSIT_FEE_ADDRESS,
      MIN_CYCLE_ETHER
    );
    await royalty.deployed();
    await royalty.setFeePercent(DEPOSIT_FEE_PERCENT);
  });
  it("Mint DarkMatter NFT", async function () {
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 5);
    await stackToken.approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.partnerMint(5);

    await stackOsNFT.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(0, [0, 1, 2, 3, 4]);
    await darkMatter.mint();

    // got 1 master node
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
    await stackOsNFT.delegate(owner.address, 0); 
    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parseEther("2.0")
    });
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");
    await royalty.claim(0, [0]);

    console.log(format(await owner.getBalance()), format(await provider.getBalance(royalty.address)));
    await expect(royalty.claim(0, [0])).to.be.revertedWith("No royalty");
  });
  it("Mint 3rd DarkMatter NFT on stack generation 2", async function () {
    await generationManager.deployNextGen(      
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
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
    stackOsNFTGen2 = await ethers.getContractAt(
      "StackOsNFT",
      await generationManager.get(1)
    );
    await stackOsNFTGen2.whitelistPartner(owner.address, 5);
    await stackToken.approve(stackOsNFTGen2.address, parseEther("100.0"));
    await stackOsNFTGen2.startPartnerSales();
    await stackOsNFTGen2.partnerMint(5); 

    await stackOsNFTGen2.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(1, [0, 1, 2, 3, 4]);
    await darkMatter.mint()

    // got 1 master node
    expect(await stackOsNFTGen2.balanceOf(darkMatter.address)).to.be.equal(5);
    expect(await stackOsNFTGen2.balanceOf(owner.address)).to.be.equal(0);
    expect(await darkMatter.balanceOf(owner.address)).to.be.equal(2);
  });
  it("Claim royalty for delegated NFTs (two generations)", async function () { 
    await stackOsNFTGen2.delegate(owner.address, 0); 
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

    console.log(format(await owner.getBalance()), format(await provider.getBalance(royalty.address)));
    await royalty.claim(0, [0]);
    await royalty.claim(1, [0]);

    console.log(format(await owner.getBalance()), format(await provider.getBalance(royalty.address)));
    await expect(royalty.claim(0, [0])).to.be.revertedWith("No royalty");
    await expect(royalty.claim(1, [0])).to.be.revertedWith("No royalty");
  });
  
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});