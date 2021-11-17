const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { Signer } = require("@ethersproject/abstract-signer");

describe("Royalty Attack", function () {

  const parseEther = ethers.utils.parseEther;
  const format = ethers.utils.formatEther;
  const CYCLE_DURATION = 60*60*24*31;

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });
  it("Defining Generals", async function () {

    await ethers.provider.send("evm_setAutomine", [false]);
    await ethers.provider.send("evm_setIntervalMining", [0]);

    provider = ethers.provider;
    [owner, partner, joe, bank, bob, vera, dude]= await hre.ethers.getSigners();
  });
  it("Deploy contracts", async function () {
    ERC20 = await ethers.getContractFactory("TestCurrency");
    currency = await ERC20.deploy(parseEther("1000.0"));
    currency2 = await ERC20.deploy(parseEther("1000.0"));

    ERC20_2 = await ethers.getContractFactory("LinkToken");
    link = await ERC20_2.deploy();

    const Coordinator = await ethers.getContractFactory("VRFCoordinatorMock");
    coordinator = await Coordinator.deploy(link.address);

    await ethers.provider.send("evm_mine");
    await currency.deployed();
    await currency2.deployed();
    await link.deployed();
    console.log(link.address);
    await coordinator.deployed();
    console.log(coordinator.address);

    NAME = "STACK OS NFT";
    SYMBOL = "SON";
    STACK_TOKEN_FOR_PAYMENT = currency.address;
    PRICE = parseEther("0.1");
    MAX_SUPPLY = 25;
    PRIZES = 10;
    AUCTIONED_NFTS = 10;
    VRF_COORDINATOR = coordinator.address;
    LINK_TOKEN = link.address;
    KEY_HASH =
      "0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311";
    FEE = parseEther("0.1");
    TRANSFER_DISCOUNT = 2000;

    const StackOS = await ethers.getContractFactory("StackOsNFT");
    // generation 1
    stackOsNFT = await StackOS.deploy(
      NAME,
      SYMBOL,
      STACK_TOKEN_FOR_PAYMENT,
      PRICE,
      MAX_SUPPLY,
      PRIZES,
      AUCTIONED_NFTS,
      // VRF_COORDINATOR,
      // LINK_TOKEN,
      KEY_HASH,
      FEE,
      TRANSFER_DISCOUNT
    );
    // generation 2
    await ethers.provider.send("evm_mine");
    await stackOsNFT.deployed();

    const GenerationManager = await ethers.getContractFactory("GenerationManager");
    generationManager = await GenerationManager.deploy(
      stackOsNFT.address
    );

    GENERATION_MANAGER_ADDRESS = generationManager.address;
    MASTER_NODE_PRICE = 50;
    const MasterNode = await ethers.getContractFactory("MasterNode");
    masterNode = await MasterNode.deploy(
      GENERATION_MANAGER_ADDRESS,
      MASTER_NODE_PRICE
    );
    
    GENERATION_MANAGER_ADDRESS = generationManager.address;
    MASTER_NODE_ADDRESS = masterNode.address;
    DEPOSIT_FEE_ADDRESS = bank.address;
    MIN_CYCLE_ETHER = parseEther("1");
    DEPOSIT_FEE_PERCENT = 1000;

    await ethers.provider.send("evm_mine");
    await generationManager.deployed();
    await masterNode.deployed();
    
    const Royalty = await ethers.getContractFactory("Royalty");
    royalty = await Royalty.deploy(
      GENERATION_MANAGER_ADDRESS,
      MASTER_NODE_ADDRESS,
      DEPOSIT_FEE_ADDRESS,
      MIN_CYCLE_ETHER,
    );
    await ethers.provider.send("evm_mine");
    await royalty.deployed();
    await royalty.setFeePercent(DEPOSIT_FEE_PERCENT);
  });
  it("Mint NFT", async function () {
    await stackOsNFT.startPartnerSales();
    await stackOsNFT.whitelistPartner(owner.address, 3);
    await currency.approve(stackOsNFT.address, parseEther("10.0"));
    await stackOsNFT.partnerMint(3);
    await ethers.provider.send("evm_mine"); // block timestamp = 0 
  })
  /**
   * This vulnerabily is possible if we allow delegation and start of the first cycle on the same block.
   * If its done, then no one can claim for first cycle forever.
   * That's because we allow to claim only if this is true: `tokenDelegationTimestamp < cycle.startTimestamp`
   * Note that changing `<` sign to `<=` would introduce another similar bug. 
   * If we do `delegation, start cycle, delegation` in the same block, then cycle would record only first delegation,
   * but `<=` would allow second delegator to claim royalty that is intended for first one.
   */
  it("Timestamp vulnerability should be fixed", async function () {

    depositTx = await owner.sendTransaction({ 
        from: owner.address,
        to: royalty.address,
        value: parseEther("2.0")
    });
    await ethers.provider.send("evm_mine"); // block timestamp = 1, cycle 0 reset to timestamp = 1

    await provider.send("evm_increaseTime", [CYCLE_DURATION]);
    await ethers.provider.send("evm_mine"); // block timestamp = 31 (cycle 0 got enough time & ether, but not delegators)
    
    await royalty.claim(0, [0]); // this should reset 0 cycle's timestamp to = 32 (becasue we've 0 delegates, so cycle can't start)
    await ethers.provider.send("evm_mine"); // block timestamp = 32
    
    await stackOsNFT.delegate(owner.address, 0); // delegation timestamp = 62
    depositTx = await owner.sendTransaction({ // this should reset 0 cycle again, we only wan't delegations that's older than current block!
        from: owner.address,
        to: royalty.address,
        value: parseEther("2.0")
    });
    await royalty.claim(0, [0]); // 0 cycle just resets here to 62, not getting delegation that is on the same block with it
    await provider.send("evm_increaseTime", [CYCLE_DURATION]);
    await ethers.provider.send("evm_mine"); // block timestamp = 62

    await royalty.claim(0, [0]); // 0 cycle gets 1 delegation here, and already had ether. and it finally 'started' at timestamp 63
    await ethers.provider.send("evm_mine"); // block timestamp = 63

    await royalty.claim(0, [0]); // literally do nothing, because no one can claim when cycle 0 not ended
    await provider.send("evm_increaseTime", [CYCLE_DURATION]);
    await ethers.provider.send("evm_mine"); // block timestamp = 93

    await royalty.claim(0, [0]); // receive or claim should just start cycle 1
    await ethers.provider.send("evm_mine"); // block timestamp = 94

    await royalty.claim(0, [0]); // claim for cycle 0
    await ethers.provider.send("evm_mine"); // block timestamp = 95

    console.log(format(await provider.getBalance(royalty.address)))
  }) 
  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
    await ethers.provider.send("evm_setAutomine", [true]);
  });
});