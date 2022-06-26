const { parseEther, parseUnits, formatEther } = require("ethers/lib/utils");
const hre = require("hardhat");
const { getImplementationAddress, getAdminAddress } = require('@openzeppelin/upgrades-core');
const { ethers } = require("hardhat");
// const { upgrades } = require("hardhat");

async function main() {
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  //vvvvvvvvvvvvvvvvvv SETTINGS vvvvvvvvvvvvvvvvvv

  // This address will be owner of vault
  // Leave empty if you want the deployer to be owner, you will be able to transfer ownership later
  OWNERSHIP = "";

  // addresses of the contracts in production
  STACK_TOKEN = "0x980111ae1b84e50222c8843e3a7a038f36fecd2b";
  GENERATION_MANAGER = "0xA07750dca4a6cb5835c1082dF3E556b0E3c98943";
  SUB0 = "0xD9A26c042b51eC5D54222e17629e4c4b4Be6A8DD";
  SUBSCRIPTION = "0x58e49a747afCF7fb6d551AAb06EF592485e3E01d";

  //^^^^^^^^^^^^^^^^^^ SETTINGS ^^^^^^^^^^^^^^^^^^

  //vvvvvvvvvvvvvvvvvvvvv DEPLOYMENT vvvvvvvvvvvvvvvvvvvvv

  //deploy Vault
  const Vault = await ethers.getContractFactory("Vault");
  vault = await Vault.deploy(
    STACK_TOKEN,
    GENERATION_MANAGER,
    SUB0,
    SUBSCRIPTION
  );
  await vault.deployed();

  //vvvvvvvvvvvvvvvvvv CONTRACT SETTINGS vvvvvvvvvvvvvvvvvv

  console.log("\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  console.log("  - Setup started...");

  // whitelist vault on ALL generations
  generationManager = await ethers.getContractAt(
    "GenerationManager",
    GENERATION_MANAGER
  );
  count = Number(await generationManager.count());
  for (let i = 0; i < count; i++) {
    let curGen = await generationManager.get(i);
    curGen = await ethers.getContractAt(
      "Whitelist",
      curGen
    );
    try {
      await (await curGen.whitelist(vault.address)).wait();
    } catch (error) {
      if(error.toString().includes("Ownable: caller is not the owner")) {
        console.error("  ~ ERROR: Whitelist transaction sended from not owner of generation №", i);
      } else console.log(error);
    }
  }

  // TRANSFER OWNERSHIP
  if (OWNERSHIP) {
    await (await vault.transferOwnership(OWNERSHIP)).wait();
    console.log("  - Ownership transferred to: ", OWNERSHIP);
  }

  console.log("  - Setup completed.");

  //^^^^^^^^^^^^^^^^^^ CONTRACT SETTINGS ^^^^^^^^^^^^^^^^^^

  //^^^^^^^^^^^^^^^^^^^^^ DEPLOYMENT ^^^^^^^^^^^^^^^^^^^^^

  // vvvvvvvvvvvvvvvvvvvvvvvvv VERIFICATION vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
  console.log("  - Verification will start in a minute...\n");
  await delay(46000);

  let deployedContracts = [
    vault
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
