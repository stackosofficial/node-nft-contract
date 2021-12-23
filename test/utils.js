const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("@ethersproject/bignumber");
const { parseEther, formatEther } = require("@ethersproject/units");

module.exports = { setup, setupLiquidity, deployStackOS, deployStackOSBasic, print };

async function deployStackOSBasic() {

  SUBSCRIPTION = subscription.address;
  TRANSFER_DISCOUNT = 2000;

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
  await stackOsNFTBasic.setFees(SUBS_FEE, DAO_FEE, DISTR_FEE);
  await stackOsNFTBasic.adjustAddressSettings(
    bank.address, //fake dao & distr addresses
    bank.address
  );
  await stackOsNFTBasic.whitelist(darkMatter.address);
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
    sub0.address,
    stableAcceptor.address,
    STACK_TOKEN,
    DARK_MATTER_ADDRESS,
    exchange.address
  );
  await stackOsNFT.setFees(SUBS_FEE, DAO_FEE, DISTR_FEE);
  await stackOsNFT.whitelist(darkMatter.address);
  return stackOsNFT;
}

async function setup() {
  ERC20 = await ethers.getContractFactory("TestCurrency");
  stackToken = await ERC20.deploy(parseEther("100000000.0"));
  await stackToken.deployed();
  console.log("stackToken", stackToken.address);

  usdt = await ERC20.deploy(parseEther("100000000.0"));
  await usdt.deployed();
  console.log("usdt", usdt.address);

  usdc = await ERC20.deploy(parseEther("100000000.0"));
  await usdc.deployed();
  console.log("usdc", usdc.address);

  dai = await ERC20.deploy(parseEther("100000000.0"));
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
    "0x17cec3137787067579F20994C019e993Bb173B4C",
    "0xCb7F54729c739db4B88C012126caDaF57F3578D3",
    "0x67d5d249D8526f654899BaFE0dD0B7d7D27B5Aa3",
  ]
  const StableCoinAcceptor = await ethers.getContractFactory("StableCoinAcceptor");
  stableAcceptor = await StableCoinAcceptor.deploy(
    STABLES
  );
  await stableAcceptor.deployed();
  console.log(stableAcceptor.address);

  const Exchange = await ethers.getContractFactory("Exchange");
  exchange = await Exchange.deploy(
    router.address,
  );
  await exchange.deployed();
  console.log(exchange.address);

  await generationManager.adjustAddressSettings(
    stableAcceptor.address,
    exchange.address,
    bank.address, // fake dao & royalty distr addresses
    bank.address,
  )

  STACK_TOKEN = stackToken.address;
  GENERATION_MANAGER_ADDRESS = generationManager.address;
  DARK_MATTER_ADDRESS = darkMatter.address;
  ROUTER_ADDRESS = router.address;
  TAX_ADDRESS = tax.address;

  SUBSCRIPTION_PRICE = parseEther("100.0");
  BONUS_PECENT = 2000;
  TAX_REDUCTION_AMOUNT = 2500; // 25% means: 1month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
  TAX_RESET_DEADLINE = 60 * 60 * 24 * 7; // 1 week

  const Subscription = await ethers.getContractFactory("Subscription");
  subscription = await Subscription.deploy(
    STACK_TOKEN,
    GENERATION_MANAGER_ADDRESS,
    DARK_MATTER_ADDRESS,
    stableAcceptor.address,
    exchange.address,
    TAX_ADDRESS,
    TAX_RESET_DEADLINE,
    SUBSCRIPTION_PRICE,
    BONUS_PECENT,
    TAX_REDUCTION_AMOUNT
  );
  await subscription.deployed();
  await subscription.setPrice(SUBSCRIPTION_PRICE);
  await subscription.setBonusPercent(BONUS_PECENT);
  await subscription.settaxReductionAmount(TAX_REDUCTION_AMOUNT);
  await subscription.setTaxResetDeadline(TAX_RESET_DEADLINE);
  MONTH = (await subscription.MONTH()).toNumber();
  console.log("MONTH: ", MONTH);

  const Sub0 = await ethers.getContractFactory("Sub0");
  sub0 = await Sub0.deploy(
    STACK_TOKEN,
    GENERATION_MANAGER_ADDRESS,
    DARK_MATTER_ADDRESS,
    stableAcceptor.address,
    exchange.address,
    TAX_ADDRESS,
    TAX_RESET_DEADLINE,
    SUBSCRIPTION_PRICE,
    BONUS_PECENT,
    TAX_REDUCTION_AMOUNT
  );
  await sub0.deployed();
  await sub0.setPrice(SUBSCRIPTION_PRICE);
  await sub0.setBonusPercent(BONUS_PECENT);
  await sub0.settaxReductionAmount(TAX_REDUCTION_AMOUNT);
  await sub0.setTaxResetDeadline(TAX_RESET_DEADLINE);
  console.log("sub0", sub0.address);

  weth = await ERC20.deploy(parseEther("100000000.0"));
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
  MAX_SUPPLY = 25;
  PRIZES = 10;
  AUCTIONED_NFTS = 10;
  VRF_COORDINATOR = coordinator.address;
  LINK_TOKEN = link.address;
  KEY_HASH =
    "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
  FEE = parseEther("0.1");
  SUBS_FEE = 1000;
  DAO_FEE = 500;
  DISTR_FEE = 500;
  TIMELOCK = 6442850;
  let StackOS = await ethers.getContractFactory("StackOsNFT");
  stackOsNFT = await deployStackOS();
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
      parseEther("4.3637"),
      parseEther("4.3637"),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      usdc.address,
      parseEther("4.3637"),
      parseEther("4.3637"),
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
