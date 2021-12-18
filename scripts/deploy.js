const { parseEther } = require("ethers/lib/utils");
const hre = require("hardhat");
const { getImplementationAddress, getAdminAddress } = require('@openzeppelin/upgrades-core');
// const { upgrades } = require("hardhat");

async function main() {
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  //vvvvvvvvvvvvvvvvvv SETTINGS vvvvvvvvvvvvvvvvvv

  // Set fee amount for chainlink in StackOsNFT.sol

  // This address will be owner of all contracts plus market proxy owner
  // Leave empty if you wan't the deployer to be owner
  OWNERSHIP = ""; // "0xeb2198ba8047B20aC84fBfB78af33f5A9690F674"

  // Stablecoins supported by Subscription, StackOsNFT, StackOsNFTBasic
  STABLES = [
    "0xeb8f08a975Ab53E34D8a0330E0D34de942C95926"
  ]

  // Required deposit amount of StackNFTs to be able to mint DarkMatter
  DARK_MATTER_PRICE = 5;

  // Uniswap router
  ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
  // Address to receive early Subscription withdraw TAX
  TAX_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";

  // Subscription price in USD
  SUBSCRIPTION_PRICE = parseEther("100.0");
  // Subscription bonus percent
  BONUS_PECENT = 2000;
  // Subscription tax reduction. 25% means: 1month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
  TAX_REDUCTION_AMOUNT = 2500;
  // Subscription time window. How much time you have to resub until TAX reset.
  TAX_RESET_DEADLINE = 60 * 60 * 24 * 7; // 1 week
  
  // Market dao fee address
  DAO_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";
  // Market royalty distribution fee address
  ROYALTY_DISTRIBUTION_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";
  // Market dao fee percent
  DAO_FEE = 1000;
  // Market royalty distribution fee percent
  ROYALTY_FEE = 1000;

  // StackNFT 1st generation
  NAME = "STACK OS NFT";
  SYMBOL = "SON";
  STACK_TOKEN = "0x641f40c85e070b92ce14b25c21609a68cd2d8a53";
  // Mint price in STACK
  PRICE = parseEther("0.1");
  MAX_SUPPLY = 25;
  // Lottery prizes amount
  PRIZES = 10;
  AUCTIONED_NFTS = 10;
  // For chainlink VRF.
  KEY_HASH =
    "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
  // Timelock for admin withdraw. Counting from current block's timestamp.
  TIMELOCK = 6442850;
  // Fee percent sent to Subscription contract on partner mint
  MINT_FEE = 2000;
  VRF_COORDINATOR = "0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B";
  LINK_TOKEN = "0x01BE23585060835E02B77ef475b0Cc51aA1e0709";

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
   * Uint256 - amount of NFTs allowed for this address to mint
   */
  WHITELISTED_PARTNERS = [
    // ["0x47ef611fcb6480fa4bc74522f2ea2b5812352ae5", 4], // remove or copy-paste this line
  ];

  // Address to take fees from when royalties deposited
  DEPOSIT_FEE_ADDRESS = "0xF90fF6d484331399f4eAa13f73D03b8B18eA1373";
  // Amount of eth required to allow new cycle start
  MIN_CYCLE_ETHER = parseEther("1");
  // Fee percent to take on royalties received by Royalty contract
  DEPOSIT_FEE_PERCENT = 1000;
  // Set weth address to be able to claim royalty in WETH on matic network.
  WETH_ADDRESS = "0xc778417E063141139Fce010982780140Aa0cD5Ab";

  // Settings for auto deploy StackNFTBasic (generations after 1)
  // On auto deploy we append " N" where N is generation number
  NAME_2 = "STACK OS NFT";
  SYMBOL_2 = "STACK NFT";
  // Mint price in USD
  PRICE_2 = parseEther("0.001626");
  // Fee percent for Subscription contract on mint
  MINT_FEE_2 = 2000;
  // How much to grow max supply on auto deployed StackNFTBasic
  // We get max supply from current generation, and add this percent
  // So if we have 25, then 10000 will give us 50
  MAX_SUPPLY_GROWTH = 10000;
  // Discount applied to mint NFTs when you transfer tickets from 1st generation to the next
  TRANSFER_DISCOUNT_2 = 2000;
  // Timelock for admin withdraw. Counting from current block's timestamp.
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

  const Market = await ethers.getContractFactory("Market");
  marketProxy = await upgrades.deployProxy(
    Market,
    [
      generationManager.address,
      darkMatter.address,
      DAO_ADDRESS,
      ROYALTY_DISTRIBUTION_ADDRESS,
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
    if(OWNERSHIP)
      await marketImplementaion.transferOwnership(OWNERSHIP);
  } catch (error) {
    console.log(error);
  }
  // const marketProxyAdminAddress = await getAdminAddress(ethers.provider, marketProxy.address);
  console.log("Market Proxy", marketProxy.address);
  console.log("Market Implementation", marketImplementaionAddress);
  // console.log("Market Proxy Admin", marketProxyAdminAddress);
  
  const Subscription = await ethers.getContractFactory("Subscription");
  let subscription = await Subscription.deploy(
    STACK_TOKEN,
    generationManager.address,
    darkMatter.address,
    stableAcceptor.address,
    exchange.address,
    TAX_ADDRESS,
    TAX_RESET_DEADLINE,
    SUBSCRIPTION_PRICE,
    BONUS_PECENT,
    TAX_REDUCTION_AMOUNT
  );
  await subscription.deployed();
  console.log("Subscription", subscription.address);

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
  console.log("StackOsNFT", stackOsNFT.address);

  const Royalty = await ethers.getContractFactory("Royalty");
  royalty = await Royalty.deploy(
    generationManager.address,
    darkMatter.address,
    subscription.address,
    exchange.address,
    DEPOSIT_FEE_ADDRESS,
    MIN_CYCLE_ETHER
  );
  await royalty.deployed();
  console.log("Royalty", royalty.address);

  //vvvvvvvvvvvvvvvvvv CONTRACT SETTINGS vvvvvvvvvvvvvvvvvv
  
  await generationManager.adjustAddressSettings(
    stableAcceptor.address,
    exchange.address,
  )

  // Allow Market to transfer DarkMatter
  await darkMatter.whitelist(marketProxy.address);

  // Add 1st generation in GenerationManager
  await generationManager.add(stackOsNFT.address);

  // Additional settings for StackNFT
  await stackOsNFT.adjustAddressSettings(
    generationManager.address,
    subscription.address,
    stableAcceptor.address,
    STACK_TOKEN,
    darkMatter.address,
    exchange.address,
  );
  await stackOsNFT.setMintFee(MINT_FEE);
  // Allow DarkMatter to transfer StackNFT
  await stackOsNFT.whitelist(darkMatter.address);
  // Allow Market to transfer StackNFT
  await stackOsNFT.whitelist(marketProxy.address);

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
    PRICE_2,
    MINT_FEE_2,
    MAX_SUPPLY_GROWTH,
    TRANSFER_DISCOUNT_2,
    TIMELOCK_2,
    royalty.address
  );
  await generationManager.setupDeploy2(
    marketProxy.address,
  )

  // TRANSFER OWNERSHIP
  if(OWNERSHIP) {
    // await stableAcceptor.transferOwnership(OWNERSHIP);
    await generationManager.transferOwnership(OWNERSHIP);
    await darkMatter.transferOwnership(OWNERSHIP);
    
    await marketProxy.transferOwnership(OWNERSHIP);
    
    await subscription.transferOwnership(OWNERSHIP);
    await stackOsNFT.transferOwnership(OWNERSHIP);
    await royalty.transferOwnership(OWNERSHIP);
  }
  
  //^^^^^^^^^^^^^^^^^^ CONTRACT SETTINGS ^^^^^^^^^^^^^^^^^^

  //^^^^^^^^^^^^^^^^^^^^^ DEPLOYMENT ^^^^^^^^^^^^^^^^^^^^^

  // vvvvvvvvvvvvvvvvvvvvvvvvv VERIFICATION vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
  console.log("Verification started, please wait for a minute!");
  await delay(46000);

  try {
    await hre.run("verify:verify", {
      address: stableAcceptor.address,
      constructorArguments: [STABLES],
    });
  } catch (error) {
    console.log(error)
  }
  try {
    await hre.run("verify:verify", {
      address: exchange.address,
      constructorArguments: [ROUTER_ADDRESS],
    });
  } catch (error) {
    console.log(error)
  }
  try {
    await hre.run("verify:verify", {
      address: generationManager.address,
      constructorArguments: [],
    });
  } catch (error) {
    console.log(error)
  }
  try {
    await hre.run("verify:verify", {
      address: darkMatter.address,
      constructorArguments: [
        generationManager.address,
        DARK_MATTER_PRICE
      ],
    });
  } catch (error) {
    console.log(error)
  }
  try {
    await hre.run("verify:verify", {
      address: marketImplementaionAddress,
      constructorArguments: [ ],
    });
  } catch (error) {
    console.log(error)
  }
  try {
    await hre.run("verify:verify", {
      address: subscription.address,
      constructorArguments: [
        STACK_TOKEN,
        generationManager.address,
        darkMatter.address,
        stableAcceptor.address,
        exchange.address,
        TAX_ADDRESS,
        TAX_RESET_DEADLINE,
        SUBSCRIPTION_PRICE,
        BONUS_PECENT,
        TAX_REDUCTION_AMOUNT
      ],
    });
  } catch (error) {
    console.log(error)
  }
  try {
    await hre.run("verify:verify", {
      address: stackOsNFT.address,
      constructorArguments: [
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
      ],
    });
  } catch (error) {
    console.log(error)
  }
  try {
    await hre.run("verify:verify", {
      address: royalty.address,
      constructorArguments: [
        generationManager.address,
        darkMatter.address,
        subscription.address,
        DEPOSIT_FEE_ADDRESS,
        MIN_CYCLE_ETHER
      ],
    });
  } catch (error) {
    console.log(error)
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
