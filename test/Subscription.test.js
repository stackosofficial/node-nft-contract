const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");
const { parseEther } = require("@ethersproject/units");
const { deployStackOS, setup, print } = require("./utils");

use(solidity);

describe("Subscription", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer, van] =
      await hre.ethers.getSigners();
    router = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
  });

  it("Deploy full SETUP", async function () {
    [ stackToken, 
      usdt, 
      usdc, 
      dai, 
      link, 
      coordinator, 
      generationManager, 
      darkMatter, 
      subscription, 
      stackOsNFT ] = await setup();
  });

  it("Add liquidity", async function () {
    await stackToken.approve(router.address, parseEther("100000000.0"));
    await usdt.approve(router.address, parseEther("100000000.0"));
    await dai.approve(router.address, parseEther("100000000.0"));
    var deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.addLiquidityETH(
      stackToken.address,
      parseEther("100000.0"),
      parseEther("100000.0"),
      parseEther("3.77"),
      joe.address,
      deadline,
      { value: parseEther("3.77") }
    );

    await router.addLiquidityETH(
      usdt.address,
      parseEther("43637.0"),
      parseEther("43637.0"),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      dai.address,
      parseEther("43637.0"),
      parseEther("43637.0"),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });

  it("Mint some NFTs", async function () {
    await usdt.transfer(partner.address, parseEther("100.0"));
    await stackOsNFT.startPartnerSales();

    await stackOsNFT.whitelistPartner(owner.address, 4);
    await usdt.approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.partnerMint(4, usdt.address);

    await stackOsNFT.whitelistPartner(partner.address, 1);
    await usdt
      .connect(partner)
      .approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.connect(partner).partnerMint(1, usdt.address);
  });

  it("Unable to withdraw without subs and foreign ids", async function () {
    await expect(subscription.withdraw(0, [0])).to.be.revertedWith(
      "No subscription"
    );
    await expect(subscription.withdraw(0, [4])).to.be.revertedWith("Not owner");
  });

  it("Unable to subscribe and withdraw on wrong generation id", async function () {
    await expect(subscription.subscribe(1337, 0, usdt.address)).to.be.revertedWith(
      "Generation doesn't exist"
    );
    await expect(subscription.withdraw(1337, [0])).to.be.revertedWith(
      "Generation doesn't exist"
    );
  });

  it("Subscribe with usdt token", async function () {
    await usdt.approve(subscription.address, parseEther("5000.0"));
    await subscription.subscribe(0, 0, usdt.address);
  });
  it("Subscribe with dai coin", async function () {
    // await usdt.approve(subscription.address, parseEther("5000.0"));
    // await subscription.subscribe(0, 1, 4, usdt.address);

    await dai.approve(subscription.address, parseEther("5000.0"));
    await subscription.subscribe(0, 1, dai.address);
  });
  it("Take TAX for early withdrawal", async function () {
    await stackOsNFT.transferFrom(owner.address, bob.address, 0);
    expect(await stackToken.balanceOf(bob.address)).to.equal(0);
    await subscription.connect(bob).withdraw(0, [0]); // 1st month 75% tax (so its 0-1 month, like 1st day of the 1st month)
    print("bob: ", (await stackToken.balanceOf(bob.address)));
    print("tax: ", (await stackToken.balanceOf(tax.address)));
    // 599 Deposit. Withdraw 150 first month tax 75%
    expect(await stackToken.balanceOf(bob.address)).to.be.gt(parseEther("149"));
    expect(await stackToken.balanceOf(bob.address)).to.be.lt(parseEther("150"));
  });

  it("Subscribe 3 months in a row", async function () {
    await usdt.approve(subscription.address, parseEther("5000.0"));
    await provider.send("evm_increaseTime", [MONTH]);
    await subscription.subscribe(0, 1, usdt.address);
    await provider.send("evm_increaseTime", [MONTH]);
    await subscription.subscribe(0, 1, usdt.address);
  });
  it("Unable to withdraw when low balance on bonus wallet", async function () {
    await expect(subscription.withdraw(0, [1])).to.be.revertedWith(
      "Not enough balance on bonus wallet"
    );
  });
  it("Withdraw", async function () {
    await stackToken.transfer(subscription.address, parseEther("5000.0"));

    await stackOsNFT.transferFrom(owner.address, bank.address, 1);
    // 3 months = 1800, bonus = 360
    expect(await stackToken.balanceOf(bank.address)).to.equal(0);
    print(
      "bank: ",
      (await stackToken.balanceOf(bank.address))
    );

    await subscription.connect(bank).withdraw(0, [1]); // tax should be 25% as we at 3rd month
    await expect(subscription.connect(bank).withdraw(0, [1])).to.be.revertedWith(
      "Already withdrawn"
    );

    print(
      "bank: ",
      (await stackToken.balanceOf(bank.address))
    );

    print(
      "bank: ",
      (await stackToken.balanceOf(bank.address))
    );
    print("tax: ", (await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(bank.address)).to.be.gt(
      parseEther("1338.0")
    );
  });
  it("Buy, then wait 2 month, buy again, and withdraw after that", async function () {
    // clear tax balance for simplicity
    await dai 
      .connect(tax)
      .transfer(owner.address, await dai.balanceOf(tax.address));
    await stackOsNFT.whitelistPartner(owner.address, 4);
    await dai.approve(stackOsNFT.address, parseEther("5000.0"));
    await stackOsNFT.partnerMint(4, dai.address); // 5-9

    await dai.approve(subscription.address, parseEther("5000.0"));
    await subscription.subscribe(0, 5, dai.address); // 600, bonus 120
    await provider.send("evm_increaseTime", [MONTH * 2]); // wait 2 months, tax is max
    await provider.send("evm_mine"); // wait 2 months, tax is max

    // clear owner balance for simplicity
    await stackToken.transfer(
      subscription.address,
      await stackToken.balanceOf(owner.address)
    );
    expect(await stackToken.balanceOf(owner.address)).to.equal(0);
    await subscription.subscribe(0, 5, dai.address); // tax max, 1200, bonus 240

    print(
      "owner: ",
      (await stackToken.balanceOf(owner.address))
    );
    print("tax: ", (await stackToken.balanceOf(tax.address)));
    // Restart tax because skipped subs.
    await subscription.withdraw(0, [5]); // withdraw for 2 months, tax 75%
    print(
      "owner: ",
      (await stackToken.balanceOf(owner.address))
    );
    print("tax: ", (await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(
      parseEther("291.0") // 282 + 9
    );
    expect(await stackToken.balanceOf(owner.address)).to.be.lt(
      parseEther("292.0")
    );

    await provider.send("evm_increaseTime", [MONTH]); 
    await subscription.subscribe(0, 5, dai.address); // tax max, 600, bonus 
    await subscription.withdraw(0, [5]); // withdraw for 1 month
    print(
      "owner: ",
      (await stackToken.balanceOf(owner.address))
    );
    print("tax: ", (await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(
      parseEther("451.0")
    );
    expect(await stackToken.balanceOf(owner.address)).to.be.lt(
      parseEther("451.1")
    );
  });

  it("Withdraw on multiple generations", async function () {
    stackOsNFTGen2 = await deployStackOS();

    await stackOsNFTGen2.whitelistPartner(owner.address, 1);
    await usdt.approve(stackOsNFTGen2.address, parseEther("10000.0"));
    await stackOsNFTGen2.startPartnerSales();
    await stackOsNFTGen2.partnerMint(1, usdt.address);

    await usdt.approve(subscription.address, parseEther("20000.0"));
    await subscription.subscribe(0, 6, usdt.address); // gen 0, token 6
    await subscription.subscribe(1, 0, usdt.address); // gen 1, token 0

    // clear balances for simplicity
    await stackToken
      .connect(tax)
      .transfer(owner.address, await stackToken.balanceOf(tax.address));
    await stackToken.transfer(
      subscription.address,
      await stackToken.balanceOf(owner.address)
    );

    print(
      "owner: ",
      (await stackToken.balanceOf(owner.address))
    );
    print("tax: ", (await stackToken.balanceOf(tax.address)));
    await subscription.withdraw(0, [6]); // full tax
    await subscription.withdraw(1, [0]); 
    print(
      "owner: ",
      (await stackToken.balanceOf(owner.address))
    );
    print("tax: ", (await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(
      parseEther("270.0")
    );
  });
  it("Withdraw on multiple generations, 9 months no tax", async function () {
    await provider.send("evm_increaseTime", [MONTH * 9]); // wait 9 months

    await subscription.subscribe(0, 6, usdt.address);
    await subscription.subscribe(1, 0, usdt.address); 
    await subscription.withdraw(0, [6]); 
    await subscription.withdraw(1, [0]);
    print(
      "owner: ",
      (await stackToken.balanceOf(owner.address))
    );
    print("tax: ", (await stackToken.balanceOf(tax.address)));
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(
      parseEther("601.0")
    );
    expect(await stackToken.balanceOf(tax.address)).to.be.lt(
      parseEther("1596.0")
    );
  });

  it("Pay for subscription on NFT owned by other peoples", async function () {
    await provider.send("evm_increaseTime", [MONTH]); 
    await provider.send("evm_mine"); 
    await usdt.transfer(partner.address, parseEther("100.0"));
    await usdt
      .connect(partner)
      .approve(subscription.address, parseEther("100.0"));
    await subscription.connect(partner).subscribe(0, 6, usdt.address);

    await provider.send("evm_increaseTime", [MONTH]);
    await subscription.withdraw(0, [6]);

    print(
      "owner: ",
      (await stackToken.balanceOf(owner.address))
    );
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(
      parseEther("738.0")
    );
  });

  it("ReSubscribe using the earned funds", async function () {
    await usdt.transfer(partner.address, parseEther("100.0"));
    await usdt
      .connect(partner)
      .approve(subscription.address, parseEther("100.0"));
    await subscription.connect(partner).subscribe(0, 6, usdt.address);

    await provider.send("evm_increaseTime", [MONTH * 1337]);

    await expect(subscription.reSubscribe(0, [6], 0, 6, usdt.address)).to.be.revertedWith(
      "Not enough on deposit for resub"
    );

    await usdt.transfer(partner.address, parseEther("400.0"));
    await usdt
      .connect(partner)
      .approve(subscription.address, parseEther("400.0"));
    await subscription.connect(partner).subscribe(0, 6, usdt.address);
    await provider.send("evm_increaseTime", [MONTH * 3]);

    await subscription.reSubscribe(0, [6], 0, 6, usdt.address);
  });

  it("Pay for subscription on NFT owned by other peoples", async function () {
    await usdt.transfer(partner.address, parseEther("500.0"));
    await usdt.connect(partner).approve(
      subscription.address,
      parseEther("500.0")
    );

    await subscription.withdraw(0, [6]); 
    await provider.send("evm_increaseTime", [MONTH]); // TODO: without this delay, reverted with 'cant pay in advance', this is not exepected i guess
    await subscription.connect(partner).subscribe(0, 6, usdt.address);

    await provider.send("evm_increaseTime", [MONTH]); 

    print("owner: ", (await stackToken.balanceOf(owner.address)));
    await subscription.withdraw(0, [6]); 
    print("owner: ", (await stackToken.balanceOf(owner.address)));
  });
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
