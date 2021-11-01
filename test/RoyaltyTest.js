const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");

describe("Royalty", function () {
  const parse = ethers.utils.parseEther;
  const format = ethers.utils.formatEther;
  const CYCLE_DURATION = 60*60*24*31;
  it("Defining Generals", async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
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
    // generation 2
    stackOsNFTgen2 = await StackOS.deploy(
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
    await stackOsNFTgen2.deployed();
    // gen3
    stackOsNFTgen3 = await StackOS.deploy(
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
    await stackOsNFTgen3.deployed();
  });
  it("Deploy royalty", async function () {
    
    STACKOS_NFT_ADDRESS = stackOsNFT.address;
    MIN_CYCLE_ETHER = parse("1");
    DEPOSIT_FEE_ADDRESS = bank.address;
    DEPOSIT_FEE_PERCENT = 1000;
    
    const Royalty = await ethers.getContractFactory("Royalty");
    royalty = await Royalty.deploy(
      STACKOS_NFT_ADDRESS,
      MIN_CYCLE_ETHER,
      DEPOSIT_FEE_ADDRESS,
    );
    await royalty.deployed();
    await royalty.setFeePercent(DEPOSIT_FEE_PERCENT);
  });
  it("Mint some NFTs", async function () {
    await currency.transfer(partner.address, parse("100.0"));
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(partner.address, 3);
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
    await royalty.connect(partner).claim(0, [0]); // just (re)sets first cycle's timestamp
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // at this point first cycle have enough royalty and passed time, but no delegates
    await provider.send("evm_mine");
    await royalty.connect(partner).claim(0, [0]); // just (re)sets first cycle's timestamp, there is still no delegates
    await stackOsNFT.connect(partner).delegate(owner.address, 0); // first cycle is special, it won't start if delegates dont exist!

    await royalty.connect(partner).claim(0, [0]); // first cycle STARTed.
    await provider.send("evm_increaseTime", [CYCLE_DURATION / 2]); 
    await royalty.connect(partner).claim(0, [0]); // this will not reset cycle's timestamp, it's just 'empty call' 
    await provider.send("evm_increaseTime", [CYCLE_DURATION / 2]); 
    await provider.send("evm_mine");
    await royalty.connect(partner).claim(0, [0]); // second cycle STARTed

    console.log(format(await partner.getBalance()), format(await provider.getBalance(royalty.address)));
    await expect(royalty.connect(partner).claim(0, [0])).to.be.revertedWith("No royalty");

    await expect(joe.sendTransaction({ 
        from: joe.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // second cycle can end in next claim or deposit
    await provider.send("evm_mine");
    await stackOsNFT.connect(partner).delegate(owner.address, 2); // this delegate will go in cycle 3, because cycle 2 started earlier
    console.log(format(await partner.getBalance()), format(await provider.getBalance(royalty.address)));
    await expect(royalty.connect(partner).claim(0, [0])).to.be.not.reverted; //(claim 5.4 eth) third cycle starts, it counts 2 delegated tokens
    console.log(format(await partner.getBalance()), format(await provider.getBalance(royalty.address)));
    await expect(joe.sendTransaction({ // enough eth for cycle 3 to end
        from: joe.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // enough time for cycle 3 to end
    await provider.send("evm_mine");
    await stackOsNFT.connect(partner).delegate(stackOsNFT.address, 1); // will claim this later, this delegate will be counted from cycle 4

    expect(await partner.getBalance()).to.be.lt(parse("10006.0")); 
    await expect(royalty.connect(partner).claim(0, [0])).to.be.not.reverted; // 4 cycle starts here (claim 0.9 eth, 6.3 total)
    expect(await partner.getBalance()).to.be.gt(parse("10006.0")); 
    console.log(format(await partner.getBalance()), format(await provider.getBalance(royalty.address)));
  })
  it("Can't claim claimed", async function () {
    await royalty.connect(partner).claim(0, [0]); // 'empty call', already claimed for 3 cycles, 4 is still growing
  })
  it("Multiple claimers", async function () {
    await stackOsNFT.whitelistPartner(vera.address, 2);
    await stackOsNFT.whitelistPartner(bob.address, 2);
    await stackOsNFT.whitelistPartner(owner.address, 2);

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

    await expect(royalty.claim(0, [0])).to.be.revertedWith("Not owner");
    await expect(royalty.connect(vera).claim(0, [4])).to.be.revertedWith("NFT should be delegated");
    // +3 delegates for 5 cycle
    await stackOsNFT.connect(bob).delegate(stackOsNFT.address, 3); 
    await stackOsNFT.connect(vera).delegate(stackOsNFT.address, 4);
    await stackOsNFT.delegate(stackOsNFT.address, 5);

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 4 can end, with 100 eth
    await provider.send("evm_mine");
    await expect(dude.sendTransaction({ // 5 cycle start with 2 eth
        from: dude.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 5 can end
    await provider.send("evm_mine");
    console.log(format(await partner.getBalance()), format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()))
    await royalty.claim(0, [5]); // 6 cycle start
    await royalty.connect(bob).claim(0, [3]);
    await royalty.connect(vera).claim(0, [4]);
    await royalty.connect(partner).claim(0, [0, 1, 2]); 
    console.log(format(await partner.getBalance()), format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()))

    expect(await bob.getBalance()).to.be.gt(parse("10000.28")) // should be ((2 - 10% fee) / 6 tokens) = 0.3, but transfer fees also here... 
    expect(await vera.getBalance()).to.be.gt(parse("10000.28"))
    expect(await partner.getBalance()).to.be.gt(parse("10090.0"))
  })
  it("StackOS generation 2 with multiple claimers", async function () {

    await expect(dude.sendTransaction({ // 6 cycle get 6 eth
        from: dude.address,
        to: royalty.address,
        value: parse("6.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 6 cycle can end
    await provider.send("evm_mine");

    await stackOsNFT.connect(bob).partnerMint(1);
    await stackOsNFT.connect(vera).partnerMint(1);
    await stackOsNFT.partnerMint(1);

    await stackOsNFTgen2.whitelistPartner(vera.address, 2);
    await stackOsNFTgen2.whitelistPartner(bob.address, 2);
    await stackOsNFTgen2.whitelistPartner(owner.address, 2);
    await stackOsNFTgen2.startPartnerSales();

    await currency.connect(bob).approve(stackOsNFTgen2.address, parse("5.0"));
    await stackOsNFTgen2.connect(bob).partnerMint(1);
    await currency.connect(vera).approve(stackOsNFTgen2.address, parse("5.0"));
    await stackOsNFTgen2.connect(vera).partnerMint(1);
    await currency.approve(stackOsNFTgen2.address, parse("5.0"));
    await stackOsNFTgen2.partnerMint(1);

    //+6 delegates for 7 cycle
    await stackOsNFT.connect(bob).delegate(stackOsNFT.address, 6); 
    await stackOsNFT.connect(vera).delegate(stackOsNFT.address, 7);
    await stackOsNFT.delegate(stackOsNFT.address, 8);

    await stackOsNFTgen2.connect(bob).delegate(stackOsNFTgen2.address, 0);
    await stackOsNFTgen2.connect(vera).delegate(stackOsNFTgen2.address, 1);
    await stackOsNFTgen2.delegate(stackOsNFTgen2.address, 2);

    await expect(dude.sendTransaction({ // 7 cycle start
        from: dude.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 7 cycle can end
    await provider.send("evm_mine");

    console.log(format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()))
    await royalty.connect(bob).claim(0, [6]); // 8 cycle start 
    await royalty.connect(vera).claim(0, [7]); 
    await royalty.claim(0, [8]);
    console.log(format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()))

    await royalty.addNextGeneration(stackOsNFTgen2.address); //delegates of gen2 will be only counted in future cycles
    // console.log("balance after add generation: ", format(await provider.getBalance(royalty.address)));

    await royalty.claim(1, [2]);

    // console.log(format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()))
    await royalty.claim(0, [5]); 
    await royalty.connect(bob).claim(0, [3]);
    await royalty.connect(vera).claim(0, [4]); 
    await royalty.connect(partner).claim(0, [0, 1, 2]); 
    // console.log(format(await owner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()));

    await expect(dude.sendTransaction({ // for 8 cycle
        from: dude.address,
        to: royalty.address,
        value: parse("2.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 8 can end
    await provider.send("evm_mine");

    await royalty.connect(bob).claim(0, [6]); // 9 cycle start, gen2 delegates counted for it, should be 12 total
    await royalty.connect(vera).claim(0, [7]); 
    await royalty.claim(0, [8]);

    // 9 cycle not ended, can't claim gen2 for it
    let before = format(await provider.getBalance(royalty.address));
    await royalty.claim(1, [2]);
    await royalty.connect(bob).claim(1, [0]);
    await royalty.connect(vera).claim(1, [1]); 
    await royalty.claim(1, [2]); 
    expect(before).to.be.equal(format(await provider.getBalance(royalty.address)));

    await royalty.claim(0, [5]); 
    await royalty.connect(bob).claim(0, [3]);
    await royalty.connect(vera).claim(0, [4]); 
    await royalty.connect(partner).claim(0, [0, 1, 2]); 

    await expect(dude.sendTransaction({ // for cycle 9
        from: dude.address,
        to: royalty.address,
        value: parse("1000.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 9 can end
    await provider.send("evm_mine");
    
    await royalty.connect(bob).claim(0, [6]); // 10 cycle start, now generation2 tokens can claim for cycle 9
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
    expect(await provider.getBalance(royalty.address)).to.be.equal(parse("0.0"));
    console.log(format(await owner.getBalance()), format(await partner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()));
    await expect(royalty.addNextGeneration(stackOsNFTgen2.address)).to.be.revertedWith("Address already added");
  })
  it("StackOS generation 3 with multiple claimers", async function () {

    await royalty.addNextGeneration(stackOsNFTgen3.address); // gen3 will be counted in 11 cycle

    await stackOsNFTgen3.whitelistPartner(vera.address, 1);
    await stackOsNFTgen3.whitelistPartner(bob.address, 1);
    await stackOsNFTgen3.whitelistPartner(owner.address, 1);
    await stackOsNFTgen3.startPartnerSales();

    await currency.connect(bob).approve(stackOsNFTgen3.address, parse("5.0"));
    await stackOsNFTgen3.connect(bob).partnerMint(1);
    await currency.connect(vera).approve(stackOsNFTgen3.address, parse("5.0"));
    await stackOsNFTgen3.connect(vera).partnerMint(1);
    await currency.approve(stackOsNFTgen3.address, parse("5.0"));
    await stackOsNFTgen3.partnerMint(1);

    // delegates for 11 cycle
    await stackOsNFTgen3.connect(bob).delegate(stackOsNFTgen3.address, 0); 
    await stackOsNFTgen3.connect(vera).delegate(stackOsNFTgen3.address, 1);
    await stackOsNFTgen3.delegate(stackOsNFTgen3.address, 2);

    await expect(dude.sendTransaction({ // this go in 10 cycle, gen3 can't claim
        from: dude.address,
        to: royalty.address,
        value: parse("1000.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 10 can end
    await provider.send("evm_mine");

    await royalty.claim(2, [2]); // 11 cycle started, though owner didn't get ether

    await royalty.connect(bob).claim(0, [6]);

    await expect(dude.sendTransaction({ // this go in 11 cycle, gen3 can claim it
        from: dude.address,
        to: royalty.address,
        value: parse("1000.0")
    })).to.be.not.reverted;

    await provider.send("evm_increaseTime", [CYCLE_DURATION]); // 11 can end
    await provider.send("evm_mine");

    await royalty.connect(bob).claim(2, [0]); // 12 cycle start (zero-based index 11)
    await royalty.connect(vera).claim(2, [1]); 
    await royalty.claim(2, [2]);

    await royalty.connect(bob).claim(0, [6]);
    await royalty.connect(vera).claim(0, [7]); 
    await royalty.claim(0, [8]);

    await royalty.connect(bob).claim(1, [0]);
    await royalty.connect(vera).claim(1, [1]); 
    await royalty.claim(1, [2]); 

    await royalty.claim(0, [5]); 
    await royalty.connect(bob).claim(0, [3]);
    await royalty.connect(vera).claim(0, [4]); 
    await royalty.connect(partner).claim(0, [0, 1, 2]); 

    console.log(format(await provider.getBalance(royalty.address)));
    expect(await provider.getBalance(royalty.address)).to.be.equal(parse("0.0"));
    console.log(format(await owner.getBalance()), format(await partner.getBalance()), format(await bob.getBalance()), format(await vera.getBalance()));
  })
});