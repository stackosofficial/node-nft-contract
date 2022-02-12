const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { print, setup, deployStackOS, setupLiquidity, deployStackOSBasic, setupDeployment } = require("./utils");
const { parseEther, parseUnits } = require("ethers/lib/utils");

describe("DarkMatter doesn't corrupt Royalty contract logic", function () {
  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, dude, tax, DaoWallet, pepe] =
      await hre.ethers.getSigners();
    
    CYCLE_DURATION = 60*60*24*31;
  });
 
  it("Deploy full SETUP", async function () {

    await setup();
    await setupDeployment();
    await setupLiquidity()

  });

  it("Mint DarkMatter NFT", async function () {

    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 5);
    await usdt.approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.partnerMint(5);

    await darkMatter.activate();
    await stackOsNFT.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(0, [0, 1, 2, 3, 4]);
    await darkMatter.mint();

    expect(await stackOsNFT.balanceOf(darkMatter.address)).to.be.equal(5);
    expect(await stackOsNFT.balanceOf(owner.address)).to.be.equal(0);
    expect(await darkMatter.balanceOf(owner.address)).to.be.equal(1);

  });
  it("Bank takes percent", async function () {
    await owner.sendTransaction({ // cycle 0 start
        from: owner.address,
        to: royalty.address,
        value: parseEther("2.0")
    });
    expect(await bank.getBalance()).to.be.gt(parseEther("10000.19"))
    expect(await provider.getBalance(royalty.address)).to.equal(parseEther("1.8"))
  })
  it("Claim royalty for NFTs", async function () { 
    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parseEther("2.0")
    });
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");
    let tokenIds = [...Array(5).keys()];
    await royalty.claim(0, tokenIds, [0]); // cycle 1 start

    print((await owner.getBalance()), (await provider.getBalance(royalty.address)));
    // 3.6 - 0.18, the 0.18 comes from 3.6 / 100 total maxSupply * 5 tokens
    await expect((await provider.getBalance(royalty.address))).to.be.equal(parseEther("3.42"))
  });
  it("Mint 3rd DarkMatter NFT on stack generation 2", async function () {

    stackOsNFTGen2 = await deployStackOSBasic();
    await stackToken.approve(stackOsNFTGen2.address, parseEther("100.0"));
    await provider.send("evm_increaseTime", [60 * 5]); 
    await stackOsNFTGen2.mint(5);

    await stackOsNFTGen2.setApprovalForAll(darkMatter.address, true);
    await darkMatter.deposit(1, [0, 1, 2, 3, 4]);
    await darkMatter.mint()

    expect(await stackOsNFTGen2.balanceOf(darkMatter.address)).to.be.equal(5);
    expect(await stackOsNFTGen2.balanceOf(owner.address)).to.be.equal(0);
    expect(await darkMatter.balanceOf(owner.address)).to.be.equal(2);
  });
  it("Claim royalty for NFTs (two generations)", async function () { 
    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parseEther("2.0")
    });
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");

    let tokenIds = [...Array(5).keys()];
    // cycle 0 already claimed thus ignored
    // cycle 1 has only 2nd gen balance, thus gen 1 is ignore in cycle 1 here 
    await royalty.claim(0, tokenIds, [0, 1]); // cycle 2 start
    // 0 cycle's 3.42 + 2nd cycle's 1.8 - 1.8 / 200 * 5
    await expect((await provider.getBalance(royalty.address))).to.be.equal(parseEther("5.175"))

    await owner.sendTransaction({
      from: owner.address,
      to: royalty.address,
      value: parseEther("2.0")
    });
    await provider.send("evm_increaseTime", [CYCLE_DURATION]); 
    await provider.send("evm_mine");

    print((await owner.getBalance()), (await provider.getBalance(royalty.address)));
    // cycle 0, 1 already claimed, cycle 2 has 1.8 in gen 1 balance
    await royalty.claim(0, tokenIds, [1]); // cycle 3 start
    await expect((await provider.getBalance(royalty.address))).to.be.equal(parseEther("6.93"))
    // gen 1 cant claim from gen 0 balance, claiming cycle 1, 2
    await royalty.claim(1, tokenIds, [1]);
    await expect((await provider.getBalance(royalty.address))).to.be.equal(parseEther("6.84"))

    print((await owner.getBalance()), (await provider.getBalance(royalty.address)));
    await expect(royalty.claim(1, [0], [0])).to.be.revertedWith("Bad gen id");
  });
  
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });
});