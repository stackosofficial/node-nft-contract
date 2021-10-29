const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("@ethersproject/bignumber");
// const timeMachine = require("@atixlabs/hardhat-time-n-mine");

describe("StackOS NFT", function () {
  const parse = ethers.utils.parseEther;
  const format = ethers.utils.formatEther;
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, joe] = await hre.ethers.getSigners();
  });
  it("Deploy TestCurrency", async function () {
    const ERC20 = await ethers.getContractFactory("TestCurrency");
    currency = await ERC20.deploy(parse("1000.0"));
    await currency.deployed();
  });
  it("Deploy fake LINK", async function () {
    const ERC20_2 = await ethers.getContractFactory("LinkToken");
    link = await ERC20_2.deploy();
    await link.deployed();
    console.log(link.address);
  });
  it("Deploy VRF Coordinator", async function () {
    const Coordinator = await ethers.getContractFactory("VRFCoordinatorMock");
    coordinator = await Coordinator.deploy(link.address);
    await coordinator.deployed();
    console.log(coordinator.address);
  });
  it("Deploy StackOS NFT", async function () {
    NAME = "STACK OS NFT";
    SYMBOL = "SON";
    STACK_TOKEN_FOR_PAYMENT = currency.address;
    PRICE = parse("0.1");
    MAX_SUPPLY = 25;
    PRIZES = 10;
    AUCTIONED_NFTS = 10;
    VRF_COORDINATOR = coordinator.address;
    LINK_TOKEN = link.address;
    KEY_HASH =
      "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
    FEE = parse("0.1");

    const StackOS = await ethers.getContractFactory("StackOsNFT");
    stackOsNFT = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      VRF_COORDINATOR,
      LINK_TOKEN,
      KEY_HASH,
      FEE
    );
    await stackOsNFT.deployed();
  });
  it("Stake for tickets", async function () {
    await currency.approve(stackOsNFT.address, parse("10.0"));

    await expect(stackOsNFT.stakeForTickets(2)).to.be.revertedWith(
      "Lottery inactive"
    );
    await stackOsNFT.activateLottery();
    await stackOsNFT.stakeForTickets(14);

    expect(await currency.balanceOf(owner.address)).to.be.equal(parse("998.6"));
    expect(await currency.balanceOf(stackOsNFT.address)).to.be.equal(
      parse("1.4")
    );
  });
  it("Start lottery", async function () {
    await link.transfer(stackOsNFT.address, parse("10.0"));
    requestID = await stackOsNFT.callStatic.announceLottery();
    await stackOsNFT.callStatic.announceLottery();
    console.log(requestID);
    expect(await stackOsNFT.ticketOwner(1)).to.be.equal(owner.address);
  });

  it("Start lottery", async function () {
    await coordinator.callBackWithRandomness(
      requestID,
      89765,
      stackOsNFT.address
    );
    var randomNumber = await stackOsNFT.randomNumber();
    console.log(randomNumber.toString());
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
    console.log(winningTickets, notWinning);

    await expect(stackOsNFT.claimReward(winningTickets)).to.be.revertedWith(
      "Not Assigned Yet!"
    );
    await expect(stackOsNFT.returnStake(notWinning)).to.be.revertedWith(
      "Not Assigned Yet!"
    );
  });
  it("Map out winners", async function () {
    await stackOsNFT.mapOutWinningTickets(0, 10);
  });

  it("changeTicketStatus()", async function () {
    await stackOsNFT.changeTicketStatus();
  });

  it("Try to return stake of tickets that won!", async function () {
    await expect(stackOsNFT.returnStake(winningTickets)).to.be.revertedWith(
      "Stake Not Returnable"
    );
  });
  it("Try to return stake of tickets that did not win won!", async function () {
    var balanceBefore = await currency.balanceOf(owner.address);
    console.log("Balance Before Return Stake: " + balanceBefore.toString());

    await stackOsNFT.returnStake(notWinning);
    var balanceAfter = await currency.balanceOf(owner.address);
    console.log("Balance After Return Stake: " + balanceAfter.toString());
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

  it("Partners mint", async function () {
    console.log(format(await currency.balanceOf(stackOsNFT.address)));

    await stackOsNFT.whitelistPartner(joe.address, 2);
    await currency.transfer(joe.address, parse("2.0"));
    await currency.connect(joe).approve(stackOsNFT.address, parse("2.0"));
    await expect(stackOsNFT.connect(joe).partnerMint(4)).to.be.revertedWith(
      "Amount Too Big"
    );
    await stackOsNFT.connect(joe).partnerMint(2);
    expect(await stackOsNFT.balanceOf(joe.address)).to.be.equal(2);
    expect(await currency.balanceOf(stackOsNFT.address)).to.be.equal(
      parse("1.2")
    );
  });

  it("Owners can delegate their NFTs", async function () {
    expect(await stackOsNFT.getDelegatee(0)).to.equal(
      ethers.constants.AddressZero
    );
    await stackOsNFT.delegate(joe.address, 0);
    expect(await stackOsNFT.getDelegatee(0)).to.equal(joe.address);
  });

  it("Bid on Auction before it's open", async function () {
    await currency.approve(stackOsNFT.address, parse("100.0"));
    await expect(stackOsNFT.placeBid(parse("1.0"))).to.be.revertedWith(
      "Auction closed!"
    );
  });

  it("Open Auction for bidding", async function () {

    deadline = Math.floor(Date.now() / 1000) + 1000;
    console.log(deadline, Date.now());
    await stackOsNFT.adjustAuctionCloseTime(deadline);
  });

  it("Auction", async function () {
    //   // console.log(format(await currency.balanceOf(owner.address)))
    await stackOsNFT.placeBid(parse("1.0"));
    await stackOsNFT.placeBid(parse("1.0"));
    await stackOsNFT.placeBid(parse("2.0"));
    await stackOsNFT.placeBid(parse("5.0"));
    await stackOsNFT.placeBid(parse("3.0"));
    await stackOsNFT.placeBid(parse("10.0"));
    await stackOsNFT.placeBid(parse("15.0"));
    await stackOsNFT.placeBid(parse("5.0"));
    await stackOsNFT.placeBid(parse("1.0"));
    await stackOsNFT.placeBid(parse("9.0"));
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

  it("Admin tried to withdraw before time lock expires.", async function () {
    var adminWithdrawableAmount = await stackOsNFT.adminWithdrawableAmount();
    console.log(adminWithdrawableAmount.toString());
    await expect(stackOsNFT.adminWithdraw()).to.be.revertedWith("Locked!");
  });

  it("Admin withdraws after time lock.", async function () {
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline + 3600]);
    await stackOsNFT.adminWithdraw();
  });
});