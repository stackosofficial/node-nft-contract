const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");
const { formatEther, parseEther } = require("@ethersproject/units");

use(solidity);

describe("Subscription", function () {

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer, van]= await hre.ethers.getSigners();
    router = await ethers.getContractAt(
      "IUniswapV2Router02", 
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
  });

  it("Deploy fake StackToken", async function () {
    ERC20 = await ethers.getContractFactory("TestCurrency");
    stackToken = await ERC20.deploy(parseEther("1000000.0"));
    await stackToken.deployed();
  })

  it("Deploy USDT", async function () {
    usdt = await ERC20.deploy(parseEther("1000000.0"));
    await usdt.deployed();
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
    STACK_TOKEN_FOR_PAYMENT = stackToken.address;
    PRICE = parseEther("0.1");
    MAX_SUPPLY = 25;
    PRIZES = 10;
    AUCTIONED_NFTS = 10;
    VRF_COORDINATOR = coordinator.address;
    LINK_TOKEN = link.address;
    KEY_HASH =
      "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
    FEE = parseEther("0.1");

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

    stackOsNFTGen2 = await StackOS.deploy(
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
    await stackOsNFTGen2.deployed();
 
  });

  it("Deploy subscription", async function () {
    
    PAYMENT_TOKEN = usdt.address;
    STACK_TOKEN_FOR_PAYMENT = stackToken.address;
    STACKOS_NFT_ADDRESS = stackOsNFT.address;
    ROUTER_ADDRESS = router.address;
    TAX_ADDRESS = tax.address;

    SUBSCRIPTION_PRICE = parseEther("10.0");
    BONUS_PECENT = 2000;
    TAX_REDUCTION_PERCENT = 2500; // 25% means: 1month withdraw 75% tax, 2 month 50%, 3 month 25%, 4 month 0%
    TAX_RESET_DEADLINE = 60*60*24*7; // 1 week

    const Subscription = await ethers.getContractFactory("Subscription");
    subscription = await Subscription.deploy(
      PAYMENT_TOKEN,
      STACK_TOKEN_FOR_PAYMENT,
      STACKOS_NFT_ADDRESS,
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

  it("Mint some NFTs", async function () {
    await stackToken.transfer(partner.address, parseEther("100.0"));
    await stackOsNFT.startPartnerSales();
    
    await stackOsNFT.whitelistPartner(owner.address, 4);
    await stackToken.approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.partnerMint(4);
    
    await stackOsNFT.whitelistPartner(partner.address, 1);
    await stackToken.connect(partner).approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.connect(partner).partnerMint(1);
  });

  it("Unable to withdraw without subs and foreign ids", async function () {
    await expect(subscription.withdraw(0, [0])).to.be.revertedWith(
      "No subscription"
    );
    await expect(subscription.withdraw(0, [4])).to.be.revertedWith(
      "Not owner"
    );
  });

  it("Unable to subscribe for 0 months or foreign ids", async function () {
    await expect(subscription.subscribe(0, 0, 0)).to.be.revertedWith(
      "Zero months not allowed"
    );
    await expect(subscription.subscribe(0, 4, 1)).to.be.revertedWith(
      "Not owner"
    );
  });

  it("Unable to subscribe and withdraw on wrong generation id", async function () {
    await expect(subscription.subscribe(1337, 0, 0)).to.be.revertedWith(
      "Wrong generation id"
    );
    await expect(subscription.withdraw(1337, [0])).to.be.revertedWith(
      "Wrong generation id"
    );
  });

  it("Add liquidity", async function () {
    await stackToken.approve(
      router.address,
      parseEther("100000.0")
    );
    await usdt.approve(
      router.address,
      parseEther("100000.0")
    );
    var deadline = Math.floor(Date.now() / 1000) + 1200;
    // TODO: can replace this shit with pair that (if) exists on rinkeby with a lot of liquidity? or find way to improve this one.
    await router.addLiquidity(
      usdt.address,
      stackToken.address,
      parseEther("100000.0"),
      parseEther("100000.0"),
      0,
      0,
      joe.address,
      deadline
    );
  });

  it("Subscribe 1 month and 4 months in advance for another NFT", async function () {
    await usdt.approve(
      subscription.address,
      parseEther("200.0")
    );
    await subscription.subscribe(0, 0, 1);
    await subscription.subscribe(0, 1, 4);
  });

  it("Unable to subscibe until next month", async function () {
    await expect(subscription.subscribe(0, 0, 1)).to.be.revertedWith(
      "Too soon"
    );
    await expect(subscription.subscribe(0, 1, 4)).to.be.revertedWith(
      "Too soon"
    );
  });
  
  it("Take TAX for early withdrawal", async function () {
    await stackOsNFT.transferFrom(owner.address, bob.address, 0);
    expect(await stackToken.balanceOf(bob.address)).to.equal(0);
    await subscription.connect(bob).withdraw(0, [0]); // 1st month 75% tax (so its 0-1 month, like 1st day of the 1st month)
    console.log("bob: ", formatEther(await stackToken.balanceOf(bob.address)));
    console.log("tax: ", formatEther(await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(bob.address)).to.be.gt(parseEther("2.9"));
    expect(await stackToken.balanceOf(bob.address)).to.be.lt(parseEther("3.1"));
  });

  it("Unable to withdraw when low balance on bonus wallet", async function () {
    await expect(subscription.withdraw(0, [1])).to.be.revertedWith(
      "Not enough balance on bonus wallet"
    );
  });

  it("Withdraw 3 months, then one more (total 4)", async function () {
    await provider.send("evm_increaseTime", [MONTH * 2]); // 3rd month is going 
    await stackToken.transfer(subscription.address, parseEther("100.0"));
    
    await stackOsNFT.transferFrom(owner.address, bank.address, 1);
    expect(await stackToken.balanceOf(bank.address)).to.equal(0);
    console.log("bank: ", formatEther(await stackToken.balanceOf(bank.address)));
    await subscription.connect(bank).withdraw(0, [1]); // tax should be 25% as we at 3rd month, amount get 27
    console.log("bank: ", formatEther(await stackToken.balanceOf(bank.address)));

    await provider.send("evm_increaseTime", [MONTH]); // 4th month started
    await subscription.connect(bank).withdraw(0, [1]);

    // TODO: gets 48 here, but should get less!
    console.log("bank: ", formatEther(await stackToken.balanceOf(bank.address)));
    console.log("tax: ", formatEther(await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(bank.address)).to.be.gt(parseEther("38.0")); // 27 + 12 = 39 

  });
  it("Payed in advance, and withdraw sooner than TAX is 0%", async function () {
    await subscription.subscribe(0, 2, 4); // 1 month for NFT 2 
    await stackOsNFT.transferFrom(owner.address, vera.address, 2);
    await provider.send("evm_increaseTime", [MONTH]); // now 2 month

    // vera withdraw TAXed 2 months
    expect(await stackToken.balanceOf(vera.address)).to.equal(0);
    await subscription.connect(vera).withdraw(0, [2]); // withdraws for 2 months, TAX taken should be 50%.
    expect(await stackToken.balanceOf(vera.address)).to.be.gt(parseEther("11.0"));
    console.log("vera: ", formatEther(await stackToken.balanceOf(vera.address)));
    console.log("tax: ", formatEther(await stackToken.balanceOf(tax.address)));

    // them homer withdraw from the same NFT but 0% tax and 2 months 
    await provider.send("evm_increaseTime", [MONTH * 2]); // 4 month
    await stackToken.transfer(subscription.address, parseEther("100.0")); // not enough for bonuses
    await stackOsNFT.connect(vera).transferFrom(vera.address, homer.address, 2);
    expect(await stackToken.balanceOf(homer.address)).to.equal(0);
    await subscription.connect(homer).withdraw(0, [2]); // withdraws for 2 months, not taxed
    console.log("homer: ", formatEther(await stackToken.balanceOf(homer.address)));
    console.log("tax: ", formatEther(await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(homer.address)).to.be.gt(parseEther("23.0")); // 24
  });
  it("Buy, then wait 2 month, then buy in advance, and withdraw after that", async function () {

    // clear tax balance for simplicity
    await stackToken.connect(tax).transfer(owner.address, await stackToken.balanceOf(tax.address));
    await stackOsNFT.whitelistPartner(owner.address, 4);
    await stackToken.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.partnerMint(4); // 5-9

    await subscription.subscribe(0, 5, 2); // 5 is subscribed for 2 months
    await provider.send("evm_increaseTime", [MONTH * 4]); // wait 4 months, tax is max

    // clear owner balance for simplicity
    await stackToken.transfer(subscription.address, await stackToken.balanceOf(owner.address)); 
    expect(await stackToken.balanceOf(owner.address)).to.equal(0);
    await subscription.subscribe(0, 5, 2); // 5 is sub for 4 months, tax max

    console.log("owner: ", formatEther(await stackToken.balanceOf(owner.address)));
    console.log("tax: ", formatEther(await stackToken.balanceOf(tax.address)));
    await subscription.withdraw(0, [5]); // withdraw for 3 months, 36 * 0.25 = 9
    console.log("owner: ", formatEther(await stackToken.balanceOf(owner.address)));
    console.log("tax: ", formatEther(await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(parseEther("8.0"));
    expect(await stackToken.balanceOf(owner.address)).to.be.lt(parseEther("9.1"));

    await provider.send("evm_increaseTime", [MONTH]); // wait month, tax is 50%
    await subscription.withdraw(0, [5]); // withdraw for 1 month, 12 * 0.5 = 6, total balance = 9+6=15
    console.log("owner: ", formatEther(await stackToken.balanceOf(owner.address)));
    console.log("tax: ", formatEther(await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(parseEther("14.0"));
    expect(await stackToken.balanceOf(owner.address)).to.be.lt(parseEther("15.1"));
  });

  it("Withdraw on multiple generations", async function () {
    await subscription.addNextGeneration(stackOsNFTGen2.address);
    await stackOsNFTGen2.whitelistPartner(owner.address, 1);
    await stackToken.approve(stackOsNFTGen2.address, parseEther("100.0"));
    await stackOsNFTGen2.startPartnerSales();
    await stackOsNFTGen2.partnerMint(1); 

    await usdt.approve(
      subscription.address,
      parseEther("200.0")
    );
    await subscription.subscribe(0, 6, 10); // gen 0, token 6, 10 months
    await subscription.subscribe(1, 0, 10); // gen 1, token 0, 10 months

    // clear balances for simplicity
    await stackToken.connect(tax).transfer(owner.address, await stackToken.balanceOf(tax.address));
    await stackToken.transfer(subscription.address, await stackToken.balanceOf(owner.address)); 

    console.log("owner: ", formatEther(await stackToken.balanceOf(owner.address)));
    console.log("tax: ", formatEther(await stackToken.balanceOf(tax.address)));
    await subscription.withdraw(0, [6]); // +3 (tax is 75%, 12 * 0.25 = 3)
    await subscription.withdraw(1, [0]); // +3
    console.log("owner: ", formatEther(await stackToken.balanceOf(owner.address)));
    console.log("tax: ", formatEther(await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(parseEther("5.0"));
  });
  it("Withdraw on multiple generations, 9 months no tax", async function () {
    await provider.send("evm_increaseTime", [MONTH * 9]); // wait 9 months, tax 0

    await subscription.withdraw(0, [6]); // + 108 (90 * 1.2)
    await subscription.withdraw(1, [0]); // + 108
    console.log("owner: ", formatEther(await stackToken.balanceOf(owner.address)));
    console.log("tax: ", formatEther(await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(parseEther("220.0"));
    expect(await stackToken.balanceOf(tax.address)).to.be.lt(parseEther("18.0")); // tax was 0, should stay the same
  });

  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

});