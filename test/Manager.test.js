const { ethers } = require("hardhat");
const { expect } = require("chai");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
const { deployStackOS, setup, deployStackOSBasic, print, setupDeployment, setupLiquidity } = require("./utils");

describe("Generation Manager", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, joe, tax, bank] = await hre.ethers.getSigners();

  });

  it("Deploy full SETUP", async function () {
    await setup();
    await setupDeployment();
    await setupLiquidity();
  });

  it("Trigger auto deploy of the 2nd generation", async function () {
    await stackOsNFT.whitelistPartner(owner.address, 100);
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.partnerMint(MAX_SUPPLY);

    // get 2nd generation contract
    stackOsNFTBasic = await ethers.getContractAt(
      "StackOsNFTBasic",
      await generationManager.get(1)
    );
    // verify it's added to manager
    expect(await generationManager.count()).to.be.equal(2);
    // 2nd generation has hardcoded max supply value, but not any after that
    expect(await stackOsNFTBasic.getMaxSupply()).to.be.equal(1000);
  });

  it("Trigger auto deploy of the 3rd generation", async function () {
    await stackToken.approve(stackOsNFTBasic.address, parseEther("1000000.0"));
    let oldMaxSupply = await stackOsNFTBasic.getMaxSupply();

    for (let i = 0; i < oldMaxSupply; i++) {
      try {
        await provider.send("evm_increaseTime", [60 * 60]); 
        await stackOsNFTBasic.mint(10);
      } catch (error) {
        break;
      }
    }

    expect(await generationManager.count()).to.be.equal(3);

    await expect(
      generationManager.connect(joe).add(joe.address)
    ).to.be.reverted;

    stackAutoDeployed = await ethers.getContractAt(
      "StackOsNFTBasic",
      await generationManager.get(2)
    );
    
    expect(await stackAutoDeployed.owner()).to.be.equal(owner.address);
    expect(await stackAutoDeployed.getMaxSupply()).to.be.equal(
      oldMaxSupply * (10000 + MAX_SUPPLY_GROWTH) / 10000
    );
    await expect(generationManager.autoDeployNextGeneration()).to.be.reverted;
  });

  it("Trigger auto deploy of the 4th generation", async function () {
    await stackToken.approve(stackAutoDeployed.address, parseEther("100000.0"));
    let oldGenerationsCount = (await generationManager.count()).toNumber();
    
    let oldMaxSupply = await stackAutoDeployed.getMaxSupply(); 
    for (let i = 0; i < oldMaxSupply; i++) {
      try {
        await provider.send("evm_increaseTime", [60 * 60]); 
        await stackAutoDeployed.mint(10);
      } catch (error) {
        break;
      }
    }

    expect(await generationManager.count()).to.be.equal(4);

    stackAutoDeployed2 = await ethers.getContractAt(
      "StackOsNFTBasic",
      await generationManager.get(oldGenerationsCount)
    );
    
    expect(await stackAutoDeployed2.name()).to.be.equal("StackOS NFT 3");
    expect(await stackAutoDeployed2.owner()).to.be.equal(owner.address);
    let newMaxSupply = Math.floor(
        (oldMaxSupply) * (10000 + MAX_SUPPLY_GROWTH) / 10000
    );
    console.log("new max supply", newMaxSupply);
    expect(await stackAutoDeployed2.getMaxSupply()).to.be.equal(
      newMaxSupply
    );
  });

  it("Deploy stackOsNFTBasic generation from manager", async function () {
    let oldMaxSupply = await stackAutoDeployed.getMaxSupply(); 

    MAX_SUPPLY = 1
    stackOsNFTBasicgen3 = await deployStackOSBasic();

    expect(await stackOsNFTBasicgen3.owner()).to.be.equal(owner.address);
    expect(await generationManager.count()).to.be.equal(5);

    console.log(
      "manual deploy with custom max supply", 
      (await stackOsNFTBasicgen3.getMaxSupply()).toNumber()
    );
    expect(await stackOsNFTBasicgen3.getMaxSupply()).to.be.equal(1);
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
