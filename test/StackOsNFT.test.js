const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("@ethersproject/bignumber");
const { parseEther, formatEther } = require("@ethersproject/units");
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
  it("Deploy stackToken", async function () {
    const ERC20 = await ethers.getContractFactory("TestCurrency");
    stackToken = await ERC20.deploy(parseEther("1000.0"));
    await stackToken.deployed();
  });
  it("Deploy fake USDT", async function () {
    ERC20 = await ethers.getContractFactory("TestCurrency");
    usdt = await ERC20.deploy(parseEther("100000000.0"));
    await usdt.deployed();
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
  it("Deploy GenerationManager", async function () {
    const GenerationManager = await ethers.getContractFactory(
      "GenerationManager"
    );
    generationManager = await GenerationManager.deploy();
    await generationManager.deployed();
    console.log(generationManager.address);
  });
  it("Deploy DarkMatter", async function () {
    GENERATION_MANAGER_ADDRESS = generationManager.address;
    MASTER_NODE_PRICE = 50;
    const DarkMatter = await ethers.getContractFactory("DarkMatter");
    darkMatter = await DarkMatter.deploy(
      GENERATION_MANAGER_ADDRESS,
      MASTER_NODE_PRICE
    );
    await darkMatter.deployed();
    console.log(darkMatter.address);
  });
  it("Deploy subscription", async function () {
    PAYMENT_TOKEN = usdt.address;
    STACK_TOKEN_FOR_PAYMENT = stackToken.address;
    GENERATION_MANAGER_ADDRESS = generationManager.address;
    MASTER_NODE_ADDRESS = darkMatter.address;
    ROUTER_ADDRESS = router.address;
    TAX_ADDRESS = tax.address;

    SUBSCRIPTION_PRICE = parseEther("10.0");
    BONUS_PECENT = 2000;
    TAX_REDUCTION_PERCENT = 2500; // 25% means: 1month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
    TAX_RESET_DEADLINE = 60 * 60 * 24 * 7; // 1 week

    const Subscription = await ethers.getContractFactory("Subscription");
    subscription = await Subscription.deploy(
      PAYMENT_TOKEN,
      STACK_TOKEN_FOR_PAYMENT,
      GENERATION_MANAGER_ADDRESS,
      MASTER_NODE_ADDRESS,
      ROUTER_ADDRESS,
      TAX_ADDRESS,
      TAX_RESET_DEADLINE,
      SUBSCRIPTION_PRICE,
      BONUS_PECENT,
      TAX_REDUCTION_PERCENT
    );
    await subscription.deployed();
    await subscription.setPrice(SUBSCRIPTION_PRICE);
    await subscription.setBonusPercent(BONUS_PECENT);
    await subscription.setTaxReductionPercent(TAX_REDUCTION_PERCENT);
    await subscription.setTaxResetDeadline(TAX_RESET_DEADLINE);
    MONTH = (await subscription.MONTH()).toNumber();
  });
  it("Deploy StackOS NFT", async function () {
    NAME = "STACK OS NFT";
    SYMBOL = "SON";
    STACK_TOKEN_FOR_PAYMENT = stackToken.address;
    MASTER_NODE_ADDRESS = darkMatter.address;
    PRICE = parseEther("0.1");
    MAX_SUPPLY = 25;
    PRIZES = 10;
    AUCTIONED_NFTS = 10;
    VRF_COORDINATOR = coordinator.address;
    LINK_TOKEN = link.address;
    KEY_HASH =
      "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
    FEE = parseEther("0.1");
    MINT_FEE = 2000;
    TRANSFER_DISCOUNT = 2000;
    TIMELOCK = 6442850;
    StackOS = await ethers.getContractFactory("StackOsNFT");
    stackOsNFT = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      KEY_HASH,
      TRANSFER_DISCOUNT,
      TIMELOCK
    );
    await stackOsNFT.deployed();
    await generationManager.add(stackOsNFT.address);
    await stackOsNFT.adjustAddressSettings(generationManager.address, router.address, subscription.address);
    await stackOsNFT.setMintFee(MINT_FEE); // usdt

    await stackOsNFT.addPaymentToken(usdt.address); // usdt
    // await stackOsNFT.addPaymentToken("0xdAC17F958D2ee523a2206206994597C13D831ec7"); // usdt
    await stackOsNFT.addPaymentToken("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"); // usdc
    await stackOsNFT.addPaymentToken("0x6B175474E89094C44Da98b954EedeAC495271d0F"); // dai 
  });
  it("Stake for tickets", async function () {
    await stackToken.approve(stackOsNFT.address, parseEther("10.0"));

    await expect(stackOsNFT.stakeForTickets(2)).to.be.revertedWith(
      "Lottery inactive"
    );
    await stackOsNFT.activateLottery();
    await stackOsNFT.stakeForTickets(14);

    expect(await stackToken.balanceOf(owner.address)).to.be.equal(
      parseEther("998.6")
    );
    expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
      parseEther("1.4")
    );
  });
  it("Start lottery", async function () {
    await link.transfer(stackOsNFT.address, parseEther("10.0"));
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
    console.log("Balance Before Return Stake: " + balanceBefore.toString());

    await stackOsNFT.returnStake(notWinning);
    var balanceAfter = await stackToken.balanceOf(owner.address);
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
    await expect(stackOsNFT.partnerMint(4, stackToken.address)).to.be.revertedWith(
      "Sales not started"
    );
    await stackOsNFT.startPartnerSales();
    await expect(stackOsNFT.partnerMint(4, usdt.address)).to.be.revertedWith(
      "Amount Too Big"
    );
  });

  it("Partners mint", async function () {
    console.log(formatEther(await stackToken.balanceOf(stackOsNFT.address)));

    await stackOsNFT.whitelistPartner(joe.address, 2);
    await stackToken.transfer(joe.address, parseEther("2.0"));
    await stackToken.connect(joe).approve(stackOsNFT.address, parseEther("2.0"));
    await expect(stackOsNFT.connect(joe).partnerMint(4, stackToken.address)).to.be.revertedWith(
      "Amount Too Big"
    );
    await stackOsNFT.connect(joe).partnerMint(2, stackToken.address);
    expect(await stackOsNFT.balanceOf(joe.address)).to.be.equal(2);
    expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
      parseEther("1.16")
    );
  });

  it("Add liquidity", async function () {
    await stackToken.approve(router.address, parseEther("100.0"));
    await usdt.approve(router.address, parseEther("100.0"));
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
  });

  it("Partners mint for usdt", async function () {
    console.log(formatEther(await stackToken.balanceOf(stackOsNFT.address)));
    await stackOsNFT.whitelistPartner(owner.address, 1);
    await usdt.approve(stackOsNFT.address, parseEther("2.0"));
    await stackOsNFT.partnerMint(1, usdt.address);
    console.log(formatEther(await stackToken.balanceOf(stackOsNFT.address)));
    // expect(await stackToken.balanceOf(stackOsNFT.address)).to.be.equal(
    //   parseEther("1.24")
    // );
  });
  
  it("Owners can delegate their NFTs", async function () {
    expect(await stackOsNFT.getDelegatee(0)).to.equal(
      ethers.constants.AddressZero
    );
    await stackOsNFT.delegate(joe.address, 0);
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
    //   // console.log(formatEther(await stackToken.balanceOf(owner.address)))
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
    stackOsNFTgen2 = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      KEY_HASH,
      TRANSFER_DISCOUNT,
      TIMELOCK
    );
    await stackOsNFTgen2.deployed();
    await generationManager.add(stackOsNFTgen2.address);
    await stackOsNFTgen2.adjustAddressSettings(generationManager.address, router.address, subscription.address);
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
    console.log(requestID);
    expect(await stackOsNFTgen2.ticketOwner(1)).to.be.equal(owner.address);

    //"Start lottery"
    await coordinator.callBackWithRandomness(
      requestID,
      89765,
      stackOsNFTgen2.address
    );
    var randomNumber = await stackOsNFTgen2.randomNumber();
    console.log(randomNumber.toString());

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
    stackOsNFTgen3 = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      MASTER_NODE_ADDRESS,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      KEY_HASH,
      TRANSFER_DISCOUNT,
      TIMELOCK
    );
    await stackOsNFTgen3.deployed();
    await generationManager.add(stackOsNFTgen3.address);
    await stackOsNFTgen3.adjustAddressSettings(generationManager.address, router.address, subscription.address);
  });

  it("Try to buy directly using transferFromLastGen", async function () {
    await expect(
      stackOsNFTgen3.transferFromLastGen(owner.address, parseEther("10.0"))
    ).to.be.revertedWith("Not Correct Address");
  });

  it("Transfer tickets that did not win from gen 2 to gen 3", async function () {
    console.log("not winning tickets to be transferred: " + notWinning);
    console.log(
      "gen2 balance: " +
        formatEther(await stackToken.balanceOf(stackOsNFTgen2.address))
    );
    console.log(
      "gen3 balance: " +
        formatEther(await stackToken.balanceOf(stackOsNFTgen3.address))
    );
    await stackOsNFTgen2.transferTicket(notWinning, stackOsNFTgen3.address);
    expect(await stackToken.balanceOf(stackOsNFTgen2.address)).to.be.equal(
      parseEther("1.0")
    );
    expect(await stackToken.balanceOf(stackOsNFTgen3.address)).to.be.equal(
      parseEther("0.4")
    );
    console.log("Tickets transfered!");
    console.log(
      "gen2 balance: " +
        formatEther(await stackToken.balanceOf(stackOsNFTgen2.address))
    );
    console.log(
      "gen3 balance: " +
        formatEther(await stackToken.balanceOf(stackOsNFTgen3.address))
    );
  });
  it("Play lottery with transferred tickets", async function () {
    await link.transfer(stackOsNFTgen3.address, parseEther("10.0"));
    requestID = await stackOsNFTgen3.callStatic.announceLottery();
    await stackOsNFTgen3.announceLottery();
    console.log(requestID);
    expect(await stackOsNFTgen3.ticketOwner(1)).to.be.equal(owner.address);

    await coordinator.callBackWithRandomness(
      requestID,
      89765,
      stackOsNFTgen3.address
    );
    var randomNumber = await stackOsNFTgen3.randomNumber();
    console.log(randomNumber.toString());

    await stackOsNFTgen3.announceWinners(100);

    winningTickets = [];
    for (let i = 0; i < PRIZES; i++) {
      winningTickets.push((await stackOsNFTgen3.winningTickets(i)).toNumber());
    }
    // get NOT winning tickets
    notWinning = [...Array(4).keys()].filter(
      (e) => winningTickets.indexOf(e) == -1
    );
    console.log("winning tickets: " + winningTickets);

    await stackOsNFTgen3.mapOutWinningTickets(0, PRIZES);

    await stackOsNFTgen3.changeTicketStatus();

    await expect(stackOsNFTgen3.claimReward(notWinning)).to.be.revertedWith(
      "Awarded Or Not Won"
    );
    await stackOsNFTgen3.claimReward(winningTickets);
    expect(await stackOsNFTgen3.balanceOf(owner.address)).to.be.equal(
      winningTickets.length
    );

    console.log(
      "Balance Before Return Stake: " +
        formatEther(await stackToken.balanceOf(owner.address))
    );
    await stackOsNFTgen3.returnStake(notWinning);
    console.log(
      "Balance After Return Stake: " +
        formatEther(await stackToken.balanceOf(owner.address))
    );
  });
  it("Admin tried to withdraw before time lock expires.", async function () {
    var adminWithdrawableAmount = await stackOsNFT.adminWithdrawableAmount();
    console.log(adminWithdrawableAmount.toString());
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