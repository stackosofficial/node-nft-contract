const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { parseEther, parseUnits } = require("@ethersproject/units");
const { deployStackOSBasic, setup, print, setupDeployment } = require("./utils");

describe("Subscription (generations above 1st)", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, tax, homer, van] =
      await hre.ethers.getSigners();

  });

  it("Deploy full SETUP", async function () {
    await setup();
    await setupDeployment();
    stackOsNFTBasic = await deployStackOSBasic();
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
      parseUnits("43637", await usdt.decimals()),
      parseUnits("43637", await usdt.decimals()),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );

    await router.addLiquidityETH(
      dai.address,
      parseUnits("43637", await dai.decimals()),
      parseUnits("43637", await dai.decimals()),
      parseEther("10.0"),
      joe.address,
      deadline,
      { value: parseEther("10.0") }
    );
  });

  it("Mint some NFTs", async function () {
    await stackToken.transfer(partner.address, parseEther("100.0"));

    await stackToken.approve(stackOsNFTBasic.address, parseEther("10.0"));
    await stackOsNFTBasic.mint(4);

    await stackToken
      .connect(partner)
      .approve(stackOsNFTBasic.address, parseEther("10.0"));
    await stackOsNFTBasic.connect(partner).mint(1);
  });

  it("Unable to withdraw without subs and foreign ids", async function () {
    await expect(subscription.withdraw(1, [4])).to.be.revertedWith("Not owner");
  });

  it("Unable to subscribe and withdraw on wrong generation id", async function () {
    await expect(
      subscription.subscribe(1337, 0, parseEther("100"), usdt.address, false)
    ).to.be.revertedWith("Generation doesn't exist");
    await expect(subscription.withdraw(1337, [0])).to.be.revertedWith(
      "Generation doesn't exist"
    );
  });
  it("Unable to use contract from generation 1", async function () {
    await expect(subscription.subscribe(0, 0, parseEther("100"), usdt.address, false)).to.be.revertedWith(
      "Generaion shouldn't be 0"
    );
    await expect(subscription.claimReward(0, [0], [0])).to.be.revertedWith(
      "Generaion shouldn't be 0"
    );
  });
  it("Subscribe with usdt token", async function () {
    await usdt.approve(subscription.address, parseEther("5000.0"));
    print(await usdt.balanceOf(owner.address));
    print(parseUnits((await usdt.balanceOf(owner.address)).toString(), 6));
    await subscription.subscribe(1, 0, parseEther("100"), usdt.address, false);
    print(parseUnits((await usdt.balanceOf(owner.address)).toString(), 6));
    // print(parseUnits(await usdt.balanceOf(owner.address), 6));
  });
  it("Subscribe with dai coin", async function () {
    await dai.approve(subscription.address, parseEther("5000.0"));
    await subscription.subscribe(1, 1, 0, dai.address, false);
  });
  it("Take TAX for early withdrawal", async function () {
    // send some for bonuses
    await stackToken.transfer(subscription.address, parseEther("100.0"));

    await stackOsNFTBasic.whitelist(owner.address);
    await stackOsNFTBasic.transferFrom(owner.address, bob.address, 0);
    expect(await stackToken.balanceOf(bob.address)).to.equal(0);
    await subscription.connect(bob).withdraw(1, [0]); // 1st month 75% tax (so its 0-1 month, like 1st day of the 1st month)
    print("bob: ", await stackToken.balanceOf(bob.address));
    print("tax: ", await stackToken.balanceOf(tax.address));
    // 599 Deposit. Withdraw 150 first month tax 75%
    expect(await stackToken.balanceOf(bob.address)).to.be.gt(
      parseEther("149")
    );
    expect(await stackToken.balanceOf(bob.address)).to.be.lt(
      parseEther("150")
    );
  });

  it("Subscribe 3 months in a row", async function () {
    await usdt.approve(subscription.address, parseEther("5000.0"));
    await provider.send("evm_increaseTime", [MONTH]);
    await subscription.subscribe(1, 1, 0, usdt.address, false);
    await provider.send("evm_increaseTime", [MONTH]);
    await provider.send("evm_mine");
    await subscription.subscribe(1, 1, 0, usdt.address, false);
  });
  it("Withdraw", async function () {
    await stackToken.transfer(subscription.address, parseEther("5000.0"));

    await stackOsNFTBasic.transferFrom(owner.address, vera.address, 1);
    // 3 months = 1800, bonus = 360
    expect(await stackToken.balanceOf(vera.address)).to.equal(0);
    print("vera: ", await stackToken.balanceOf(vera.address));

    await subscription.connect(vera).withdraw(1, [1]);
    print("vera: ", await stackToken.balanceOf(vera.address));
    print("tax: ", await stackToken.balanceOf(tax.address));
    expect(await stackToken.balanceOf(vera.address)).closeTo(
      parseEther("1310"),
      parseEther("1")
    );

  });

  it("Unable to withdraw when already did", async function () {
    await expect(subscription.connect(vera).withdraw(1, [1])).to.be.revertedWith(
      "Already withdrawn"
    );
  });

  it("Buy, then wait 2 month, buy again, and withdraw after that", async function () {
    // clear tax balance for simplicity
    await dai
      .connect(tax)
      .transfer(owner.address, await dai.balanceOf(tax.address));
    await stackOsNFT.whitelistPartner(owner.address, 4);
    await stackToken.approve(stackOsNFTBasic.address, parseEther("5000.0"));
    await stackOsNFTBasic.mint(4);

    await dai.approve(subscription.address, parseEther("5000.0"));
    await subscription.subscribe(1, 5, parseEther("100"), dai.address, false); // 600, bonus 120
    await provider.send("evm_increaseTime", [MONTH * 2]); // wait 2 months, tax is max
    await provider.send("evm_mine"); // wait 2 months, tax is max

    // clear owner balance for simplicity
    await stackToken.transfer(
      subscription.address,
      await stackToken.balanceOf(owner.address)
    );
    expect(await stackToken.balanceOf(owner.address)).to.equal(0);
    await subscription.subscribe(1, 5, parseEther("100"), dai.address, false); // tax max, 1200, bonus 240

    print("owner: ", await stackToken.balanceOf(owner.address));
    print("tax: ", await stackToken.balanceOf(tax.address));
    // Restart tax because skipped subs.
    await subscription.withdraw(1, [5]);
    expect(await stackToken.balanceOf(owner.address)).closeTo(
      parseEther("282"), 
      parseEther("1")
    ); // withdraw for 2 months, tax 75% (282 + 9)
    print("owner: ", await stackToken.balanceOf(owner.address));
    print("tax: ", await stackToken.balanceOf(tax.address));

    await provider.send("evm_increaseTime", [MONTH]);
    await subscription.subscribe(1, 5, parseEther("100"), dai.address, false); // tax max, 600, bonus
    await subscription.withdraw(1, [5]);
    expect(await stackToken.balanceOf(owner.address)).closeTo(
      parseEther("419"),
      parseEther("1")
    ); // withdraw for 1 month

    print("owner: ", await stackToken.balanceOf(owner.address));
    print("tax: ", await stackToken.balanceOf(tax.address));
  });

  it("Withdraw on multiple generations", async function () {
    stackOsNFTGen2 = await deployStackOSBasic();

    await stackToken.approve(stackOsNFTGen2.address, parseEther("10000.0"));

    await provider.send("evm_increaseTime", [60 * 5]); 
    await stackOsNFTGen2.mint(5);
    console.log("GEN 3 NFT ADDRESS", stackOsNFTGen2.address);

    await usdt.approve(subscription.address, parseEther("20000.0"));
    await subscription.subscribe(1, 6, parseEther("100"), usdt.address, false); // gen 1, token 6
    await subscription.subscribe(2, 0, parseEther("100"), usdt.address, false); // gen 1, token 0

    // clear balances for simplicity
    await stackToken
      .connect(tax)
      .transfer(owner.address, await stackToken.balanceOf(tax.address));
    await stackToken.transfer(
      subscription.address,
      await stackToken.balanceOf(owner.address)
    );

    print("owner: ", await stackToken.balanceOf(owner.address));
    print("tax: ", await stackToken.balanceOf(tax.address));
    await subscription.withdraw(1, [6]); // full tax
    await subscription.withdraw(2, [0]);
    print("owner: ", await stackToken.balanceOf(owner.address));
    print("tax: ", await stackToken.balanceOf(tax.address));
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(
      parseEther("270.0")
    );
  });
  it("Withdraw on multiple generations, 9 months no tax", async function () {
    await provider.send("evm_increaseTime", [MONTH * 9]); // wait 9 months

    await subscription.subscribe(1, 6, parseEther("100"), usdt.address, false);
    await subscription.subscribe(2, 0, parseEther("100"), usdt.address, false);
    await subscription.subscribe(2, 1, parseEther("100"), usdt.address, false);
    await subscription.withdraw(1, [6]);
    await subscription.withdraw(2, [0]);
    print("owner: ", await stackToken.balanceOf(owner.address));
    print("tax: ", await stackToken.balanceOf(tax.address));
    expect(await stackToken.balanceOf(owner.address)).to.be.closeTo(
      parseEther("531.0"),
      parseEther("1")
    );
    expect(await stackToken.balanceOf(tax.address)).to.be.closeTo(
      parseEther("1595"),
      parseEther("1.0")
    );
  });

  it("Pay for subscription on NFT owned by other peoples", async function () {
    await provider.send("evm_increaseTime", [MONTH]);
    await provider.send("evm_mine");
    await usdt.transfer(partner.address, parseEther("100.0"));
    await usdt
      .connect(partner)
      .approve(subscription.address, parseEther("100.0"));
    await subscription.connect(partner).subscribe(1, 6, parseEther("100"), usdt.address, false);

    await provider.send("evm_increaseTime", [MONTH]);
    await subscription.withdraw(1, [6]);

    print("owner: ", await stackToken.balanceOf(owner.address));
    expect(await stackToken.balanceOf(owner.address)).to.be.gt(
      parseEther("657.0")
    );
  });

  it("Using the earned funds to buy new NFT", async function () {
    await provider.send("evm_increaseTime", [MONTH * 1337]);
    await subscription.subscribe(2, 4, parseEther("100"), usdt.address, false);
    await provider.send("evm_increaseTime", [MONTH * 3]);

    await expect(subscription.purchaseNewNft(2, [4], 2, 5)).to.be.revertedWith(
      "Can only purchase when 0 tax"
    );

    while((await subscription.deposits(2, 4)).tax.toNumber() > 0) {
        await subscription.subscribe(2, 4, 0, usdt.address, false);
        await provider.send("evm_increaseTime", [MONTH]);
        await provider.send("evm_mine");
    }

    await expect(() => subscription.purchaseNewNft(2, [4], 2, 5))
      .to.changeTokenBalance(stackOsNFTGen2, owner, 5);
  });

  it("Pay for subscription on NFT owned by other peoples", async function () {
    await usdt.transfer(partner.address, parseEther("500.0"));
    await usdt.connect(partner).approve(
      subscription.address,
      parseEther("500.0")
    );

    await subscription.connect(partner).subscribe(1, 6, parseEther("100"), usdt.address, false);

    await provider.send("evm_increaseTime", [MONTH]); 

    print("owner: ", (await stackToken.balanceOf(owner.address)));
    await subscription.withdraw(1, [6]); 
    print("owner: ", (await stackToken.balanceOf(owner.address)));
  });

  it("Claim bonus", async function () {
    // clear owner balance for simplicity
    await stackToken.transfer(
      subscription.address,
      await stackToken.balanceOf(owner.address)
    );

    print("owner: ", await stackToken.balanceOf(owner.address));
    oldPendingBonus = await subscription.pendingBonus(1, 5);
    print("gen 1 token 5 pending bonus: ", 
      oldPendingBonus.unlocked, 
      oldPendingBonus.locked,
      oldPendingBonus.timeLeft,
    );

    await subscription.claimBonus(1, [5]);

    print("owner: ", (await stackToken.balanceOf(owner.address)));
    newPendingBonus = await subscription.pendingBonus(1, 5);
    print("gen 1 token 5 pending bonus: ", 
      newPendingBonus.unlocked, 
      newPendingBonus.locked,
      newPendingBonus.timeLeft,
    );

    expect(oldPendingBonus.unlocked).to.be.equal(
      await stackToken.balanceOf(owner.address)
    );
  })

  it("mint 1 token", async function () {
    await stackToken.approve(stackOsNFTGen2.address, parseEther("10000.0"));
    await stackOsNFTGen2.mint(1);
  });
  it("subscriptions", async function () {
    await usdt.approve(subscription.address, parseEther("20000.0"));
    for (let i = 0; i < 10; i++) {
      await subscription.subscribe(2, 1, parseEther("100"), usdt.address, false); 
      await provider.send("evm_increaseTime", [MONTH]); 
      await provider.send("evm_mine"); 
    }
    await subscription.withdraw(2, [1]);
  });
  it("Test bonus logic", async function () {
    // clear owner balance for simplicity
    await stackToken.transfer(
      subscription.address,
      await stackToken.balanceOf(owner.address)
    );

    print("owner: ", await stackToken.balanceOf(owner.address));

    dripPeriod = (await subscription.dripPeriod()).toNumber();

    await provider.send("evm_increaseTime", [dripPeriod / 2]); 
    await provider.send("evm_mine"); 

    oldPendingBonus = await subscription.pendingBonus(2, 1);
    print("gen 2 token 1 pending bonus: ", 
      oldPendingBonus.unlocked, 
      oldPendingBonus.locked,
      oldPendingBonus.timeLeft,
    );

    await subscription.claimBonus(2, [1]);

    newPendingBonus = await subscription.pendingBonus(2, 1);
    print("gen 2 token 1 pending bonus: ", 
      newPendingBonus.unlocked, 
      newPendingBonus.locked,
      newPendingBonus.timeLeft,
    );
    await provider.send("evm_increaseTime", [dripPeriod / 2]); 
    await provider.send("evm_mine"); 

    await subscription.claimBonus(2, [1]);

    print("owner: ", await stackToken.balanceOf(owner.address));

    newPendingBonus = await subscription.pendingBonus(2, 1);
    print("gen 2 token 1 pending bonus: ", 
      newPendingBonus.unlocked, 
      newPendingBonus.locked,
      newPendingBonus.timeLeft,
    );
    expect(
      newPendingBonus.unlocked
    ).to.be.equal(0);
  })

  it("Subscribe with STACK", async function () {
    // await stackToken.transferFrom(subscription.address, vera.address, await stackToken.balanceOf(subscription.address));
    await stackToken.approve(subscription.address, parseEther("20000.0"));
    print("owner balance before sub: ", await stackToken.balanceOf(owner.address));
    print("sub balance before sub: ", await stackToken.balanceOf(subscription.address));
    oldBalance = await stackToken.balanceOf(owner.address);
    await subscription.subscribe(2, 1, parseEther("100"), stackToken.address, true); 
    newBalance = await stackToken.balanceOf(owner.address);
    print("owner balance after sub: ", await stackToken.balanceOf(owner.address));
    print("sub balance after sub: ", await stackToken.balanceOf(subscription.address));
    expect(oldBalance.sub(newBalance)).to.be.closeTo(
      parseEther("404"), parseEther("1")
    )
  });
  it("Withdraw", async function () {
    await subscription.withdraw(2, [1]); 
  });
  it("Mint gen0 token", async function () {
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 100);
    await usdt.approve(stackOsNFT.address, parseEther("100.0"));
    await stackOsNFT.partnerMint(1);
  });
  it("Subscribe for 5000$", async function () {
    
    await provider.send("evm_increaseTime", [MONTH]); 
    await provider.send("evm_mine"); 

    await usdt.approve(sub0.address, parseEther("20000.0"));
    print("owner balance before sub: ", await usdt.balanceOf(owner.address));
    print("sub balance before sub: ", await usdt.balanceOf(stackToken.address));

    await expect(
      sub0.subscribe(0, 0, parseEther("99"), usdt.address, false)
    ).to.be.revertedWith(
      "Wrong pay amount"
    )
    await expect(
      sub0.subscribe(0, 0, parseEther("5001"), usdt.address, false)
    ).to.be.revertedWith(
      "Wrong pay amount"
    )

    await sub0.subscribe(0, 0, parseEther("5000"), usdt.address, false); 

    print("owner balance after sub: ", await usdt.balanceOf(owner.address));
    print("sub balance after sub: ", await stackToken.balanceOf(sub0.address));
    expect(await stackToken.balanceOf(sub0.address)).to.be.closeTo(
      parseEther("14814"), parseEther("1")
    )
    expect(await usdt.balanceOf(owner.address)).to.be.closeTo(
      "99999399999999949063000000", parseUnits("1", 6)
    )
  });
  it("Withdraw", async function () {
    await stackToken.transfer(sub0.address, await stackToken.balanceOf(owner.address));
    await sub0.withdraw(0, [0]);
    expect(await stackToken.balanceOf(owner.address)).to.be.closeTo(
      parseEther("3703"), parseEther("1")
    )
  });
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});
