const hre = require("hardhat");

async function main() {
  const parseEther = ethers.utils.parseEther;
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  //vvvvvvvvvvvvvvvvvv SETTINGS vvvvvvvvvvvvvvvvvv

  NAME = "STACK OS NFT";
  SYMBOL = "SON";
  STACK_TOKEN_FOR_PAYMENT = "0x47ef611fcb6480fa4bc74522f2ea2b5812352ae5";
  PRICE = parseEther("0.1");
  MAX_SUPPLY = 25;
  PRIZES = 10;
  AUCTIONED_NFTS = 10;
  VRF_COORDINATOR = "0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B";
  LINK_TOKEN = "0x01BE23585060835E02B77ef475b0Cc51aA1e0709";
  KEY_HASH =
    "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
  FEE = parseEther("0.1");
  /**
   * Set to true if you want partners to be able to mint for themselves (can be started later, after deployment)
   */
  START_PARTNER_SALES = false;
  /**
   * Set to true if you want to allow staking for lottery tickets (can be activated later, after deployment)
   */
  ACTIVATE_LOTTERY = false;
  /**
   * You can add more partners, just copy-paste inner array (its marked)
   *
   * Params
   * Address - address who will be allowed to mint for themselves
   * Bool - set true for whitelisted
   * Uint256 - amount of NFTs allowed for this address to mint
   */
  WHITELISTED_PARTNERS = [
    ["0x47ef611fcb6480fa4bc74522f2ea2b5812352ae5", true, 4], // remove or copy-paste this line and adjust parameters
  ];

  ROYALTY_MIN_CYCLE_ETHER = parseEther("1");
  ROYALTY_DEPOSIT_FEE_ADDRESS = "0x47ef611fcb6480fa4bc74522f2ea2b5812352ae5";
  ROYALTY_DEPOSIT_FEE_PERCENT = 1000;

  //^^^^^^^^^^^^^^^^^^ SETTINGS ^^^^^^^^^^^^^^^^^^

  //vvvvvvvvvvvvvvvvvvvvv DEPLOYMENT vvvvvvvvvvvvvvvvvvvvv
  const StackOS = await ethers.getContractFactory("StackOsNFT");
  stackOsNFT = await StackOS.deploy(
    NAME,
    SYMBOL,
    STACK_TOKEN_FOR_PAYMENT,
    PRICE,
    MAX_SUPPLY,
    PRIZES,
    AUCTIONED_NFTS,
    VRF_COORDINATOR,
    LINK_TOKEN,
    KEY_HASH,
    FEE
  );
  await stackOsNFT.deployed();
  console.log("StackOS deployed at: ", stackOsNFT.address);

  //vvvvvvvvvvvvvvvvvv CONTRACT SETTINGS vvvvvvvvvvvvvvvvvv
  // if (WHITELISTED_PARTNERS.length > 0) {
  //   await Promise.all(
  //     WHITELISTED_PARTNERS.map((args) => {
  //       return stackOsNFT.whitelistPartner(...args);
  //     })
  //   );
  // }

  // if (START_PARTNER_SALES) {
  //   await stackOsNFT.startPartnerSales();
  // }

  // if (ACTIVATE_LOTTERY) {
  //   await stackOsNFT.activateLottery();
  // }
  //^^^^^^^^^^^^^^^^^^ CONTRACT SETTINGS ^^^^^^^^^^^^^^^^^^

  // const Royalty = await ethers.getContractFactory("Royalty");
  // royalty = await Royalty.deploy(
  //   stackOsNFT.address,
  //   ROYALTY_MIN_CYCLE_ETHER,
  //   ROYALTY_DEPOSIT_FEE_ADDRESS,
  //   ROYALTY_DEPOSIT_FEE_PERCENT
  // );
  // await royalty.deployed();
  // console.log("Royalty deployed at: ", royalty.address);

  //^^^^^^^^^^^^^^^^^^^^^ DEPLOYMENT ^^^^^^^^^^^^^^^^^^^^^

  // vvvvvvvvvvvvvvvvvvvvvvvvv VERIFICATION vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
  console.log("Approve token!");
  await delay(46000);
  console.log("Waited 46s");

  await hre.run("verify:verify", {
    address: stackOsNFT.address,
    constructorArguments: [
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      VRF_COORDINATOR,
      LINK_TOKEN,
      KEY_HASH,
      FEE,
    ],
  });

  // await hre.run("verify:verify", {
  //   address: royalty.address,
  //   constructorArguments: [
  //     stackOsNFT.address,
  //     ROYALTY_MIN_CYCLE_ETHER,
  //     ROYALTY_DEPOSIT_FEE_ADDRESS,
  //     ROYALTY_DEPOSIT_FEE_PERCENT,
  //   ],
  // });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
