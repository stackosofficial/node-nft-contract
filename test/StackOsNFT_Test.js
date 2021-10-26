const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("@ethersproject/bignumber");

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

    expect(await currency.balanceOf(owner.address)).to.be.equal(parse("999.6"));
    expect(await currency.balanceOf(stackOsNFT.address)).to.be.equal(parse("0.4"));
  });
  it("Partners can't mint", async function () {
    await expect(stackOsNFT.partnerMint(4)).to.be.revertedWith("Sales not started");
    await stackOsNFT.startSales();
    await expect(stackOsNFT.partnerMint(4)).to.be.revertedWith("Can't Mint");
  });
  it("Partners mint", async function () {

    //non-partners
    await currency.approve(stackOsNFT.address, parse("2.0"));
    await stackOsNFT.stakeForTickets(2);

    //partners
    await stackOsNFT.whitelistPartner(joe.address, true, 2);
    await currency.transfer(joe.address, parse("2.0"));
    console.log(format(await currency.balanceOf(joe.address)));
    await currency.connect(joe).approve(stackOsNFT.address, parse("2.0"));
    await expect(stackOsNFT.connect(joe).partnerMint(4)).to.be.revertedWith("Can't Mint");
    // await stackOsNFT.connect(joe).partnerMint(2);
  });
  it("Start lottery", async function () {
    await link.transfer(stackOsNFT.address, parse("10.0"));
    await stackOsNFT.announceLottery();
    expect(await stackOsNFT.ticketOwner(1)).to.be.equal(owner.address);
  });
  it("Announce winners", async function () {
    await stackOsNFT.announceWinners(1);

    winningTickets = [];
    for(let i = 0; i < PRIZES; i++) {
      winningTickets.push((await stackOsNFT.winningTickets(i)).toNumber());
    }
    // get NOT winning tickets
    notWinning = [ ...Array(4).keys() ].filter(e => winningTickets.indexOf(e) == -1)
    console.log(winningTickets, notWinning);
    // claimReward reverts when passing duplicates, so we get only unique indexes
    uniqueWinning = [ ...new Set(winningTickets) ];

    await expect(stackOsNFT.claimReward(uniqueWinning)).to.be.revertedWith(
      "Not Assigned Yet!"
    );
    await expect(stackOsNFT.returnStake(notWinning)).to.be.revertedWith(
      "Not Assigned Yet!"
      );
  });
  it("Map out winners", async function () {
    await stackOsNFT.mapOutWinningTickets(); 
  });
  it("Return stake", async function () {

    await expect(stackOsNFT.returnStake(winningTickets)).to.be.revertedWith(
      "Ticket Stake Not Returnable"
    );
    await stackOsNFT.returnStake(notWinning);
    await expect(stackOsNFT.returnStake(notWinning)).to.be.revertedWith(
      "Ticket Stake Not Returnable"
    );

    // this should be calculated at runtime because there can be arbitrary amount of winning tickets
    console.log(
      format(parse("999.6").add(PRICE.mul(notWinning.length))), 
      format(parse("0.4").sub(PRICE.mul(notWinning.length))),
      notWinning.length
    );
    expect(await currency.balanceOf(owner.address)).to.be.equal(
      parse("999.6").add(PRICE.mul(notWinning.length))
    );
    expect(await currency.balanceOf(stackOsNFT.address)).to.be.equal(
      parse("0.4").sub(PRICE.mul(notWinning.length))
    );
  });
  it("Claim reward", async function () {
    await expect(stackOsNFT.claimReward(notWinning)).to.be.revertedWith(
      "Ticket Did not win!"
    );
    await stackOsNFT.claimReward(uniqueWinning);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(
      uniqueWinning.length
    );
  })
  it("Owners can delegate their NFTs", async function () {
    expect(await stackOsNFT.getDelegatee(owner.address, 0)).to.equal(
      ethers.constants.AddressZero
    );
    await stackOsNFT.delegate(joe.address, 0);
    expect(await stackOsNFT.getDelegatee(owner.address, 0)).to.equal(
      joe.address
    );
  });
});
