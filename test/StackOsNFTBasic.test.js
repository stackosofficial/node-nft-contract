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
    [owner, joe, tax] = await hre.ethers.getSigners();

    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
    
  });
 
  it("Deploy full SETUP", async function () {
    [stackToken,
      usdt,
      usdc,
      dai,
      link,
      coordinator,
      generationManager,
      darkMatter,
      subscription,
      stackOsNFT] = await setup();

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
    await stackOsNFT.mint(4, usdc.address);
  });

  it("Mint for usdt", async function () {
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.mint(1, usdt.address);
  });

  it("Unable to mint for unsupported coin", async function () {
    await expect(
      stackOsNFT.mint(1, stackToken.address)
    ).to.be.revertedWith(
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

  it("Deploy stackOsNFT generation 2 from manager", async function () {
    await generationManager.deployNextGen(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
      // ROUTER,
      SUBSCRIPTION,
      PRICE,
      MINT_FEE,
      MAX_SUPPLY,
      TRANSFER_DISCOUNT,
      TIMELOCK
    );
    stackOsNFTgen2 = await ethers.getContractAt(
      "StackOsNFTBasic",
      await generationManager.get(1)
    );
    expect(await stackOsNFTgen2.owner()).to.be.equal(owner.address);
  });

  it("Deploy stackOsNFT generation 3 from manager", async function () {
    PRIZES = 2;
    await generationManager.deployNextGen(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
      // ROUTER,
      SUBSCRIPTION,
      PRICE,
      MINT_FEE,
      MAX_SUPPLY,
      TRANSFER_DISCOUNT,
      TIMELOCK
    );
    stackOsNFTgen3 = await ethers.getContractAt(
      "StackOsNFTBasic",
      await generationManager.get(2)
    );
    expect(await stackOsNFTgen3.owner()).to.be.equal(owner.address);
  });

  it("Try to buy directly using transferFromLastGen", async function () {
    await expect(
      stackOsNFTgen3.transferFromLastGen(owner.address, parseEther("10.0"))
    ).to.be.revertedWith("Not Correct Address");
  });

  it("Unable to transfer when not whitelisted", async function () {
    await expect(
      stackOsNFT.transferFrom(owner.address, joe.address, 0)
    ).to.be.revertedWith(
      "Not whitelisted for transfers"
    )
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
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
