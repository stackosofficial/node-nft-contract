//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

// import "hardhat/console.sol";

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
        WETH = router.WETH();
        emit SetRouter(_router);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts) {

        address[] memory newPath = getPath(path);

        uint256[] memory newAmounts = router.swapExactETHForTokens{value: msg.value}(
            0,
            newPath,
            to,
            deadline
        );
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = newAmounts[newAmounts.length - 1];
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

        address[] memory newPath = getPath(path);

        uint256[] memory newAmounts = router.swapExactTokensForETH(
            amountIn,
            0,
            newPath,
            to,
            deadline
        );
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = newAmounts[newAmounts.length - 1];
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

        address[] memory newPath = getPath(path);

        uint256[] memory newAmounts = router.swapExactTokensForTokens(
            amountIn,
            0,
            newPath,
            to,
            deadline
        );
        amounts = new uint256[](path.length);
        amounts[path.length-1] = newAmounts[newAmounts.length-1];
    }

    function getAmountsIn(uint256 amountOut, address[] memory path)
        public
        view
        returns (uint256[] memory amounts)
    {
        address[] memory newPath = getPath(path);

        // in Exchange.getAmountIn it takes [0], so assign only it
        amounts = new uint256[](path.length);
        amounts[0] = router.getAmountsIn(amountOut, newPath)[0];
    }

    function getAmountsOut(uint256 amountIn, address[] memory path)
        public
        view
        returns (uint256[] memory amounts)
    {
        address[] memory newPath = getPath(path);

        uint256[] memory newAmounts = router.getAmountsOut(amountIn, newPath);
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = newAmounts[newAmounts.length - 1];
    }

    function getPath(address[] memory path)
        public
        view
        returns (address[] memory newPath)
    {
        address tokenIn = path[0];
        address tokenOut = path[path.length-1];
        newPath = paths[tokenIn][tokenOut];
        require(newPath.length > 1, "Swap path not found");
    }
}
