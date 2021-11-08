//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IStackOSNFT.sol";
import "hardhat/console.sol";

contract Subscription is ReentrancyGuard {

    IERC20 private stackToken;
    IERC20 private paymentToken;
    IStackOSNFT private stackNFT;
    IUniswapV2Router02 private router;
    address private taxAddress;

    uint256 private constant MONTH = 28 days; // define what's a month
    uint256 private monthsRequired = 2; // 0 tax when subscribed this many months 
    uint256 private taxResetDeadline = 7 days; // tax reduction resets if you haven't pay for this long for current unpayed month

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
        @title Buy subscription.
        @dev Caller must own StackNFT and approve us `cost` amount of `paymentToken`.
    */
    function subscribe(uint256 tokenId, uint256 numberOfMonths) external nonReentrant {

        require(numberOfMonths > 0, "Zero months not allowed");
        require(stackNFT.ownerOf(tokenId) == msg.sender, "Not owner");
        require(deposits[tokenId].nextPayDate < block.timestamp, "Too soon");

        if(deposits[tokenId].nextPayDate == 0) {
            deposits[tokenId].nextPayDate = block.timestamp;
        }

        // Paid after deadline?
        if(deposits[tokenId].nextPayDate + taxResetDeadline < block.timestamp) {
            // Reset TAX reduction
            deposits[tokenId].monthsPaid = 0;
        }

        deposits[tokenId].monthsPaid += numberOfMonths;
        deposits[tokenId].nextPayDate += (MONTH * numberOfMonths);
        
        // convert payment token into stack token
        uint256 amountOutMin = getQuote(cost * numberOfMonths);
        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](2);
        path[0] = address(paymentToken);
        path[1] = address(stackToken);
        // TODO: what is amounts[0] ? just the same input amount we've passed?
        uint256[] memory amounts = router.swapExactTokensForTokens(cost * numberOfMonths, amountOutMin, path, address(this), deadline);
        
        console.log("amouns after swap payment token: %s, stack token: %s", amounts[0], amounts[1]);
        deposits[tokenId].balance += (amounts[1] * (10000 + bonusPercent) / 10000);
    }

    /*
        @title Withdraw accumulated deposit.
        @dev Caller must own `tokenIds` and subscription at least for one month.
        @dev TAX is subtracted if caller haven't subscribed for `monthsRequired` number of months in a row.
    */
    function withdraw(uint256[] calldata tokenIds) external nonReentrant {
        for(uint256 i; i < tokenIds.length; i) {
             _withdraw(tokenIds[i]);
        }
    }

    function _withdraw(uint256 tokenId) private {
        require(stackNFT.ownerOf(tokenId) == msg.sender, "Not owner");
        require(deposits[tokenId].monthsPaid > 0, "No subscription");
        
        if(deposits[tokenId].monthsPaid < monthsRequired ) {
            uint256 tax = monthsRequired - deposits[tokenId].monthsPaid * (deposits[tokenId].balance / monthsRequired);
            stackToken.transfer(taxAddress, tax);
            deposits[tokenId].balance -= tax;
            deposits[tokenId].monthsPaid = 0;
        }

        stackToken.transfer(msg.sender, deposits[tokenId].balance);
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
