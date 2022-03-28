//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

contract Exchange is Ownable {
    using SafeERC20 for IERC20;

    event SetRouter(address newRouter);

    IUniswapV2Router02 public router;

    constructor (address _router) {
        router = IUniswapV2Router02(_router);
    }

    function setRouter(address _router) external onlyOwner {
        require(_router != address(0));
        router = IUniswapV2Router02(_router);
        emit SetRouter(_router);
    }

    /**
     *  @notice Swap exact ETH for tokens.
     *  @param token Address of token to receive.
     *  @return amountReceived Amount of token received.
     */
    function swapExactETHForTokens(
        IERC20 token
    ) public payable returns (uint256 amountReceived) {
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

    /**
     *  @notice Swap exact tokens for ETH.
     *  @param token Address of token to swap.
     *  @param amount Amount of token to swap.
     *  @param to Receiver of eth.
     *  @return amountReceived Amount of eth received.
     */
    function swapExactTokensForETH(
        IERC20 token,
        uint256 amount,
        address to
    ) public payable returns (uint256 amountReceived) {
        token.safeTransferFrom(msg.sender, address(this), amount);
        token.approve(address(router), amount);
        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = address(router.WETH());
        uint256[] memory amountOutMin = router.getAmountsOut(amount, path);
        uint256[] memory amounts = router.swapExactTokensForETH(
            amount,
            amountOutMin[1],
            path,
            to,
            deadline
        );
        return amounts[1];
    }

    /**
     *  @notice Swap exact tokens for tokens using path tokenA > WETH > tokenB.
     *  @param amountA Amount of tokenA to spend.
     *  @param tokenA Address of tokenA to spend.
     *  @param tokenB Address of tokenB to receive.
     *  @return amountReceivedTokenB Amount of tokenB received.
     */
    function swapExactTokensForTokens(
        uint256 amountA, 
        IERC20 tokenA, 
        IERC20 tokenB
    ) public returns (uint256 amountReceivedTokenB) {

        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
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

    /**
     *  @notice Given an output amount of an asset, 
     *          returns a required input amount of the other asset,
     *          using path tokenIn > WETH > tokenOut.
     *  @param amountOut Amount wish to receive.
     *  @param tokenOut Token wish to receive.
     *  @param tokenIn Token wish to spend.
     *  @return amountIn Amount of tokenIn.
     */
    function getAmountIn(
        uint256 amountOut, 
        IERC20 tokenOut, 
        IERC20 tokenIn
    ) public view returns (uint256 amountIn) {
        address[] memory path = new address[](3);
        path[0] = address(tokenIn);
        path[1] = address(router.WETH());
        path[2] = address(tokenOut);
        uint256[] memory amountsIn = router.getAmountsIn(amountOut, path);
        return amountsIn[0];
    }

    /**
     *  @notice Given an input amount of an asset, 
     *          returns the maximum output amount of the other asset,
     *          using path tokenIn > WETH > tokenOut.
     *  @param amountIn Amount wish to spend.
     *  @param tokenIn Token wish to spend.
     *  @param tokenOut Token wish to receive.
     *  @return amountOut Amount of tokenIn.
     */
    function getAmountOut(
        uint256 amountIn, 
        IERC20 tokenIn, 
        IERC20 tokenOut
    ) public view returns (uint256 amountOut) {
        address[] memory path = new address[](3);
        path[0] = address(tokenIn);
        path[1] = address(router.WETH());
        path[2] = address(tokenOut);
        uint256[] memory amountsIn = router.getAmountsOut(amountIn, path);
        return amountsIn[2];
    }
}
