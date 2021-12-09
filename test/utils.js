const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("@ethersproject/bignumber");
const { parseEther, formatEther } = require("@ethersproject/units");

module.exports = { setup, deployStackOS, deployStackOSBasic, print };

async function deployStackOSBasic() {
  // NAME = "STACK OS NFT";
  // SYMBOL = "SON";
  // STACK_TOKEN_FOR_PAYMENT = stackToken.address;
  // DARK_MATTER_ADDRESS = darkMatter.address;
  // ROUTER = router.address;
  SUBSCRIPTION = subscription.address;
  // PRICE = parseEther("5");
  // MINT_FEE = 2000;
  // MAX_SUPPLY = 25;
  // TRANSFER_DISCOUNT = 2000;
  // TIMELOCK = 6442850;
  const StackOS = await ethers.getContractFactory("StackOsNFTBasic");
  let stackOsNFT = await StackOS.deploy(
    NAME,
    SYMBOL,
    STACK_TOKEN_FOR_PAYMENT,
    DARK_MATTER_ADDRESS,
    // ROUTER,
    SUBSCRIPTION,
    PRICE,
    MINT_FEE,
    MAX_SUPPLY,
    TRANSFER_DISCOUNT,
    TIMELOCK,
    ROYALTY_ADDRESS
  );
  await stackOsNFT.deployed();
  console.log(stackOsNFT.address);
  await generationManager.add(stackOsNFT.address);
  await stackOsNFT.adjustAddressSettings(
    generationManager.address,
    router.address
  );
  await stackOsNFT.whitelist(darkMatter.address);
  return stackOsNFT;
}

async function deployStackOS() {
  const StackOS = await ethers.getContractFactory("StackOsNFT");
  let stackOsNFT = await StackOS.deploy(
    NAME,
    SYMBOL,
    STACK_TOKEN_FOR_PAYMENT,
    DARK_MATTER_ADDRESS,
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
  await stackOsNFT.adjustAddressSettings(
    generationManager.address,
    router.address,
    subscription.address
  );
  await stackOsNFT.setMintFee(MINT_FEE); // usdt
  await stackOsNFT.whitelist(darkMatter.address);
  return stackOsNFT;
}

async function setup() {
  ERC20 = await ethers.getContractFactory("TestCurrency");
  let stackToken = await ERC20.deploy(parseEther("100000000.0"));
  await stackToken.deployed();
  console.log("stackToken", stackToken.address);

  let usdt = await ERC20.deploy(parseEther("100000000.0"));
  await usdt.deployed();
  console.log("usdt", usdt.address);

  let usdc = await ERC20.deploy(parseEther("100000000.0"));
  await usdc.deployed();
  console.log("usdc", usdc.address);

  let dai = await ERC20.deploy(parseEther("100000000.0"));
  await dai.deployed();
  console.log("dai", dai.address);

  const LinkToken = await ethers.getContractFactory("LinkToken");
  let link = await LinkToken.deploy();
  await link.deployed();
  console.log("link", link.address);

  const Coordinator = await ethers.getContractFactory("VRFCoordinatorMock");
  let coordinator = await Coordinator.deploy(link.address);
  await coordinator.deployed();
  console.log("coordinator", coordinator.address);

  const GenerationManager = await ethers.getContractFactory(
    "GenerationManager"
  );
  let generationManager = await GenerationManager.deploy();
  await generationManager.deployed();
  console.log("Gen manager", generationManager.address);

  GENERATION_MANAGER_ADDRESS = generationManager.address;
  DARK_MATTER_PRICE = 5;
  const DarkMatter = await ethers.getContractFactory("DarkMatter");
  let darkMatter = await DarkMatter.deploy(
    GENERATION_MANAGER_ADDRESS,
    DARK_MATTER_PRICE
  );
  await darkMatter.deployed();
  console.log(darkMatter.address);

  PAYMENT_TOKEN = usdt.address;
  STACK_TOKEN_FOR_PAYMENT = stackToken.address;
  GENERATION_MANAGER_ADDRESS = generationManager.address;
  DARK_MATTER_ADDRESS = darkMatter.address;
  ROUTER_ADDRESS = router.address;
  TAX_ADDRESS = tax.address;

  SUBSCRIPTION_PRICE = parseEther("100.0");
  BONUS_PECENT = 2000;
  TAX_REDUCTION_PERCENT = 2500; // 25% means: 1month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
  TAX_RESET_DEADLINE = 60 * 60 * 24 * 7; // 1 week

  const Subscription = await ethers.getContractFactory("Subscription");
  let subscription = await Subscription.deploy(
    // PAYMENT_TOKEN,
    STACK_TOKEN_FOR_PAYMENT,
    GENERATION_MANAGER_ADDRESS,
    DARK_MATTER_ADDRESS,
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
  console.log("MONTH: ", MONTH);

  NAME = "STACK OS NFT";
  SYMBOL = "SON";
  STACK_TOKEN_FOR_PAYMENT = stackToken.address;
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
  MINT_FEE = 2000;
  TRANSFER_DISCOUNT = 2000;
  TIMELOCK = 6442850;
  StackOS = await ethers.getContractFactory("StackOsNFT");
  let stackOsNFT = await StackOS.deploy(
    NAME,
    SYMBOL,
    STACK_TOKEN_FOR_PAYMENT,
    DARK_MATTER_ADDRESS,
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
  await stackOsNFT.adjustAddressSettings(
    generationManager.address,
    router.address,
    subscription.address
  );
  await stackOsNFT.setMintFee(MINT_FEE);
  await stackOsNFT.whitelist(darkMatter.address);

  weth = await ERC20.deploy(parseEther("100000000.0"));
  await weth.deployed();
  console.log("weth", weth.address);

  GENERATION_MANAGER_ADDRESS = generationManager.address;
  DARK_MATTER_ADDRESS = darkMatter.address;
  DEPOSIT_FEE_ADDRESS = bank.address;
  MIN_CYCLE_ETHER = parseEther("1");
  DEPOSIT_FEE_PERCENT = 1000;

  const Royalty = await ethers.getContractFactory("Royalty");
  royalty = await Royalty.deploy(
    ROUTER_ADDRESS,
    GENERATION_MANAGER_ADDRESS,
    DARK_MATTER_ADDRESS,
    subscription.address,
    DEPOSIT_FEE_ADDRESS,
    MIN_CYCLE_ETHER
  );
  await royalty.deployed();
  ROYALTY_ADDRESS = royalty.address;
  await royalty.setFeePercent(DEPOSIT_FEE_PERCENT);
  await royalty.setWETH(weth.address);

  return [
    stackToken,
    usdt,
    usdc,
    dai,
    link,
    weth,
    coordinator,
    generationManager,
    darkMatter,
    subscription,
    stackOsNFT,
    royalty,
  ];
}

function print(...args) {
  args = args.map((value) => {
    return BigNumber.isBigNumber(value) ? formatEther(value) : value;
  });
  console.log(...args);
}
