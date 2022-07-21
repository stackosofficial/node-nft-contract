const { ethers, upgrades } = require("hardhat");
const { use, expect } = require("chai");
const { parseEther, parseUnits, formatEther } = require("@ethersproject/units");
const { deployStackOS, setup, print, deployStackOSBasic, setupDeployment, setupLiquidity } = require("./utils");

describe("test GetTokensOwnedBy contract", function () {

  // state to which should revert after test
  let initialState, snapshotId;
  let getter;

  before(async () => {
    // General
    initialState = await ethers.provider.send("evm_snapshot");
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer, dao, royaltyDistribution, nonVaultOwner, nonTokenOwner] =
      await hre.ethers.getSigners();

    await setup();
    await setupDeployment();
    // await setupLiquidity();
    // Add liquidity
    await stackToken.approve(router.address, parseEther("100000000.0"));
    await usdt.approve(router.address, parseEther("100000000.0"));
    await usdc.approve(router.address, parseEther("100000000.0"));
    var deadline = Date.now();
    await network.provider.send("hardhat_setBalance", [
      owner.address.toString(),
      "0xffffffffffffffffffffffffffffffffffffffffff",
    ]);
    await router.addLiquidityETH(
      stackToken.address,
      parseEther("100000.0"),
      0,
      0,
      joe.address,
      deadline,
      { value: parseEther("100000") }
    );

    await router.addLiquidityETH(
      usdt.address,
      parseUnits("100000.0", await usdt.decimals()),
      0,
      0,
      joe.address,
      deadline,
      { value: parseEther("100000") }
    );

    await router.addLiquidityETH(
      usdc.address,
      parseUnits("100000", await usdc.decimals()),
      0,
      0,
      joe.address,
      deadline,
      { value: parseEther("100000") }
    );

    CYCLE_DURATION = (await royalty.cycleDuration()).toNumber();

    // set subscriptions allowance and add bonus tokens
    await usdt.approve(subscription.address, parseEther("5000.0"));
    await usdt.approve(sub0.address, parseEther("5000.0"));
    await stackToken.transfer(subscription.address, parseEther("10000"));
    await stackToken.transfer(sub0.address, parseEther("10000"));

    stackOsNFTgen2 = await deployStackOSBasic();
    // mint gen0 0,1,2,3,4,5
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 100);
    await usdt.approve(stackOsNFT.address, parseEther("1000.0"));
    await stackOsNFT.partnerMint(6);
    await stackOsNFT.whitelist(owner.address);
    await stackOsNFT.transferFrom(owner.address, joe.address, 5);
    // mint gen2 0,1
    await stackToken.approve(stackOsNFTgen2.address, parseEther("100.0"));
    await provider.send("evm_increaseTime", [60 * 60]);
    await stackOsNFTgen2.mint(2);
    // mint DarkMatter 0,1
    await stackOsNFT.partnerMint(10);
    await stackOsNFT.whitelist(owner.address);
    await darkMatter.activate();
    await stackOsNFT.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(0, [6,7,8,9,10,11,12,13,14,15]);
    await darkMatter.mint();

    //deploy  GetTokensOwnedBy
    const GetTokensOwnedBy = await ethers.getContractFactory("GetTokensOwnedBy");
    getter = await GetTokensOwnedBy.deploy();
    await getter.deployed();
  });

  beforeEach(async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  afterEach(async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

  after(async function () {
    await ethers.provider.send("evm_revert", [initialState]);
  });

  describe("getTokensOfOwner", async function () {
    it("should return empty when owner have 0 tokens", async function () {
      let tokensGen1 = await getter.getTokensOfOwner(bob.address, stackOsNFT.address);
      let tokensGen2 = await getter.getTokensOfOwner(bob.address, stackOsNFTgen2.address);
      let tokensDM = await getter.getTokensOfOwner(bob.address, darkMatter.address);
      expect(tokensGen1.toString()).to.be.eq("");
      expect(tokensGen2.toString()).to.be.eq("");
      expect(tokensDM.toString()).to.be.eq("");
    });
    it("should return tokens of owner in any ERC721Enumerable contract", async function () {
      let tokensGen1 = await getter.getTokensOfOwner(owner.address, stackOsNFT.address);
      let tokensGen2 = await getter.getTokensOfOwner(owner.address, stackOsNFTgen2.address);
      let tokensDM = await getter.getTokensOfOwner(owner.address, darkMatter.address);
      expect(tokensGen1.toString()).to.be.eq("0,1,2,3,4");
      expect(tokensGen2.toString()).to.be.eq("0,1");
      expect(tokensDM.toString()).to.be.eq("1,0");
    });
  });

  
  describe("getTokensOfOwnerIn", async function () {
    it("should return empty when user have 0 tokens", async function () {
      let tokensGen1 = await getter.getTokensOfOwnerIn(bob.address, stackOsNFT.address, 0, 1);
      let tokensGen2 = await getter.getTokensOfOwnerIn(bob.address, stackOsNFTgen2.address, 0, 1);
      let tokensDM = await getter.getTokensOfOwnerIn(bob.address, darkMatter.address, 0, 1);
      expect(tokensGen1.toString()).to.be.eq("");
      expect(tokensGen2.toString()).to.be.eq("");
      expect(tokensDM.toString()).to.be.eq("");
    });
    it("should return tokens of owner in any ERC721Enumerable contract", async function () {
      let tokensGen1 = await getter.getTokensOfOwnerIn(owner.address, stackOsNFT.address, 1, 3);
      let tokensGen2 = await getter.getTokensOfOwnerIn(owner.address, stackOsNFTgen2.address, 0, 4);
      let tokensDM = await getter.getTokensOfOwnerIn(owner.address, darkMatter.address, 1, 2);
      expect(tokensGen1.toString()).to.be.eq("1,2");
      expect(tokensGen2.toString()).to.be.eq("0,1");
      expect(tokensDM.toString()).to.be.eq("0"); // order is [1,0] for this, so range 1,2 is second element which is 0
    });
    
    it("should return tokens of owner in any range", async function () {
      let tokensGen1 = await getter.getTokensOfOwnerIn(owner.address, stackOsNFT.address, 0, 2);
      expect(tokensGen1.toString()).to.be.eq("0,1");

      tokensGen1 = await getter.getTokensOfOwnerIn(owner.address, stackOsNFT.address, 1, 3);
      expect(tokensGen1.toString()).to.be.eq("1,2");

      tokensGen1 = await getter.getTokensOfOwnerIn(owner.address, stackOsNFT.address, 2, 6);
      expect(tokensGen1.toString()).to.be.eq("2,3,4");
    });
  });
  
  describe("getTokensOfOwnerInAllGenerations", async function () {
    it("should return tokens of owner in all generations", async function () {
      let tokensGen1 = await getter.getTokensOfOwnerInAllGenerations(owner.address, generationManager.address);
      expect(tokensGen1[0].toString()).to.be.eq("0,1,2,3,4");
      expect(tokensGen1[1].toString()).to.be.eq("0,1");
    });
  });

});
