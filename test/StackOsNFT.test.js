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
    await stackToken.approve(stackOsNFT.address, parseEther("10.0"));

    await expect(stackOsNFT.stakeForTickets(2)).to.be.revertedWith(
      "Lottery inactive"
    );
    await stackOsNFT.activateLottery();
    TICKETS = 14;
    await stackOsNFT.stakeForTickets(TICKETS);

    expect(await stackToken.balanceOf(owner.address)).to.be.equal(
      parseEther("99999998.6")
    );
    expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
      parseEther("1.4")
    );
  });
  it("Start lottery", async function () {
    await link.transfer(stackOsNFT.address, parseEther("10.0"));
    requestID = await stackOsNFT.callStatic.announceLottery();
    await stackOsNFT.callStatic.announceLottery();
    print(requestID);
    expect(await stackOsNFT.ticketOwner(1)).to.be.equal(owner.address);
  });

  it("Start lottery", async function () {
    await coordinator.callBackWithRandomness(
      requestID,
      89765,
      stackOsNFT.address
    );
    var randomNumber = await stackOsNFT.randomNumber();
    print(randomNumber);
  });

  it("Announce winners", async function () {
    await stackOsNFT.announceWinners(10);

    winningTickets = [];
    for (let i = 0; i < PRIZES; i++) {
      winningTickets.push((await stackOsNFT.winningTickets(i)).toNumber());
    }
    // get looser tickets
    notWinning = [...Array(TICKETS).keys()].filter(
      (e) => winningTickets.indexOf(e) == -1
    );
    print(winningTickets, notWinning);

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
  it("Map out winners", async function () {
    await stackOsNFT.mapOutWinningTickets(0, PRIZES);
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
    expect(await stackOsNFT.tokenURI(0)).to.be.equal(
      "site.com"
    );
  });
  it("Partners can't mint", async function () {
    await expect(stackOsNFT.partnerMint(4, usdt.address)).to.be.revertedWith(
      "Sales not started"
    );
    await stackOsNFT.startPartnerSales();
    await expect(stackOsNFT.partnerMint(4, usdt.address)).to.be.revertedWith(
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
      stackOsNFT.connect(joe).partnerMint(4, usdc.address)
    ).to.be.revertedWith("Amount Too Big");
    await stackOsNFT.connect(joe).partnerMint(2, usdc.address);
    expect(await stackOsNFT.balanceOf(joe.address)).to.be.equal(2);
    expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
      parseEther("1.200047530321643004")
    );
  });

  it("Partners mint for usdt", async function () {
    print(await stackToken.balanceOf(stackOsNFT.address));
    await stackOsNFT.whitelistPartner(owner.address, 1);
    await usdt.approve(stackOsNFT.address, parseEther("2.0"));
    await stackOsNFT.partnerMint(1, usdt.address);
    print(await stackToken.balanceOf(stackOsNFT.address));
    // expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
    //   parseEther("1.24")
    // );
  });

  it("Owners can delegate their NFTs", async function () {
    expect(await stackOsNFT.getDelegatee(0)).to.equal(
      ethers.constants.AddressZero
    );
    await stackOsNFT.delegate(joe.address, [0]);
    expect(await stackOsNFT.getDelegatee(0)).to.equal(joe.address);
  });

  it("Bid on Auction before it's open", async function () {
    await stackToken.approve(stackOsNFT.address, parseEther("100.0"));
    await expect(stackOsNFT.placeBid(parseEther("1.0"))).to.be.revertedWith(
      "Auction closed!"
    );
  });

  it("Open Auction for bidding", async function () {
    deadline = Math.floor(Date.now() / 1000) + 1000;
    await stackOsNFT.adjustAuctionCloseTime(deadline);
  });

  async function logBids () {
    let topBids = [];
    for(let i = 0; i <= AUCTIONED_NFTS; i++) {
      topBids.push(
        formatEther((await stackOsNFT.topBids(i)).toString())
      );
    }
    print("topBids", topBids, topBids.length);
  }
  it("Auction", async function () {

    print("auctioned NFTs:", AUCTIONED_NFTS)

    await logBids();

    await stackOsNFT.placeBid(parseEther("1.0"));
    await stackOsNFT.placeBid(parseEther("1.0"));
    await stackOsNFT.placeBid(parseEther("2.0"));
    await stackOsNFT.placeBid(parseEther("5.0"));
    await stackOsNFT.placeBid(parseEther("3.0"));
    await stackOsNFT.placeBid(parseEther("10.0"));
    await stackOsNFT.placeBid(parseEther("15.0"));
    await stackOsNFT.placeBid(parseEther("5.0"));
    await stackOsNFT.placeBid(parseEther("1.0"));
    await stackOsNFT.placeBid(parseEther("9.0"));
    await stackOsNFT.placeBid(parseEther("20.0"));

    await logBids();

    await expect(stackOsNFT.placeBid(parseEther("1.0"))).to.be.revertedWith(
      "Bid too small"
    );
  });

  it("Try to close auction before it has ended.", async function () {
    await expect(stackOsNFT.finalizeAuction()).to.be.revertedWith(
      "Auction still ongoing."
    );
  });

  it("Close Auction Distribute NFT's", async function () {
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline + 1]);
    print(await stackOsNFT.balanceOf(owner.address))
    await expect(() => stackOsNFT.finalizeAuction()).to.changeTokenBalance(
      stackOsNFT, owner, AUCTIONED_NFTS
    );
    print(await stackOsNFT.balanceOf(owner.address))
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
      deadline + TIMELOCK,
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
    await stackToken.approve(stackOsNFT.address, parseEther("10.0"));

    await expect(stackOsNFT.stakeForTickets(2)).to.be.revertedWith(
      "Lottery inactive"
    );
    await stackOsNFT.activateLottery();
    await stackOsNFT.stakeForTickets(14);

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
    notWinning = [...Array(14).keys()].filter(
      (e) => winningTickets.indexOf(e) == -1
    );
    print(notWinning);

    await stackOsNFT.mapOutWinningTickets(0, PRIZES);

    await stackOsNFT.changeTicketStatus();
  });

  it("Deploy stackOsNFTBasic", async function () {
    stackOsNFTBasic = await deployStackOSBasic();
  });

  it("Try to buy directly using transferFromLastGen", async function () {
    await expect(
      stackOsNFTBasic.transferFromLastGen(owner.address, parseEther("10.0"))
    ).to.be.reverted;
  });

  it("Transfer tickets that did not win from gen 1 to gen 2", async function () {
    print("not winning tickets to be transferred: " + notWinning);
    print(
      "gen2 balance: " +
        (await stackToken.balanceOf(stackOsNFT.address))
    );
    print(
      "gen3 balance: " +
        (await stackToken.balanceOf(stackOsNFTBasic.address))
    );
    // Pass some time to drip some tokens
    await provider.send("evm_increaseTime", [60 * 60]); 
    await provider.send("evm_mine"); 
    await stackOsNFT.transferTicket(notWinning, stackOsNFTBasic.address);
    expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
      parseEther("1.0")
    );
    expect(await stackToken.balanceOf(stackOsNFTBasic.address)).to.be.equal(
      parseEther("0.32")
    );
    print("Tickets transfered!");
    print(
      "gen2 balance: " +
        (await stackToken.balanceOf(stackOsNFT.address))
    );
    print(
      "gen3 balance: " +
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
      deadline + TIMELOCK,
    ]);
    await expect(() => stackOsNFT.adminWithdraw())
      .to.changeTokenBalance(stackToken, owner, adminWithdrawableAmount);
    
  });

  it("Trigger auto deploy of the next generation", async function () {
    stackOsNFT = await deployStackOS();
    await stackOsNFT.startPartnerSales();

    await stackOsNFT.whitelistPartner(joe.address, 25);
    await usdc.transfer(joe.address, parseEther("220"));
    await usdc.connect(joe).approve(stackOsNFT.address, parseEther("220"));

    oldGenerationsCount = (await generationManager.count()).toNumber();
    await stackOsNFT.connect(joe).partnerMint(25, usdc.address);

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
      MAX_SUPPLY * 2
    );
    await expect(generationManager.deployNextGenPreset()).to.be.reverted;
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
    await stackToken.approve(stackOsNFT.address, parseEther("10.0"));

    await expect(stackOsNFT.stakeForTickets(2)).to.be.revertedWith(
      "Lottery inactive"
    );
    await stackOsNFT.activateLottery();
    await stackOsNFT.stakeForTickets(14);

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
    notWinning = [...Array(14).keys()].filter(
      (e) => winningTickets.indexOf(e) == -1
    );
    // print(notWinning);

    await stackOsNFT.mapOutWinningTickets(0, PRIZES);

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
    await stackOsNFT.partnerMint(15, usdc.address);
    await stackOsNFT.claimReward(winningTickets);

    expect(await generationManager.count()).to.be.equal(2);
    expect(await stackOsNFT.totalSupply()).to.be.equal(
      await stackOsNFT.getMaxSupply()
    );
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
