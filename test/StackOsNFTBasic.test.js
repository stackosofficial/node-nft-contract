const { ethers } = require("hardhat");
const { expect } = require("chai");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
const { deployStackOS, setup, deployStackOSBasic, print, setupDeployment } = require("./utils");

describe("StackOS NFT Basic", function () {
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
    stackOsNFTBasic = await deployStackOSBasic();
  });

  it("Add liquidity", async function () {
    await stackToken.approve(router.address, parseEther("100000000.0"));
    await usdt.approve(router.address, parseEther("100000000.0"));
    await usdc.approve(router.address, parseEther("100000000.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.addLiquidityETH(
      stackToken.address,
      parseEther("100000.0"),
      parseEther("100000.0"),
      parseEther("3.77"),
      joe.address,
      deadline,
      { value: parseEther("3.77") }
    );

    await router.addLiquidityETH(
      usdt.address,
      parseUnits("43637", await usdt.decimals()),
      parseUnits("43637", await usdt.decimals()),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      usdc.address,
      parseUnits("43637", await usdc.decimals()),
      parseUnits("43637", await usdc.decimals()),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });

  it("Mint", async function () {

    await stackToken.approve(stackOsNFTBasic.address, parseEther("100.0"));
    // pass some time, so that enough tokens dripped
    await provider.send("evm_increaseTime", [60 * 60]); 
    await provider.send("evm_mine"); 
    await stackOsNFTBasic.mint(4);
  });

  it("Mint for usdt", async function () {
    await usdt.approve(stackOsNFTBasic.address, parseEther("100.0"));
    await stackOsNFTBasic.mint(1);
  });

  it("Setup auto deploy", async function () {
    // ROYALTY = royalty.address;
    // await generationManager.setupDeploy(
    //   NAME,
    //   SYMBOL,
    //   STACK_TOKEN,
    //   DARK_MATTER_ADDRESS,
    //   SUBSCRIPTION,
    //   sub0.address,
    //   PRICE,
    //   SUBS_FEE,
    //   MAX_SUPPLY_GROWTH,
    //   TRANSFER_DISCOUNT,
    //   TIMELOCK,
    //   ROYALTY
    // );
    // await generationManager.setupDeploy2(
    //   owner.address, // fake market address
    //   DAO_FEE,
    //   baseURI,
    //   REWARD_DISCOUNT
    // )
  });

  it("Trigger auto deploy of the next generation", async function () {
    await stackToken.approve(stackOsNFTBasic.address, parseEther("100.0"));
    let oldGenerationsCount = (await generationManager.count()).toNumber();

    for (let i = 0; i < MAX_SUPPLY; i++) {
      try {
        await provider.send("evm_increaseTime", [60 * 60]); 
        await stackOsNFTBasic.mint(10);
      } catch (error) {
        break;
      }
    }
    // await provider.send("evm_increaseTime", [60 * 60]); 
    // await stackOsNFTBasic.mint(10);

    expect(await generationManager.count()).to.be.equal(
      oldGenerationsCount + 1
    );

    await expect(
      generationManager.connect(joe).add(joe.address)
    ).to.be.reverted;

    stackAutoDeployed = await ethers.getContractAt(
      "StackOsNFTBasic",
      await generationManager.get(oldGenerationsCount)
    );
    
    expect(await stackAutoDeployed.owner()).to.be.equal(owner.address);
    expect(await stackAutoDeployed.getMaxSupply()).to.be.equal(
      MAX_SUPPLY * (10000 + MAX_SUPPLY_GROWTH) / 10000
    );
    await expect(generationManager.autoDeployNextGeneration()).to.be.reverted;
  });

  it("Trigger auto deploy of the next generation 2", async function () {
    await stackToken.approve(stackAutoDeployed.address, parseEther("100.0"));
    let oldGenerationsCount = (await generationManager.count()).toNumber();
    
    let iterCount = 
      await stackAutoDeployed.getMaxSupply() - 
      await stackAutoDeployed.totalSupply() - 2;
    for (let i = 0; i < iterCount; i++) {
      try {
        await provider.send("evm_increaseTime", [60 * 60]); 
        await stackAutoDeployed.mint(1);
      } catch (error) {
        break;
      }
    }
    await provider.send("evm_increaseTime", [60 * 60]); 
    // test frontrun protection
    await stackAutoDeployed.mint(10);
    await expect(stackAutoDeployed.mint(1)).to.be.reverted;

    expect(await stackAutoDeployed.tokenURI(0)).to.be.equal(
      baseURI + "2/0"
    );
    expect(await generationManager.count()).to.be.equal(
      oldGenerationsCount + 1
    );

    stackAutoDeployed2 = await ethers.getContractAt(
      "StackOsNFTBasic",
      await generationManager.get(oldGenerationsCount)
    );
    
    expect(await stackAutoDeployed2.name()).to.be.equal("StackOS NFT 3");
    expect(await stackAutoDeployed2.owner()).to.be.equal(owner.address);
    expect(await stackAutoDeployed2.getMaxSupply()).to.be.equal(
      Math.floor(
        (await stackAutoDeployed.getMaxSupply()) * 
          (10000 + MAX_SUPPLY_GROWTH) / 10000
      )
    );
  });

  it("Deploy stackOsNFTBasic generation from manager", async function () {
    PRIZES = 2;
    stackOsNFTBasicgen3 = await deployStackOSBasic();
    expect(await stackOsNFTBasicgen3.owner()).to.be.equal(owner.address);
  });

  it("Try to buy directly using transferFromLastGen", async function () {
    await expect(
      stackOsNFTBasicgen3.transferFromLastGen(owner.address, parseEther("10.0"))
    ).to.be.reverted;
  });

  it("Dripping tokens", async function () {
    await stackToken.approve(stackOsNFTBasicgen3.address, parseEther("100.0"));

    await expect(stackOsNFTBasicgen3.mint(11)).to.be.reverted;
    await stackOsNFTBasicgen3.mint(10);
    await provider.send("evm_increaseTime", [60 * 1]); 
    await expect(stackOsNFTBasicgen3.mint(2)).to.be.reverted;
    await stackOsNFTBasicgen3.mint(1);
    await expect(stackOsNFTBasicgen3.mint(9)).to.be.reverted;
    await provider.send("evm_increaseTime", [60 * 9]); 
    await stackOsNFTBasicgen3.mint(8);
  });

  it("Mint for USD", async function () {
    await usdc.approve(stackOsNFTBasicgen3.address, parseEther("1"));
    let oldOwnerBalance = await stackToken.balanceOf(owner.address);
    await stackOsNFTBasicgen3.mintForUsd(1, usdc.address);
    let newOwnerBalance = await stackToken.balanceOf(owner.address);
    expect(await stackToken.balanceOf(stackOsNFTBasicgen3.address)).to.be.equal(0);
    expect(newOwnerBalance.sub(oldOwnerBalance)).to.be.closeTo(
      parseEther("0.48"), 
      parseEther("0.01")
    );
  });

  it("Whitelist address and transfer from it", async function () {
    await stackOsNFTBasic.whitelist(owner.address);
    await stackOsNFTBasic.transferFrom(owner.address, joe.address, 0);
  });

  it("Unable to transfer when not whitelisted", async function () {
    await expect(
      stackOsNFTBasic.connect(joe).transferFrom(joe.address, owner.address, 0)
    ).to.be.revertedWith("Not whitelisted for transfers");
  });

  it("tokenURI function should work as expected", async () => {
    expect(await stackOsNFTBasic.tokenURI(0)).to.be.equal(
      baseURI + "1/0"
    );
    expect(await stackAutoDeployed.tokenURI(1)).to.be.equal(
      baseURI + "2/1"
    );
    expect(await stackOsNFTBasicgen3.tokenURI(2)).to.be.equal(
      baseURI + "4/2"
    );
    await expect(stackOsNFTBasicgen3.tokenURI(1337)).to.be.reverted;
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
