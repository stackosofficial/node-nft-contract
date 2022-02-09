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
    CYCLE_DURATION = Number(await royalty.CYCLE_DURATION());
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
    
    await expect(royalty.claim(0, [0], [0], [0]))
      .to.be.revertedWith("Still first cycle");

    // 1st cycle have enough royalty, now pass enough time
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");

    // cycle 0 end, cycle 1 starts in next call
    // 3.6 balance / 100 maxSupply = 0.036
    await expect(() => royalty.claim(0, [0], [0], [0]))
      .to.changeEtherBalance(owner, parseEther("0.036"));

    await expect(royalty.claim(0, [0], [0], [0]))
      .to.be.revertedWith("Nothing to claim");
  });

  it("Claim royalty for all NFTs", async function () {

    // get token ids 1-98
    let tokenIds = [...Array(99).keys()].slice(1);
    // claim for them all
    await expect(() => royalty.claim(0, tokenIds, [0], [0]))
      .to.changeEtherBalance(owner, parseEther("0.036").mul(98));
  });


  it("Mint last NFT to trigger auto deploy of 2nd generation", async function () {
    await stackOsNFT.partnerMint(1);
  });

  it("Claim last portion from cycle", async function () {

    await expect(() => royalty.claim(0, [99], [0], [0]))
      .to.changeEtherBalance(owner, parseEther("0.036"));

    // now all royalty claimed
    await expect(royalty.claim(0, [0], [0], [0])).to.be.revertedWith(
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
      await expect(royalty.claim(0, [0], [0, 1], [0])).to.be.revertedWith(
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
      await expect(royalty.claim(1, [0], [2], [0])).to.be.revertedWith(
        "Bad gen id"
      );
  });

  it("Generation 0 can claim pool 1", async function () {
      // cycle 2 only has pool 0 balance
      await expect(royalty.claim(0, [0], [2], [1])).to.be.revertedWith(
        "Nothing to claim"
      );

      // now generation 0 claim pool 0 in cycle 2 
      // div by 100 because pool 0 only divided by generation 0
      await expect(() => royalty.claim(0, [0], [2], [0]))
        .to.changeEtherBalance(owner, parseEther("1.8").div(100));

      // now generation 0 claim pool 1 in cycle 1 
      await expect(() => royalty.claim(0, [0], [1], [1]))
        .to.changeEtherBalance(owner, parseEther("1.8").div(1100));

      // test pendingRoyalty function
      expect(await royalty.pendingRoyalty(0, [0]))
        .to.be.equal(parseEther("0"));

      expect(await royalty.pendingRoyalty(1, [0]))
        .to.be.equal(parseEther("1.8").div(1100));
  });

    // print(
    //   await partner.getBalance(),
    //   await provider.getBalance(royalty.address)
    // );
    // await expect(
    //   joe.sendTransaction({
    //     // enough eth for cycle 3 to end
    //     from: joe.address,
    //     to: royalty.address,
    //     value: parseEther("2.0"),
    //   })
    // ).to.be.not.reverted;
    // await provider.send("evm_increaseTime", [CYCLE_DURATION]); // enough time for cycle 3 to end
    // await provider.send("evm_mine");
    // await stackOsNFT.connect(partner).delegate(stackOsNFT.address, [1]); // will claim this later, this delegate will be counted from cycle 4

    // expect(await partner.getBalance()).to.be.lt(parseEther("10006.0"));
    // await expect(royalty.connect(partner).claim(0, [0], [0, 1, 2], [0])).to.be.not.reverted; // 4 cycle starts here (claim 0.9 eth, 6.3 total)
    // expect(await partner.getBalance()).to.be.gt(parseEther("10006.0"));
    // print(
    //   await partner.getBalance(),
    //   await provider.getBalance(royalty.address)
    // );
  // });

  // it("Can't claim claimed", async function () {
  //   await royalty.connect(partner).claim(0, [0], [0, 1, 2], [0]); // 'empty call', already claimed for 3 cycles, 4 is still growing
  // });
  // it("Multiple claimers", async function () {
  //   await stackOsNFT.whitelistPartner(vera.address, 2);
  //   await stackOsNFT.whitelistPartner(bob.address, 2);
  //   await stackOsNFT.whitelistPartner(owner.address, 2);

  //   await usdt.transfer(vera.address, parseEther("100.0"));
  //   await usdt.transfer(bob.address, parseEther("100.0"));
  //   await dude.sendTransaction({
  //     // this should be divided by 3 previous delegates
  //     from: dude.address,
  //     to: royalty.address,
  //     value: parseEther("100.0"),
  //   });
  //   await usdt.connect(bob).approve(stackOsNFT.address, parseEther("5.0"));
  //   await stackOsNFT.connect(bob).partnerMint(1);
  //   await usdt.connect(vera).approve(stackOsNFT.address, parseEther("5.0"));
  //   await stackOsNFT.connect(vera).partnerMint(1);
  //   await usdt.approve(stackOsNFT.address, parseEther("5.0"));
  //   await stackOsNFT.partnerMint(1);

  //   await expect(royalty.claim(0, [0], [0], [0])).to.be.revertedWith("Not owner");
  //   await expect(royalty.connect(vera).claim(0, [4], [0], [0])).to.be.revertedWith(
  //     "NFT should be delegated"
  //   );
  //   // +3 delegates for 5 cycle
  //   await stackOsNFT.connect(bob).delegate(stackOsNFT.address, [3]);
  //   await stackOsNFT.connect(vera).delegate(stackOsNFT.address, [4]);
  //   await stackOsNFT.delegate(stackOsNFT.address, [5]);

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 4 can end, with 100 eth
  //   await provider.send("evm_mine");
  //   await expect(
  //     dude.sendTransaction({
  //       // 5 cycle start with 2 eth
  //       from: dude.address,
  //       to: royalty.address,
  //       value: parseEther("2.0"),
  //     })
  //   ).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 5 can end
  //   await provider.send("evm_mine");
  //   print(
  //     await partner.getBalance(),
  //     await owner.getBalance(),
  //     await bob.getBalance(),
  //     await vera.getBalance()
  //   );
  //   await royalty.claim(0, [5], [0, 1, 2, 3, 4], [0]); // 6 cycle start
  //   await royalty.connect(bob).claim(0, [3], [0, 1, 2, 3, 4], [0]);
  //   await royalty.connect(vera).claim(0, [4], [0, 1, 2, 3, 4], [0]);
  //   await royalty.connect(partner).claim(0, [0, 1, 2], [0, 1, 2, 3, 4], [0]);
  //   print(
  //     await partner.getBalance(),
  //     await owner.getBalance(),
  //     await bob.getBalance(),
  //     await vera.getBalance()
  //   );

  //   expect(await bob.getBalance()).to.be.gt(parseEther("10000.28")); // should be ((2 - 10% fee) / 6 tokens) = 0.3, but transfer fees also here...
  //   expect(await vera.getBalance()).to.be.gt(parseEther("10000.28"));
  //   expect(await partner.getBalance()).to.be.gt(parseEther("10090.0"));
  // });
  // it("StackOS generation 2 with multiple claimers", async function () {
  //   // generation 2
  //   // delegates of gen2 will be only counted in future cycles

  //   stackOsNFTgen2 = await deployStackOSBasic();

  //   await expect(
  //     dude.sendTransaction({
  //       // 6 cycle get 6 eth
  //       from: dude.address,
  //       to: royalty.address,
  //       value: parseEther("6.0"),
  //     })
  //   ).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 6 cycle can end
  //   await provider.send("evm_mine");

  //   await stackOsNFT.connect(bob).partnerMint(1);
  //   await stackOsNFT.connect(vera).partnerMint(1);
  //   await stackOsNFT.partnerMint(1);

    
  //   // give them some STACK
  //   await stackToken.transfer(bob.address, parseEther("50.0"));
  //   await stackToken.transfer(vera.address, parseEther("50.0"));

  //   await stackToken.connect(bob).approve(stackOsNFTgen2.address, parseEther("50.0"));
  //   await stackOsNFTgen2.connect(bob).mint(1);
  //   await stackToken.connect(vera).approve(stackOsNFTgen2.address, parseEther("50.0"));
  //   await stackOsNFTgen2.connect(vera).mint(1);
  //   await stackToken.approve(stackOsNFTgen2.address, parseEther("50.0"));
  //   await stackOsNFTgen2.mint(1);

  //   //+6 delegates for 7 cycle
  //   await stackOsNFT.connect(bob).delegate(stackOsNFT.address, [6]);
  //   await stackOsNFT.connect(vera).delegate(stackOsNFT.address, [7]);
  //   await stackOsNFT.delegate(stackOsNFT.address, [8]);

  //   await stackOsNFTgen2.connect(bob).delegate(stackOsNFTgen2.address, [0]);
  //   await stackOsNFTgen2.connect(vera).delegate(stackOsNFTgen2.address, [1]);
  //   await stackOsNFTgen2.delegate(stackOsNFTgen2.address, [2]);

  //   await expect(
  //     dude.sendTransaction({
  //       // 7 cycle start
  //       from: dude.address,
  //       to: royalty.address,
  //       value: parseEther("2.0"),
  //     })
  //   ).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 7 cycle can end
  //   await provider.send("evm_mine");

  //   print(
  //     await owner.getBalance(),
  //     await bob.getBalance(),
  //     await vera.getBalance()
  //   );
  //   cycleIds = [...Array(7).keys()];
  //   await royalty.connect(bob).claim(0, [6], cycleIds, [0]); // 8 cycle start
  //   await royalty.connect(vera).claim(0, [7], cycleIds, [0]);
  //   await royalty.claim(0, [8], cycleIds, [0]);
  //   print(
  //     await owner.getBalance(),
  //     await bob.getBalance(),
  //     await vera.getBalance()
  //   );

  //   // print("balance after add generation: ", (await provider.getBalance(royalty.address)));

  //   await royalty.claim(1, [2], cycleIds, [0]);

  //   // print((await owner.getBalance()), (await bob.getBalance()), (await vera.getBalance()))
  //   await royalty.claim(0, [5], cycleIds, [0]);
  //   await royalty.connect(bob).claim(0, [3], cycleIds, [0]);
  //   await royalty.connect(vera).claim(0, [4], cycleIds, [0]);
  //   await royalty.connect(partner).claim(0, [0, 1, 2], cycleIds, [0]);
  //   // print((await owner.getBalance()), (await bob.getBalance()), (await vera.getBalance()));

  //   await expect(
  //     dude.sendTransaction({
  //       // for 8 cycle
  //       from: dude.address,
  //       to: royalty.address,
  //       value: parseEther("2.0"),
  //     })
  //   ).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 8 can end
  //   await provider.send("evm_mine");

  //   cycleIds = [...Array(8).keys()];
  //   await royalty.connect(bob).claim(0, [6], cycleIds, [0]); // 9 cycle start, gen2 delegates counted for it, should be 12 total
  //   await royalty.connect(vera).claim(0, [7], cycleIds, [0]);
  //   await royalty.claim(0, [8], cycleIds, [0]);

  //   await royalty.claim(1, [2], cycleIds, [0]);
  //   await royalty.connect(bob).claim(1, [0], cycleIds, [0]);
  //   await royalty.connect(vera).claim(1, [1], cycleIds, [0]);
  //   await royalty.claim(1, [2], cycleIds, [0]);

  //   await royalty.claim(0, [5], cycleIds, [0]);
  //   await royalty.connect(bob).claim(0, [3], cycleIds, [0]);
  //   await royalty.connect(vera).claim(0, [4], cycleIds, [0]);
  //   await royalty.connect(partner).claim(0, [0, 1, 2], cycleIds, [0]);

  //   await expect(
  //     dude.sendTransaction({
  //       // for cycle 9
  //       from: dude.address,
  //       to: royalty.address,
  //       value: parseEther("1000.0"),
  //     })
  //   ).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 9 can end
  //   await provider.send("evm_mine");

  //   cycleIds = [...Array(9).keys()];
  //   await royalty.connect(bob).claim(0, [6], cycleIds, [0]); // 10 cycle start, now generation2 tokens can claim for cycle 9
  //   await royalty.connect(vera).claim(0, [7], cycleIds, [0]);
  //   await royalty.claim(0, [8], cycleIds, [0]);

  //   await royalty.connect(bob).claim(1, [0], cycleIds, [0]);
  //   await royalty.connect(vera).claim(1, [1], cycleIds, [0]);
  //   await royalty.claim(1, [2], cycleIds, [0]);

  //   expect(
  //     await royalty.pendingRoyalty(0, [0, 1, 2, 3, 4, 5])
  //   ).to.be.equal(parseEther("450.0"));

  //   await royalty.claim(0, [5], cycleIds, [0]);
  //   await royalty.connect(bob).claim(0, [3], cycleIds, [0]);
  //   await royalty.connect(vera).claim(0, [4], cycleIds, [0]);
  //   await royalty.connect(partner).claim(0, [0, 1, 2], cycleIds, [0]);

  //   // should be zero + last cycle unclaimed
  //   print(await provider.getBalance(royalty.address));
  //   expect(await provider.getBalance(royalty.address)).to.be.closeTo(
  //     BigNumber.from(0), 50
  //   );

  //   expect(
  //     await royalty.pendingRoyalty(0, [0, 1, 2, 3, 4, 5])
  //   ).to.be.equal(parseEther("0.0"));

  //   print(
  //     await owner.getBalance(),
  //     await partner.getBalance(),
  //     await bob.getBalance(),
  //     await vera.getBalance()
  //   );
  // });
  // it("StackOS generation 3 with multiple claimers", async function () {
  //   // gen3
  //   stackOsNFTgen3 = await deployStackOS();

  //   await stackOsNFTgen3.whitelistPartner(vera.address, 1);
  //   await stackOsNFTgen3.whitelistPartner(bob.address, 1);
  //   await stackOsNFTgen3.whitelistPartner(owner.address, 1);
  //   await stackOsNFTgen3.startPartnerSales();

  //   await usdt.connect(bob).approve(stackOsNFTgen3.address, parseEther("5.0"));
  //   await stackOsNFTgen3.connect(bob).partnerMint(1);
  //   await usdt.connect(vera).approve(stackOsNFTgen3.address, parseEther("5.0"));
  //   await stackOsNFTgen3.connect(vera).partnerMint(1);
  //   await usdt.approve(stackOsNFTgen3.address, parseEther("5.0"));
  //   await stackOsNFTgen3.partnerMint(1);

  //   // delegates for 11 cycle
  //   await stackOsNFTgen3.connect(bob).delegate(stackOsNFTgen3.address, [0]);
  //   await stackOsNFTgen3.connect(vera).delegate(stackOsNFTgen3.address, [1]);
  //   await stackOsNFTgen3.delegate(stackOsNFTgen3.address, [2]);

  //   await expect(
  //     dude.sendTransaction({
  //       // this go in 10 cycle, gen3 can't claim
  //       from: dude.address,
  //       to: royalty.address,
  //       value: parseEther("1000.0"),
  //     })
  //   ).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 10 can end
  //   await provider.send("evm_mine");

  //   cycleIds = [...Array(10).keys()];
  //   await royalty.claim(2, [2], cycleIds, [0]); // 11 cycle started, though owner didn't get ether

  //   await royalty.connect(bob).claim(0, [6], cycleIds, [0]);

  //   await expect(
  //     dude.sendTransaction({
  //       // this go in 11 cycle, gen3 can claim it
  //       from: dude.address,
  //       to: royalty.address,
  //       value: parseEther("1000.0"),
  //     })
  //   ).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 11 can end
  //   await provider.send("evm_mine");

  //   cycleIds = [...Array(11).keys()];
  //   await royalty.connect(bob).claim(2, [0], cycleIds, [0]); // 12 cycle start (zero-based index 11)
  //   await royalty.connect(vera).claim(2, [1], cycleIds, [0]);
  //   await royalty.claim(2, [2], cycleIds, [0]);

  //   await royalty.connect(bob).claim(0, [6], cycleIds, [0]);
  //   await royalty.connect(vera).claim(0, [7], cycleIds, [0]);
  //   await royalty.claim(0, [8], cycleIds, [0]);

  //   await royalty.connect(bob).claim(1, [0], cycleIds, [0]);
  //   await royalty.connect(vera).claim(1, [1], cycleIds, [0]);
  //   await royalty.claim(1, [2], cycleIds, [0]);

  //   await royalty.claim(0, [5], cycleIds, [0]);
  //   await royalty.connect(bob).claim(0, [3], cycleIds, [0]);
  //   await royalty.connect(vera).claim(0, [4], cycleIds, [0]);
  //   await royalty.connect(partner).claim(0, [0, 1, 2], cycleIds, [0]);

  //   print(await provider.getBalance(royalty.address));
  //   expect(await provider.getBalance(royalty.address)).to.be.closeTo(
  //     BigNumber.from(0), 50
  //   );
  //   print(
  //     await owner.getBalance(),
  //     await partner.getBalance(),
  //     await bob.getBalance(),
  //     await vera.getBalance()
  //   );
  // });

  // it("Purchase NFTs from rewards", async function () {
  //   await expect(
  //     dude.sendTransaction({
  //       from: dude.address,
  //       to: royalty.address,
  //       value: parseEther("10.0"),
  //     })
  //   ).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]);
  //   await provider.send("evm_mine");

  //   LPaddress = await factory.getPair(stackToken.address, WETH);
  //   print("LPAddress " + LPaddress);

  //   print(
  //     "before purchaseNewNft",
  //     await owner.getBalance(),
  //     await bob.getBalance()
  //   );

  //   cycleIds = [...Array(12).keys()];
  //   await expect(() => royalty.purchaseNewNft(1, [2], 5, cycleIds, [0]))
  //     .to.changeTokenBalance(stackOsNFTgen2, owner, 5);

  //   print(
  //     "royalty eth balance: " + (await provider.getBalance(royalty.address))
  //   );
  //   print(
  //     "after purchaseNewNft",
  //     await owner.getBalance(),
  //     await bob.getBalance(),
  //     await stackToken.balanceOf(bob.address)
  //   );
  // });

  // it("Claim in WETH (for Matic network)", async function () {
  //   await expect(
  //     dude.sendTransaction({
  //       from: dude.address,
  //       to: royalty.address,
  //       value: parseEther("1000.0"),
  //     })
  //   ).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]);
  //   await provider.send("evm_mine");

  //   cycleIds = [...Array(13).keys()];
  //   await royalty.claimWETH(2, [2], cycleIds, [0]);

  //   print("bob weth (before claim): ", await weth.balanceOf(bob.address));
  //   await royalty.connect(bob).claimWETH(0, [6], cycleIds, [0]);

  //   await expect(
  //     dude.sendTransaction({
  //       from: dude.address,
  //       to: royalty.address,
  //       value: parseEther("1000.0"),
  //     })
  //   ).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 11 can end
  //   await provider.send("evm_mine");

  //   cycleIds = [...Array(14).keys()];
  //   await royalty.connect(bob).claimWETH(2, [0], cycleIds, [0]); // 12 cycle start (zero-based index 11)
  //   await royalty.connect(vera).claimWETH(2, [1], cycleIds, [0]);
  //   await royalty.claimWETH(2, [2], cycleIds, [0]);

  //   await royalty.connect(bob).claimWETH(0, [6], cycleIds, [0]);
  //   await royalty.connect(vera).claimWETH(0, [7], cycleIds, [0]);
  //   await royalty.claimWETH(0, [8], cycleIds, [0]);

  //   await royalty.connect(bob).claimWETH(1, [0], cycleIds, [0]);
  //   await royalty.connect(vera).claimWETH(1, [1], cycleIds, [0]);
  //   await royalty.claimWETH(1, [2], cycleIds, [0]);

  //   await royalty.claimWETH(0, [5], cycleIds, [0]);
  //   await royalty.connect(bob).claimWETH(0, [3], cycleIds, [0]);
  //   await royalty.connect(vera).claimWETH(0, [4], cycleIds, [0]);
  //   await royalty.connect(partner).claimWETH(0, [0, 1, 2], cycleIds, [0]);

  //   print(await provider.getBalance(royalty.address));
  //   expect(await provider.getBalance(royalty.address)).to.be.closeTo(
  //     BigNumber.from(0), 50
  //   );
  //   print("owner weth:", await weth.balanceOf(owner.address));
  //   print("vera:", await weth.balanceOf(vera.address));
  //   print("bob:", await weth.balanceOf(bob.address));
  //   print("partner:", await weth.balanceOf(partner.address));
  // });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
