const { parseEther } = require("ethers/lib/utils");
const hre = require("hardhat");

async function main() {
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  //vvvvvvvvvvvvvvvvvv SETTINGS vvvvvvvvvvvvvvvvvv

  // Need to set USDT, USDC, DAI in StableCoinAcceptor.sol
  // Need to set WETH with setWETH for Royalty
  // Need to set LINK token address in StackOsNFT.sol
  // Need to set VRF Coordinator address in StackOsNFT.sol
  // Need to set fee amount for chainlink in StackOsNFT.sol
  // Need to call setupDeploy and setupDeploy2 after GenerationManager deploy
  // Need to whitelist Market to transfer DarkMatter and StackNFT 
  // Need to whitelist DarkMatter to transfer StackNFT 

  DARK_MATTER_PRICE = 5;

  ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
  TAX_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";

  SUBSCRIPTION_PRICE = parseEther("100.0");
  BONUS_PECENT = 2000;
  TAX_REDUCTION_PERCENT = 2500; // 25% means: 1month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
  TAX_RESET_DEADLINE = 60 * 60 * 24 * 7; // 1 week
  
  DEPOSIT_FEE_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";
  MIN_CYCLE_ETHER = parseEther("1");
  DEPOSIT_FEE_PERCENT = 1000;
  WETH_ADDRESS = "0xc778417E063141139Fce010982780140Aa0cD5Ab";

  DAO_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";
  ROYALTY_DISTRIBUTION_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";
  DAO_FEE = 1000;
  ROYALTY_FEE = 1000;

  NAME = "STACK OS NFT";
  SYMBOL = "SON";
  STACK_TOKEN = "0x641f40c85e070b92ce14b25c21609a68cd2d8a53";
  PRICE = parseEther("0.1");
  MAX_SUPPLY = 25;
  PRIZES = 10;
  AUCTIONED_NFTS = 10;
  KEY_HASH =
    "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
  TRANSFER_DISCOUNT = 2000;
  TIMELOCK = 6442850;
  MINT_FEE = 2000;
  /**
   * Set to true if you want partners to be able to mint for themselves (can be started later, after deployment)
   */
  START_PARTNER_SALES = false;
  /**
   * Set to true if you want to allow staking for lottery tickets (can be activated later, after deployment)
   */
  ACTIVATE_LOTTERY = false
  /** 
   * You can add more partners, just copy-paste inner array and adjust parameters for each partner.
   * Or remove that inner array for no whitelisted partners initially.
   * 
   * Params
   * Address - address who will be allowed to mint for themselves
   * Bool - set true for whitelisted
   * Uint256 - amount of NFTs allowed for this address to mint
   */
  WHITELISTED_PARTNERS = [
    ["0x47ef611fcb6480fa4bc74522f2ea2b5812352ae5", 4], // remove or copy-paste this line
  ];

  ROYALTY_MIN_CYCLE_ETHER = parseEther("1");
  ROYALTY_DEPOSIT_FEE_ADDRESS = "0x47ef611fcb6480fa4bc74522f2ea2b5812352ae5";
  ROYALTY_DEPOSIT_FEE_PERCENT = 1000;

  //^^^^^^^^^^^^^^^^^^ SETTINGS ^^^^^^^^^^^^^^^^^^

  //vvvvvvvvvvvvvvvvvvvvv DEPLOYMENT vvvvvvvvvvvvvvvvvvvvv
  const GenerationManager = await ethers.getContractFactory(
    "GenerationManager"
  );
  let generationManager = await GenerationManager.deploy();
  await generationManager.deployed();
  console.log("generationManager", generationManager.address);

  const DarkMatter = await ethers.getContractFactory("DarkMatter");
  let darkMatter = await DarkMatter.deploy(
    generationManager.address,
    DARK_MATTER_PRICE
  );
  await darkMatter.deployed();
  console.log("darkMatter", darkMatter.address);

  const Market = await ethers.getContractFactory("Market");
  market = await upgrades.deployProxy(
    Market,
    [
      generationManager.address,
      darkMatter.address,
      DAO_ADDRESS,
      ROYALTY_DISTRIBUTION_ADDRESS,
      DAO_FEE,
      ROYALTY_FEE
    ]
  );
  await market.deployed();
  console.log("market", market.address);
  await darkMatter.whitelist(market.address);
  
  const Subscription = await ethers.getContractFactory("Subscription");
  let subscription = await Subscription.deploy(
    STACK_TOKEN,
    generationManager.address,
    darkMatter.address,
    ROUTER_ADDRESS,
    TAX_ADDRESS,
    TAX_RESET_DEADLINE,
    SUBSCRIPTION_PRICE,
    BONUS_PECENT,
    TAX_REDUCTION_PERCENT
  );
  await subscription.deployed();
  console.log("subscription", subscription.address);
  // await subscription.setPrice(SUBSCRIPTION_PRICE);
  // await subscription.setBonusPercent(BONUS_PECENT);
  // await subscription.settaxReductionAmount(TAX_REDUCTION_PERCENT);
  // await subscription.setTaxResetDeadline(TAX_RESET_DEADLINE);

  let StackOS = await ethers.getContractFactory("StackOsNFT");
  let stackOsNFT = await StackOS.deploy(
    NAME,
    SYMBOL,
    STACK_TOKEN,
    darkMatter.address,
    PRICE,
    MAX_SUPPLY,
    PRIZES,
    AUCTIONED_NFTS,
    KEY_HASH,
    TRANSFER_DISCOUNT,
    TIMELOCK
  );
  await stackOsNFT.deployed();
  console.log("stackOsNFT", stackOsNFT.address);
  await generationManager.add(stackOsNFT.address);
  await stackOsNFT.adjustAddressSettings(
    generationManager.address,
    ROUTER_ADDRESS,
    subscription.address
  );
  await stackOsNFT.setMintFee(MINT_FEE);
  await stackOsNFT.whitelist(darkMatter.address);
  await stackOsNFT.whitelist(market.address);

  const Royalty = await ethers.getContractFactory("Royalty");
  royalty = await Royalty.deploy(
    ROUTER_ADDRESS,
    generationManager.address,
    darkMatter.address,
    subscription.address,
    DEPOSIT_FEE_ADDRESS,
    MIN_CYCLE_ETHER
  );
  await royalty.deployed();
  console.log("royalty", royalty.address);
  await royalty.setFeePercent(DEPOSIT_FEE_PERCENT);
  await royalty.setWETH(WETH_ADDRESS);

  //vvvvvvvvvvvvvvvvvv CONTRACT SETTINGS vvvvvvvvvvvvvvvvvv
  if (WHITELISTED_PARTNERS.length > 0) {
    await Promise.all(
      WHITELISTED_PARTNERS.map((args) => {
        return stackOsNFT.whitelistPartner(...args);
      })
    );
  }

  if (START_PARTNER_SALES) {
    await stackOsNFT.startPartnerSales();
  }

  if (ACTIVATE_LOTTERY) {
    await stackOsNFT.activateLottery();
  }
  //^^^^^^^^^^^^^^^^^^ CONTRACT SETTINGS ^^^^^^^^^^^^^^^^^^

  //^^^^^^^^^^^^^^^^^^^^^ DEPLOYMENT ^^^^^^^^^^^^^^^^^^^^^

  // vvvvvvvvvvvvvvvvvvvvvvvvv VERIFICATION vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
  console.log("Approve token!");
  await delay(46000);
  console.log("Waited 46s");

  await hre.run("verify:verify", {
    address: generationManager.address,
    constructorArguments: [],
  });
  await hre.run("verify:verify", {
    address: darkMatter.address,
    constructorArguments: [
      generationManager.address,
      DARK_MATTER_PRICE
    ],
  });
  await hre.run("verify:verify", {
    address: market.address,
    constructorArguments: [
      generationManager.address,
      darkMatter.address,
      DAO_ADDRESS,
      ROYALTY_DISTRIBUTION_ADDRESS,
      DAO_FEE,
      ROYALTY_FEE
    ],
  });
  await hre.run("verify:verify", {
    address: subscription.address,
    constructorArguments: [
      STACK_TOKEN,
      generationManager.address,
      darkMatter.address,
      ROUTER_ADDRESS,
      TAX_ADDRESS,
      TAX_RESET_DEADLINE,
      SUBSCRIPTION_PRICE,
      BONUS_PECENT,
      TAX_REDUCTION_PERCENT
    ],
  });
  await hre.run("verify:verify", {
    address: stackOsNFT.address,
    constructorArguments: [
      NAME,
      SYMBOL,
      STACK_TOKEN,
      darkMatter.address,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      KEY_HASH,
      TRANSFER_DISCOUNT,
      TIMELOCK
    ],
  });

  await hre.run("verify:verify", {
    address: royalty.address,
    constructorArguments: [
      ROUTER_ADDRESS,
      generationManager.address,
      darkMatter.address,
      subscription.address,
      DEPOSIT_FEE_ADDRESS,
      MIN_CYCLE_ETHER
    ],
  });

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
