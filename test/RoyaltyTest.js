const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");

describe("Royalty", function () {
  const parse = ethers.utils.parseEther;
  const format = ethers.utils.formatEther;
  const CYCLE_DURATION = 60*60*24*31;
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank]= await hre.ethers.getSigners();
  });
  it("Deploy TestCurrency", async function () {
    const ERC20 = await ethers.getContractFactory("TestCurrency");
    currency = await ERC20.deploy(parse("1000.0"));
    await currency.deployed();

    const ERC20_2 = await ethers.getContractFactory("TestCurrency");
    currency2 = await ERC20_2.deploy(parse("1000.0"));
    await currency2.deployed();
  })
  it("Deploy StackOS NFT", async function () {
    NAME = "STACK OS NFT";
    SYMBOL = "SON";
    STACK_TOKEN_FOR_PAYMENT = currency.address;
    PRICE = parse("0.1");
    MAX_SUPPLY = 15;
    PRIZES = 10;
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
  it("Deploy royalty", async function () {
    const Royalty = await ethers.getContractFactory("Royalty");

    royalty = await Royalty.deploy(
      stackOsNFT.address, 
      parse("1"),
      bank.address,
      1000
    );
    await royalty.deployed();
  });
  it("Bank takes percent", async function () {
    await owner.sendTransaction({
        from: owner.address,
        to: royalty.address,
        value: parse("2.0")
    });
    expect(await bank.getBalance()).to.be.gt(parse("10000.19"))
    expect(await provider.getBalance(royalty.address)).to.equal(parse("1.8"))
  })
  it("Mint some NFTs", async function () {
    await currency.transfer(partner.address, parse("100.0"));
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(partner.address, true, 2);
    await currency.connect(partner).approve(stackOsNFT.address, parse("10.0"));
    await stackOsNFT.connect(partner).partnerMint(2);
  })
  it("Royalty can be claimed only if NFT was delegated a month ago and before royalty deposited", async function () { 
    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parse("2.0")
    });
    await expect(royalty.connect(partner).claim(0, [0])).to.be.revertedWith("Too early");
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // at this point first cycle have enough royalty and passed time, thus claim or deposit functions should start next cycle
    await provider.send("evm_mine");
    await expect(royalty.connect(partner).claim(0, [0])).to.be.revertedWith("NFT should be delegated"); // cycle dont start since transaction reverted
    await stackOsNFT.connect(partner).delegate(owner.address, 0);
    await expect(royalty.connect(partner).claim(0, [0])).to.be.revertedWith("Nothing to claim");
    await expect(joe.sendTransaction({ // first cycle end, second start and get this money
        from: joe.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;
    await provider.send("evm_increaseTime", [CYCLE_DURATION]);
    await provider.send("evm_mine");
    await expect(royalty.connect(partner).claim(0, [0])).to.be.not.reverted; // third cycle starts here
    await expect(joe.sendTransaction({
        from: joe.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;
    await provider.send("evm_increaseTime", [CYCLE_DURATION]);
    await provider.send("evm_mine");
    expect(await partner.getBalance()).to.be.lt(parse("10002.0")); //10 000 + 1.6
    await expect(royalty.connect(partner).claim(0, [0])).to.be.not.reverted; // fourth cycle starts here
    expect(await partner.getBalance()).to.be.gt(parse("10003.0")); 
  })
  // it("Can't claim claimed", async function () {
  //   await expect(royalty.claim([0])).to.be.revertedWith("Nothing to claim"); // claimed for 1-3 cycles, fourth is still growing
  // })
  // it("Multiple claimers", async function () {
  //   await currency.transfer(accounts[5].address, parse("100.0"));
  //   await currency.transfer(accounts[4].address, parse("100.0"));
  //   await accounts[7].sendTransaction({
  //       from: accounts[7].address,
  //       to: royalty.address,
  //       value: parse("100.0")
  //   });
  //   await currency.connect(accounts[4]).approve(stackOsNFT.address, parse("10.0"));
  //   await stackOsNFT.connect(accounts[4]).mint();
  //   await currency.connect(accounts[5]).approve(stackOsNFT.address, parse("10.0"));
  //   await stackOsNFT.connect(accounts[5]).mint();

  //   await expect(royalty.claim([0])).to.be.reverted;
  //   await expect(royalty.connect(accounts[5]).claim([3])).to.be.revertedWith("NFT should be delegated");

  //   await stackOsNFT.connect(accounts[4]).delegate(stackOsNFT.address, 2); //we dont care about delegatee address
  //   await stackOsNFT.connect(accounts[5]).delegate(stackOsNFT.address, 3);

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]);
  //   await provider.send("evm_mine");
  //   await expect(accounts[1].sendTransaction({ // fifth cycle starts here
  //       from: accounts[1].address,
  //       to: royalty.address,
  //       value: parse("2.0")
  //   })).to.be.not.reverted;

  //   await provider.send("evm_increaseTime", [CYCLE_DURATION]);
  //   await provider.send("evm_mine");
  //   await royalty.claim([0]); // sixth cycle starts here
  //   await royalty.connect(accounts[4]).claim([2]);
  //   await royalty.connect(accounts[5]).claim([3]);

  //   // 2.0 eth should be divided by 3 users, which is 0.666 but bank takes some, so compare with 0.5
  //   expect(await accounts[4].getBalance()).to.be.gt(parse("10000.5"))
  //   expect(await accounts[5].getBalance()).to.be.gt(parse("10000.5"))
    
  //   // NOT ACTUAL ANYMORE ?! seems fixed by introducing delegatesCount for each cycle
  //   // TODO: error! this guy got only 30 (or 1/3) but he should get 90
  //   // these 60 that left will hang on balance of contract forever, 
  //   // because these guys delegated after cycle started (the one that received 100)
  //   // but when fifth cycle started, we also calculated 'ETH per NFT' value for fourth cycle
  //   // at that moment there was 1 old and 2 too young delegated NFTs
  //   // but all 3 counted in calculations! Thus this guy only got 1/3.
  //   expect(await owner.getBalance()).to.be.gt(parse("10090"))

  // })
});