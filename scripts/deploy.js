const hre = require("hardhat");

async function main() {

  const parseEther = ethers.utils.parseEther;
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  //vvvvvvvvvvvvvvvvvv SETTINGS vvvvvvvvvvvvvvvvvv

  // TODO: write about VRF and LINK addresses in contract code to be replaced
  // and write some comments here
  // and add royalty ddepllymened

  NAME = "STACK OS NFT";
  SYMBOL = "SON";
  STACK_TOKEN_FOR_PAYMENT = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  PRICE = parseEther("0.1");
  MAX_SUPPLY = 15;
  PRIZES = 10;
  URI_LINK = "https://google.com/";
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
    URI_LINK
  );
  await stackOsNFT.deployed();
  //^^^^^^^^^^^^^^^^^^^^^ DEPLOYMENT ^^^^^^^^^^^^^^^^^^^^^

  //vvvvvvvvvvvvvvvvvv CONTRACT SETTINGS vvvvvvvvvvvvvvvvvv
  /** 
   * You can add more partners, just copy paste this function call and adjust params
   * 
   * Params
   * Address - address who will be allowed to mint for themselves
   * Bool - set true for whitelisted
   * Uint256 - amount of NFTs allowed for this address to mint
  */
  await stackOsNFT.whitelistPartner("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", true, 4);

  /**
   * Comment out this function call if you don't want partners to be able to mint for themselves (can be called later)
   */
  await stackOsNFT.startSales();
  /**
   * Comment out this function call if you don't want peoples to stake for lottery tickets (can be called later)
   */
  await stackOsNFT.activateLottery();

  //^^^^^^^^^^^^^^^^^^ CONTRACT SETTINGS ^^^^^^^^^^^^^^^^^^ 

  // vvvvvvvvvvvvvvvvvvvvvvvvv VERIFICATION vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
  console.log("Approve token!");
  await delay(26000);
  console.log("Waited 26s");

  await hre.run("verify:verify", {
    address: stackOsNFT.address,
    constructorArguments: [
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      URI_LINK
    ],
  });

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
