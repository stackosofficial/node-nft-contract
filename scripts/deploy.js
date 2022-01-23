const { parseEther } = require("ethers/lib/utils");
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
  // Make sure first address has the most liquidity, as it is used by default in some places
  STABLES = [
    "0xeb8f08a975Ab53E34D8a0330E0D34de942C95926"
  ]

  // Stack token address
  STACK_TOKEN = "0x641f40c85e070b92ce14b25c21609a68cd2d8a53";

  // Required deposit amount of StackNFTs to be able to mint DarkMatter
  DARK_MATTER_PRICE = 5;

  // Uniswap router
  ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
  // Address to receive tax of early withdraw subscription
  TAX_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";
  // Subscription price in USD, should be 18 decimals!
  SUBSCRIPTION_PRICE = parseEther("100.0");
  // Subscription bonus percent
  BONUS_PECENT = 2000;
  // Subscription tax reduction amount each month
  // 25% means: 1 month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
  TAX_REDUCTION_AMOUNT = 2500;
  // Subscription forgiveness period in seconds
  FORGIVENESS_PERIOD = 60 * 60 * 24 * 7;

  // Params for first generation subscription

  // Address to receive tax of early withdraw subscription
  TAX_ADDRESS_2 = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";
  // Subscription min price in USD, should be 18 decimals!
  SUBSCRIPTION_PRICE_2 = parseEther("100.0");
  // Subscription max price in USD, should be 18 decimals!
  SUBSCRIPTION_MAX_PRICE_2 = parseEther("100.0");
  // Subscription bonus percent
  BONUS_PECENT_2 = 2000;
  // Subscription tax reduction
  TAX_REDUCTION_AMOUNT_2 = 2500;
  // Subscription forgiveness period in seconds
  FORGIVENESS_PERIOD_2 = 60 * 60 * 24 * 7;
  
  // Market dao fee address
  DAO_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";
  // Market dao fee percent
  DAO_FEE = 1000;
  // Market royalty distribution fee percent
  ROYALTY_FEE = 1000;

  // StackNFT 1st generation

  // Token name
  NAME = "STACK OS NFT";
  // Token symbol
  SYMBOL = "SON";
  // Set uri for newly minted tokens
  URI = "google.com";
  // Mint price in STACK
  PRICE = parseEther("0.1");
  // Max amount of NFT in this generation
  MAX_SUPPLY = 25;
  // Lottery prizes amount
  PRIZES = 10;
  // Auctioned NFTs amount
  AUCTIONED_NFTS = 10;
  // Timelock period for admin withdraw
  // If you set this to 60, then admin can withdraw after 60 seconds after deployment
  TIMELOCK = 6442850;
  // For chainlink VRF.
  KEY_HASH =
    "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
  VRF_COORDINATOR = "0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B";
  LINK_TOKEN = "0x01BE23585060835E02B77ef475b0Cc51aA1e0709";

  // Set to true if you want partners to be able to mint for themselves (can be started later, after deployment)
  START_PARTNER_SALES = false;

  // Set to true if you want to allow staking for lottery tickets (can be activated later, after deployment)
  ACTIVATE_LOTTERY = false

  /** 
   * You can add more partners, just copy-paste inner array and adjust parameters for each partner.
   * Or remove that inner array for no whitelisted partners initially.
   * 
   * Params
   * Address - address who will be allowed to mint
   * Uint256 - amount of NFTs allowed for this address to mint
   */
  WHITELISTED_PARTNERS = [
    // ["0x47ef611fcb6480fa4bc74522f2ea2b5812352ae5", 4], // remove or copy-paste this line
  ];
  
  // Address to send fees when royalties received by Royalty contract
  DEPOSIT_FEE_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";
  // Amount of eth required to allow new cycle start (Royalty)
  MIN_CYCLE_ETHER = parseEther("1");
  // Fee percent to take when royalties received by Royalty contract
  DEPOSIT_FEE_PERCENT = 1000;
  // Set weth address to be able to claim royalty in WETH on matic network.
  WETH_ADDRESS = "0xc778417E063141139Fce010982780140Aa0cD5Ab";

  // Settings for auto deploy StackNFTBasic (generations after first)

  // Token name, on auto deploy we append " N" to the name, where N is generation number
  NAME_2 = "STACK OS NFT";
  // Token symbol
  SYMBOL_2 = "STACK NFT";
  // Mint price in USD, should be 18 decimals!
  PRICE_2 = parseEther("100");
  // Mint fee percent for active subs
  SUBS_FEE_2 = 2000;
  // Mint fee percent for DAO
  DAO_FEE_2 = 500;
  // Mint fee percent royalty distribution
  DISTR_FEE_2 = 500;
  // Set uri for newly minted tokens
  URI_2 = "google.com";
  // How much to grow max supply in percents.
  // For example value of 25% will increase max supply from 100 to 125.
  MAX_SUPPLY_GROWTH = 10000;
  // Transfer discount to mint NFTs (when transfer unwon tickets)
  TRANSFER_DISCOUNT_2 = 2000;
  // Timelock period for admin withdraw
  TIMELOCK_2 = 6442850;

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
    MIN_CYCLE_ETHER
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
  )

  // Allow Market to transfer DarkMatter
  await darkMatter.whitelist(marketProxy.address);

  // Add 1st generation in GenerationManager
  await generationManager.add(stackOsNFT.address);

  // Additional settings for StackNFT
  await stackOsNFT.setUri(URI);
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

  // One of subs contracts is only for 1st generaion
  await sub0.setOnlyFirstGeneration();
  await sub0.setMaxPrice(SUBSCRIPTION_MAX_PRICE_2);

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

  // Settings for auto deploy
  await generationManager.setupDeploy(
    NAME_2,
    SYMBOL_2,
    STACK_TOKEN,
    darkMatter.address,
    subscription.address,
    sub0.address,
    PRICE_2,
    SUBS_FEE_2,
    MAX_SUPPLY_GROWTH,
    TRANSFER_DISCOUNT_2,
    TIMELOCK_2,
    royalty.address
  );
  await generationManager.setupDeploy2(
    marketProxy.address,
    DAO_FEE_2,
    DISTR_FEE_2,
    URI_2
  )

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
