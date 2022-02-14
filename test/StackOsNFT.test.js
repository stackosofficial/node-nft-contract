const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
const { deployStackOS, setup, print, deployStackOSBasic, setupDeployment, setupLiquidity } = require("./utils");

describe("StackOS NFT", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, joe, tax, bank] = await hre.ethers.getSigners();
  });

  it("Deploy full SETUP", async function () {
    await setup()
    await setupDeployment();
  });

  it("Stake for tickets", async function () {
    await stackToken.approve(stackOsNFT.address, parseEther("100.0"));

    await expect(stackOsNFT.stakeForTickets(2)).to.be.revertedWith(
      "Lottery inactive"
    );
    await stackOsNFT.activateLottery();
    TICKETS = PRIZES * 2;
    await stackOsNFT.stakeForTickets(TICKETS);

    expect(await stackToken.balanceOf(owner.address)).to.be.equal(
      parseEther("99999988.0")
    );
    expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
      parseEther("12.0")
    );
  });

  it("Start lottery", async function () {
    await link.transfer(stackOsNFT.address, parseEther("1.0"));
    requestID = await stackOsNFT.callStatic.announceLottery();
    await stackOsNFT.callStatic.announceLottery();
    print(requestID);
    expect(await stackOsNFT.ticketOwner(1)).to.be.equal(owner.address);
  });

  it("Start lottery", async function () {
    await coordinator.callBackWithRandomness(
      requestID,
      (Date.now()),
      stackOsNFT.address
    );
    var randomNumber = await stackOsNFT.randomNumber();
    print(randomNumber);
  });

  it("Announce winners", async function () {
    await stackOsNFT.announceWinners(PRIZES);

    winningTickets = [];
    for (let i = 0; i < PRIZES; i++) {
      winningTickets.push((await stackOsNFT.winningTickets(i)).toNumber());
    }
    // get looser tickets
    notWinning = [...Array(TICKETS).keys()].filter(
      (e) => winningTickets.indexOf(e) == -1
    );
    print("winners: ", winningTickets);
    print("losers: ", notWinning);


    // check that Won status assigned to all winning tickets
    for (let i = 0; i < PRIZES; i++) {
      expect(await stackOsNFT.ticketStatus(winningTickets[i]))
        .to.be.equal(1);
    }
    // check that tickets are valid indexes
    await expect(
      winningTickets.findIndex((n) => n < 0 || n > TICKETS-1)
    ).to.be.equal(
      -1
    );
    // check that there is no duplicated tickets indexes
    await expect(new Set(winningTickets).size).to.be.equal(
      winningTickets.length
    );
    // No duplicates between winning / loser tickets
    await expect(new Set(winningTickets.concat(notWinning)).size).to.be.equal(
      winningTickets.length + notWinning.length
    );
    // We get exact winning tickets as we want
    await expect(winningTickets.length).to.be.equal(
      PRIZES
    );
    await expect(stackOsNFT.claimReward(winningTickets)).to.be.revertedWith(
      "Not Assigned Yet!"
    );
    await expect(stackOsNFT.returnStake(notWinning)).to.be.revertedWith(
      "Not Assigned Yet!"
    );
  });

  it("changeTicketStatus()", async function () {
    await stackOsNFT.changeTicketStatus();
  });

  it("Try to return stake of tickets that won!", async function () {
    await expect(stackOsNFT.returnStake(winningTickets)).to.be.revertedWith(
      "Stake Not Returnable"
    );
  });
  it("Try to return stake of tickets that did not won!", async function () {
    var balanceBefore = await stackToken.balanceOf(owner.address);
    print("Balance Before Return Stake: " + balanceBefore);

    await stackOsNFT.returnStake(notWinning);
    var balanceAfter = await stackToken.balanceOf(owner.address);
    print("Balance After Return Stake: " + balanceAfter);
    await expect(stackOsNFT.returnStake(notWinning)).to.be.revertedWith(
      "Stake Not Returnable"
    );
  });
  //   // this should be calculated at runtime because there can be arbitrary amount of winning tickets
  it("Claim reward", async function () {
    await expect(stackOsNFT.claimReward(notWinning)).to.be.revertedWith(
      "Awarded Or Not Won"
    );
    await stackOsNFT.claimReward(winningTickets);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(
      winningTickets.length
    );  
  });
  it("Partners can't mint", async function () {
    await expect(stackOsNFT.partnerMint(4)).to.be.revertedWith(
      "Sales not started"
    );
    await stackOsNFT.startPartnerSales();
    await expect(stackOsNFT.partnerMint(4)).to.be.revertedWith(
      "Amount Too Big"
    );
  });
  it("Add liquidity", async function () {
    await setupLiquidity();
  });

  it("Partners mint", async function () {
    print(await stackToken.balanceOf(stackOsNFT.address));

    await stackOsNFT.whitelistPartner(joe.address, 2);
    await usdc.transfer(joe.address, parseEther("2.0"));
    await usdc.connect(joe).approve(stackOsNFT.address, parseEther("2.0"));
    await expect(
      stackOsNFT.connect(joe).partnerMint(4)
    ).to.be.revertedWith("Amount Too Big");
    await stackOsNFT.connect(joe).partnerMint(2);
    expect(await stackOsNFT.balanceOf(joe.address)).to.be.equal(2);
    expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
      parseEther("6")
    );
  });

  it("Partners mint for usdt", async function () {
    print(await stackToken.balanceOf(stackOsNFT.address));
    await stackOsNFT.whitelistPartner(owner.address, 1);
    await usdt.approve(stackOsNFT.address, parseEther("2.0"));
    await stackOsNFT.partnerMint(1);
    print(await stackToken.balanceOf(stackOsNFT.address));
    // expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
    //   parseEther("1.24")
    // );
  });

  async function logBids (text) {
    let topBids = [];
    for(let i = 0; i <= AUCTIONED_NFTS; i++) {
      try {
        topBids.push(
          formatEther((await stackOsNFT.topBids(i)).toString())
        );
      } catch (error) {
        console.log(error);
      }
    }
    print(text, topBids, topBids.length);
  }
  it("Auction", async function () {

    await stackToken.approve(stackOsNFT.address, parseEther("1000.0"));
    print("auctioned NFTs:", AUCTIONED_NFTS)

    await stackOsNFT.placeBid(parseEther("1.0"));
    await stackOsNFT.placeBid(parseEther("1.0"));
    await stackOsNFT.placeBid(parseEther("2.0"));
    await stackOsNFT.placeBid(parseEther("5.0"));
    await stackOsNFT.placeBid(parseEther("3.0"));
    await stackOsNFT.placeBid(parseEther("10.0"));
    await stackOsNFT.placeBid(parseEther("15.0"));
    await stackOsNFT.placeBid(parseEther("1.0"));
    await stackOsNFT.placeBid(parseEther("9.0"));
    await stackOsNFT.placeBid(parseEther("20.0"));
    await stackOsNFT.placeBid(parseEther("6.0"));

    let currentBidsCount = 0;
    for(let i = 0; i <= AUCTIONED_NFTS; i++) {
      if((await stackOsNFT.topBids(i)).isZero() == false)
        currentBidsCount++;
    }

    // make 5 more bids than there is slots
    let arbitraryBidsCount = AUCTIONED_NFTS - currentBidsCount + 5;
    for(let i = 0; i <= arbitraryBidsCount; i++) {
      await stackOsNFT.placeBid(parseEther("20.0").add(parseEther("1.0")));
    }

    await logBids("topBids array after bids");

  });

  it("Unable to bid less (or equal) than lowest bid", async function () {
    let lowestBid = await stackOsNFT.topBids(1);
    await expect(stackOsNFT.placeBid(lowestBid)).to.be.revertedWith(
      "Bid too small"
    );
  });

  it("Should credit back the bid amount when outbid", async function () {
    let lowestBid = await stackOsNFT.topBids(1);
    let newLowestBid = lowestBid.add(parseEther("1.0"));
    
    print("user spend", newLowestBid);
    print("user return", lowestBid);
    await expect(() => stackOsNFT.placeBid(newLowestBid))
        .to.changeTokenBalance(
          stackToken, 
          owner, 
          lowestBid.sub(newLowestBid)
        );
  });

  it("Close Auction Distribute NFT's", async function () {
    print(await stackOsNFT.balanceOf(owner.address))
    console.log(await stackOsNFT.totalSupply())
    await expect(() => stackOsNFT.finalizeAuction()).to.changeTokenBalance(
      stackOsNFT, owner, AUCTIONED_NFTS
    );
    print(await stackOsNFT.balanceOf(owner.address))
  });

  it("Unable to bid when finalized", async function () {
    await expect(stackOsNFT.placeBid(parseEther("1.0"))).to.be.revertedWith(
      "Auction closed!"
    );
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
    adminWithdrawableAmount = await stackOsNFT.adminWithdrawableAmount();
    print(adminWithdrawableAmount);
    await expect(stackOsNFT.adminWithdraw()).to.be.revertedWith("Locked!");
  });

  it("Admin withdraws after time lock.", async function () {
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      (Math.floor(Date.now() / 1000)) + TIMELOCK,
    ]);
    
    await expect(() => stackOsNFT.adminWithdraw())
      .to.changeTokenBalance(stackToken, owner, adminWithdrawableAmount);
    
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});

describe("Test transferTickets and transferFromLastGen", function () {

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Setup 2", async function () {
    await setup();
    await setupDeployment();
  });
  it("Add liquidity", async function () {
    await stackToken.approve(router.address, parseEther("100.0"));
    await usdt.approve(router.address, parseEther("100.0"));
    await usdc.approve(router.address, parseEther("100.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.addLiquidityETH(
      stackToken.address,
      parseEther("100"),
      parseEther("100"),
      parseEther("3.77"),
      joe.address,
      deadline,
      { value: parseEther("3.77") }
    );

    await router.addLiquidityETH(
      usdt.address,
      parseUnits("4.3637", await usdt.decimals()),
      parseUnits("4.3637", await usdt.decimals()),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      usdc.address,
      parseUnits("4.3637", await usdc.decimals()),
      parseUnits("4.3637", await usdc.decimals()),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });
  it("Get 'not winning' tickets", async function () {
    await stackToken.approve(stackOsNFT.address, parseEther("100.0"));

    await expect(stackOsNFT.stakeForTickets(2)).to.be.revertedWith(
      "Lottery inactive"
    );
    await stackOsNFT.activateLottery();
    await stackOsNFT.stakeForTickets(TICKETS);

    //"Start lottery"
    await link.transfer(stackOsNFT.address, parseEther("10.0"));
    print(await link.balanceOf(stackOsNFT.address));
    requestID = await stackOsNFT.callStatic.announceLottery();
    await stackOsNFT.callStatic.announceLottery();
    print(requestID);
    expect(await stackOsNFT.ticketOwner(1)).to.be.equal(owner.address);

    //"Start lottery"
    await coordinator.callBackWithRandomness(
      requestID,
      89765,
      stackOsNFT.address
    );
    var randomNumber = await stackOsNFT.randomNumber();
    print(randomNumber);

    await stackOsNFT.announceWinners(100);

    winningTickets = [];
    for (let i = 0; i < PRIZES; i++) {
      winningTickets.push((await stackOsNFT.winningTickets(i)).toNumber());
    }
    // get NOT winning tickets
    notWinning = [...Array(TICKETS).keys()].filter(
      (e) => winningTickets.indexOf(e) == -1
    );
    print(notWinning);

    await stackOsNFT.changeTicketStatus();
  });

  it("Deploy stackOsNFTBasic", async function () {
    PRICE = parseEther("0.016"); 
    await setupDeployment({price: PRICE});
    stackOsNFTBasic = await deployStackOSBasic();
  });

  it("Try to buy directly using transferFromLastGen", async function () {
    await expect(
      stackOsNFTBasic.transferFromLastGen(owner.address, parseEther("10.0"))
    ).to.be.reverted;
  });

  it("Transfer tickets that did not win from gen 1 to gen 2", async function () {
    print(
      "gen1 balance: " +
        (await stackToken.balanceOf(stackOsNFT.address))
    );
    print(
      "gen2 balance: " +
        (await stackToken.balanceOf(stackOsNFTBasic.address))
    );
    // Pass some time to drip some tokens
    await provider.send("evm_increaseTime", [60 * 60]); 
    await provider.send("evm_mine"); 
    let toTransfer = notWinning.slice(0, 20);
    // print("transfering tickets", toTransfer);
    let oldOwnerBalance = await stackToken.balanceOf(owner.address);
    await stackOsNFT.transferTicket(toTransfer, stackOsNFTBasic.address);
    let newOwnerBalance = await stackToken.balanceOf(owner.address);
    expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
      parseEther("10.0")
    );
    expect(await stackToken.balanceOf(stackOsNFTBasic.address)).to.be.equal(0);
    expect(newOwnerBalance.sub(oldOwnerBalance)).to.be.closeTo(
      parseEther("1.68"), parseEther("0.01")
    );

    print("Tickets transfered!");
    print(
      "gen1 balance: " +
        (await stackToken.balanceOf(stackOsNFT.address))
    );
    print(
      "gen2 balance: " +
        (await stackToken.balanceOf(stackOsNFTBasic.address))
    );
  });

  it("Admin tried to withdraw before time lock expires.", async function () {
    adminWithdrawableAmount = await stackOsNFT.adminWithdrawableAmount();
    print(adminWithdrawableAmount);
    await expect(stackOsNFT.adminWithdraw()).to.be.revertedWith("Locked!");
  });

  it("Admin withdraws after time lock.", async function () {
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      (Math.floor(Date.now() / 1000)) + TIMELOCK,
    ]);
    await expect(() => stackOsNFT.adminWithdraw())
      .to.changeTokenBalance(stackToken, owner, adminWithdrawableAmount);
    
  });

  it("Trigger auto deploy of the next generation", async function () {
    stackOsNFT = await deployStackOS();
    await stackOsNFT.startPartnerSales();

    await stackOsNFT.whitelistPartner(joe.address, 1000);
    await usdc.transfer(joe.address, parseEther("220"));
    await usdc.connect(joe).approve(stackOsNFT.address, parseEther("220"));

    oldGenerationsCount = (await generationManager.count()).toNumber();
    let amountToMint = 
      await stackOsNFT.getMaxSupply() - await stackOsNFT.totalSupply();
    await stackOsNFT.connect(joe).partnerMint(amountToMint);

  });

  it("Trigger auto deploy of the next generation 2", async function () {

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
    // growth is set to 100% so multiply supply by 2
    expect(await stackAutoDeployed.getMaxSupply()).to.be.equal(
      MAX_SUPPLY * (10000 + MAX_SUPPLY_GROWTH) / 10000
    );
    await expect(generationManager.autoDeployNextGeneration()).to.be.reverted;
  });
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});

describe("Test manual deploy before max supply reached", function () {

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Setup 2", async function () {
    await setup();
    await setupDeployment();
  });
  it("Add liquidity", async function () {
    await stackToken.approve(router.address, parseEther("100.0"));
    await usdt.approve(router.address, parseEther("100.0"));
    await usdc.approve(router.address, parseEther("100.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.addLiquidityETH(
      stackToken.address,
      parseEther("100"),
      parseEther("100"),
      parseEther("3.77"),
      joe.address,
      deadline,
      { value: parseEther("3.77") }
    );

    await router.addLiquidityETH(
      usdt.address,
      parseUnits("4.3637", await usdt.decimals()),
      parseUnits("4.3637", await usdt.decimals()),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      usdc.address,
      parseUnits("4.3637", await usdc.decimals()),
      parseUnits("4.3637", await usdc.decimals()),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });
  it("Get 'not winning' tickets", async function () {
    await stackToken.approve(stackOsNFT.address, parseEther("100.0"));

    await expect(stackOsNFT.stakeForTickets(2)).to.be.revertedWith(
      "Lottery inactive"
    );
    await stackOsNFT.activateLottery();
    await stackOsNFT.stakeForTickets(TICKETS);

    //"Start lottery"
    await link.transfer(stackOsNFT.address, parseEther("10.0"));
    // print(await link.balanceOf(stackOsNFT.address));
    requestID = await stackOsNFT.callStatic.announceLottery();
    await stackOsNFT.callStatic.announceLottery();
    // print(requestID);
    expect(await stackOsNFT.ticketOwner(1)).to.be.equal(owner.address);

    //"Start lottery"
    await coordinator.callBackWithRandomness(
      requestID,
      89765,
      stackOsNFT.address
    );
    var randomNumber = await stackOsNFT.randomNumber();
    // print(randomNumber);

    await stackOsNFT.announceWinners(100);

    winningTickets = [];
    for (let i = 0; i < PRIZES; i++) {
      winningTickets.push((await stackOsNFT.winningTickets(i)).toNumber());
    }
    // get NOT winning tickets
    notWinning = [...Array(TICKETS).keys()].filter(
      (e) => winningTickets.indexOf(e) == -1
    );
    // print(notWinning);

    await stackOsNFT.changeTicketStatus();
  });

  it("Deploy stackOsNFTBasic", async function () {
    PRICE = parseEther("0.001626");
    stackOsNFTBasic = await deployStackOSBasic();
  });

  it("Mint max supply in generation 1 while 2nd deployed manually", async function () {
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 100);
    await usdc.approve(stackOsNFT.address, parseEther("10000.0"));
    let amountToMint = (await stackOsNFT.getMaxSupply())
        .sub(await stackOsNFT.totalSupply())
        .sub(winningTickets.length);
    await stackOsNFT.partnerMint(amountToMint);
    await stackOsNFT.claimReward(winningTickets);

    expect(await generationManager.count()).to.be.equal(2);
    expect(await stackOsNFT.totalSupply()).to.be.equal(
      await stackOsNFT.getMaxSupply()
    );
  });

  it("tokenURI function should work as expected", async () => {
    expect(await stackOsNFT.tokenURI(0)).to.be.equal(
      baseURI + "0/0"
    );
    expect(await stackOsNFT.tokenURI(1)).to.be.equal(
      baseURI + "0/1"
    );
    await expect(stackOsNFT.tokenURI(1337)).to.be.reverted;
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
