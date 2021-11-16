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
import "./MasterNode.sol";
import "./GenerationManager.sol";

contract Subscription is Ownable, ReentrancyGuard {

    IERC20 private stackToken;
    IERC20 private paymentToken; // you buy subscriptions for this tokens
    IUniswapV2Router02 private router;
    MasterNode private masterNode;
    GenerationManager private generations;
    address private taxAddress;

    uint256 private constant MAX_PERCENT = 10000;   // for convinience 100%
    uint256 public constant MONTH = 28 days;        // define what's a month. if changing this, then also change in test

    uint256 public taxResetDeadline = 7 days;   // tax reduction resets if you subscribed and missed deadline
    uint256 public price = 1e18;                // subscription price 
    uint256 public bonusPercent = 2000;         // bonus that is added for each subscription month
    uint256 public taxReductionPercent = 2500;  // how much 

    // per NFT deposit
    struct Deposit {
        uint256 balance;    // total stack amount, NOT counting TAX and bonus.
        uint256 tax;        // withdraw TAX percent
        uint256 withdrawableNum; // number of months that you able to claim bonus for.
        uint256 nextPayDate;     // subscribe can be called only after this date. and this date + deadline = is the date for TAX reset to max.
        uint256 lastSubscriptionDate; // should be a date when subscribe function called. and when withdraw it should be next month.
    }

    mapping(uint256 => mapping(uint256 => Deposit)) private deposits; // generationId => tokenId => Deposit

    constructor(
        IERC20 _paymentToken,
        IERC20 _stackToken,
        GenerationManager _generations,
        MasterNode _masterNode,
        IUniswapV2Router02 _router,
        address _taxAddress,
        uint256 _taxResetDeadline,
        uint256 _price,
        uint256 _bonusPercent,
        uint256 _taxReductionPercent
    ) {
        paymentToken = _paymentToken;
        stackToken = _stackToken;
        generations = _generations;
        masterNode = _masterNode;
        router = _router;
        taxAddress = _taxAddress;
        taxResetDeadline = _taxResetDeadline;
        price = _price;
        bonusPercent = _bonusPercent;
        taxReductionPercent = _taxReductionPercent;
    }

    function setPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Cant be zero");
        price = _price;
    }

    function setBonusPercent(uint256 _percent) external onlyOwner {
        require(_percent <= MAX_PERCENT, "Maximum is 100%");
        bonusPercent = _percent;
    }

    function setTaxReductionPercent(uint256 _percent) external onlyOwner {
        require(_percent <= MAX_PERCENT, "Maximum is 100%");
        taxReductionPercent = _percent;
    }

    function setTaxResetDeadline(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Cant be zero");
        taxResetDeadline = _seconds;
    }

    /*
     *  @title Buy subscription.
     *  @param StackNFT generation id.
     *  @param Token id.
     *  @param How many months to subscribe for.
     *  @dev Caller must own StackNFT and approve us `price` * `numberOfMonths` amount of `paymentToken`.
     *  @dev Caller can re-subscribe after last subscription month is ended.
     *  @dev Tax resets to maximum if you re-subscribed too late, after `taxResetDeadline`.
     */
    function subscribe(uint256 generationId, uint256 tokenId, uint256 numberOfMonths) external nonReentrant {

        require(generationId < generations.count(), "Generation doesn't exist");
        require(masterNode.isOwnStackOrMasterNode(msg.sender, generationId, tokenId), "Not owner");
        require(numberOfMonths > 0, "Zero months not allowed");
        require(deposits[generationId][tokenId].nextPayDate < block.timestamp, "Too soon");

        if(deposits[generationId][tokenId].nextPayDate == 0) {
            deposits[generationId][tokenId].lastSubscriptionDate = block.timestamp;
            deposits[generationId][tokenId].nextPayDate = block.timestamp;
            deposits[generationId][tokenId].tax = MAX_PERCENT;
        }

        // Paid after deadline?
        if(deposits[generationId][tokenId].nextPayDate + taxResetDeadline < block.timestamp) {
            uint256 prevWithdrawableMonths = (deposits[generationId][tokenId].nextPayDate - deposits[generationId][tokenId].lastSubscriptionDate) / MONTH;

            deposits[generationId][tokenId].withdrawableNum += prevWithdrawableMonths;
            deposits[generationId][tokenId].lastSubscriptionDate = block.timestamp;
            deposits[generationId][tokenId].nextPayDate = block.timestamp;
            deposits[generationId][tokenId].tax = MAX_PERCENT;
        }

        deposits[generationId][tokenId].nextPayDate += (MONTH * numberOfMonths);
        
        // convert payment token into stack token
        uint256 totalCost = price * numberOfMonths;
        uint256 amount = buyStackToken(totalCost);
        deposits[generationId][tokenId].balance += amount;
    }

    /*
     *  @title Withdraw accumulated deposit.
     *  @dev Caller must own `tokenIds` and unwithdrawn bonus for current or previous months.
     *  @dev Tax reduced by `taxReductionPercent` each month subscribed in a row until 0.
     *  @dev Tax resets to maximum if you missed your re-subscription.
     */
    function withdraw(uint256 generationId, uint256[] calldata tokenIds) external nonReentrant {
        for(uint256 i; i < tokenIds.length; i ++) {
             _withdraw(generationId, tokenIds[i]);
        }
    }

    function _withdraw(uint256 generationId, uint256 tokenId) private {
        require(generationId < generations.count(), "Generation doesn't exist");
        require(masterNode.isOwnStackOrMasterNode(msg.sender, generationId, tokenId), "Not owner");
        require(deposits[generationId][tokenId].nextPayDate > 0, "No subscription");
        require(
            deposits[generationId][tokenId].lastSubscriptionDate < block.timestamp &&
            deposits[generationId][tokenId].nextPayDate > deposits[generationId][tokenId].lastSubscriptionDate, 
            "Already withdrawn"
        );
        require(
            deposits[generationId][tokenId].balance <= stackToken.balanceOf(address(this)), 
            "Not enough balance on bonus wallet"
        );

        // if not subscribed
        if(deposits[generationId][tokenId].nextPayDate < block.timestamp) {
            // no need for ceil, the difference should always be divisible by a month
            uint256 prevWithdrawableMonths = (deposits[generationId][tokenId].nextPayDate - deposits[generationId][tokenId].lastSubscriptionDate) / MONTH;

            deposits[generationId][tokenId].withdrawableNum += prevWithdrawableMonths;
            deposits[generationId][tokenId].lastSubscriptionDate = 0;
            deposits[generationId][tokenId].nextPayDate = 0;
            deposits[generationId][tokenId].tax = MAX_PERCENT - taxReductionPercent;
        } else {
            // current month number since last subscription date. ceil needed as we use arbitrary block time
            uint256 currentMonth = ceilDiv(block.timestamp - deposits[generationId][tokenId].lastSubscriptionDate, MONTH);
            deposits[generationId][tokenId].withdrawableNum += currentMonth;
            // move last subscription date to the next month, so that we will be unable to withdraw for the same months again
            deposits[generationId][tokenId].lastSubscriptionDate += currentMonth * MONTH;
            assert(deposits[generationId][tokenId].nextPayDate >= deposits[generationId][tokenId].lastSubscriptionDate);
            deposits[generationId][tokenId].tax = subOrZero(deposits[generationId][tokenId].tax, taxReductionPercent * currentMonth);
        }

        uint256 unwithdrawableNum = (deposits[generationId][tokenId].nextPayDate - deposits[generationId][tokenId].lastSubscriptionDate) / MONTH;
        uint256 amountWithdraw = 
            deposits[generationId][tokenId].balance / (deposits[generationId][tokenId].withdrawableNum + unwithdrawableNum);
        amountWithdraw *= deposits[generationId][tokenId].withdrawableNum;
        uint256 amountWithdrawWithBonus = amountWithdraw * (MAX_PERCENT + bonusPercent) / MAX_PERCENT;

        deposits[generationId][tokenId].withdrawableNum = 0;

        // early withdraw tax
        if(deposits[generationId][tokenId].tax > 0) {
            // take tax from amount with bonus that will be withdrawn
            uint256 tax = amountWithdrawWithBonus * deposits[generationId][tokenId].tax / MAX_PERCENT;
            amountWithdrawWithBonus -= tax;
            stackToken.transfer(taxAddress, tax);
        } 

        // subtract withdrawn amount from balance (not counting tax and bonus)
        deposits[generationId][tokenId].balance -= amountWithdraw;

        stackToken.transfer(msg.sender, amountWithdrawWithBonus);
    }

    /*
     *  @title Swap `paymentToken` for `stackToken`.
     *  @param Amount of `paymentToken`.
     */
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

    /*
     *  @title Subtract function, a - b.
     *  @title But instead of reverting with subtraction underflow we return zero. 
     *  @title For tax reduction 25% this is excessive safety, but if its 33% then on last 1% we will get underflow error.
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
