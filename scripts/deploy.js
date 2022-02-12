const { parseEther, parseUnits, formatEther } = require("ethers/lib/utils");
const hre = require("hardhat");
const { getImplementationAddress, getAdminAddress } = require('@openzeppelin/upgrades-core');
// const { upgrades } = require("hardhat");

async function main() {
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  //vvvvvvvvvvvvvvvvvv SETTINGS vvvvvvvvvvvvvvvvvv

  // Set fee amount for chainlink in StackOsNFT.sol

  // This address will be owner of all contracts plus market proxy owner
  // Leave empty if you want the deployer to be owner, you will be able to transfer ownership later
  OWNERSHIP = "";

  // Stablecoins supported by the protocol
  STABLES = [
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"
  ]

  // Stack token address
  STACK_TOKEN = "0x980111ae1b84e50222c8843e3a7a038f36fecd2b";

  // Required deposit amount of StackNFTs to be able to mint DarkMatter
  DARK_MATTER_PRICE = 5;

  // IUniswapV2Router02 compatible router
  ROUTER_ADDRESS = "0xA102072A4C07F06EC3B4900FDC4C7B80b6c57429";
  // Address to receive tax of early withdraw subscription
  TAX_ADDRESS = "0x2966bC0d207A8f1E4Da3c902db044C505e13b41E";
  // Subscription price in USD, should be 18 decimals!
  SUBSCRIPTION_PRICE = parseEther("1.0");
  // Subscription bonus percent
  BONUS_PECENT = 8000;
  // Subscription tax reduction amount each month
  // 25% means: 1 month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
  TAX_REDUCTION_AMOUNT = 2500;
  // Subscription forgiveness period in seconds
  FORGIVENESS_PERIOD = 500;
  // Subscription bonus drip period in seconds
  DRIP_PERIOD = 3600;

  // Params for sub0 contract that is locked to first generation tokens

  // Address to receive tax of early withdraw subscription
  TAX_ADDRESS_2 = "0x2966bC0d207A8f1E4Da3c902db044C505e13b41E";
  // Subscription min price in USD, should be 18 decimals!
  SUBSCRIPTION_PRICE_2 = parseEther("1.0");
  // Subscription max price in USD, should be 18 decimals!
  SUBSCRIPTION_MAX_PRICE_2 = parseEther("5.0");
  // Subscription bonus percent
  BONUS_PECENT_2 = 8000;
  // Subscription tax reduction
  TAX_REDUCTION_AMOUNT_2 = 2500;
  // Subscription forgiveness period in seconds
  FORGIVENESS_PERIOD_2 = 500;
  // Subscription bonus drip period in seconds
  DRIP_PERIOD_2 = 3600;
  
  // Market and minting dao fee address
  DAO_ADDRESS = "0x2966bC0d207A8f1E4Da3c902db044C505e13b41E";
  // Market dao fee percent
  DAO_FEE = 1000;
  // Market royalty distribution fee percent
  ROYALTY_FEE = 1000;

  // StackNFT 1st generation

  // Token name
  NAME = "StackOS NFT Genesis";
  // Token symbol
  SYMBOL = "SON";
  // Set uri for newly minted tokens
  baseURI = "https://stackos.com/";
  // Ticket price in STACK
  PRICE = parseEther("0.1");
  // Max amount of NFT in 1st generation
  MAX_SUPPLY = 10;
  // Lottery prizes amount
  PRIZES = 6;
  // Auctioned NFTs amount
  AUCTIONED_NFTS = 2;
  // Timelock period for admin withdraw
  // If you set this to 60, then admin can withdraw after 60 seconds after deployment
  TIMELOCK = 180;
  // For chainlink VRF.
  KEY_HASH =
    "0xf86195cf7690c55907b2b611ebb7343a6f649bff128701cc542f0569e2c549da";
  VRF_COORDINATOR = "0x3d2341ADb2D31f1c5530cDC622016af293177AE0";
  LINK_TOKEN = "0xb0897686c545045aFc77CF20eC7A532E3120E0F1";

  // Set to true if you want partners to be able to mint for themselves (can be started later, after deployment)
  START_PARTNER_SALES = false;

  // Set to true if you want to allow staking for lottery tickets (can be activated later, after deployment)
  ACTIVATE_LOTTERY = false

  /** 
   * You can add more partners, just copy-paste inner array and adjust parameters for each partner.
   * Or comment out that inner array for no whitelisted partners initially.
   * 
   * Params
   * Address - address who will be allowed to mint
   * Uint256 - amount of NFTs allowed for this address to mint
   */
  WHITELISTED_PARTNERS = [
    // ["0x47ef611fcb6480fa4bc74522f2ea2b5812352ae5", 20], // remove or copy-paste this line
  ];
  
  // Address to send fees when royalties received by Royalty contract
  DEPOSIT_FEE_ADDRESS = "0x2966bC0d207A8f1E4Da3c902db044C505e13b41E";
  // Amount of eth required to allow new cycle start (Royalty)
  MIN_ETH_PER_CYCLE = parseEther("0.1");
  // Fee percent to take when royalties received by Royalty contract
  DEPOSIT_FEE_PERCENT = 1000;
  // Set weth address to be able to claim royalty in WETH on matic network.
  // NOTE: in polygon router WETH variable is actually WMATIC token, don't be confused by variable name!
  WETH_ADDRESS = "0x4c28f48448720e9000907BC2611F73022fdcE1fA";

  // Settings for auto deploy StackNFTBasic (generations after first)

  // Token name, on auto deploy we append " N" to the name, where N is generation number
  NAME_2 = "StackOS NFT";
  // Token symbol
  SYMBOL_2 = "SON";
  // Mint price in USD
  PRICE_2 = parseEther("2");
  // Mint fee percent for active subs
  SUBS_FEE_2 = 2000;
  // Mint fee percent for DAO
  DAO_FEE_2 = 500;
  // Base uri
  baseURI_2 = "https://stackos.com/";
  // How much to grow max supply in percents.
  // For example value of 25% will increase max supply from 100 to 125.
  MAX_SUPPLY_GROWTH = 2000;
  // Transfer discount to mint NFTs (when transfer unwon tickets)
  TRANSFER_DISCOUNT_2 = 2000;
  // Timelock period for admin withdraw
  TIMELOCK_2 = 180;
  // Royalty & subscription rewards discount to mint NFTs
  REWARD_DISCOUNT = 2000;

  //^^^^^^^^^^^^^^^^^^ SETTINGS ^^^^^^^^^^^^^^^^^^

  //vvvvvvvvvvvvvvvvvvvvv DEPLOYMENT vvvvvvvvvvvvvvvvvvvvv
  const StableCoinAcceptor = await ethers.getContractFactory("StableCoinAcceptor");
  let stableAcceptor = await StableCoinAcceptor.deploy(
    STABLES
  );
  await stableAcceptor.deployed();
  console.log("StableCoinAcceptor", stableAcceptor.address);

  const Exchange = await ethers.getContractFactory("Exchange");
  let exchange = await Exchange.deploy(
    ROUTER_ADDRESS,
  );
  await exchange.deployed();
  console.log("Exchange", exchange.address);

  const GenerationManager = await ethers.getContractFactory(
    "GenerationManager"
  );
  let generationManager = await GenerationManager.deploy();
  await generationManager.deployed();
  console.log("GenerationManager", generationManager.address);

  const DarkMatter = await ethers.getContractFactory("DarkMatter");
  let darkMatter = await DarkMatter.deploy(
    generationManager.address,
    DARK_MATTER_PRICE
  );
  await darkMatter.deployed();
  console.log("DarkMatter", darkMatter.address);
 
  const Subscription = await ethers.getContractFactory("Subscription");
  let subscription = await Subscription.deploy(
    STACK_TOKEN,
    generationManager.address,
    darkMatter.address,
    stableAcceptor.address,
    exchange.address,
    TAX_ADDRESS,
    FORGIVENESS_PERIOD,
    SUBSCRIPTION_PRICE,
    BONUS_PECENT,
    TAX_REDUCTION_AMOUNT
  );
  await subscription.deployed();
  console.log("Subscription", subscription.address);

  const Sub0 = await ethers.getContractFactory("Subscription");
  sub0 = await Sub0.deploy(
    STACK_TOKEN,
    generationManager.address,
    darkMatter.address,
    stableAcceptor.address,
    exchange.address,
    TAX_ADDRESS_2,
    FORGIVENESS_PERIOD_2,
    SUBSCRIPTION_PRICE_2,
    BONUS_PECENT_2,
    TAX_REDUCTION_AMOUNT_2
  );
  await sub0.deployed();
  console.log("Sub0", sub0.address);

  const Royalty = await ethers.getContractFactory("Royalty");
  royalty = await Royalty.deploy(
    generationManager.address,
    darkMatter.address,
    exchange.address,
    DEPOSIT_FEE_ADDRESS,
    STACK_TOKEN,
    MIN_ETH_PER_CYCLE
  );

  await royalty.deployed();
  console.log("Royalty", royalty.address);

  const Market = await ethers.getContractFactory("Market");
  marketProxy = await upgrades.deployProxy(
    Market,
    [
      generationManager.address,
      darkMatter.address,
      DAO_ADDRESS,
      royalty.address,
      DAO_FEE,
      ROYALTY_FEE
    ],
    { kind: "uups" }
  );
  await marketProxy.deployed();
  const marketImplementaionAddress = await getImplementationAddress(ethers.provider, marketProxy.address);
  const marketImplementaion = await hre.ethers.getContractAt(
    "Market",
    marketImplementaionAddress
  );
  try {
    // params here doesn't matter, as we only wan't to set the owner
    await marketImplementaion.initialize(
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      666,
      666 
    );
  } catch (error) { }
  console.log("Market Proxy", marketProxy.address);
  console.log("Market Implementation", marketImplementaionAddress);

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
  console.log("StackOsNFT", stackOsNFT.address);

  //vvvvvvvvvvvvvvvvvv CONTRACT SETTINGS vvvvvvvvvvvvvvvvvv
  
  await generationManager.adjustAddressSettings(
    stableAcceptor.address,
    exchange.address,
    DAO_ADDRESS,
  );

  // Settings for auto deploy
  let attemps = 10;
  for (let i = 0; i < attemps; i++) {
    try {
      await generationManager.setupDeploy({
        name: NAME_2,
        symbol: SYMBOL_2,
        stackToken: STACK_TOKEN,
        darkMatter: darkMatter.address,
        subscription: subscription.address,
        sub0: sub0.address,
        mintPrice: PRICE_2,
        subsFee: SUBS_FEE_2,
        daoFee: DAO_FEE_2,
        maxSupplyGrowthPercent: MAX_SUPPLY_GROWTH,
        transferDiscount: TRANSFER_DISCOUNT_2,
        rewardDiscount: REWARD_DISCOUNT,
        timeLock: TIMELOCK_2,
        royaltyAddress: royalty.address,
        market: marketProxy.address,
        baseURI: baseURI_2
      }, { gasLimit: 1e6 });
      // console.log(`setupDeploy successfully called`);
      break;
    } catch (error) {
      console.log(`setupDeploy is failed ${i+1} times, trying to call again, attemps left ${attemps - i+1}`);
    }
    
  }

  await delay(2000);

  // Add 1st generation in GenerationManager
  for (let i = 0; i < attemps; i++) {
    try {
      await generationManager.add(stackOsNFT.address, { gasLimit: 1e6 });
      // console.log(`add successfully called`);
      break;
    } catch (error) {
      console.log(`'add' is failed ${i+1} times, trying to call again, attemps left ${attemps - i+1}`);
    }
  }

  // Allow Market to transfer DarkMatter
  await darkMatter.whitelist(marketProxy.address);

  // Additional settings for StackNFT
  await stackOsNFT.setBaseURI(baseURI);
  await stackOsNFT.adjustAddressSettings(
    generationManager.address,
    stableAcceptor.address,
    STACK_TOKEN,
    darkMatter.address,
    exchange.address,
  );
  // Allow DarkMatter to transfer StackNFT
  await stackOsNFT.whitelist(darkMatter.address);
  // Allow Market to transfer StackNFT
  await stackOsNFT.whitelist(marketProxy.address);

  await subscription.setDripPeriod(DRIP_PERIOD);
  // One of subs contracts is only for 1st generaion
  await sub0.setOnlyFirstGeneration();
  await sub0.setMaxPrice(SUBSCRIPTION_MAX_PRICE_2);
  await sub0.setDripPeriod(DRIP_PERIOD_2);

  // Whitelist partners to mint if there is any
  await Promise.all(
    WHITELISTED_PARTNERS.map((args) => {
      return stackOsNFT.whitelistPartner(...args);
    })
  );

  if (START_PARTNER_SALES) {
    await stackOsNFT.startPartnerSales();
  }

  if (ACTIVATE_LOTTERY) {
    await stackOsNFT.activateLottery();
  }

  await royalty.setFeePercent(DEPOSIT_FEE_PERCENT);
  await royalty.setWETH(WETH_ADDRESS);

  // TRANSFER OWNERSHIP
  if(OWNERSHIP) {
    // await stableAcceptor.transferOwnership(OWNERSHIP);
    await generationManager.transferOwnership(OWNERSHIP);
    await darkMatter.transferOwnership(OWNERSHIP);
    
    await marketProxy.transferOwnership(OWNERSHIP);
    
    await sub0.transferOwnership(OWNERSHIP);
    await subscription.transferOwnership(OWNERSHIP);
    await stackOsNFT.transferOwnership(OWNERSHIP);
    await royalty.transferOwnership(OWNERSHIP);
    await exchange.transferOwnership(OWNERSHIP);
  }
  
  //^^^^^^^^^^^^^^^^^^ CONTRACT SETTINGS ^^^^^^^^^^^^^^^^^^

  //^^^^^^^^^^^^^^^^^^^^^ DEPLOYMENT ^^^^^^^^^^^^^^^^^^^^^

  // vvvvvvvvvvvvvvvvvvvvvvvvv VERIFICATION vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
  console.log("Verification started, please wait for a minute!");
  await delay(46000);

  let deployedContracts = [
    stableAcceptor,
    exchange,
    generationManager,
    darkMatter,
    marketImplementaion,
    subscription,
    sub0,
    royalty,
    stackOsNFT
  ];

  for (let i = 0; i < deployedContracts.length; i++) {
    try {
      const contract = deployedContracts[i];
      await hre.run("verify:verify", {
        address: contract.address,
        constructorArguments: contract.constructorArgs,
      });
    } catch (error) {
      console.log(error)
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
