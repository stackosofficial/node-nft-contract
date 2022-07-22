const { ethers, upgrades } = require("hardhat");
const { use, expect } = require("chai");
const { parseEther, parseUnits, formatEther } = require("@ethersproject/units");
const { deployStackOS, setup, print, deployStackOSBasic, setupDeployment, setupLiquidity } = require("./utils");

describe("Vault", function () {

  // state to which should revert after test
  let initialState;

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
    // mint gen0
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 10);
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.partnerMint(6);
    await stackOsNFT.whitelist(owner.address);
    await stackOsNFT.transferFrom(owner.address, joe.address, 5);
    // mint gen2
    await stackToken.approve(stackOsNFTgen2.address, parseEther("100.0"));
    await provider.send("evm_increaseTime", [60 * 60]);
    await stackOsNFTgen2.mint(2);

    //deploy Vault
    const Vault = await ethers.getContractFactory("Vault");
    vault = await Vault.deploy(
      stackToken.address,
      generationManager.address,
      sub0.address,
      subscription.address,
      60 * 60 * 24 * 30 * 18 // = 30 days * 18
    );
    LOCK_DURATION = (await vault.LOCK_DURATION()).toNumber();
    await vault.deployed();
    await stackOsNFT.whitelist(vault.address);
    await stackOsNFTgen2.whitelist(vault.address);
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

  /*
    deposit:
      should transfer NFT to vault (if approved)
      should only be for active subscribers
      should claimed bonus and withdrawn fees be transferred to contract owner
      should DepositInfo be stored with correct values
      should work correctly with both sub0 and subscription
    ownerClaim:
      should only be callable by contract owner
      should claimed bonus and withdrawn fee be transferred to contract owner
      should work correctly with both sub0 and subscription
    withdraw:
      should revert if lock period (18 months) is not passed
      should only depositor be able to get his deposited NFTs back
      should claim bonus and send to contract owner
      should not revert can't claim bonus
      should transfer NFT back to the depositor      
      should work correctly with both sub0 and subscription
  */

  describe("deposit", async function () {
    it("should only be for active subscribers", async function () {
      let generationId = 0;
      let tokenId = 1;
      await stackOsNFT.approve(vault.address, tokenId);
      await expect(vault.deposit(generationId, tokenId)).to.be.reverted;
    });

    it("should revert when deposits are closed", async function () {
      let generationId = 0;
      let tokenId = 1;
      await vault.closeDeposits();
      await expect(vault.deposit(generationId, tokenId)).to.be.revertedWith("Deposits are closed now");
    });

    it("should revert if redepositing the same token", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFT.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);
      await provider.send("evm_increaseTime", [LOCK_DURATION + 1]);
      await vault.withdraw(generationId, tokenId);

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFT.approve(vault.address, tokenId);

      await expect(vault.deposit(generationId, tokenId)).to.be.revertedWith("Cannot redeposit same token");
    });

    it("should transfer NFT to vault (if approved)", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFT.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);

      let tokenOwner = await stackOsNFT.ownerOf(tokenId);
      expect(tokenOwner).to.be.eq(vault.address);
    });

    it("should claimed bonus and withdrawn fee be transferred to contract owner", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFT.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);
      // resub needed, otherwise cant ownerClaim
      await provider.send("evm_increaseTime", [MONTH]);
      await provider.send("evm_mine");
      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);

      let simulatedFeeAmount = await simulateSubscriptionWithdraw(generationId, tokenId);
      let simulatedBonusAmount = await simulateSubscriptionClaimBonus(generationId, tokenId);
      let simulatedTotalAmount = simulatedFeeAmount.add(simulatedBonusAmount);
      // console.log(simulatedFeeAmount, simulatedBonusAmount);

      let balanceBefore = await stackToken.balanceOf(owner.address);
      await vault.ownerClaim(generationId, tokenId)
      let balanceAfter = await stackToken.balanceOf(owner.address);
      let balanceDelta = balanceAfter.sub(balanceBefore);
      expect(balanceDelta).to.be.equal(simulatedTotalAmount);
    });

    it("should DepositInfo be stored with correct values", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      let simulatedFeeAmount = await simulateSubscriptionWithdraw(generationId, tokenId, owner);
      let tax = (await sub0.deposits(generationId, tokenId)).tax;
      await stackOsNFT.approve(vault.address, tokenId);
      // bonus claim simulation should be done right before deposit tx!
      let simulatedBonusAmount = await simulateSubscriptionClaimBonus(generationId, tokenId, owner);
      let depositTx = await vault.deposit(generationId, tokenId);
      let depositTimestamp = (await provider.getBlock(depositTx.blockNumber)).timestamp;

      let claimInfo = await vault.depositInfo(generationId, tokenId);
      expect(claimInfo.depositor).to.be.eq(owner.address);
      expect(claimInfo.totalFee).to.be.eq(simulatedFeeAmount);
      expect(claimInfo.totalBonus).to.be.eq(simulatedBonusAmount);
      expect(claimInfo.tax).to.be.eq(tax);
      expect(claimInfo.date).to.be.eq(depositTimestamp);
    });

    it("should work correctly with both sub0 and subscription", async function () {
      let generationId = 1;
      let tokenId = 1;

      await subscription.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      let simulatedFeeAmount = await simulateSubscriptionWithdraw(generationId, tokenId, owner);
      let tax = (await subscription.deposits(generationId, tokenId)).tax;
      await stackOsNFTgen2.approve(vault.address, tokenId);
      // bonus claim simulation should be done right before deposit tx!
      let simulatedBonusAmount = await simulateSubscriptionClaimBonus(generationId, tokenId, owner);
      let depositTx = await vault.deposit(generationId, tokenId);
      let depositTimestamp = (await provider.getBlock(depositTx.blockNumber)).timestamp;


      let claimInfo = await vault.depositInfo(generationId, tokenId);
      expect(claimInfo.depositor).to.be.eq(owner.address);
      expect(claimInfo.totalFee).to.be.eq(simulatedFeeAmount);
      expect(claimInfo.totalBonus).to.be.eq(simulatedBonusAmount);
      expect(claimInfo.tax).to.be.eq(tax);
      expect(claimInfo.date).to.be.eq(depositTimestamp);
    });
  });

  describe("ownerClaim", async function () {
    it("should only be callable by contract owner", async function () {
      let generationId = 0;
      let tokenId = 1;
      await expect(vault.connect(nonVaultOwner).ownerClaim(generationId, tokenId)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should claimed bonus and withdrawn fee be transferred to contract owner", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFT.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);
      // resub needed, otherwise cant ownerClaim
      await provider.send("evm_increaseTime", [MONTH]);
      await provider.send("evm_mine");
      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);

      let simulatedFeeAmount = await simulateSubscriptionWithdraw(generationId, tokenId);
      let simulatedBonusAmount = await simulateSubscriptionClaimBonus(generationId, tokenId);
      let simulatedTotalAmount = simulatedFeeAmount.add(simulatedBonusAmount);
      // console.log(simulatedFeeAmount, simulatedBonusAmount);

      let balanceBefore = await stackToken.balanceOf(owner.address);
      await vault.ownerClaim(generationId, tokenId)
      let balanceAfter = await stackToken.balanceOf(owner.address);
      let balanceDelta = balanceAfter.sub(balanceBefore);
      expect(balanceDelta).to.be.equal(simulatedTotalAmount);
    });

    it("should work correctly with both sub0 and subscription", async function () {
      let generationId = 1;
      let tokenId = 1;

      await subscription.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFTgen2.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);
      // resub needed, otherwise cant ownerClaim
      await provider.send("evm_increaseTime", [MONTH]);
      await provider.send("evm_mine");
      await subscription.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);

      let simulatedFeeAmount = await simulateSubscriptionWithdraw(generationId, tokenId);
      let simulatedBonusAmount = await simulateSubscriptionClaimBonus(generationId, tokenId);
      let simulatedTotalAmount = simulatedFeeAmount.add(simulatedBonusAmount);
      // console.log(simulatedFeeAmount, simulatedBonusAmount);

      let balanceBefore = await stackToken.balanceOf(owner.address);
      await vault.ownerClaim(generationId, tokenId)
      let balanceAfter = await stackToken.balanceOf(owner.address);
      let balanceDelta = balanceAfter.sub(balanceBefore);
      expect(balanceDelta).to.be.equal(simulatedTotalAmount);
    });
  });

  describe("withdraw", async function () {
    it("should revert if lock period (18 months) is not passed", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFT.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);

      await expect(vault.withdraw(generationId, tokenId)).to.be.revertedWith(
        "lock"
      );
    });

    it("should only depositor be able to get his deposited NFTs back", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFT.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);

      await provider.send("evm_increaseTime", [LOCK_DURATION + 1]);
      await expect(vault.connect(nonTokenOwner).withdraw(generationId, tokenId)).to.be.revertedWith(
        "Not owner"
      );
    });

    it("should claim bonus and send to contract owner", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFT.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);
      await provider.send("evm_increaseTime", [LOCK_DURATION + 1]);

      let simulatedBonusAmount = await simulateSubscriptionClaimBonus(generationId, tokenId);

      let balanceBefore = await stackToken.balanceOf(owner.address);
      await vault.withdraw(generationId, tokenId);
      let balanceAfter = await stackToken.balanceOf(owner.address);
      let balanceDelta = balanceAfter.sub(balanceBefore);
      expect(balanceDelta).to.be.equal(simulatedBonusAmount);
    });

    it("should not revert can't claim bonus", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFT.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);
      await provider.send("evm_increaseTime", [LOCK_DURATION + 1]);

      // -= remove bonus STACK tokens from sub0 contract =-
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [sub0.address.toString()],
      });
      const signer = await ethers.getSigner(sub0.address);
      await network.provider.send("hardhat_setBalance", [
        signer.address.toString(),
        "0xffffffffffffffffffffffffffffffffffffffffff",
      ]);
      await stackToken.connect(signer).transfer(
        bank.address,
        await stackToken.balanceOf(sub0.address)
      );
      // -= end remove bonus STACK tokens from sub0 contract =-

      let balanceBefore = await stackToken.balanceOf(owner.address);
      await vault.withdraw(generationId, tokenId);
      let balanceAfter = await stackToken.balanceOf(owner.address);
      let balanceDelta = balanceAfter.sub(balanceBefore);
      // all bonus was removed, should claim 0
      expect(balanceDelta).to.be.equal(0);
    });

    it("should transfer NFT back to the depositor", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFT.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);

      await provider.send("evm_increaseTime", [LOCK_DURATION + 1]);
      await vault.withdraw(generationId, tokenId);

      let tokenOwner = await stackOsNFT.ownerOf(tokenId);
      expect(tokenOwner).to.be.eq(owner.address);
    });

    it("should work correctly with both sub0 and subscription", async function () {
      let generationId = 1;
      let tokenId = 1;

      await subscription.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await stackOsNFTgen2.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);

      await provider.send("evm_increaseTime", [LOCK_DURATION + 1]);
      await vault.withdraw(generationId, tokenId);

      let tokenOwner = await stackOsNFTgen2.ownerOf(tokenId);
      expect(tokenOwner).to.be.eq(owner.address);
    });
  });

  describe("test total allocations", async function () {
    it.only("should allocation increase on deposit", async function () {
      let generationId = 0;
      let tokenId = 1;

      await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);

      await provider.send("evm_increaseTime", [MONTH]);
      await provider.send("evm_mine");

      // simulate allocation calculation
      let simulatedFeeAmount = await simulateSubscriptionWithdraw(generationId, tokenId, owner);
      let pendingBonus = await sub0.pendingBonus(generationId, tokenId);
      let totalAlloc = simulatedFeeAmount.add(pendingBonus.locked.add(pendingBonus.unlocked));

      await stackOsNFT.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);

      // --- repeat with NFT gen 2
      generationId = 1;
      tokenId = 1;

      await subscription.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
      await provider.send("evm_increaseTime", [MONTH]);
      await provider.send("evm_mine");

      // simulate allocation calculation
      simulatedFeeAmount = await simulateSubscriptionWithdraw(generationId, tokenId, owner);
      pendingBonus = await subscription.pendingBonus(generationId, tokenId);
      totalAlloc = totalAlloc.add(simulatedFeeAmount.add(pendingBonus.locked.add(pendingBonus.unlocked)));

      await stackOsNFTgen2.approve(vault.address, tokenId);
      await vault.deposit(generationId, tokenId);

      let allocation = await vault.allocations(owner.address);
      expect(allocation).to.be.equal(totalAlloc);

    });

  });

  // describe("getUserDepositedTokens function", async function () {
  //   it("should return correct tokenIds, totalFee, totalBonus", async function () {
  //     let generationId = 1;
  //     let tokenId = 1;
  //     await subscription.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
  //     await stackOsNFTgen2.approve(vault.address, tokenId);
  //     await vault.deposit(generationId, tokenId);

  //     generationId = 0;
  //     tokenId = 1;
  //     await sub0.subscribe(generationId, [tokenId], parseEther("100"), usdt.address, false);
  //     await stackOsNFT.approve(vault.address, tokenId);
  //     await vault.deposit(generationId, tokenId);

  //     await provider.send("evm_increaseTime", [LOCK_DURATION + 1]); 
  //     let depositedTokens = await vault.getUserDepositedTokens(owner.address);

  //     console.log(depositedTokens);

  //     expect(depositedTokens.tokenIds[0].toString()).to.be.eq("1");
  //     expect(depositedTokens.tokenIds[1].toString()).to.be.eq("1");

  //     let historyEntry0 = await vault.depositInfo(0, 1);
  //     let historyEntry1 = await vault.depositInfo(1, 1);
  //     expect(depositedTokens.totalFee).to.be.eq(historyEntry0.totalFee.add(historyEntry1.totalFee));

  //     historyEntry0 = await vault.depositInfo(0, 1);
  //     historyEntry1 = await vault.depositInfo(1, 1);
  //     expect(depositedTokens.totalBonus).to.be.eq(historyEntry0.totalBonus.add(historyEntry1.totalBonus));

  //     // let tokenOwner = await stackOsNFTgen2.ownerOf(tokenId);
  //     // expect(tokenOwner).to.be.eq(owner.address);
  //   });

  // });

  async function simulateSubscriptionWithdraw(generationId, tokenId, caller) {
    let _snapshot = await ethers.provider.send("evm_snapshot");

    if (!caller) caller = vault;
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [caller.address.toString()],
    });
    const signer = await ethers.getSigner(caller.address);
    await network.provider.send("hardhat_setBalance", [
      signer.address.toString(),
      "0xffffffffffffffffffffffffffffffffffffffffff",
    ]);

    let balanceBefore = await stackToken.balanceOf(caller.address);
    if (generationId == 0)
      await sub0.connect(signer).withdraw(generationId, [tokenId]);
    else
      await subscription.connect(signer).withdraw(generationId, [tokenId]);
    let balanceAfter = await stackToken.balanceOf(caller.address);

    await ethers.provider.send("evm_revert", [_snapshot]);
    return balanceAfter.sub(balanceBefore);
  }

  async function simulateSubscriptionClaimBonus(generationId, tokenId, caller) {
    let _snapshot = await ethers.provider.send("evm_snapshot");

    if (!caller) caller = vault;
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [caller.address.toString()],
    });
    const signer = await ethers.getSigner(caller.address);
    await network.provider.send("hardhat_setBalance", [
      signer.address.toString(),
      "0xffffffffffffffffffffffffffffffffffffffffff",
    ]);

    let balanceBefore = await stackToken.balanceOf(caller.address);
    if (generationId == 0)
      await sub0.connect(signer).claimBonus(generationId, [tokenId]);
    else
      await subscription.connect(signer).claimBonus(generationId, [tokenId]);
    let balanceAfter = await stackToken.balanceOf(caller.address);

    await ethers.provider.send("evm_revert", [_snapshot]);
    return balanceAfter.sub(balanceBefore);
  }

});
