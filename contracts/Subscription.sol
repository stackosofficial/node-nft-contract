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

    uint256 private constant MAX_PERCENT = 10000; // define what's a month
    uint256 private constant MONTH = 28 days; // define what's a month
    uint256 public monthsRequired = 2; // tax fully reduced to 0 when subscribed this many months 
    uint256 public taxResetDeadline = 7 days; // tax reduction resets if you haven't pay for this long for current unpayed month

    uint256 public cost = 1e18;
    uint256 public bonusPercent = 2000;
    uint256 public taxReductionPercent = 2500;

    // per NFT deposit
    struct Deposit {
        uint256 balance; // total stack amount, NOT counting TAX and bonus.
        uint256 subscribedMonthsNum;
        uint256 monthsWithdrawn;
        uint256 withdrawableNum; // number of months that you able to claim bonus for.
        uint256 nextPayDate; // subscribe can be called only after this date. and this date + deadline = is the date for TAX reset to max.
        uint256 tax; 
        uint256 lastSubscriptionDate; // should be a date when subscribe function called. and when withdraw it should be next month.
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

    // basically instead of subtraction underflow we return zero
    function subOrZero(uint256 a, uint256 b) private returns (uint256) {
        return a > b ? a - b : 0;
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
            deposits[tokenId].lastSubscriptionDate = block.timestamp;
            deposits[tokenId].nextPayDate = block.timestamp;
            deposits[tokenId].tax = MAX_PERCENT - taxReductionPercent;
        }

        // Paid after deadline?
        if(deposits[tokenId].nextPayDate + taxResetDeadline < block.timestamp) {
            uint256 prevWithdrawableMonths = (deposits[tokenId].nextPayDate - deposits[tokenId].lastSubscriptionDate) / MONTH;

            deposits[tokenId].withdrawableNum += prevWithdrawableMonths;
            deposits[tokenId].lastSubscriptionDate = block.timestamp;
            deposits[tokenId].nextPayDate = block.timestamp;
            deposits[tokenId].tax = MAX_PERCENT - taxReductionPercent;
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
    */
    function withdraw(uint256[] calldata tokenIds) external nonReentrant {
        for(uint256 i; i < tokenIds.length; i ++) {
             _withdraw(tokenIds[i]);
        }
    }

    // TODO: see what if paid for 100% months, but withdraw too soon
    // TODO: if they stop paying $100 a month the withdrawal tax resets
    function _withdraw(uint256 tokenId) private {
        require(stackNFT.ownerOf(tokenId) == msg.sender, "Not owner");
        require(deposits[tokenId].subscribedMonthsNum > 0, "No subscription");
        require(
            deposits[tokenId].balance <= stackToken.balanceOf(address(this)), 
            "Not enough balance on bonus wallet"
        );

        // if not subscribed
        if(deposits[tokenId].nextPayDate < block.timestamp) {
            // no need for ceil, their difference should be always divisible by month
            uint256 prevWithdrawableMonths = (deposits[tokenId].nextPayDate - deposits[tokenId].lastSubscriptionDate) / MONTH;

            deposits[tokenId].withdrawableNum += prevWithdrawableMonths;
            deposits[tokenId].lastSubscriptionDate = 0;
            deposits[tokenId].nextPayDate = 0;
            deposits[tokenId].tax = MAX_PERCENT - taxReductionPercent;
        } else {
            // current month number since last subscription date. ceil needed as we use arbitrary block time
            uint256 currentMonth = ceilDiv(block.timestamp - deposits[tokenId].lastSubscriptionDate, MONTH);
            deposits[tokenId].withdrawableNum += currentMonth;
            deposits[tokenId].lastSubscriptionDate += currentMonth * MONTH;
            assert(deposits[tokenId].nextPayDate >= deposits[tokenId].lastSubscriptionDate); // TODO: remove if will be fine on tests
            deposits[tokenId].tax = subOrZero(deposits[tokenId].tax, taxReductionPercent * currentMonth);
        }

        uint256 unwithdrawableNum = (deposits[tokenId].nextPayDate - deposits[tokenId].lastSubscriptionDate) / MONTH;

        uint256 amountWithdraw = 
            deposits[tokenId].balance / (deposits[tokenId].withdrawableNum + unwithdrawableNum);
        amountWithdraw *= deposits[tokenId].withdrawableNum;

        uint256 amountWithdrawWithBonus = amountWithdraw * (10000 + bonusPercent) / 10000;

        deposits[tokenId].withdrawableNum = 0;

        // early withdraw tax
        if(deposits[tokenId].tax > 0) {
            // console.log(currentMonthSinceStarted, zeroTaxDate, reducedTaxMonthsNum);
            // take tax from amount with bonus that will be withdrawn
            uint256 tax = amountWithdrawWithBonus * deposits[tokenId].tax / MAX_PERCENT;
            amountWithdrawWithBonus -= tax;
            stackToken.transfer(taxAddress, tax);

            // console.log(withdrawMonthsNum, amountWithdraw / 1e18, tax / 1e18, amountWithdrawWithBonus / 1e18);
            // take tax from deposit balance which is without bonus
            tax = deposits[tokenId].balance * deposits[tokenId].tax / MAX_PERCENT;
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

    // Taken from @openzeppelin/contracts/utils/math/Math.sol
    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        // (a + b - 1) / b can overflow on addition, so we distribute.
        return a / b + (a % b == 0 ? 0 : 1);
    }
}
