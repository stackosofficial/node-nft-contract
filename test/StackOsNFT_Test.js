const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

describe("StackOS NFT", function () {
  const parse = ethers.utils.parseEther;
  const format = ethers.utils.formatEther;
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    accounts = await hre.ethers.getSigners();
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
    MAX_SUPPLY = 5;
    PRIZES = 2;
    URI_LINK = "https://google.com/";

    const StackOS = await ethers.getContractFactory("StackOsNFT");
    stackOsNFT = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      URI_LINK
    );
    await stackOsNFT.deployed();
  });
  it("Stake for tickets", async function () {
    await currency.approve(stackOsNFT.address, parse("2.0"));
    
    await expect(stackOsNFT.stakeForTickets(2)).to.be.revertedWith("Lottery inactive");
    await stackOsNFT.activateLottery();
    await stackOsNFT.stakeForTickets(4);

    expect(await currency.balanceOf(accounts[0].address)).to.be.equal(parse("999.6"));
    expect(await currency.balanceOf(stackOsNFT.address)).to.be.equal(parse("0.4"));
  });
  it("Start lottery", async function () {
    await link.transfer(stackOsNFT.address, parse("10.0"));
    await stackOsNFT.announceLottery();
    expect(await stackOsNFT.ticketOwner(1)).to.be.equal(accounts[0].address);
    await expect(stackOsNFT.claimReward([0, 1])).to.be.reverted;
    await expect(stackOsNFT.returnStake([0, 1])).to.be.reverted;
  });
  it("Announce winners", async function () {
    await stackOsNFT.announceWinners(1);
    await expect(stackOsNFT.claimReward([0, 1])).to.be.reverted;
    await expect(stackOsNFT.returnStake([0, 1])).to.be.reverted;
    // console.log(await stackOsNFT.winningTickets(0));
    // console.log(await stackOsNFT.winningTickets(1));
    // console.log(await stackOsNFT.winningTickets(2));
  });
  it("Map out winners", async function () {
    await stackOsNFT.mapOutWinningTickets(); 
  });
  it("Return stake", async function () {
    winningTickets = [];
    ticketStatus = [];
    for(let i = 0; i < PRIZES; i++) {
      winningTickets.push((await stackOsNFT.winningTickets(i)).toNumber());
    }
    for(let i = 0; i < 4; i++) {
      ticketStatus.push(await stackOsNFT.ticketStatus(i));
    }
    console.log(ticketStatus, winningTickets);

    // get tickets that doesn't exists in winningTickets, so they are NOT winning
    notWinning = [ ...Array(4).keys() ].filter(e => winningTickets.indexOf(e) == -1)
    console.log(notWinning);

    await expect(stackOsNFT.returnStake(winningTickets)).to.be.revertedWith("Ticket Stake Not Returnable");
    await stackOsNFT.returnStake(notWinning);
    await expect(stackOsNFT.returnStake(notWinning)).to.be.revertedWith("Ticket Stake Not Returnable");

    // this should be calculated at runtime
    // expect(await currency.balanceOf(accounts[0].address)).to.be.equal(parse("999.9"));
    // expect(await currency.balanceOf(stackOsNFT.address)).to.be.equal(parse("0.4"));
  });
  it("Claim reward", async function () {
    await expect(stackOsNFT.claimReward(notWinning)).to.be.revertedWith("Ticket Did not win!");
    // it reverts when passing duplicates, so with 'Set' we get only unique indexes
    uniqueWinning = [ ...new Set(winningTickets) ];
    await stackOsNFT.claimReward(uniqueWinning);
    console.log((await stackOsNFT.balanceOf(accounts[0].address)).toNumber(), uniqueWinning.length);
    expect(await stackOsNFT.balanceOf(accounts[0].address)).to.be.equal(uniqueWinning.length)
  })
});
