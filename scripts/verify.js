const { parseEther } = require("ethers/lib/utils");
const hre = require("hardhat");

async function main() {

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

  // await hre.run("verify:verify", {
  //   address: "0x161fb8a44a4E47090059fbB6b055fFf3416b015f",
  //   constructorArguments: [],
  // });
  // await hre.run("verify:verify", {
  //   address: "0x7E0767BBe99C6b1A21f45c1D7BEBb19143F4Fad9",
  //   constructorArguments: [
  //     "0x161fb8a44a4E47090059fbB6b055fFf3416b015f",
  //     DARK_MATTER_PRICE
  //   ],
  // });
  // await hre.run("verify:verify", {
  //   address: "0xC7c52676319D8783d6864ae587dEf90c0FEf8543",
  //   constructorArguments: [
  //     "0x161fb8a44a4E47090059fbB6b055fFf3416b015f",
  //     "0x7E0767BBe99C6b1A21f45c1D7BEBb19143F4Fad9",
  //     DAO_ADDRESS,
  //     ROYALTY_DISTRIBUTION_ADDRESS,
  //     DAO_FEE,
  //     ROYALTY_FEE
  //   ],
  // });
  await hre.run("verify:verify", {
    address: "0x5Eb8728223f798F2318e4a2C890127e29F497F99",
    constructorArguments: [
      STACK_TOKEN,
      "0x161fb8a44a4E47090059fbB6b055fFf3416b015f",
      "0x7E0767BBe99C6b1A21f45c1D7BEBb19143F4Fad9",
      ROUTER_ADDRESS,
      TAX_ADDRESS,
      TAX_RESET_DEADLINE,
      SUBSCRIPTION_PRICE,
      BONUS_PECENT,
      TAX_REDUCTION_PERCENT
    ],
  });
  await hre.run("verify:verify", {
    address: "0xF04A576f20D7CC102099F385B1dee3Db9D90AE42",
    constructorArguments: [
      NAME,
      SYMBOL,
      STACK_TOKEN,
      "0x7E0767BBe99C6b1A21f45c1D7BEBb19143F4Fad9",
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
    address: "0xcea942f6010B81a5945eBe602944441AB96EC869",
    constructorArguments: [
      ROUTER_ADDRESS,
      "0x161fb8a44a4E47090059fbB6b055fFf3416b015f",
      "0x7E0767BBe99C6b1A21f45c1D7BEBb19143F4Fad9",
      "0x5Eb8728223f798F2318e4a2C890127e29F497F99",
      DEPOSIT_FEE_ADDRESS,
      MIN_CYCLE_ETHER
    ],
  });

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
