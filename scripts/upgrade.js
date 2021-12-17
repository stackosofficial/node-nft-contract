const { parseEther } = require("ethers/lib/utils");
const hre = require("hardhat");
const { getImplementationAddress, getAdminAddress } = require('@openzeppelin/upgrades-core');
// const { upgrades } = require("hardhat");

async function main() {
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  //vvvvvvvvvvvvvvvvvv SETTINGS vvvvvvvvvvvvvvvvvv

  OWNERSHIP = "";
  NEW_IMPLEMENTATION = "Market";
  MARKET_PROXY_ADDRESS = "0x2a2E02b876d42408D755428aF6F4dCa0AdFC18dd";

  //^^^^^^^^^^^^^^^^^^ SETTINGS ^^^^^^^^^^^^^^^^^^

  //vvvvvvvvvvvvvvvvvvvvv DEPLOYMENT vvvvvvvvvvvvvvvvvvvvv

  const Market = await ethers.getContractFactory(NEW_IMPLEMENTATION);
  marketProxy = await upgrades.upgradeProxy(
    MARKET_PROXY_ADDRESS,
    Market,
    { kind: "uups" }
  );
  await marketProxy.deployed();
  const marketImplementaionAddress = await getImplementationAddress(ethers.provider, marketProxy.address);
  const marketImplementaion = await hre.ethers.getContractAt(
    NEW_IMPLEMENTATION,
    marketImplementaionAddress
  );
  try {
    // params here doesn't matter, as we only wan't to set the owner
    await marketImplementaion.initialize(
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      0 
    );
    if(OWNERSHIP)
      await marketImplementaion.transferOwnership(OWNERSHIP);
  } catch (error) {
      console.log(error);
  }
  console.log("Market Proxy", marketProxy.address);
  console.log("Market Implementation", marketImplementaionAddress);
  
  //^^^^^^^^^^^^^^^^^^^^^ DEPLOYMENT ^^^^^^^^^^^^^^^^^^^^^

  // vvvvvvvvvvvvvvvvvvvvvvvvv VERIFICATION vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
  console.log("Verification started, please wait for a minute!");
  await delay(46000);

  try {
    await hre.run("verify:verify", {
      address: marketImplementaionAddress,
      constructorArguments: [ ],
    });
  } catch (error) {
    console.log(error)
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
