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
    [owner, partner, joe, bank, bob, vera, dude]= await hre.ethers.getSigners();
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
    // generation 2
    stackOsNFTgen2 = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      URI_LINK
    );
    await stackOsNFTgen2.deployed();
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
  it("Mint some NFTs", async function () {
    await currency.transfer(partner.address, parse("100.0"));
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(partner.address, true, 3);
    await currency.connect(partner).approve(stackOsNFT.address, parse("10.0"));
    await stackOsNFT.connect(partner).partnerMint(3);
  })
  it("Bank takes percent", async function () {
    await owner.sendTransaction({
        from: owner.address,
        to: royalty.address,
        value: parse("2.0")
    });
    expect(await bank.getBalance()).to.be.gt(parse("10000.19"))
    expect(await provider.getBalance(royalty.address)).to.equal(parse("1.8"))
  })
  it("Royalty can be claimed only if NFT was delegated a month ago and before royalty deposited", async function () { 
    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parse("2.0")
    });
    await expect(royalty.connect(partner).claim(0, [0])).to.be.revertedWith("Too early");
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // at this point first cycle have enough royalty and passed time, but no delegates
    await provider.send("evm_mine");
    await expect(royalty.connect(partner).claim(0, [0])).to.be.revertedWith("NFT should be delegated"); // cycle dont start since transaction reverted
    await stackOsNFT.connect(partner).delegate(owner.address, 0); // first cycle is special, it won't start if delegates dont exist!

    await expect(royalty.connect(partner).claim(0, [0])).to.be.revertedWith("Nothing to claim");
    // first cycle start at this transfer, its startTimestamp resets to current block, 
    // means we have enough delegates and eth, but not enough time to start next cycle (2)
    // so to start cycle 2 we need time to pass
    await expect(joe.sendTransaction({ // this will go in first cycle
        from: joe.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // first cycle can end in next claim or deposit
    await provider.send("evm_mine");
    await stackOsNFT.connect(partner).delegate(owner.address, 2); // this delegate will go in cycle 2, because cycle 1 started earlier
    console.log(format(await partner.getBalance()), format(await provider.getBalance(royalty.address)));
    await expect(royalty.connect(partner).claim(0, [0])).to.be.not.reverted; //(claim 5.4 eth) second cycle starts, it counts 2 delegated tokens
    console.log(format(await partner.getBalance()), format(await provider.getBalance(royalty.address)));
    await expect(joe.sendTransaction({ // enough eth for cycle 2 to end
        from: joe.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // enough time for cycle 2 to end
    await provider.send("evm_mine");
    await stackOsNFT.connect(partner).delegate(stackOsNFT.address, 1); // will claim this later, this delegate will be counted from cycle 3

    expect(await partner.getBalance()).to.be.lt(parse("10006.0")); 
    await expect(royalty.connect(partner).claim(0, [0])).to.be.not.reverted; // (claim 0.9 eth, 6.3 total) third cycle starts here
    expect(await partner.getBalance()).to.be.gt(parse("10006.0")); 
    console.log(format(await partner.getBalance()), format(await provider.getBalance(royalty.address)));
  })
  it("Can't claim claimed", async function () {
    await expect(royalty.connect(partner).claim(0, [0])).to.be.revertedWith("Nothing to claim"); // claimed for 2 cycles, 3 is still growing
  })
  it("Multiple claimers", async function () {
    await stackOsNFT.whitelistPartner(vera.address, true, 2);
    await stackOsNFT.whitelistPartner(bob.address, true, 2);
    await stackOsNFT.whitelistPartner(owner.address, true, 2);

    await currency.transfer(vera.address, parse("100.0"));
    await currency.transfer(bob.address, parse("100.0"));
    await dude.sendTransaction({ // this should be divided by 3 previous delegates 
        from: dude.address,
        to: royalty.address,
        value: parse("100.0")
    });
    await currency.connect(bob).approve(stackOsNFT.address, parse("5.0"));
    await stackOsNFT.connect(bob).partnerMint(1);
    await currency.connect(vera).approve(stackOsNFT.address, parse("5.0"));
    await stackOsNFT.connect(vera).partnerMint(1);
    await currency.approve(stackOsNFT.address, parse("5.0"));
    await stackOsNFT.partnerMint(1);

    await expect(royalty.claim(0, [0])).to.be.reverted;
    await expect(royalty.connect(vera).claim(0, [4])).to.be.revertedWith("NFT should be delegated");
    // these 3 delegates will be counted in 4 cycle
    await stackOsNFT.connect(bob).delegate(stackOsNFT.address, 3); 
    await stackOsNFT.connect(vera).delegate(stackOsNFT.address, 4);
    await stackOsNFT.delegate(stackOsNFT.address, 5);

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // third can end, with 100 eth
    await provider.send("evm_mine");
    await expect(dude.sendTransaction({ // fourth cycle start with 2 eth
        from: dude.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // fourth can end
    await provider.send("evm_mine");
    console.log(format(await partner.getBalance()), format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()))
    await royalty.claim(0, [5]); // fifth cycle start
    await royalty.connect(bob).claim(0, [3]);
    await royalty.connect(vera).claim(0, [4]);
    await royalty.connect(partner).claim(0, [0, 1, 2]); 
    console.log(format(await partner.getBalance()), format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()))

    expect(await bob.getBalance()).to.be.gt(parse("10000.28")) // should be ((2 - 10% fee) / 6 tokens) = 0.3, but transfer fees also here... 
    expect(await vera.getBalance()).to.be.gt(parse("10000.28"))
    expect(await partner.getBalance()).to.be.gt(parse("10090.0"))
  })
  it("StackOS generation 2 with multiple claimers", async function () {


    await expect(dude.sendTransaction({ // fifth cycle get 6 eth
        from: dude.address,
        to: royalty.address,
        value: parse("6.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // fifth cycle can end
    await provider.send("evm_mine");

    await stackOsNFT.connect(bob).partnerMint(1);
    await stackOsNFT.connect(vera).partnerMint(1);
    await stackOsNFT.partnerMint(1);

    await stackOsNFTgen2.whitelistPartner(vera.address, true, 2);
    await stackOsNFTgen2.whitelistPartner(bob.address, true, 2);
    await stackOsNFTgen2.whitelistPartner(owner.address, true, 2);
    await stackOsNFTgen2.startPartnerSales();

    await currency.connect(bob).approve(stackOsNFTgen2.address, parse("5.0"));
    await stackOsNFTgen2.connect(bob).partnerMint(1);
    await currency.connect(vera).approve(stackOsNFTgen2.address, parse("5.0"));
    await stackOsNFTgen2.connect(vera).partnerMint(1);
    await currency.approve(stackOsNFTgen2.address, parse("5.0"));
    await stackOsNFTgen2.partnerMint(1);

    await stackOsNFT.connect(bob).delegate(stackOsNFT.address, 6); 
    await stackOsNFT.connect(vera).delegate(stackOsNFT.address, 7);
    await stackOsNFT.delegate(stackOsNFT.address, 8);

    await stackOsNFTgen2.connect(bob).delegate(stackOsNFTgen2.address, 0);
    await stackOsNFTgen2.connect(vera).delegate(stackOsNFTgen2.address, 1);
    await stackOsNFTgen2.delegate(stackOsNFTgen2.address, 2);

    await expect(dude.sendTransaction({ // sixth cycle start
        from: dude.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // sixth cycle can end
    await provider.send("evm_mine");

    console.log(format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()))
    await royalty.connect(bob).claim(0, [6]); // seventh cycle start (should have zero-based index 6 internally)
    await royalty.connect(vera).claim(0, [7]); 
    await royalty.claim(0, [8]);
    console.log(format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()))

    // For now, when this function called does matter
    await royalty.addNextGeneration(stackOsNFTgen2.address); //in past and current cycle delegates of gen2 not counted 
    console.log("balance after add generation: ", format(await provider.getBalance(royalty.address)));

    await expect(royalty.claim(1, [2])).to.be.revertedWith("Nothing to claim");

    // console.log(format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()))
    await royalty.claim(0, [5]); 
    await royalty.connect(bob).claim(0, [3]);
    await royalty.connect(vera).claim(0, [4]); 
    await royalty.connect(partner).claim(0, [0, 1, 2]); 
    // console.log(format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()));

    await expect(dude.sendTransaction({
        from: dude.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]);
    await provider.send("evm_mine");

    await royalty.connect(bob).claim(0, [6]); // 8 cycle start (index 7) // gen2 delegates counted, should be 12 total
    await royalty.connect(vera).claim(0, [7]); 
    await royalty.claim(0, [8]);

    await expect(royalty.claim(1, [2])).to.be.revertedWith("Nothing to claim");
    // await royalty.connect(bob).claim(1, [0]);
    // await royalty.connect(vera).claim(1, [1]); 
    // await royalty.claim(1, [2]); 

    await royalty.claim(0, [5]); 
    await royalty.connect(bob).claim(0, [3]);
    await royalty.connect(vera).claim(0, [4]); 
    await royalty.connect(partner).claim(0, [0, 1, 2]); 

    await expect(dude.sendTransaction({ // this go in cycle 8
        from: dude.address,
        to: royalty.address,
        value: parse("1000.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]);
    await provider.send("evm_mine");
    
    await royalty.connect(bob).claim(0, [6]); // 9 cycle start (index 8), now generation2 tokens can claim for cycle 8
    await royalty.connect(vera).claim(0, [7]); 
    await royalty.claim(0, [8]);

    await royalty.connect(bob).claim(1, [0]);
    await royalty.connect(vera).claim(1, [1]); 
    await royalty.claim(1, [2]); 

    await royalty.claim(0, [5]); 
    await royalty.connect(bob).claim(0, [3]);
    await royalty.connect(vera).claim(0, [4]); 
    await royalty.connect(partner).claim(0, [0, 1, 2]); 

    // should be zero + last cycle unclaimed
    console.log(format(await provider.getBalance(royalty.address)));
    console.log(format(await owner.getBalance()), format(await partner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()));
    await expect(royalty.addNextGeneration(stackOsNFTgen2.address)).to.be.revertedWith("This generation already exists");
  })
});