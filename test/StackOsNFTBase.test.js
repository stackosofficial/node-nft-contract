const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("@ethersproject/bignumber");
const { parseEther, formatEther } = require("@ethersproject/units");
// const timeMachine = require("@atixlabs/hardhat-time-n-mine");

describe("StackOS NFT", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, joe, tax] = await hre.ethers.getSigners();

    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
    
  });
  it("Deploy fake StackToken", async function () {
    ERC20 = await ethers.getContractFactory("TestCurrency");
    stackToken = await ERC20.deploy(parseEther("100000000.0"));
    await stackToken.deployed();
  });
  it("Deploy fake USDT", async function () {
    ERC20 = await ethers.getContractFactory("TestCurrency");
    usdt = await ERC20.deploy(parseEther("100000000.0"));
    await usdt.deployed();
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
    MASTER_NODE_PRICE = 50;
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
  it("Deploy StackOS NFT Basic", async function () {
    NAME = "STACK OS NFT";
    SYMBOL = "SON";
    STACK_TOKEN_FOR_PAYMENT = stackToken.address;
    MASTER_NODE_ADDRESS = darkMatter.address;
    ROUTER = router.address;
    SUBSCRIPTION = subscription.address;
    PRICE = parseEther("5");
    MINT_FEE = 2000;
    MAX_SUPPLY = 25;
    TRANSFER_DISCOUNT = 2000;
    TIMELOCK = 6442850;
    const StackOS = await ethers.getContractFactory("StackOsNFTBase");
    stackOsNFT = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
      ROUTER,
      SUBSCRIPTION,
      PRICE,
      MINT_FEE,
      MAX_SUPPLY,
      TRANSFER_DISCOUNT,
      TIMELOCK
    );
    await stackOsNFT.deployed();
    console.log(stackOsNFT.address);
    await generationManager.add(stackOsNFT.address);
    await stackOsNFT.adjustAddressSettings(generationManager.address, router.address);

    await stackOsNFT.addPaymentToken(usdt.address); // usdt
    // await stackOsNFT.addPaymentToken("0xdAC17F958D2ee523a2206206994597C13D831ec7"); // usdt
    await stackOsNFT.addPaymentToken("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"); // usdc
    await stackOsNFT.addPaymentToken("0x6B175474E89094C44Da98b954EedeAC495271d0F"); // dai 
  });

  it("Add liquidity", async function () {
    await stackToken.approve(router.address, parseEther("100000000.0"));
    await usdt.approve(router.address, parseEther("100000000.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.addLiquidityETH(
      stackToken.address,
      parseEther("100000.0"),
      parseEther("100000.0"),
      parseEther("3.77"),
      joe.address,
      deadline,
      { value: parseEther("3.77") }
    );

    await router.addLiquidityETH(
      usdt.address,
      parseEther("43637.0"),
      parseEther("43637.0"),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });

  it("Mint for stack token", async function () {
    await stackOsNFT.startSales();

    await stackToken.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.mint(4, stackToken.address);
  });

  it("Mint for STABLE coin", async function () {
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.mint(1, usdt.address);
  });

  it("Unable to mint for unsupported coin", async function () {
    await expect(
      stackOsNFT.mint(1, "0x6Aea593F1E70beb836049929487F7AF3d5e4432F")
    ).to.be.revertedWith(
      "Unsupported payment coin"
    );
  });

  it("Owners can delegate their NFTs", async function () {
    expect(await stackOsNFT.getDelegatee(0)).to.equal(
      ethers.constants.AddressZero
    );
    await stackOsNFT.delegate(joe.address, 0);
    expect(await stackOsNFT.getDelegatee(0)).to.equal(joe.address);
  });

  it("Deploy stackOsNFT generation 2 from manager", async function () {
    await generationManager.deployNextGen(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
      ROUTER,
      SUBSCRIPTION,
      PRICE,
      MINT_FEE,
      MAX_SUPPLY,
      TRANSFER_DISCOUNT,
      TIMELOCK
    );
    stackOsNFTgen2 = await ethers.getContractAt(
      "StackOsNFTBase",
      await generationManager.get(1)
    );
    expect(await stackOsNFTgen2.owner()).to.be.equal(owner.address);
  });

  it("Deploy stackOsNFT generation 3 from manager", async function () {
    PRIZES = 2;
    await generationManager.deployNextGen(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
      ROUTER,
      SUBSCRIPTION,
      PRICE,
      MINT_FEE,
      MAX_SUPPLY,
      TRANSFER_DISCOUNT,
      TIMELOCK
    );
    stackOsNFTgen3 = await ethers.getContractAt(
      "StackOsNFTBase",
      await generationManager.get(2)
    );
    expect(await stackOsNFTgen3.owner()).to.be.equal(owner.address);
  });

  it("Try to buy directly using transferFromLastGen", async function () {
    await expect(
      stackOsNFTgen3.transferFromLastGen(owner.address, parseEther("10.0"))
    ).to.be.revertedWith("Not Correct Address");
  });

  it("Admin tried to withdraw before time lock expires.", async function () {
    var adminWithdrawableAmount = await stackOsNFT.adminWithdrawableAmount();
    console.log(adminWithdrawableAmount.toString());
    await expect(stackOsNFT.adminWithdraw()).to.be.revertedWith("Locked!");
  });

  it("Admin withdraws after time lock.", async function () {
    deadline = Math.floor(Date.now() / 1000) + 1000;
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      deadline + TIMELOCK,
    ]);
    await stackOsNFT.adminWithdraw();
  });
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
