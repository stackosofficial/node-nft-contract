//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IStackOSNFT.sol";
import "hardhat/console.sol";

contract Subscription is Ownable, ReentrancyGuard {

    IERC20 private stackToken;
    IERC20 private paymentToken;
    IStackOSNFT private stackNFT;
    IUniswapV2Router02 private router;
    IERC20 private taxAddress;

    uint256 private constant MIN_MONTHS = 2; // 0 tax after this many months paid
    uint256 private constant MONTH = 28 days; // define what's a month
    uint256 private constant TAX_RESET_DEADLINE = 7 days; // tax reduction resets if you haven't pay for this long for current unpayed month

    uint256 public cost = 10e18;
    uint256 public bonusPercent = 2000;

    // per NFT deposit
    struct Deposit {
        uint256 balance; 
        uint256 monthsPaid;
        uint256 nextPayDate; 
    }

    mapping(uint256 => Deposit) private deposits;

    constructor(
        IERC20 _stackToken,
        IERC20 _paymentToken,
        IStackOSNFT _stackNFT,
        IUniswapV2Router02 _router
    ) {
        _stackToken = stackToken;
        _paymentToken = paymentToken;
        _stackNFT = stackNFT;
        _router = router;
    }

    /*
        @title StackNFT owner can buy subscription.
        @dev Caller must approve us `cost` amount of paymentToken.
    */
    function subscribe(uint256 tokenId) external nonReentrant {

        require(paymentToken.balanceOf(msg.sender) >= cost , "Not enough balance for subscription");
        require(stackNFT.ownerOf(tokenId) == msg.sender, "Not your token");
        // TODO: if withdraw, we set nextPayDay to 0, so technically can have 2 subs per month
        require(deposits[tokenId].nextPayDate < block.timestamp, "Cant subscribe twice a month");

        if(deposits[tokenId].nextPayDate == 0) {
            deposits[tokenId].nextPayDate = block.timestamp;
        }

        if(deposits[tokenId].nextPayDate + TAX_RESET_DEADLINE < block.timestamp) {
            deposits[tokenId].monthsPaid = 0;
        }

        deposits[tokenId].monthsPaid += 1;
        deposits[tokenId].nextPayDate += MONTH;
        
        // convert payment token into stack token
        uint256 amountOutMin = getQuote(cost );
        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](2);
        path[0] = address(paymentToken);
        path[1] = address(stackToken);
        // TODO: what is amounts[0] ? just the same input amount we've passed?
        uint256[] memory amounts = router.swapExactTokensForTokens(cost , amountOutMin, path, address(this), deadline);
        
        console.log("amouns after swap payment token: %s, stack token: %s", amounts[0], amounts[1]);

        deposits[tokenId].balance += (amounts[1] + ((amounts[1] * bonusPercent) / 10000));

    }

    function withdraw(uint256 tokenId) external nonReentrant {
        require(stackNFT.ownerOf(tokenId) == msg.sender, "Not your token");
        // TODO: require monthsPaid > 0?

        uint256 tax;
        if(deposits[tokenId].monthsPaid < MIN_MONTHS) {
            // TODO: should be there applied a trick for a better precision?
            uint256 payForMonth = deposits[tokenId].balance / MIN_MONTHS;
            tax = MIN_MONTHS - deposits[tokenId].monthsPaid * payForMonth;
        }

        deposits[tokenId].monthsPaid = 0;
        deposits[tokenId].nextPayDate = 0;

        stackToken.transfer(msg.sender, deposits[tokenId].balance - tax);
        deposits[tokenId].balance = 0;
    }

    function getQuote(uint256 amountA) public view returns (uint256) {
        IUniswapV2Pair lpToken = IUniswapV2Pair(
            IUniswapV2Factory(
                router.factory()
            ).getPair(address(paymentToken), address(stackToken))
        );
        (uint112 reserveA, uint112 reserveB, ) = lpToken.getReserves();
        return router.quote(amountA, reserveA, reserveB);
    }
}
