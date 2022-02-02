const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("@ethersproject/bignumber");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");

module.exports = { setup, setupLiquidity, deployStackOS, deployStackOSBasic, setupDeployment, print };

async function deployStackOSBasic() {

  SUBSCRIPTION = subscription.address;

  let args = [
    NAME,
    SYMBOL,
    STACK_TOKEN,
    darkMatter.address,
    subscription.address,
    sub0.address,
    PRICE,
    MAX_SUPPLY,
    TRANSFER_DISCOUNT,
    TIMELOCK,
    ROYALTY_ADDRESS,
  ]
  // get address with callStatic, the call will not change the state
  let stackOsNFTBasic = await generationManager.callStatic.deployNextGen(
    ...args
  );
  // actual deploy
  await generationManager.deployNextGen(
    ...args
  );
  stackOsNFTBasic = await ethers.getContractAt(
    "StackOsNFTBasic",
    stackOsNFTBasic
  )
  console.log("stackOsNFTBasic", stackOsNFTBasic.address);
  return stackOsNFTBasic;
}

async function deployStackOS() {
  let StackOS = await ethers.getContractFactory("StackOsNFT");
  let stackOsNFT = await StackOS.deploy(
    NAME,
    SYMBOL,
    VRF_COORDINATOR,
    LINK_TOKEN,
    PRICE,
    MAX_SUPPLY,
    PRIZES,
    AUCTIONED_NFTS,
    KEY_HASH,
    TIMELOCK,
    royalty.address
  );
  await stackOsNFT.deployed();
  await generationManager.add(stackOsNFT.address);
  await stackOsNFT.adjustAddressSettings(
    generationManager.address,
    stableAcceptor.address,
    STACK_TOKEN,
    DARK_MATTER_ADDRESS,
    exchange.address
  );
  await stackOsNFT.whitelist(darkMatter.address);
  await stackOsNFT.setUri(URI);
  return stackOsNFT;
}

async function setup() {
  TestCurrency = await ethers.getContractFactory("TestCurrency");
  stackToken = await TestCurrency.deploy(parseEther("100000000.0"), 18);
  await stackToken.deployed();
  console.log("stackToken", stackToken.address);

  usdt = await TestCurrency.deploy(parseEther("100000000.0"), 6);
  await usdt.deployed();
  console.log("usdt", usdt.address);

  usdc = await TestCurrency.deploy(parseEther("100000000.0"), 6);
  await usdc.deployed();
  console.log("usdc", usdc.address);

  dai = await TestCurrency.deploy(parseEther("100000000.0"), 18);
  await dai.deployed();
  console.log("dai", dai.address);

  const LinkToken = await ethers.getContractFactory("LinkToken");
  link = await LinkToken.deploy();
  await link.deployed();
  console.log("link", link.address);

  const Coordinator = await ethers.getContractFactory("VRFCoordinatorMock");
  coordinator = await Coordinator.deploy(link.address);
  await coordinator.deployed();
  console.log("coordinator", coordinator.address);

  const GenerationManager = await ethers.getContractFactory(
    "GenerationManager"
  );
  generationManager = await GenerationManager.deploy();
  await generationManager.deployed();
  console.log("Gen manager", generationManager.address);

  GENERATION_MANAGER_ADDRESS = generationManager.address;
  DARK_MATTER_PRICE = 5;
  const DarkMatter = await ethers.getContractFactory("DarkMatter");
  darkMatter = await DarkMatter.deploy(
    GENERATION_MANAGER_ADDRESS,
    DARK_MATTER_PRICE
  );
  await darkMatter.deployed();
  console.log(darkMatter.address);

  STABLES = [
    "0x2f6f107D4Afd43c451B74DA41A6DDA53D2Bf24B1",
    "0xb9b0c96e4E7181926D2A7ed331C9C346dfa59b4D",
    "0x905Ad472d7eeB94ed1Fc29D8ff4B53FD4D5a5Eb4",
  ]
  const StableCoinAcceptor = await ethers.getContractFactory("StableCoinAcceptor");
  stableAcceptor = await StableCoinAcceptor.deploy(
    STABLES
  );
  await stableAcceptor.deployed();
  console.log(stableAcceptor.address);

  router = await ethers.getContractAt(
    "IUniswapV2Router02",
    "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"
  );
  const Exchange = await ethers.getContractFactory("Exchange");
  exchange = await Exchange.deploy(
    router.address,
  );
  await exchange.deployed();
  console.log(exchange.address);

  await generationManager.adjustAddressSettings(
    stableAcceptor.address,
    exchange.address,
    bank.address // fake dao
  )

  STACK_TOKEN = stackToken.address;
  GENERATION_MANAGER_ADDRESS = generationManager.address;
  DARK_MATTER_ADDRESS = darkMatter.address;
  ROUTER_ADDRESS = router.address;
  TAX_ADDRESS = tax.address;

  DRIP_PERIOD = 31536000;
  SUBSCRIPTION_PRICE = parseEther("100.0");
  SUBSCRIPTION_PRICE_MAX = parseEther("5000.0");
  BONUS_PECENT = 8000;
  TAX_REDUCTION_AMOUNT = 2500; // 25% means: 1month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
  FORGIVENESS_PERIOD = 604800; // 1 week

  const Subscription = await ethers.getContractFactory("Subscription");
  subscription = await Subscription.deploy(
    STACK_TOKEN,
    GENERATION_MANAGER_ADDRESS,
    DARK_MATTER_ADDRESS,
    stableAcceptor.address,
    exchange.address,
    TAX_ADDRESS,
    FORGIVENESS_PERIOD,
    SUBSCRIPTION_PRICE,
    BONUS_PECENT,
    TAX_REDUCTION_AMOUNT
  );
  await subscription.deployed();
  await subscription.setDripPeriod(DRIP_PERIOD);
  await subscription.setPrice(SUBSCRIPTION_PRICE);
  await subscription.setBonusPercent(BONUS_PECENT);
  await subscription.setTaxReductionAmount(TAX_REDUCTION_AMOUNT);
  await subscription.setForgivenessPeriod(FORGIVENESS_PERIOD);
  MONTH = (await subscription.MONTH()).toNumber();
  console.log("MONTH: ", MONTH);

  const Sub0 = await ethers.getContractFactory("Subscription");
  sub0 = await Sub0.deploy(
    STACK_TOKEN,
    GENERATION_MANAGER_ADDRESS,
    DARK_MATTER_ADDRESS,
    stableAcceptor.address,
    exchange.address,
    TAX_ADDRESS,
    FORGIVENESS_PERIOD,
    SUBSCRIPTION_PRICE,
    BONUS_PECENT,
    TAX_REDUCTION_AMOUNT
  );
  await sub0.deployed();
  await sub0.setDripPeriod(DRIP_PERIOD);
  await sub0.setPrice(SUBSCRIPTION_PRICE);
  await sub0.setMaxPrice(SUBSCRIPTION_PRICE_MAX);
  await sub0.setBonusPercent(BONUS_PECENT);
  await sub0.setTaxReductionAmount(TAX_REDUCTION_AMOUNT);
  await sub0.setForgivenessPeriod(FORGIVENESS_PERIOD);
  await sub0.setOnlyFirstGeneration();
  console.log("sub0", sub0.address);

  weth = await TestCurrency.deploy(parseEther("100000000.0"), 18);
  await weth.deployed();
  console.log("weth", weth.address);


  DEPOSIT_FEE_ADDRESS = bank.address;
  MIN_CYCLE_ETHER = parseEther("1");
  DEPOSIT_FEE_PERCENT = 1000;

  const Royalty = await ethers.getContractFactory("Royalty");
  royalty = await Royalty.deploy(
    generationManager.address,
    darkMatter.address,
    exchange.address,
    DEPOSIT_FEE_ADDRESS,
    stackToken.address,
    MIN_CYCLE_ETHER
  );
  await royalty.deployed();
  ROYALTY_ADDRESS = royalty.address;
  await royalty.setFeePercent(DEPOSIT_FEE_PERCENT);
  await royalty.setWETH(weth.address);
  console.log("royalty", royalty.address);
  
  NAME = "STACK OS NFT";
  SYMBOL = "SON";
  STACK_TOKEN = stackToken.address;
  DARK_MATTER_ADDRESS = darkMatter.address;
  PRICE = parseEther("0.1");
  MAX_SUPPLY = 100;
  PRIZES = 60;
  AUCTIONED_NFTS = 20;
  VRF_COORDINATOR = coordinator.address;
  LINK_TOKEN = link.address;
  KEY_HASH =
    "0xf86195cf7690c55907b2b611ebb7343a6f649bff128701cc542f0569e2c549da";
  SUBS_FEE = 1000;
  DAO_FEE = 1000;
  ROYALTY_FEE = 1000;
  URI = "site.com";
  TIMELOCK = 6442850;
  MAX_SUPPLY_GROWTH = 2000;
  TRANSFER_DISCOUNT = 2000;
  REWARD_DISCOUNT = 2000;
  let StackOS = await ethers.getContractFactory("StackOsNFT");
  stackOsNFT = await deployStackOS();

}

async function setupDeployment() {
    await generationManager.setupDeploy(
      NAME,
      SYMBOL,
      STACK_TOKEN,
      DARK_MATTER_ADDRESS,
      subscription.address,
      sub0.address,
      PRICE,
      SUBS_FEE,
      MAX_SUPPLY_GROWTH,
      TRANSFER_DISCOUNT,
      TIMELOCK,
      royalty.address
    );
    await generationManager.setupDeploy2(
      owner.address, // fake market address
      DAO_FEE,
      ROYALTY_FEE,
      URI,
      REWARD_DISCOUNT
    )
}

async function setupLiquidity() {
    await stackToken.approve(router.address, parseEther("100.0"));
    await usdt.approve(router.address, parseEther("100.0"));
    await usdc.approve(router.address, parseEther("100.0"));
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
      // parseEther("4.3637"),
      // parseEther("4.3637"),
      parseUnits("4.3637", await usdt.decimals()),
      parseUnits("4.3637", await usdt.decimals()),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      usdc.address,
      // parseEther("4.3637"),
      // parseEther("4.3637"),
      parseUnits("4.3637", await usdc.decimals()),
      parseUnits("4.3637", await usdc.decimals()),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
}

function print(...args) {
  args = args.map((value) => {
    return BigNumber.isBigNumber(value) ? formatEther(value) : value;
  });
  console.log(...args);
}
