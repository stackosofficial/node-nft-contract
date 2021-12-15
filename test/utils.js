const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("@ethersproject/bignumber");
const { parseEther, formatEther } = require("@ethersproject/units");

module.exports = { setup, setupLiquidity, deployStackOS, deployStackOSBasic, print };

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
  TRANSFER_DISCOUNT = 2000;
  // TIMELOCK = 6442850;

  let args = [
    NAME,
    SYMBOL,
    STACK_TOKEN_FOR_PAYMENT,
    DARK_MATTER_ADDRESS,
    SUBSCRIPTION,
    PRICE,
    MINT_FEE,
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
  await stackOsNFTBasic.adjustAddressSettings(
    router.address
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
    TIMELOCK
  );
  await stackOsNFT.deployed();
  await generationManager.add(stackOsNFT.address);
  await stackOsNFT.adjustAddressSettings(
    generationManager.address,
    router.address,
    subscription.address,
    stableAcceptor.address,
    STACK_TOKEN_FOR_PAYMENT,
    DARK_MATTER_ADDRESS,
    exchange.address
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

  STABLES = [
    "0x17cec3137787067579F20994C019e993Bb173B4C",
    "0xCb7F54729c739db4B88C012126caDaF57F3578D3",
    "0x67d5d249D8526f654899BaFE0dD0B7d7D27B5Aa3",
  ]
  const StableCoinAcceptor = await ethers.getContractFactory("StableCoinAcceptor");
  let stableAcceptor = await StableCoinAcceptor.deploy(
    STABLES
  );
  await stableAcceptor.deployed();
  console.log(stableAcceptor.address);

  const Exchange = await ethers.getContractFactory("Exchange");
  let exchange = await Exchange.deploy(
    router.address,
  );
  await exchange.deployed();
  console.log(exchange.address);

  await generationManager.adjustAddressSettings(
    stableAcceptor.address,
    exchange.address,
  )

  STACK_TOKEN_FOR_PAYMENT = stackToken.address;
  GENERATION_MANAGER_ADDRESS = generationManager.address;
  DARK_MATTER_ADDRESS = darkMatter.address;
  ROUTER_ADDRESS = router.address;
  TAX_ADDRESS = tax.address;

  SUBSCRIPTION_PRICE = parseEther("100.0");
  BONUS_PECENT = 2000;
  TAX_REDUCTION_AMOUNT = 2500; // 25% means: 1month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
  TAX_RESET_DEADLINE = 60 * 60 * 24 * 7; // 1 week

  const Subscription = await ethers.getContractFactory("Subscription");
  let subscription = await Subscription.deploy(
    STACK_TOKEN_FOR_PAYMENT,
    GENERATION_MANAGER_ADDRESS,
    DARK_MATTER_ADDRESS,
    ROUTER_ADDRESS,
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
  TIMELOCK = 6442850;
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
    TIMELOCK
  );
  await stackOsNFT.deployed();
  await generationManager.add(stackOsNFT.address);
  await stackOsNFT.adjustAddressSettings(
    generationManager.address,
    router.address,
    subscription.address,
    stableAcceptor.address,
    STACK_TOKEN_FOR_PAYMENT,
    DARK_MATTER_ADDRESS,
    exchange.address
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
    exchange.address,
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
    stableAcceptor,
    exchange
  ];
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
