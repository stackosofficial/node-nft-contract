const { ethers } = require("hardhat");
const { expect } = require("chai");
const { parseEther, formatEther } = require("@ethersproject/units");
const { deployStackOS, setup, deployStackOSBasic, print } = require("./utils");

describe("StackOS NFT Basic", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, joe, tax, bank] = await hre.ethers.getSigners();

    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
  });

  it("Deploy full SETUP", async function () {
    [
      stackToken,
      usdt,
      usdc,
      dai,
      link,
      weth,
      coordinator,
      generationManager,
      darkMatter,
      subscription,
      stackOsNFT,
      royalty,
      stableAcceptor,
      exchange,
    ] = await setup();

    stackOsNFT = await deployStackOSBasic();
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
      parseEther("43637.0"),
      parseEther("43637.0"),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      usdc.address,
      parseEther("43637.0"),
      parseEther("43637.0"),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });

  it("Mint for usdc", async function () {
    await stackOsNFT.startSales();

    await usdc.approve(stackOsNFT.address, parseEther("100.0"));
    // pass some time, so that enough tokens dripped
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackOsNFT.mint(4, usdc.address);
  });

  it("Mint for usdt", async function () {
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.mint(1, usdt.address);
  });

  it("Unable to mint for unsupported coin", async function () {
    await expect(stackOsNFT.mint(1, stackToken.address)).to.be.revertedWith(
      "Unsupported payment coin"
    );
  });

  it("Owners can delegate their NFTs", async function () {
    expect(await stackOsNFT.getDelegatee(0)).to.equal(
      ethers.constants.AddressZero
    );
    await stackOsNFT.delegate(joe.address, [0]);
    expect(await stackOsNFT.getDelegatee(0)).to.equal(joe.address);
  });

  it("Setup auto deploy", async function () {
    ROYALTY = royalty.address;
    MAX_SUPPLY_GROWTH = 10000;
    await generationManager.setupDeploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      DARK_MATTER_ADDRESS,
      SUBSCRIPTION,
      PRICE,
      MINT_FEE,
      MAX_SUPPLY_GROWTH,
      TRANSFER_DISCOUNT,
      TIMELOCK,
      ROYALTY
    );
    await generationManager.setupDeploy2(
      owner.address, // fake market address
    )
  });

  it("Trigger auto deploy of the next generation", async function () {
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    let oldGenerationsCount = (await generationManager.count()).toNumber();

    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackOsNFT.mint(10, usdt.address);
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackOsNFT.mint(10, usdt.address);

    expect(await generationManager.count()).to.be.equal(
      oldGenerationsCount + 1
    );

    await expect(
      generationManager.connect(joe).add(joe.address)
    ).to.be.revertedWith(
      "Caller is not the owner or stack contract"
    );

    stackAutoDeployed = await ethers.getContractAt(
      "StackOsNFTBasic",
      await generationManager.get(oldGenerationsCount)
    );
    
    expect(await stackAutoDeployed.owner()).to.be.equal(owner.address);
    expect(await stackAutoDeployed.getMaxSupply()).to.be.equal(
      MAX_SUPPLY * 2
    );
    await expect(generationManager.deployNextGenPreset()).to.be.revertedWith(
      "Not Correct Address"
    );
  });

  it("Trigger auto deploy of the next generation 2", async function () {
    await usdt.approve(stackAutoDeployed.address, parseEther("100.0"));
    let oldGenerationsCount = (await generationManager.count()).toNumber();
    
    await stackAutoDeployed.startSales();
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackAutoDeployed.mint(10, usdt.address);
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackAutoDeployed.mint(10, usdt.address);
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackAutoDeployed.mint(10, usdt.address);
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackAutoDeployed.mint(10, usdt.address);
    await provider.send("evm_increaseTime", [60 * 60]); 
    await stackAutoDeployed.mint(10, usdt.address);

    // await stackAutoDeployed.mint(50, usdt.address);
    expect(await generationManager.count()).to.be.equal(
      oldGenerationsCount + 1
    );

    stackAutoDeployed2 = await ethers.getContractAt(
      "StackOsNFTBasic",
      await generationManager.get(oldGenerationsCount)
    );
    
    expect(await stackAutoDeployed2.name()).to.be.equal("STACK OS NFT 4");
    expect(await stackAutoDeployed2.owner()).to.be.equal(owner.address);
    expect(await stackAutoDeployed2.getMaxSupply()).to.be.equal(
      100
    );
  });

  it("Deploy stackOsNFT generation from manager", async function () {
    PRIZES = 2;
    stackOsNFTgen3 = await deployStackOSBasic();
    expect(await stackOsNFTgen3.owner()).to.be.equal(owner.address);
  });

  it("Try to buy directly using transferFromLastGen", async function () {
    await expect(
      stackOsNFTgen3.transferFromLastGen(owner.address, parseEther("10.0"))
    ).to.be.revertedWith("Not Correct Address");
  });

  it("Dripping tokens", async function () {
    await usdt.approve(stackOsNFTgen3.address, parseEther("100.0"));
    await stackOsNFTgen3.startSales();
    await expect(stackOsNFTgen3.mint(11, usdt.address)).to.be.revertedWith(
      "Minting too fast"
    )
    await stackOsNFTgen3.mint(10, usdt.address)
    await provider.send("evm_increaseTime", [60 * 1]); 
    await expect(stackOsNFTgen3.mint(2, usdt.address)).to.be.revertedWith(
      "Minting too fast"
    )
    await stackOsNFTgen3.mint(1, usdt.address);
    await expect(stackOsNFTgen3.mint(9, usdt.address)).to.be.revertedWith(
      "Minting too fast"
    )
    await provider.send("evm_increaseTime", [60 * 9]); 
    await stackOsNFTgen3.mint(9, usdt.address);
  });

  it("Unable to transfer when not whitelisted", async function () {
    await expect(
      stackOsNFT.transferFrom(owner.address, joe.address, 0)
    ).to.be.revertedWith("Not whitelisted for transfers");
  });

  it("Whitelist address and transfer from it", async function () {
    await stackOsNFT.whitelist(owner.address);
    await stackOsNFT.transferFrom(owner.address, joe.address, 0);
  });

  it("Admin tried to withdraw before time lock expires.", async function () {
    var adminWithdrawableAmount = await stackOsNFT.adminWithdrawableAmount();
    print(adminWithdrawableAmount);
    await expect(stackOsNFT.adminWithdraw()).to.be.revertedWith("Locked!");
  });

  it("Admin withdraws after time lock.", async function () {
    deadline = Math.floor(Date.now() / 1000) + 1000;
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      deadline + TIMELOCK,
    ]);
    await stackOsNFT.adminWithdraw();
  });

  it("Verify function getFromRewardsPrice()", async function () {
    var price = await stackOsNFT.getFromRewardsPrice(2, usdt.address);
    console.log(price.toString());
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
