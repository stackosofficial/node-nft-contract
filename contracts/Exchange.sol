//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./GenerationManager.sol";
import "./DarkMatter.sol";
import "./interfaces/IStackOsNFT.sol";
import "./Subscription.sol";

contract Exchange {

    IUniswapV2Router02 private router;

    constructor (address _router) {
        router = IUniswapV2Router02(_router);
    }

    /*
     *  @title Buy `_stablecoin` for `amount` of WETH.
     *  @param Amount of WETH to swap.
     *  @param Address of supported stablecoin
     */
    function swapExactETHForTokens(
        IERC20 token
    ) public payable returns (uint256) {

        // tokenA.transferFrom(msg.sender, address(router), amountA);
        // tokenA.approve(address(router), amountA);

        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](2);
        path[0] = address(router.WETH());
        path[1] = address(token);
        uint256[] memory amountOutMin = router.getAmountsOut(msg.value, path);
        uint256[] memory amounts = router.swapExactETHForTokens{value: msg.value}(
            amountOutMin[1],
            path,
            address(msg.sender),
            deadline
        );
        return amounts[1];
    }

    /*
     *  @title Buy `stackToken` for `amount` of _stablecoin.
     *  @param Amount of `_stablecoin` to sell.
     *  @param Address of supported stablecoin
     */

    function swapExactTokensForTokens(
        uint256 amountA, 
        IERC20 tokenA, 
        IERC20 tokenB
    ) public returns (uint256) {

        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenA.approve(address(router), amountA);

        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](3);
        path[0] = address(tokenA);
        path[1] = address(router.WETH());
        path[2] = address(tokenB);
        uint256[] memory amountOutMin = router.getAmountsOut(amountA, path);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amountA,
            amountOutMin[2],
            path,
            address(msg.sender),
            deadline
        );
        return amounts[2];
    }
}
