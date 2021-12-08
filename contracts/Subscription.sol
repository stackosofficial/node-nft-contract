//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "hardhat/console.sol";

contract Subscription is StableCoinAcceptor, Ownable, ReentrancyGuard {
    IERC20 private stackToken;
    IUniswapV2Router02 private router;
    DarkMatter private darkMatter;
    GenerationManager private generations;
    address private taxAddress;

    uint256 private constant HUNDRED_PERCENT = 10000;
    uint256 public constant MONTH = 28 days;

    uint256 public dripPeriod = 700 days;
    uint256 public taxResetDeadline = 7 days;
    uint256 public price = 1e18;
    uint256 public bonusPercent = 2000;
    uint256 public taxReductionPercent = 2500; // monthly tax reduction

    struct Bonus {
        uint256 total;
        uint256 depositDate;
        uint256 lastTxDate;
        uint256 releasePeriod;
        uint256 lockedAmount;
        // TODO: this can be removed, because = total / releasePeriod
        uint256 dripRate;
    }

    struct Deposit {
        uint256 balance; // amount without bonus
        Bonus[] reward; // bonuses
        uint256 tax; // tax percent on withdraw
        uint256 withdrawableNum; // number of months that you able to claim bonus for.
        uint256 nextPayDate; // you can subscribe after this date, but before deadline
    }

    mapping(uint256 => mapping(uint256 => Deposit)) public deposits; // generationId => tokenId => Deposit
    mapping(uint256 => mapping(uint256 => uint256)) public overflow; // generationId => tokenId => withdraw amount

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
        taxAddress = _taxAddress;
        taxResetDeadline = _taxResetDeadline;
        price = _price;
        bonusPercent = _bonusPercent;
        taxReductionPercent = _taxReductionPercent;
    }



    function setDripPeriod(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Cant be zero");
        dripPeriod = _seconds;
    }

    function setPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Cant be zero");
        price = _price;
    }

    function viewPrice() external view returns (uint256) {
        return price;
    }

    function setBonusPercent(uint256 _percent) external onlyOwner {
        require(_percent <= HUNDRED_PERCENT, "Maximum is 100%");
        bonusPercent = _percent;
    }

    function setTaxReductionPercent(uint256 _percent) external onlyOwner {
        require(_percent <= HUNDRED_PERCENT, "Maximum is 100%");
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
     *  @param One of the supported coins such as USDT, USDC, DAI
     *  @dev Caller must approve us `price` * `numberOfMonths` amount of `_stablecoin`.
     *  @dev Tax resets to maximum if you re-subscribed after `nextPayDate` + `taxResetDeadline`.
     */

    function subscribe(
        uint256 generationId,
        uint256 tokenId,
        IERC20 _stablecoin
    ) public nonReentrant {
        require(supportsCoin(_stablecoin), "Unsupported payment coin");
        _subscribe(generationId, tokenId, _stablecoin, true);
    }

    function _subscribe(
        uint256 generationId,
        uint256 tokenId,
        // uint256 numberOfMonths,
        IERC20 _stablecoin,
        bool externalBuyer
    ) internal {
        require(generationId < generations.count(), "Generation doesn't exist");
        // check token exists
        IERC721(address(generations.get(generationId))).ownerOf(tokenId);

        Deposit storage deposit = deposits[generationId][tokenId];
        require(deposit.nextPayDate < block.timestamp, "Cant pay in advace");

        if (deposit.nextPayDate == 0) {
            deposit.nextPayDate = block.timestamp;
            deposit.tax = HUNDRED_PERCENT;
        }

        // Paid after deadline?
        if (deposit.nextPayDate + taxResetDeadline < block.timestamp) {
            deposit.nextPayDate = block.timestamp;
            deposit.tax = HUNDRED_PERCENT;
        }

        deposit.tax = subOrZero(
            deposit.tax,
            taxReductionPercent
        );
        deposit.withdrawableNum += 1;
        deposit.nextPayDate += MONTH;

        // convert stablecoin to stack token
        uint256 amount = buyStackToken(price, _stablecoin, externalBuyer);
        deposit.balance += amount;

        // bonuses logic
        uint256 newBonusAmount = amount * bonusPercent / HUNDRED_PERCENT;

        uint256 index;
        for (uint256 i; i < deposit.reward.length; i++) {
            Bonus storage bonus = deposit.reward[i];

            uint256 amountBonus = bonus.dripRate * (block.timestamp - bonus.lastTxDate);
            // if(bonus.lockedAmount > amountBonus && i == 0) break;

            if(bonus.lockedAmount < amountBonus) {
                amountBonus = bonus.lockedAmount;
            }
            overflow[generationId][tokenId] += amountBonus;
            bonus.lockedAmount -= amountBonus;
            bonus.lastTxDate = block.timestamp;

            // search for last non-withdrawn bonus
            if(bonus.lockedAmount == 0) index = i+1;
            // we should arrive here once such bonus found
            // example: [--++] where + is non-empty bonus, so index = 3 (not zero-based)
            else if(index > 0) {
                uint256 currentIndex = i - index;

                deposit.reward[currentIndex] = deposit.reward[index + currentIndex];
                delete deposit.reward[index + currentIndex];
            }
        }

        console.log("bonuses before pops:", deposit.reward.length);
        // pop from end until we find non-withdrawn bonus
        for (uint256 i = subOrZero(deposit.reward.length, 1); i > 0; i--) {
            Bonus storage bonus = deposit.reward[i];
            if(bonus.lockedAmount > 0) break;
            deposit.reward.pop();
        }
        console.log("bonuses after pops:", deposit.reward.length);

        // for (uint256 a = index; a < clusterUsers[clusterDns].length - 1; a++) {
        //     clusterUsers[clusterDns][a] = clusterUsers[clusterDns][a + 1];
        // }
        // clusterUsers[clusterDns].pop();

        deposit.reward.push(Bonus({
            total: newBonusAmount, 
            depositDate: block.timestamp, 
            lastTxDate: block.timestamp, 
            releasePeriod: dripPeriod, 
            lockedAmount: newBonusAmount,
            dripRate: newBonusAmount / dripPeriod 
        }));

        if(_stablecoin == stablecoins[0]) {
            console.log("usdt sub:", price/1e18);
            console.log("usdt sub:", amount/1e18);
            console.log("reward:", newBonusAmount / 1e18, newBonusAmount);
            console.log("balance:", deposit.balance / 1e18);
        }
        if(_stablecoin == stablecoins[2]) {
            console.log("dai sub:", price/1e18);
            console.log("dai sub:", amount/1e18);
            console.log("reward:", newBonusAmount / 1e18);
            console.log("balance:", deposit.balance / 1e18);
        }
    }

    /*
     *  @title Withdraw accumulated deposit taking into account bonus and tax.
     *  @param StackNFT generation id.
     *  @param Token ids.
     *  @dev Caller must own `tokenIds` and unwithdrawn bonus for current or previous months.
     *  @dev Tax reduced by `taxReductionPercent` each month subscribed in a row until tax is 0.
     *  @dev Tax resets to maximum if you missed your re-subscription.
     */

    function withdraw(uint256 generationId, uint256[] calldata tokenIds)
        external
        nonReentrant
    {
        for (uint256 i; i < tokenIds.length; i++) {
            _withdraw(generationId, tokenIds[i], false, 0, 0, IERC20(address(0)));
        }
    }

    /*
     *  @title Withdraw and then ReSubscribe using the withdrawn amount.
     *  @param StackNFT generation id to withdraw.
     *  @param Token ids to withdraw.
     *  @param StackNFT generation id to subscribe.
     *  @param Token id to subscribe.
     *  @dev Caller must own `tokenIds` and unwithdrawn bonus for current or previous months.
     *  @dev Tax reduced by `taxReductionPercent` each month subscribed in a row until tax is 0.
     *  @dev Tax resets to maximum if you missed your re-subscription.
     */

    function reSubscribe(
        uint256 withdrawGenerationId,
        uint256[] calldata withdrawTokenIds,
        uint256 subscribeGenerationId,
        uint256 subscribeTokenId,
        IERC20 _stablecoin
    ) external nonReentrant {
        require(supportsCoin(_stablecoin), "Unsupported payment coin");
        for (uint256 i; i < withdrawTokenIds.length; i++) {
            _withdraw(
                withdrawGenerationId,
                withdrawTokenIds[i],
                true, 
                subscribeGenerationId,
                subscribeTokenId,
                _stablecoin
            );
        }
    }

    function _withdraw(
        uint256 generationId,
        uint256 tokenId,
        bool subscription,
        uint256 subscribeGenerationId,
        uint256 subscribeTokenId,
        IERC20 _stablecoin
    ) private {
        require(generationId < generations.count(), "Generation doesn't exist");
        require(
            darkMatter.isOwnStackOrDarkMatter(
                msg.sender,
                generationId,
                tokenId
            ),
            "Not owner"
        );
        Deposit storage deposit = deposits[generationId][tokenId];

        uint256 totalBonusAmount;
        uint256 index;

        for (uint256 i; i < deposit.reward.length; i++) {
            Bonus storage bonus = deposit.reward[i];

            uint256 amount = (block.timestamp - bonus.lastTxDate) * bonus.dripRate;
            if (amount > bonus.lockedAmount)
                amount = bonus.lockedAmount;

            totalBonusAmount += amount;
            console.log("bonus: ", amount);

            bonus.lastTxDate = block.timestamp;
            bonus.lockedAmount -= amount;
            
            // same as in _subscribe
            console.log("lockedAmount 0 at index: ", i+1);
            if(bonus.lockedAmount == 0) index = i+1;
            else if(index > 0) {
                uint256 currentIndex = i - index;

                console.log(index, currentIndex);
                
                deposit.reward[currentIndex] = deposit.reward[index + currentIndex];
                delete deposit.reward[index + currentIndex];
            }
        }

        console.log("bonuses before pops:", deposit.reward.length);

        // same as in _subscribe
        for (uint256 i = subOrZero(deposit.reward.length, 1); i > 0; i--) {
            Bonus storage bonus = deposit.reward[i];
            console.log("pop cycle, lockedAmount: ", bonus.lockedAmount );
            if(bonus.lockedAmount > 0) break;
            deposit.reward.pop();
        }

        console.log("bonuses after pops:", deposit.reward.length);

        totalBonusAmount += overflow[generationId][tokenId];
        overflow[generationId][tokenId] = 0;
 
        // console.log("withdraw(times)", block.timestamp - deposit.lastTxDate, deposit.dripRate, deposit.withdrawableReward );

        require(
            deposit.balance + totalBonusAmount <= stackToken.balanceOf(address(this)),
            "Not enough balance on bonus wallet"
        );

        // if not subscribed
        if (deposit.nextPayDate < block.timestamp) {
            deposit.nextPayDate = 0;
            deposit.tax = HUNDRED_PERCENT - taxReductionPercent;
        }

        uint256 amountWithdraw = deposit.balance;

        deposit.withdrawableNum = 0;
        deposit.balance = 0;

        // early withdraw tax
        if (deposit.tax > 0) {
            // take tax from amount with bonus that will be withdrawn
            uint256 tax = (amountWithdraw * deposit.tax) / HUNDRED_PERCENT;
            amountWithdraw -= tax;
            stackToken.transfer(taxAddress, tax);
        }

        // amount withdraw with bonus
        console.log("withdraw", amountWithdraw / 1e18, totalBonusAmount / 1e18, deposit.tax);
        console.log("withdraw", amountWithdraw , totalBonusAmount );
        amountWithdraw += totalBonusAmount;
        require(amountWithdraw > 0, "Already withdrawn");

        if (subscription) {
            _reSubscribe(
                amountWithdraw,
                subscribeGenerationId,
                subscribeTokenId,
                _stablecoin
            );
        } else {
            stackToken.transfer(msg.sender, amountWithdraw);
            deposit.tax = HUNDRED_PERCENT;
        }
    }

    function _reSubscribe(
        uint256 _amountStack,
        uint256 _generationId,
        uint256 _tokenId,
        IERC20 _stablecoin
    ) internal {
        uint256 amountUSD = sellStackToken(_amountStack, _stablecoin);
        require(amountUSD >= price, "Not enough on deposit for resub");
        _subscribe(_generationId, _tokenId, _stablecoin, false);
        uint256 leftOverAmount = amountUSD - price;
        _stablecoin.transfer(msg.sender, leftOverAmount);
    }

    function pendingReward(uint256 _generationId, uint256 _tokenId)
        public
        view
        returns (uint256)
    {
        Deposit storage deposit = deposits[_generationId][_tokenId];

        uint256 totalPending;

        for (uint256 i; i < deposit.reward.length; i++) {
            Bonus storage bonus = deposit.reward[i];

            uint256 dripRate = bonus.total / bonus.releasePeriod;
            uint256 amount = (block.timestamp - bonus.lastTxDate) * dripRate;
            if (amount > bonus.lockedAmount)
                amount = bonus.lockedAmount;
            totalPending += amount;
        }

        return totalPending;
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
}
