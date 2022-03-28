//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

contract FakeRouter is Ownable {
    using SafeERC20 for IERC20;

    event SetRouter(address newRouter);
    event SetPath(address from, address to, address[] path);

    IUniswapV2Router02 public router;

    address public WETH;

    // from -> to -> path
    mapping(address => mapping(address => address[])) public paths;

    constructor(address _router) {
        router = IUniswapV2Router02(_router);
        WETH = router.WETH();
    }

    function setPath(
        address from,
        address to,
        address[] calldata path
    ) external onlyOwner {
        require(path[0] == from, "Wrong 'from' in path");
        require(path[path.length - 1] == to, "Wrong 'to' in path");

        for (uint256 i = 0; i < path.length; i++) {
            require(path[i] != address(0), "Zero address in path");
        }
        // check that all pairs exists
        IUniswapV2Factory factory = IUniswapV2Factory(router.factory());
        for (uint256 i; i < path.length - 1; i++) {
            address pair = factory.getPair(path[i], path[i + 1]);
            require(pair != address(0), "Pair not found");
        }
        paths[from][to] = path;
        emit SetPath(from, to, path);
    }

    function setPathUnchecked(
        address from,
        address to,
        address[] calldata path
    ) external onlyOwner {
        for (uint256 i = 0; i < path.length; i++) {
            require(path[i] != address(0), "Zero address in path");
        }

        paths[from][to] = path;
        emit SetPath(from, to, path);
    }

    function setRouter(address _router) external onlyOwner {
        require(_router != address(0));
        router = IUniswapV2Router02(_router);
        emit SetRouter(_router);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts) {
        amounts = router.swapExactETHForTokens{value: msg.value}(
            amountOutMin,
            path,
            to,
            deadline
        );
        return amounts;
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(path[0]).approve(address(router), amountIn);
        uint256[] memory amounts = router.swapExactTokensForETH(
            amountIn,
            amountOutMin,
            path,
            to,
            deadline
        );
        return amounts;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(path[0]).approve(address(router), amountIn);

        address tokenFrom = path[0];
        address tokenTo = path[2];
        address[] memory newPath = paths[tokenFrom][tokenTo];
        require(newPath.length > 1, "Swap path not found");

        amounts = router.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            newPath,
            to,
            deadline
        );
        return amounts;
    }

    function getAmountsIn(uint256 amountOut, address[] memory path)
        public
        view
        returns (uint256[] memory amounts)
    {
        address tokenIn = path[0];
        address tokenOut = path[2];
        address[] memory newPath = paths[tokenIn][tokenOut];
        require(newPath.length > 1, "Swap path not found");

        uint256[] memory amountsIn = router.getAmountsIn(amountOut, newPath);
        return amountsIn;
    }

    function getAmountsOut(uint256 amountIn, address[] memory path)
        public
        view
        returns (uint256[] memory amounts)
    {
        address tokenIn = path[0];
        address tokenOut = path[2];
        address[] memory newPath = paths[tokenIn][tokenOut];
        require(newPath.length > 1, "Swap path not found");

        uint256[] memory amountsOut = router.getAmountsOut(amountIn, newPath);
        return amountsOut;
    }
}
