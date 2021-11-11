//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
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
    address private taxAddress;

    uint256 private constant MONTH = 28 days; // define what's a month
    uint256 public monthsRequired = 2; // tax fully reduced to 0 when subscribed this many months 
    uint256 public taxResetDeadline = 7 days; // tax reduction resets if you haven't pay for this long for current unpayed month

    uint256 public cost = 1e18;
    uint256 public bonusPercent = 2000;

    // per NFT deposit
    struct Deposit {
        uint256 balance; 
        uint256 subscribedMonthsNum;
        uint256 monthsWithdrawn;
        uint256 nextPayDate; 
        uint256 taxReductionStartDate; 
        uint256 firstSubscriptionDate; 
    }

    mapping(uint256 => Deposit) private deposits;

    constructor(
        IERC20 _paymentToken,
        IERC20 _stackToken,
        IStackOSNFT _stackNFT,
        IUniswapV2Router02 _router,
        address _taxAddress
    ) {
        paymentToken = _paymentToken;
        stackToken = _stackToken;
        stackNFT = _stackNFT;
        router = _router;
        taxAddress = _taxAddress;
    }

    function setCost(uint256 _cost) external onlyOwner {
        require(_cost > 0, "Cant be zero");
        cost = _cost;
    }

    function setBonusPercent(uint256 _percent) external onlyOwner {
        require(_percent <= 10000, "Should not be higher than 100%");
        bonusPercent = _percent;
    }

    function setMonthsRequired(uint256 _numberOfMonths) external onlyOwner {
        require(_numberOfMonths > 0, "Cant be zero");
        monthsRequired = _numberOfMonths;
    }

    function setTaxResetDeadline(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Cant be zero");
        taxResetDeadline = _seconds;
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

        if(deposits[tokenId].subscribedMonthsNum == 0) {
            deposits[tokenId].firstSubscriptionDate = block.timestamp;
        }

        // Paid after deadline?
        if(deposits[tokenId].nextPayDate + taxResetDeadline < block.timestamp) {
            // Reset TAX to maximum
            deposits[tokenId].taxReductionStartDate = 0;
        }
      

        if(deposits[tokenId].taxReductionStartDate == 0) {
            deposits[tokenId].taxReductionStartDate = block.timestamp;
        }

        deposits[tokenId].subscribedMonthsNum += numberOfMonths;
        deposits[tokenId].nextPayDate += (MONTH * numberOfMonths);
        
        // convert payment token into stack token
        uint256 totalCost = cost * numberOfMonths;
        uint256 amount = buyStackToken(totalCost);
        deposits[tokenId].balance += amount;

        // console.log(tokenId, deposits[tokenId].balance, deposits[tokenId].subscribedMonthsNum);
    }

    /*
        @title Withdraw accumulated deposit.
        @dev Caller must own `tokenIds` and subscription at least for one month.
        @dev TAX is subtracted if caller haven't subscribed for `monthsRequired` number of months in a row.
        
        TODO: If they stop paying $100 a month the withdrawal tax resets to 75%
    */
    function withdraw(uint256[] calldata tokenIds) external nonReentrant {
        for(uint256 i; i < tokenIds.length; i ++) {
             _withdraw(tokenIds[i]);
        }
    }

    // TODO: if paid 100% months, but withdraw too soon
    function _withdraw(uint256 tokenId) private {
        require(stackNFT.ownerOf(tokenId) == msg.sender, "Not owner");
        require(deposits[tokenId].subscribedMonthsNum > 0, "No subscription");
        require(
            deposits[tokenId].balance <= stackToken.balanceOf(address(this)), 
            "Not enough balance on bonus wallet"
        );

        // subscribedMonthsNum, currentMonthAfterTaxReductionStarted, 10 paid, 5 required, withdraw at 3 month, or at 7 month
        uint256 currentMonthSinceStarted = (block.timestamp - deposits[tokenId].firstSubscriptionDate) / MONTH;
        if(currentMonthSinceStarted > deposits[tokenId].subscribedMonthsNum) {
            currentMonthSinceStarted = deposits[tokenId].subscribedMonthsNum;
        } else if (currentMonthSinceStarted == 0) {
            currentMonthSinceStarted = 1;
        }

        uint256 notWithdrawnMonths = 
            deposits[tokenId].subscribedMonthsNum - deposits[tokenId].monthsWithdrawn;
        uint256 withdrawMonthsNum = 
            currentMonthSinceStarted - deposits[tokenId].monthsWithdrawn;
        uint256 amountWithdraw = 
            deposits[tokenId].balance / notWithdrawnMonths * withdrawMonthsNum;

        uint256 amountWithdrawWithBonus = amountWithdraw * (10000 + bonusPercent) / 10000;

        deposits[tokenId].monthsWithdrawn += withdrawMonthsNum;

        uint256 zeroTaxDate = deposits[tokenId].taxReductionStartDate + (MONTH * monthsRequired);
        uint256 reducedTaxMonthsNum = (block.timestamp - deposits[tokenId].taxReductionStartDate) / MONTH;
        if(reducedTaxMonthsNum > monthsRequired) {
            reducedTaxMonthsNum = monthsRequired;
        } else if (reducedTaxMonthsNum == 0) {
            reducedTaxMonthsNum = 1;
        }
        uint256 tax;
        // early withdraw tax
        if(zeroTaxDate > block.timestamp) {
            // console.log(currentMonthSinceStarted, zeroTaxDate, reducedTaxMonthsNum);
            // take tax from withdraw amount
            tax = amountWithdrawWithBonus / monthsRequired * (monthsRequired - reducedTaxMonthsNum);
            stackToken.transfer(taxAddress, tax);
            amountWithdrawWithBonus -= tax;

            // console.log(withdrawMonthsNum, amountWithdraw / 1e18, tax / 1e18, amountWithdrawWithBonus / 1e18);
            // take tax from NFT balance
            tax = amountWithdraw / monthsRequired * (monthsRequired - reducedTaxMonthsNum);
            deposits[tokenId].balance -= tax;
            // console.log(tokenId, amountWithdraw / 1e18, tax / 1e18, amountWithdrawWithBonus / 1e18);
        } else {
            deposits[tokenId].balance -= amountWithdraw;
        }

        stackToken.transfer(msg.sender, amountWithdrawWithBonus);
    }

    // swap payments-token to stack-token
    function buyStackToken(uint256 amount) private returns (uint256) {

        paymentToken.transferFrom(msg.sender, address(this), amount);
        paymentToken.approve(address(router), amount);

        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](2);
        path[0] = address(paymentToken);
        path[1] = address(stackToken);
        uint256[] memory amountOutMin = router.getAmountsOut(amount, path);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amount,
            amountOutMin[1],
            path,
            address(this),
            deadline
        );
        
        return amounts[1];
    }
}
