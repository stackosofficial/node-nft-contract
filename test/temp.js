const { ethers } = require("hardhat");
const { expect } = require("chai");
const { parseEther, formatEther, parseUnits } = require("@ethersproject/units");
const { deployStackOS, setup, deployStackOSBasic, print, setupDeployment, walletOfOwner } = require("./utils");

describe("StackOS NFT Basic", function () {

  it("Snapshot EVM", async function () {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  it("Defining Generals", async function () {
    // General
    provider = ethers.provider;
    [owner, joe, tax, bank] = await hre.ethers.getSigners();

    provider = ethers.provider;
    parseusdt = (args) => parseUnits(args, 6);
    // parseUst = (args) => parseUnits(args, 18);
    // parseUniform = (args) => parseUnits(args, 18);

    usdt = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
    usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", usdt);

    usdtHolder = "0x0d0707963952f2fba59dd06f2b425ace40b492fe";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [usdtHolder],
    });
    usdtHolder = await ethers.getSigner(usdtHolder);
    await usdt.connect(usdtHolder).transfer(
      owner.address,
      parseusdt("5000000")
    );


    
    stackToken = "0x980111ae1b84e50222c8843e3a7a038f36fecd2b";
    stackToken = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", stackToken);

    stackTokenHolder = "0xa08554ada77d70d3d4a4e3d3aec7fb0d33409ad8";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [stackTokenHolder],
    });
    stackTokenHolder = await ethers.getSigner(stackTokenHolder);

    console.log(await stackToken.balanceOf(stackTokenHolder.address));
    await stackToken.connect(stackTokenHolder).transfer(
      owner.address,
      parseEther("5000000")
    );


    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0xa08554ada77d70d3d4a4e3d3aec7fb0d33409ad8"],
    });
    exchangeOwner = await ethers.getSigner("0xa08554ada77d70d3d4a4e3d3aec7fb0d33409ad8");

    exchange = await ethers.getContractAt("Exchange", "0x9027CbbfaEe5DA5c2E948E617f8AE38b9b6a5AD0");
    router = await ethers.getContractAt("IUniswapV2Router02", "0xA102072A4C07F06EC3B4900FDC4C7B80b6c57429");
    // dfyn 0xA102072A4C07F06EC3B4900FDC4C7B80b6c57429
    // quickswap 0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff
    // quickswap = await ethers.getContractAt("IUniswapV2Router02", "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff");

    factory = await ethers.getContractAt("IUniswapV2Factory", await router.factory());

    pairAddr = await factory.getPair(usdt.address, await router.WETH());
    pairUSD = await ethers.getContractAt("IUniswapV2Pair", pairAddr);

  });

  it("Deploy full SETUP", async function () {

    // GEN 9 (id 8)
    stackOsNFTBasic = await ethers.getContractAt(
      "StackOsNFTBasic",
      "0x55bfB8de8820762Ad9911467edA615a89f561860"
    )
  });

  it("change router in exchange contract to FakeRouter", async function () {
    const FakeRouter = await ethers.getContractFactory("FakeRouter");
    fakeRouter = await FakeRouter.deploy(
      router.address,
    );
    await fakeRouter.deployed();

    await exchange.connect(exchangeOwner).setRouter(fakeRouter.address);
    expect(await exchange.router()).to.be.equal(fakeRouter.address);
    expect(await fakeRouter.router()).to.be.equal(router.address);
    console.log("router", await exchange.router());
  });

  it("Setup paths in FakeRouter", async function () {

    USDT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
    USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
      usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", USDC);
      usdcHolder = "0xf977814e90da44bfa03b6295a0616a897441acec";
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [usdcHolder],
      });
      usdcHolder = await ethers.getSigner(usdcHolder);
      await usdc.connect(usdcHolder).transfer(
        owner.address,
        parseusdt("5000000")
      );

    DAI = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
      dai = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20", DAI);
      daiHolder = "0x4a35582a710e1f4b2030a3f826da20bfb6703c09";
      await network.provider.send("hardhat_setBalance", [
        daiHolder.toString(),
        "0x21e19e0c9bab240000000000",
      ]);
      // console.log(await dai.balanceOf(daiHolder));
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [daiHolder],
      });
      daiHolder = await ethers.getSigner(daiHolder);
      await dai.connect(daiHolder).transfer(
        owner.address,
        parseEther("500000")
      );
    UST = "0x692597b009d13C4049a947CAB2239b7d6517875F";
    STACK = "0x980111ae1b84e50222c8843e3a7a038f36fecd2b";
    WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"; // ETH
    WMATIC = "0x4c28f48448720e9000907bc2611f73022fdce1fa"; // dfyn's WETH()

    // set 'note' file to understand what paths we need to define
    await fakeRouter.setPath(USDT, STACK, [USDT, USDC, STACK]);
    await fakeRouter.setPath(STACK, USDT, [STACK, USDC, USDT]);

    // other stables used in mintForUsd and subsription
    await fakeRouter.setPath(USDC, STACK, [USDC, STACK]);
    await fakeRouter.setPath(DAI, STACK, [DAI, USDT, USDC, STACK]);
    await fakeRouter.setPath(UST, STACK, [UST, USDT, USDC, STACK]);

    // paths for getAmounts to work in SwapETH.. functions to work
    // PATH FOR THESE MUST BE = 2 LENGTH
    await fakeRouter.setPath(WMATIC, WETH, [WMATIC, WETH]);
    await fakeRouter.setPath(WMATIC, STACK, [WMATIC, STACK]);

  });

  it("getAmountsOut", async function () {

    // returns ~94k which is ~0.104 price, this is correct
    console.log("getAmountsOut", await exchange.getAmountOut(
      parseusdt("10000"),
      usdt.address,
      stackToken.address,
    ));
  });

  it("getAmountsIn", async function () {

    // returns ~100k which is ~0.1 price, this is correct
    console.log("getAmountsIn", await exchange.getAmountIn(
      parseusdt("10000"),
      usdt.address,
      stackToken.address,
    ));
  });

  it("swapExactETHForTokens", async function () {

    // returns ~16.6k which is ~1 matic, this is correct
    let oldBalance = await stackToken.balanceOf(owner.address);
    let tx = await exchange.swapExactETHForTokens(
      stackToken.address,
      { value: parseEther("1.0") }
    );
    let newBalance = await stackToken.balanceOf(owner.address);
    console.log("swapExactETHForTokens receive stack", newBalance.sub(oldBalance));
  });

  it("swapExactTokensForTokens USDC -> STACK", async function () {
    // function swapExactTokensForTokens(
    // uint256 amountA, 
    // IERC20 tokenA, 
    // IERC20 tokenB

    // returns ~97 which is ~10 usdc, this is correct
    let oldBalance = await stackToken.balanceOf(owner.address);
    await usdc.approve(exchange.address, parseEther("100000000.0"));
    let tx = await exchange.swapExactTokensForTokens(
      parseusdt("10.0"),
      USDC,
      stackToken.address
    );
    let newBalance = await stackToken.balanceOf(owner.address);
    console.log("swapExactTokensForTokens receive stack", newBalance.sub(oldBalance));
  });

  it("swapExactTokensForTokens DAI -> STACK", async function () {
    // returns ~96.6 which is ~10 dai, this is correct
    let oldBalance = await stackToken.balanceOf(owner.address);
    await dai.approve(exchange.address, parseEther("100000000.0"));
    let tx = await exchange.swapExactTokensForTokens(
      parseEther("10.0"),
      DAI,
      stackToken.address
    );
    let newBalance = await stackToken.balanceOf(owner.address);
    console.log("swapExactTokensForTokens receive stack", newBalance.sub(oldBalance));
  });

  it("get pair", async function () {

    // await network.provider.send("hardhat_setBalance", [
    //   owner.address.toString(),
    //   "0x21e19e0c9bab240000000000",
    // ]);

    // console.log(await provider.getBalance(owner.address));
    // await stackToken.approve(router.address, parseEther("100000000.0"));
    // var deadline = Math.floor(Date.now() / 1000) + 1200;

    // await router.addLiquidityETH(
    //   stackToken.address,
    //   parseEther("17.0"),
    //   parseEther("0.0"),
    //   parseEther("1.0"),
    //   joe.address,
    //   deadline,
    //   { value: parseEther("1.0") }
    // );

    // await router.addLiquidityETH(
    //   stackToken.address,
    //   parseEther("880561.0"),
    //   parseEther("0.0"),
    //   parseEther("49704.0"),
    //   joe.address,
    //   deadline,
    //   { value: parseEther("49704.0") }
    // );


    let pairAddr = await factory.getPair(stackToken.address, await router.WETH());
    pair = await ethers.getContractAt("IUniswapV2Pair", pairAddr);

  })

  it("Mint", async function () {

    await stackToken.approve(stackOsNFTBasic.address, parseEther("10000000.0"));


    // console.log("pair.reserves (stackos/weth)", await pair.getReserves());
    // console.log("pair.reserves (usdt/weth)", await pairUSD.getReserves());


    swapAmount = parseEther("10000");
    // await usdt.approve(exchange.address, swapAmount);
    await stackToken.approve(exchange.address, swapAmount);
    // await exchange.swapExactTokensForTokens(
    //   swapAmount,
    //   stackToken.address,
    //   usdt.address,
    // );

    console.log("------ before swap ----------");
    // console.log(await stackToken.balanceOf(owner.address));
    let oldBalance = await stackToken.balanceOf(owner.address);
    await stackOsNFTBasic.mint(50);
    let newBalance = await stackToken.balanceOf(owner.address);

    // path = [
    //   stackToken.address,
    //   await router.WETH(),
    //   usdt.address
    // ]
    // console.log("router.getAmountsIn", await router.getAmountsIn(
    //   parseusdt("10000"),
    //   path
    // ));

    console.log("pair.reserves (stackos/weth)", await pair.getReserves());
    console.log("pair.reserves (usdt/weth)", await pairUSD.getReserves());

    console.log("stack tokens sended: %s", oldBalance.sub(newBalance));
  });

  it("Subscription", async function () {

    subscription = await ethers.getContractAt("Subscription", "0x58e49a747afCF7fb6d551AAb06EF592485e3E01d");

    let oldBalance = await stackToken.balanceOf(subscription.address);
    let oldBalanceU = await usdt.balanceOf(owner.address);
    await usdt.approve(subscription.address, parseEther("5000.0"));
    await subscription.subscribe(9, [0], 0, usdt.address, false);
    let newBalance = await stackToken.balanceOf(subscription.address);
    let newBalanceU = await usdt.balanceOf(owner.address);

    console.log("stack tokens received by subscription contract: %s", newBalance.sub(oldBalance));
    console.log("usdt sended from owner %s", newBalanceU.sub(oldBalanceU));
  });

  it("Mint for usd", async function () {

    // skip mint rate
    await provider.send("evm_increaseTime", [60 * 60]);
    await provider.send("evm_mine");

    let daoAddr = "0x333669c2ef75f4638BCE5f553f56b92415C2D4eF";

    let oldBalance = await stackToken.balanceOf(daoAddr);
    await usdt.approve(stackOsNFTBasic.address, parseEther("5000.0"));
    await stackOsNFTBasic.mintForUsd(50, usdt.address);
    let newBalance = await stackToken.balanceOf(daoAddr);
    // debuggin showed that stackOsNFTBasic received 94333188141327988752092
    // so dao only should get 25% of that (20 from sub0 and 5 from dao percents)
    // dao received 23583297035331997188022 which is 25%
    console.log("stack tokens received by dao: %s", newBalance.sub(oldBalance));
  });


  it("Revert EVM state", async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

});
