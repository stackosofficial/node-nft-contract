const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { parseEther, parseUnits } = require("@ethersproject/units");
const { deployStackOS, setup, print, deployStackOSBasic, setupDeployment } = require("./utils");
const { BigNumber } = require("ethers");

describe("Royalty", function () {

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, dude, tax, DaoWallet, pepe] =
      await hre.ethers.getSigners();
  });

  it("Deploy full SETUP", async function () {
    await setup();
    await setupDeployment();
    CYCLE_DURATION = Number(await royalty.cycleDuration());

    // console.log(await royalty.cycles(0, 0));
  });

  it("Add liquidity ", async function () {
    await stackToken.transfer(pepe.address, parseEther("100000.0"));
    await stackToken
      .connect(pepe)
      .approve(router.address, parseEther("100000.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;
    WETH = await router.WETH();

    await router
      .connect(pepe)
      .addLiquidityETH(
        stackToken.address,
        parseEther("100000.0"),
        parseEther("100000.0"),
        parseEther("100.0"),
        pepe.address,
        deadline,
        { value: parseEther("100.0") }
      );

    await usdt.transfer(pepe.address, parseEther("100000.0"));
    await usdt.connect(pepe).approve(router.address, parseEther("100000.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;
    await router
      .connect(pepe)
      .addLiquidityETH(
        usdt.address,
        parseUnits("100000", await usdt.decimals()),
        parseUnits("100000", await usdt.decimals()),
        parseEther("100.0"),
        pepe.address,
        deadline,
        { value: parseEther("100.0") }
      );

    await weth.transfer(pepe.address, parseEther("100000.0"));
    await weth.connect(pepe).approve(router.address, parseEther("100000.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;
    await router
      .connect(pepe)
      .addLiquidityETH(
        weth.address,
        parseEther("100000.0"),
        parseEther("100000.0"),
        parseEther("100.0"),
        pepe.address,
        deadline,
        { value: parseEther("100.0") }
      );

  });

  it("Mint maxSupply - 1", async function () {
    await stackOsNFT.startPartnerSales();

    await stackOsNFT.whitelistPartner(owner.address, 100);

    await usdt.approve(stackOsNFT.address, parseEther("100.0"));

    await stackOsNFT.partnerMint(99);
  });

  it("Bank takes percent", async function () {
    // this goes to gen 0 pool (balance 1.8)
    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parseEther("2.0"),
    });
    expect(await bank.getBalance()).to.be.equal(parseEther("10000.2"));
    expect(await provider.getBalance(royalty.address)).to.equal(
      parseEther("1.8")
    );
  });

  it("Claim royalty for NFT", async function () {

    // first send royalties to the contract 
    // this goes to gen 0 pool (balance 3.6)
    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parseEther("2.0"),
    });
    
    await expect(royalty.claim(0, [0], [0]))
      .to.be.revertedWith("Still first cycle");

    // 1st cycle have enough royalty, now pass enough time
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");

    // cycle 0 end, cycle 1 starts in next call
    // 3.6 balance / 100 maxSupply = 0.036
    await expect(() => royalty.claim(0, [0], [0]))
      .to.changeEtherBalance(owner, parseEther("0.036"));

    await expect(royalty.claim(0, [0], [0]))
      .to.be.revertedWith("Nothing to claim");
  });

  it("Claim royalty for all NFTs", async function () {

    // get token ids 1-98
    let tokenIds = [...Array(99).keys()].slice(1);
    // claim for them all
    await expect(() => royalty.claim(0, tokenIds, [0]))
      .to.changeEtherBalance(owner, parseEther("0.036").mul(98));
  });


  it("Mint last NFT to trigger auto deploy of 2nd generation", async function () {
    await stackOsNFT.partnerMint(1);
  });

  it("Claim last portion from cycle", async function () {

    await expect(() => royalty.claim(0, [99], [0]))
      .to.changeEtherBalance(owner, parseEther("0.036"));

    // now all royalty claimed
    await expect(royalty.claim(0, [0], [0])).to.be.revertedWith(
      "No royalty"
    );
  });

  it("Mint 2nd generation tokens", async function () {
    stackOsNFTgen2 = await ethers.getContractAt(
      "StackOsNFTBasic",
      await generationManager.get(1)
    );

    await usdt.approve(stackOsNFTgen2.address, parseEther("1000"));
    await stackOsNFTgen2.mintForUsd(10, usdt.address);
  });

  it("Send fee and pass time, then next tx starts new cycle", async function () {
    // gen 1 pool (balance 1.8)
    await joe.sendTransaction({
      from: joe.address,
      to: royalty.address,
      value: parseEther("2.0"),
    });

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");
  });

  it("pendingRoyalty work as expected", async function () {
    // 1100 = total max supply of gen 0 and 1 (so 100 + 1000)
    // and since pool 0 fully claimed, we can just divide by 1100
    // but if pool 0 wouldn't claimed, then calculations harder
    expect(await royalty.pendingRoyalty(0, [0]))
      .to.be.equal(parseEther("1.8").div(1100));
  });

  it("Unable to claim from pool 0", async function () {
      // fees are sent only to pool 1
      await expect(royalty.claim(0, [0], [0])).to.be.revertedWith(
        "Nothing to claim"
      );
  });

  it("Send fees to pool 0 and pass time", async function () {
      // cycle 2 starts with:
      // gen 0 pool (balance 1.8)
      await royalty.connect(joe).onReceive(0, {value: parseEther("2.0")});

      // enought eth to end cycle, now pass time
      await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
      await provider.send("evm_mine");
  });

  it("Generation 1 can't claim pool 0", async function () {
      // cycle 2 should end, but reverted
      await expect(royalty.claim(1, [0], [0])).to.be.revertedWith(
        "Bad gen id"
      );
  });

  it("Generation 0 can claim pool 1", async function () {

      // now generation 0 claim pool 0 in cycle 2
      await expect(() => royalty.claim(0, [0], [0]))
        .to.changeEtherBalance(owner, parseEther("1.8").div(100));

      // cycle's totalBalance should update
      expect((await royalty.cycles(2)).totalBalance)
        .to.be.equal(parseEther("1.8").sub(parseEther("1.8").div(100)));

      // test pendingRoyalty function
      expect(await royalty.pendingRoyalty(0, [0]))
        .to.be.equal(parseEther("1.8").div(1100));

      expect(await royalty.pendingRoyalty(1, [0]))
        .to.be.equal(parseEther("1.8").div(1100));
  });

  it("Go to cycle id 6 so cycles 0,1,2 will be only for admin", async function () {

    // current cycle id become 5, but 6 can start
    for (let i = 0; i < 7 - Number(await royalty.counter()); i++) {
      await joe.sendTransaction({
        from: joe.address,
        to: royalty.address,
        value: parseEther("2.0"),
      });
  
      await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
      await provider.send("evm_mine");
    }
  });

  it("Shouldn't claim for cycles that are become admin withdrawable", async function () {

      // start cycle 6
      // cycles 6,5,4,3 have 1.8 balance

      // generation 0 was able to claim pool 1 in cycle 1 
      // but that cycle now admin withdrawable
      // and user can only claim 3,4,5
      await expect(() => royalty.claim(0, [0], [1]))
        .to.changeEtherBalance(owner, parseEther("1.8").div(1100).mul(3));

      expect(await royalty.isClaimed(1, 1, 0, 0)).to.be.equal(false);

      expect((await royalty.cycles(0)).totalBalance).to.be.equal(0);
      expect((await royalty.cycles(1)).totalBalance).to.be.equal(0);
      expect((await royalty.cycles(2)).totalBalance).to.be.equal(0);

      expect((await royalty.cycles(3)).totalBalance).to.be.not.equal(0);

      expect(await royalty.adminWithdrawable()).to.be.equal(
        parseEther("1.8").mul(2).sub(parseEther("1.8").div(100))
      );
    
  });
  
  it("Admin withdraw", async function () {

      // cycle 0 fully claimed
      // cycle 1 wasn't claimed
      // cycle 2 claimed once in pool 0 (so -0.018)
      // total is 3.6 - 0.018
      await expect(() => royalty.adminWithdraw())
        .to.changeEtherBalance(
          owner,
          parseEther("1.8").mul(2).sub(parseEther("1.8").div(100))
        );
  });

  it("Mint 2nd generation tokens", async function () {
    await usdt.approve(stackOsNFTgen2.address, parseEther("1000"));
    await stackOsNFTgen2.mintForUsd(10, usdt.address);

    // wait for mint rate
    await provider.send("evm_increaseTime", [60*10]); 
    await provider.send("evm_mine");
  });

  it("Purchase NFTs from rewards", async function () {

    await stackOsNFTgen2.whitelist(owner.address);
    await stackOsNFTgen2.transferFrom(owner.address, bob.address, 0);

    let oldBalance = await stackToken.balanceOf(bob.address);
    await expect(() => royalty.connect(bob).purchaseNewNft(1, [0], 5, [1]))
      .to.changeTokenBalance(stackOsNFTgen2, bob, 5);
    let newBalance = await stackToken.balanceOf(bob.address);

    // 4.9 stack received
    // 0.08 * 5 spend for mint
    // so user receives ~4.5 stack
    expect(newBalance.sub(oldBalance)).to.be.closeTo(
      parseEther("4.5"), parseEther("0.01")
    )

  });

  it("Claim in WETH", async function () {

    let oldBalance = await weth.balanceOf(owner.address);
    await royalty.claimWETH(0, [5], [1]);
    let newBalance = await weth.balanceOf(owner.address);

    expect(newBalance.sub(oldBalance)).to.be.closeTo(
      parseEther("4.9"), parseEther("0.01")
    )
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
