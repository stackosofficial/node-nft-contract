const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("@ethersproject/bignumber");
const { parseEther,  } = require("@ethersproject/units");
const { deployStackOS, setup, print } = require("./utils");
// const timeMachine = require("@atixlabs/hardhat-time-n-mine");

describe("StackOS NFT", function () {
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
  });

  it("Deploy StackOS NFT generation 2", async function () {
    stackOsNFTgen2 = await deployStackOS();
  });
  it("Stake for tickets", async function () {
    await stackToken.approve(stackOsNFT.address, parseEther("10.0"));

    await expect(stackOsNFT.stakeForTickets(2)).to.be.revertedWith(
      "Lottery inactive"
    );
    await stackOsNFT.activateLottery();
    await stackOsNFT.stakeForTickets(14);

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
    await stackOsNFT.announceWinners(100);

    winningTickets = [];
    for (let i = 0; i < PRIZES; i++) {
      winningTickets.push((await stackOsNFT.winningTickets(i)).toNumber());
    }
    // // get NOT winning tickets
    notWinning = [...Array(14).keys()].filter(
      (e) => winningTickets.indexOf(e) == -1
    );
    print(winningTickets, notWinning);

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
      parseEther("4.3637"),
      parseEther("4.3637"),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      usdc.address,
      parseEther("4.3637"),
      parseEther("4.3637"),
      parseEther("1.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });

  it("Partners mint", async function () {
    print((await stackToken.balanceOf(stackOsNFT.address)));

    await stackOsNFT.whitelistPartner(joe.address, 2);
    await usdc.transfer(joe.address, parseEther("2.0"));
    await usdc.connect(joe).approve(stackOsNFT.address, parseEther("2.0"));
    await expect(stackOsNFT.connect(joe).partnerMint(4, usdc.address)).to.be.revertedWith(
      "Amount Too Big"
    );
    await stackOsNFT.connect(joe).partnerMint(2, usdc.address);
    expect(await stackOsNFT.balanceOf(joe.address)).to.be.equal(2);
    expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
      parseEther("1.160000000000000007")
    );
  });

  it("Partners mint for usdt", async function () {
    print((await stackToken.balanceOf(stackOsNFT.address)));
    await stackOsNFT.whitelistPartner(owner.address, 1);
    await usdt.approve(stackOsNFT.address, parseEther("2.0"));
    await stackOsNFT.partnerMint(1, usdt.address);
    print((await stackToken.balanceOf(stackOsNFT.address)));
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

  it("Auction", async function () {
    //   // print((await stackToken.balanceOf(owner.address)))
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
  });

  it("Try to close auction before it has ended.", async function () {
    await expect(stackOsNFT.finalizeAuction()).to.be.revertedWith(
      "Auction still ongoing."
    );
  });

  it("Close Auction Distribute NFT's", async function () {
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline + 1]);
    await stackOsNFT.finalizeAuction();
  });

  it("Deploy stackOsNFT generation 2", async function () {
    stackOsNFTgen2 = await deployStackOS();
  });
  it("Get some 'not winning' tickets on stack generation 2", async function () {
    await stackToken.approve(stackOsNFTgen2.address, parseEther("10.0"));

    await expect(stackOsNFTgen2.stakeForTickets(2)).to.be.revertedWith(
      "Lottery inactive"
    );
    await stackOsNFTgen2.activateLottery();
    await stackOsNFTgen2.stakeForTickets(14);

    //"Start lottery"
    await link.transfer(stackOsNFTgen2.address, parseEther("10.0"));
    requestID = await stackOsNFTgen2.callStatic.announceLottery();
    await stackOsNFTgen2.callStatic.announceLottery();
    print(requestID);
    expect(await stackOsNFTgen2.ticketOwner(1)).to.be.equal(owner.address);

    //"Start lottery"
    await coordinator.callBackWithRandomness(
      requestID,
      89765,
      stackOsNFTgen2.address
    );
    var randomNumber = await stackOsNFTgen2.randomNumber();
    print(randomNumber);

    await stackOsNFTgen2.announceWinners(100);

    winningTickets = [];
    for (let i = 0; i < PRIZES; i++) {
      winningTickets.push((await stackOsNFTgen2.winningTickets(i)).toNumber());
    }
    // get NOT winning tickets
    notWinning = [...Array(14).keys()].filter(
      (e) => winningTickets.indexOf(e) == -1
    );

    await stackOsNFTgen2.mapOutWinningTickets(0, PRIZES);

    await stackOsNFTgen2.changeTicketStatus();
  });

  it("Deploy stackOsNFT generation 3 from manager", async function () {
    PRIZES = 2;
    stackOsNFTgen3 = await deployStackOS();
  });

  // it("Try to buy directly using transferFromLastGen", async function () {
  //   await expect(
  //     stackOsNFTgen3.transferFromLastGen(owner.address, parseEther("10.0"))
  //   ).to.be.revertedWith("Not Correct Address");
  // });

  // it("Transfer tickets that did not win from gen 2 to gen 3", async function () {
  //   print("not winning tickets to be transferred: " + notWinning);
  //   print(
  //     "gen2 balance: " +
  //       (await stackToken.balanceOf(stackOsNFTgen2.address))
  //   );
  //   print(
  //     "gen3 balance: " +
  //       (await stackToken.balanceOf(stackOsNFTgen3.address))
  //   );
  //   await stackOsNFTgen2.transferTicket(notWinning, stackOsNFTgen3.address);
  //   expect(await stackToken.balanceOf(stackOsNFTgen2.address)).to.be.equal(
  //     parseEther("1.0")
  //   );
  //   expect(await stackToken.balanceOf(stackOsNFTgen3.address)).to.be.equal(
  //     parseEther("0.4")
  //   );
  //   print("Tickets transfered!");
  //   print(
  //     "gen2 balance: " +
  //       (await stackToken.balanceOf(stackOsNFTgen2.address))
  //   );
  //   print(
  //     "gen3 balance: " +
  //       (await stackToken.balanceOf(stackOsNFTgen3.address))
  //   );
  // });
  // it("Play lottery with transferred tickets", async function () {
  //   await link.transfer(stackOsNFTgen3.address, parseEther("10.0"));
  //   requestID = await stackOsNFTgen3.callStatic.announceLottery();
  //   await stackOsNFTgen3.announceLottery();
  //   print(requestID);
  //   expect(await stackOsNFTgen3.ticketOwner(1)).to.be.equal(owner.address);

  //   await coordinator.callBackWithRandomness(
  //     requestID,
  //     89765,
  //     stackOsNFTgen3.address
  //   );
  //   var randomNumber = await stackOsNFTgen3.randomNumber();
  //   print(randomNumber);

  //   await stackOsNFTgen3.announceWinners(100);

  //   winningTickets = [];
  //   for (let i = 0; i < PRIZES; i++) {
  //     winningTickets.push((await stackOsNFTgen3.winningTickets(i)).toNumber());
  //   }
  //   // get NOT winning tickets
  //   notWinning = [...Array(4).keys()].filter(
  //     (e) => winningTickets.indexOf(e) == -1
  //   );
  //   print("winning tickets: " + winningTickets);

  //   await stackOsNFTgen3.mapOutWinningTickets(0, PRIZES);

  //   await stackOsNFTgen3.changeTicketStatus();

  //   await expect(stackOsNFTgen3.claimReward(notWinning)).to.be.revertedWith(
  //     "Awarded Or Not Won"
  //   );
  //   await stackOsNFTgen3.claimReward(winningTickets);
  //   expect(await stackOsNFTgen3.balanceOf(owner.address)).to.be.equal(
  //     winningTickets.length
  //   );

  //   print(
  //     "Balance Before Return Stake: " +
  //       (await stackToken.balanceOf(owner.address))
  //   );
  //   await stackOsNFTgen3.returnStake(notWinning);
  //   print(
  //     "Balance After Return Stake: " +
  //       (await stackToken.balanceOf(owner.address))
  //   );
  // });
  it("Admin tried to withdraw before time lock expires.", async function () {
    var adminWithdrawableAmount = await stackOsNFT.adminWithdrawableAmount();
    print(adminWithdrawableAmount);
    await expect(stackOsNFT.adminWithdraw()).to.be.revertedWith("Locked!");
  });

  it("Admin withdraws after time lock.", async function () {
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      deadline + TIMELOCK,
    ]);
    await stackOsNFT.adminWithdraw();
  });
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
