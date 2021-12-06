//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IStackOSNFT.sol";
import "hardhat/console.sol";

contract Market is Ownable, ReentrancyGuard {
    IERC20 private stackToken;
    IUniswapV2Router02 private router;
    DarkMatter private darkMatter;
    GenerationManager private generations;
    address private dao;

    IERC20[] public stablecoins;

    uint256 private constant MAX_PERCENT = 10000; // for convinience 100%

    // 10% will distribute to its generations and above it
    uint256 public generationsTax = 1000; 
    // And 10% is used to purchase liquidity, and the LP tokens are held by the foundation (later dao)
    uint256 public liquidityTax = 1000; 
    // Also 10% of the tokens locked on the NFT should be moved to the foundation. 
    uint256 public lockedTokensTax = 1000; 

    struct Lot {
        uint256 price;
        uint256 generationId;
        uint256 tokenId;
        address owner;
    }

    mapping(uint256 => mapping(uint256 => Lot)) public tokenToLot;
    Lot[] public lots;

    constructor(
        IERC20 _stackToken,
        GenerationManager _generations,
        DarkMatter _darkMatter,
        IUniswapV2Router02 _router,
        address _taxAddress,
        uint256 _taxResetDeadline,
        uint256 _price,
        uint256 _bonusPercent,
        uint256 _taxReductionPercent
    ) {
        stackToken = _stackToken;
        generations = _generations;
        darkMatter = _darkMatter;
        router = _router;
        // taxAddress = _taxAddress;
        // taxResetDeadline = _taxResetDeadline;
        // price = _price;
        // bonusPercent = _bonusPercent;
        // taxReductionPercent = _taxReductionPercent;

        stablecoins.push(IERC20(0xB678B953dD909a4386ED1cA7841550a89fb508cc));
        stablecoins.push(IERC20(0x6Aea593F1E70beb836049929487F7AF3d5e4432F));
        stablecoins.push(IERC20(0x89842f40928f81FC4415b39bfBFC3205eB6161cB));
    }

    /*
     * @title Whether or not stackNFT can be bought for `_address` coin.
     */

    function supportsCoin(IERC20 _address) public view returns (bool) {
        for(uint256 i; i < stablecoins.length; i++) {
            if(_address == stablecoins[i]) {
                return true;
            }
        }
        return false;
    }

    function viewLots() public view returns (Lot[] memory) {
        return lots;
    }

    function sell(
        uint256 generationId,
        uint256 tokenId,
        uint256 price 
    ) public nonReentrant {
        require(generationId < generations.count(), "Generation doesn't exist");

        Lot storage lot = tokenToLot[generationId][tokenId];
        require(lot.owner == address(0), "Already listed");
        generations.get(generationId).transferFrom(msg.sender, address(this), tokenId);

        lot.price = price;
        lot.owner = msg.sender;
        lot.generationId = generationId;
        lot.tokenId = tokenId;

        lots.push(lot);
    }

    function buy(
        uint256 generationId,
        uint256 tokenId,
        IERC20 _stablecoin
    ) public {
        require(supportsCoin(_stablecoin), "Unsupported payment coin");
        require(generationId < generations.count(), "Generation doesn't exist");
        Lot storage lot = tokenToLot[generationId][tokenId];
        require(lot.owner != address(0), "Not listed");


        _stablecoin.transferFrom(msg.sender, lot.owner, lot.price);
    }

    function buy(
        uint256 lotId,
        IERC20 _stablecoin
    ) public nonReentrant {
        buy(lots[lotId].generationId, lots[lotId].tokenId, _stablecoin);
    }

    /*
     *  @title Buy `stackToken` for `_stablecoin`.
     *  @param Amount of `_stablecoin` to sell.
     *  @param Called by external wallet or by this contract?
     */
    function buyStackToken(uint256 amount, IERC20 _stablecoin, bool externalBuyer) private returns (uint256) {
        if(externalBuyer) {
            _stablecoin.transferFrom(msg.sender, address(this), amount);
        }
        _stablecoin.approve(address(router), amount);

        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](3);
        path[0] = address(_stablecoin);
        path[1] = address(router.WETH());
        path[2] = address(stackToken);
        uint256[] memory amountOutMin = router.getAmountsOut(amount, path);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amount,
            amountOutMin[2],
            path,
            address(this),
            deadline
        );

        return amounts[2];
    }

    /*
     *  @title Buy `_stablecoin` for `stackToken`.
     *  @param Amount of `stackToken` to sell.
     */
    function sellStackToken(uint256 amount, IERC20 _stablecoin) private returns (uint256) {
        stackToken.approve(address(router), amount);

        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](3);
        path[0] = address(stackToken);
        path[1] = address(router.WETH());
        path[2] = address(_stablecoin);
        uint256[] memory amountOutMin = router.getAmountsOut(amount, path);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amount,
            amountOutMin[2],
            path,
            address(this),
            deadline
        );

        return amounts[2];
    }

    /*
     *  @title Subtract function, a - b.
     *  @title But instead of reverting with subtraction underflow we return zero.
     *  @title For tax reduction 25% this is excessive safety, but if its 33% then on last 1% we would get underflow error.
     */
    function subOrZero(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : 0;
    }

    // Taken from @openzeppelin/contracts/utils/math/Math.sol
    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        // (a + b - 1) / b can overflow on addition, so we distribute.
        return a / b + (a % b == 0 ? 0 : 1);
    }
}
