//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "./Exchange.sol";
import "./StackOsNFTBasic.sol";
import "./interfaces/IDecimals.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// import "hardhat/console.sol";

contract Subscription is Ownable, ReentrancyGuard {

    event SetOnlyFirstGeneration();
    event SetDripPeriod(uint256 _seconds);
    event SetPrice(uint256 price);
    event SetMaxPrice(uint256 maxPrice);
    event SetBonusPercent(uint256 _percent);
    event SetTaxReductionAmount(uint256 _amount);
    event SetForgivenessPeriod(uint256 _seconds);
    event NewPeriodStarted(uint256 newPeriodId);

    event Subscribe(
        address indexed subscriberWallet,
        uint256 nextPayDate,
        uint256 generationId,
        uint256 tokenId,
        uint256 stablePayed,
        uint256 stackReceived,
        uint256 userBonus,
        IERC20 _stablecoin,
        bool _payWithStack,
        uint256 periodId
    );

    event WithdrawRewards(
        address indexed subscriberWallet,
        uint256 amountWithdrawn,
        uint256 generationId, 
        uint256[] tokenIds,
        uint256[] periodIds
    );

    event PurchaseNewNft(
        address indexed subscriberWallet,
        uint256 generationId,
        uint256 tokenId,
        uint256 purchaseGenerationId,
        uint256 amountToMint
    );

    event Withdraw(
        address indexed subscriberWallet,
        uint256 generationId,
        uint256 tokenId,
        uint256 amountWithdrawn
    );

    event ClaimBonus(
        address indexed subscriberWallet,
        uint256 generationId,
        uint256 tokenId,
        uint256 amountWithdrawn
    );

    IERC20 internal immutable stackToken;
    GenerationManager internal immutable generations;
    DarkMatter internal immutable darkMatter;
    StableCoinAcceptor internal immutable stableAcceptor;
    Exchange internal immutable exchange;
    address internal immutable taxAddress;

    uint256 internal constant HUNDRED_PERCENT = 10000;
    uint256 public constant PRICE_PRECISION = 1e18; // how much decimals `price` has
    uint256 public constant MONTH = 28 days;

    uint256 public totalDeposited;
    uint256 public totalRewards;

    uint256 public dripPeriod;
    uint256 public forgivenessPeriod;
    uint256 public price; // price in USD
    uint256 public maxPrice;
    uint256 public bonusPercent;
    uint256 public taxReductionAmount;
    uint256 public currentPeriodId;
    bool public isOnlyFirstGeneration;


    enum withdrawStatus {
        withdraw,
        purchase
    }

    struct Period {
        uint256 balance; // total fees collected from mint
        uint256 subsNum; // total subscribed tokens during this period
        uint256 endAt;   // when period ended, then subs can claim reward
        mapping(uint256 => mapping(uint256 => PeriodTokenData)) tokenData; // tokens related data, see struct 
    }

    struct PeriodTokenData {
        bool isSub;         // whether token is subscribed during period
        uint256 withdrawn;  // this is probably unchanged once written, and is equal to token's share in period
    }

    struct Bonus {
        uint256 total;
        uint256 lastTxDate;
        uint256 releasePeriod;
        uint256 lockedAmount;
    }

    struct Deposit {
        uint256 balance; // amount without bonus
        Bonus[] bonuses; // subscription bonuses
        uint256 tax; // tax percent on withdraw
        uint256 nextPayDate; // you can subscribe after this date, but before deadline to reduce tax
    }

    mapping(uint256 => Period) public periods;
    mapping(uint256 => mapping(uint256 => Deposit)) public deposits; // generationId => tokenId => Deposit
    mapping(uint256 => mapping(uint256 => uint256)) public bonusDripped; // generationId => tokenId => total bonuses unlocked

    modifier restrictGeneration(uint256 generationId) {
        requireCorrectGeneration(generationId);
        _;
    }

    constructor(
        IERC20 _stackToken,
        GenerationManager _generations,
        DarkMatter _darkMatter,
        StableCoinAcceptor _stableAcceptor,
        Exchange _exchange,
        address _taxAddress,
        uint256 _forgivenessPeriod,
        uint256 _price,
        uint256 _bonusPercent,
        uint256 _taxReductionAmount
    ) {
        stackToken = _stackToken;
        generations = _generations;
        darkMatter = _darkMatter;
        stableAcceptor = _stableAcceptor;
        exchange = _exchange;
        taxAddress = _taxAddress;
        forgivenessPeriod = _forgivenessPeriod;
        price = _price;
        bonusPercent = _bonusPercent;
        taxReductionAmount = _taxReductionAmount;
    }    
    
    /**
     * @notice If set, then only 1st generation allowed to use contract, 
     *         otherwise only generation 2 and onward can.
     * @dev Could only be invoked by the contract owner.
     */
    function setOnlyFirstGeneration() external onlyOwner {
        isOnlyFirstGeneration = true;
        emit SetOnlyFirstGeneration();
    }

    /**
     * @notice Set bonus drip perdiod.
     * @param _seconds Amount of seconds required to fully release bonus.
     * @dev Could only be invoked by the contract owner.
     */
    function setDripPeriod(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Cant be zero");
        dripPeriod = _seconds;
        emit SetDripPeriod(_seconds);
    }

    /**
     * @notice Set subscription price.
     * @param _price New price in USD. Must have `PRICE_PRECISION` decimals.
     * @dev Could only be invoked by the contract owner.
     */
    function setPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Cant be zero");
        price = _price;
        emit SetPrice(_price);
    }

    /**
     * @notice Set max subscription price, usde only if contract locked to 1st generation.
     * @param _maxPrice Max price in USD. Must have `PRICE_PRECISION` decimals.
     * @dev Could only be invoked by the contract owner.
     * @dev Max price unused in 2nd generation and onward.
     */
    function setMaxPrice(uint256 _maxPrice) external onlyOwner {
        require(_maxPrice > 0, "Cant be zero");
        maxPrice = _maxPrice;
        emit SetMaxPrice(_maxPrice);
    }

    /**
     * @notice Set bonus added for each subscription.
     * @param _percent Bonus percent.
     * @dev Could only be invoked by the contract owner.
     */
    function setBonusPercent(uint256 _percent) external onlyOwner {
        require(_percent <= HUNDRED_PERCENT, "invalid basis points");
        bonusPercent = _percent;
        emit SetBonusPercent(_percent);
    }

    /**
     * @notice Set tax reduction amount.
     * @param _amount Amount to subtract from tax on each subscribed month in a row.
     * @dev Could only be invoked by the contract owner.
     */
    function setTaxReductionAmount(uint256 _amount) external onlyOwner {
        require(_amount <= HUNDRED_PERCENT, "invalid basis points");
        taxReductionAmount = _amount;
        emit SetTaxReductionAmount(_amount);
    }

    /**
     * @notice Set forgiveness period for resubscribe to keep TAX reducing.
     * @param _seconds Amount of seconds.
     * @dev Could only be invoked by the contract owner.
     */
    function setForgivenessPeriod(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Cant be zero");
        forgivenessPeriod = _seconds;
        emit SetForgivenessPeriod(_seconds);
    }  
    
    /**
     * @dev Reverts if generationId doesn't match contract's desired generation.
     * @dev This is used in modifier.
     */
    function requireCorrectGeneration(uint256 generationId) internal view {
        if(isOnlyFirstGeneration)
            require(generationId == 0, "Generaion should be 0");
        else
            require(generationId > 0, "Generaion shouldn't be 0");
    }

    /**
     *  @notice Pay subscription.
     *  @param generationId StackNFT generation id.
     *  @param tokenId StackNFT token id.
     *  @param _payAmount Amount to pay, unused if `isOnlyFirstGeneration == false`.
     *  @param _stablecoin Address of supported stablecoin, unused if `_payWithStack == true`.
     *  @param _payWithStack Whether to pay with STACK token.
     *  @dev Caller must approve us to spend `price` amount of `_stablecoin`.
     *  @dev If paying with stack, caller must approve stack amount that costs `price` usd.
     */
    function subscribe(
        uint256 generationId,
        uint256 tokenId,
        uint256 _payAmount,
        IERC20 _stablecoin,
        bool _payWithStack
    ) 
        public 
        nonReentrant 
        restrictGeneration(generationId)
    {
        require(
            // don't validate stables when paying with stack
            _payWithStack || stableAcceptor.supportsCoin(_stablecoin), 
            "Unsupported stablecoin"
        );

        uint256 _price = price;
        if(isOnlyFirstGeneration) {
            _price = _payAmount;
            require(
                _payAmount >= price && _payAmount <= maxPrice, 
                "Wrong pay amount"
            );
        }

        // active sub reward logic
        updatePeriod();
        periods[currentPeriodId].subsNum += 1;
        periods[currentPeriodId].tokenData[generationId][tokenId].isSub = true;

        _subscribe(generationId, tokenId, _price, _stablecoin, _payWithStack);
    }

    function _subscribe(
        uint256 generationId,
        uint256 tokenId,
        uint256 _price,
        IERC20 _stablecoin,
        bool _payWithStack
    ) internal {
        require(generationId < generations.count(), "Generation doesn't exist");
        require(
            generations.get(generationId).exists(tokenId), 
            "Token doesn't exists"
        );

        Deposit storage deposit = deposits[generationId][tokenId];
        require(deposit.nextPayDate < block.timestamp, "Cant pay in advance");

        // Paid after deadline?
        if (deposit.nextPayDate + forgivenessPeriod < block.timestamp) {
            deposit.tax = HUNDRED_PERCENT;
        }

        deposit.tax = subOrZero(deposit.tax, taxReductionAmount);
        deposit.nextPayDate = block.timestamp + MONTH;

        uint256 amount;
        if(_payWithStack) {
            _stablecoin = stableAcceptor.stablecoins(0);
            // price has 18 decimals, convert to stablecoin decimals
            _price = _price * 
                10 ** IDecimals(address(_stablecoin)).decimals() /
                PRICE_PRECISION;
            // get stack amount we need to sell to get `price` amount of usd
            amount = exchange.getAmountIn(
                _price, 
                _stablecoin, 
                stackToken
            );
            stackToken.transferFrom(msg.sender, address(this), amount);
        } else {
            // price has 18 decimals, convert to stablecoin decimals
            _price = _price * 
                10 ** IDecimals(address(_stablecoin)).decimals() /
                PRICE_PRECISION;
            require(
                _stablecoin.transferFrom(msg.sender, address(this), _price),
                "USD: transfer failed"
            );
            _stablecoin.approve(address(exchange), _price);
            amount = exchange.swapExactTokensForTokens(
                _price,
                _stablecoin,
                stackToken
            );
        }

        totalDeposited += amount;
        deposit.balance += amount;

        // bonuses logic
        updateBonuses(generationId, tokenId);
        uint256 bonusAmount = amount * bonusPercent / HUNDRED_PERCENT;
        deposit.bonuses.push(Bonus({
            total: bonusAmount,
            lastTxDate: block.timestamp,
            releasePeriod: dripPeriod,
            lockedAmount: bonusAmount
        }));
        emit Subscribe(
            msg.sender,
            deposit.nextPayDate,
            generationId,
            tokenId,
            _price,
            amount,
            bonusAmount,
            _stablecoin,
            _payWithStack,
            currentPeriodId
        );
    }

    /**
     *  @notice Start next period if its time.
     *  @dev Called automatically from other functions, but can be called manually.
     */
    function updatePeriod() public {
        if (periods[currentPeriodId].endAt < block.timestamp) {
            currentPeriodId += 1;
            periods[currentPeriodId].endAt = block.timestamp + MONTH;
            emit NewPeriodStarted(currentPeriodId);
        }
    }

    /**
     *  @notice Handle fee sent from minting.
     *  @param _amount Amount of stack trying to receive.
     *  @return _isTransfered Whether fee received or not.
     *  @dev Called automatically from stack NFT contract, but can be called manually.
     *  @dev Will receive tokens if previous period has active subs.
     */
    function onReceiveStack(uint256 _amount) 
        external 
        returns 
        (bool _isTransfered) 
    {
        updatePeriod();

        if(periods[currentPeriodId - 1].subsNum == 0) {
            return false;
        } else {
            totalRewards += _amount;
            periods[currentPeriodId - 1].balance += _amount;
            stackToken.transferFrom(msg.sender, address(this), _amount);
        }
        return true;
    }

    /**
     *  @notice Withdraw active subs reward which comes from minting fees.
     *  @param generationId StackNFT generation id.
     *  @param tokenIds StackNFT token ids.
     *  @param periodIds Period ids.
     *  @dev Caller must own tokens.
     *  @dev Periods must be ended and tokens should have subscription during periods.
     */
    function claimReward(
        uint256 generationId, 
        uint256[] calldata tokenIds,
        uint256[] calldata periodIds
    )
        external
        nonReentrant
        restrictGeneration(generationId)
    {
        updatePeriod();

        uint256 toWithdraw;
        for (uint256 i; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            require(
                darkMatter.isOwnStackOrDarkMatter(
                    msg.sender,
                    generationId,
                    tokenId
                ),
                "Not owner"
            );
            for (uint256 o; o < periodIds.length; o++) {
                require(periodIds[o] < currentPeriodId, "Period not ended");
                Period storage period = periods[periodIds[o]];
                require(period.subsNum > 0, "No subs in period");
                require(
                    period.tokenData[generationId][tokenId].isSub, 
                    "Was not subscribed"
                );

                uint256 share = period.balance / period.subsNum;
                // this way we ignore periods withdrawn
                toWithdraw += (share - period.tokenData[generationId][tokenId].withdrawn);
                period.tokenData[generationId][tokenId].withdrawn = share; 
            }
        }

        totalRewards -= toWithdraw;
        stackToken.transfer(msg.sender, toWithdraw);

        emit WithdrawRewards(
            msg.sender,
            toWithdraw,
            generationId, 
            tokenIds,
            periodIds
        );
    }

    /**
     *  @dev Calculate dripped amount and remove fully released bonuses from array.
     */
    function updateBonuses(
        uint256 generationId,
        uint256 tokenId
    ) private {
        Deposit storage deposit = deposits[generationId][tokenId];
        // number of fully unlocked bonuses
        uint256 unlockedNum; 
        // current number of token's bonuses
        uint256 bonusesLength = deposit.bonuses.length;
        // total dripped of each bonus
        uint256 drippedAmount;

        for (uint256 i; i < bonusesLength; i++) {
            // this should saves gas, but probably not
            // in case where 0 fully unlocked bonuses
            Bonus memory bonus = deposit.bonuses[i];

            uint256 withdrawAmount = 
                (bonus.total / bonus.releasePeriod) * 
                (block.timestamp - bonus.lastTxDate);

            if (withdrawAmount > bonus.lockedAmount)
                withdrawAmount = bonus.lockedAmount;
            
            drippedAmount += withdrawAmount;
            bonus.lockedAmount -= withdrawAmount;
            bonus.lastTxDate = block.timestamp;

            // We need to remove all drained bonuses from the array.
            // If our array looks like this [+--+-] where - is drained bonuses,
            // then we move all - to be after all +, so we get [++---]
            // Then we can pop all - from the end of array.
            if(bonus.lockedAmount == 0) 
                unlockedNum += 1;
            else if(unlockedNum > 0)
                deposit.bonuses[i - unlockedNum] = bonus;
            else
                deposit.bonuses[i] = bonus;
        }
        bonusDripped[generationId][tokenId] += drippedAmount;

        for (uint256 i = unlockedNum; i > 0; i--) {
            deposit.bonuses.pop();
        }
    }

    /**
     *  @notice Withdraw deposit, accounting for tax.
     *  @param generationId StackNFT generation id.
     *  @param tokenIds StackNFT token ids.
     *  @dev Caller must own `tokenIds`
     *  @dev Tax resets to maximum after withdraw.
     */
    function withdraw(
        uint256 generationId, 
        uint256[] calldata tokenIds
    )
        external
        nonReentrant
        restrictGeneration(generationId)
    {
        updatePeriod();
        for (uint256 i; i < tokenIds.length; i++) {
            _withdraw(
                generationId,
                tokenIds[i],
                withdrawStatus.withdraw,
                0,
                0
            );
        }
    }

   /**
    * @notice Purchase StackNFTs using money in deposit.
    * @param withdrawGenerationId StackNFT generation id to withdraw fee for.
    * @param withdrawTokenIds StackNFT token ids to withdraw fee for.
    * @param purchaseGenerationId Generation id to mint.
    * @param amountToMint Amount to mint.
    * @dev Tokens must be owned by the caller.
    * @dev Purchase Generation should be greater than 0.
    * @dev Function withdraw token subscription fee, then on received stack tokens
    *      it mints `amountToMint`, it will do this for every token in `tokenIds`.
    *      So if `withdrawTokenIds` has 2 subscribed tokens, and `amountToMint == 2`
    *      Then you'll receive 2 + 2 = 4 new tokens.
    */
    function purchaseNewNft(
        uint256 withdrawGenerationId,
        uint256[] calldata withdrawTokenIds,
        uint256 purchaseGenerationId,
        uint256 amountToMint
    ) 
        external 
        nonReentrant
        restrictGeneration(withdrawGenerationId)
    {
        require(purchaseGenerationId > 0, "Cant purchase generation 0");
        updatePeriod();

        for (uint256 i; i < withdrawTokenIds.length; i++) {
            _withdraw(
                withdrawGenerationId,
                withdrawTokenIds[i],
                withdrawStatus.purchase,
                purchaseGenerationId,
                amountToMint
            );
        }
    }

    function _withdraw(
        uint256 generationId,
        uint256 tokenId,
        withdrawStatus allocationStatus,
        uint256 purchaseGenerationId,
        uint256 amountToMint
    ) internal {
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

        uint256 amountWithdraw = deposit.balance;
        require(amountWithdraw > 0, "Already withdrawn");

        if (allocationStatus == withdrawStatus.purchase) {

            require(deposit.tax == 0, "Can only purchase when 0 tax");

            StackOsNFTBasic stack = StackOsNFTBasic(
                address(generations.get(purchaseGenerationId))
            );

            // most of the following should be on stack contract side, but code size limit...
            amountToMint = stack.clampToMaxSupply(amountToMint);

            // adjust decimals
            uint256 mintPrice = stack.mintPrice() * 
                (10 ** IDecimals(address(stableAcceptor.stablecoins(0))).decimals()) / 
                stack.PRICE_PRECISION();

            // convert usd to stack
            uint256 stackToSpend = exchange.getAmountIn(
                // get total amount usd needed to mint requested amount 
                (mintPrice * (10000 - stack.rewardDiscount()) / 10000) * amountToMint,
                stableAcceptor.stablecoins(0),
                stackToken
            );

            require(amountWithdraw > stackToSpend, "Not enough earnings");

            stackToken.transfer(
                address(stack), 
                stackToSpend 
            );

            stack.mintFromSubscriptionRewards(
                amountToMint, 
                stackToSpend, 
                msg.sender
            );

            // Add left over amount back to user's balance
            deposit.balance = amountWithdraw - stackToSpend;
            // decrease totals only by amount that we spend
            totalDeposited -= stackToSpend;

            emit PurchaseNewNft(
                msg.sender,
                generationId,
                tokenId,
                purchaseGenerationId,
                amountToMint
            );
        } else {

            // if not subscribed - max taxes
            if (deposit.nextPayDate + forgivenessPeriod < block.timestamp) {
                deposit.tax = HUNDRED_PERCENT - taxReductionAmount;
            }

            // decrease totals before we transfer tax
            totalDeposited -= amountWithdraw;

            // early withdraw tax
            if (deposit.tax > 0) {
                uint256 tax = amountWithdraw * deposit.tax / HUNDRED_PERCENT;
                amountWithdraw -= tax;
                stackToken.transfer(taxAddress, tax);
            }

            stackToken.transfer(msg.sender, amountWithdraw);
            deposit.tax = HUNDRED_PERCENT;
            deposit.balance = 0;

            emit Withdraw(
                msg.sender,
                generationId,
                tokenId,
                amountWithdraw
            );
        }
    }

    /**
     *  @notice Withdraw dripped bonuses.
     *  @param generationId StackNFT generation id.
     *  @param tokenIds StackNFT token ids.
     *  @dev Caller must own `tokenIds`.
     */
    function claimBonus(
        uint256 generationId,
        uint256[] calldata tokenIds
    ) external {

        uint256 totalWithdraw;
        for (uint256 i; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];

            require(generationId < generations.count(), "Generation doesn't exist");
            require(
                darkMatter.isOwnStackOrDarkMatter(
                    msg.sender,
                    generationId,
                    tokenId
                ),
                "Not owner"
            );

            updateBonuses(generationId, tokenId);
            uint256 unlockedBonus = bonusDripped[generationId][tokenId];
            totalWithdraw += unlockedBonus;
            bonusDripped[generationId][tokenId] = 0;

            emit ClaimBonus(
                msg.sender,
                generationId,
                tokenId,
                unlockedBonus
            );
        }

        uint256 contractBalance = stackToken.balanceOf(address(this));
        require(
            // make sure bonus won't withdraw balances of deposits or rewards
            totalWithdraw <= 
                contractBalance - totalRewards - totalDeposited,
            "Bonus balance is too low"
        );
        stackToken.transfer(msg.sender, totalWithdraw);
    }

   /**
     * @notice Get pending bonus amount, locked amount, and longest timeLeft.
     * @param _generationId StackNFT generation id.
     * @param _tokenId StackNFT token id.
     * @return unlocked Withdrawable amount of bonuses
     * @return locked Locked amount of bonuses
     * @return timeLeft Per-bonus array containing time left to fully release locked amount
     */
    function pendingBonus(uint256 _generationId, uint256 _tokenId)
        external
        view
        returns (
            uint256 unlocked, 
            uint256 locked,
            uint256 timeLeft 
        )
    {
        Deposit memory deposit = deposits[_generationId][_tokenId];

        uint256 bonusesLength = deposit.bonuses.length;

        for (uint256 i; i < bonusesLength; i++) {
            Bonus memory bonus = deposit.bonuses[i];

            uint256 amount = 
                (bonus.total / bonus.releasePeriod) * 
                (block.timestamp - bonus.lastTxDate);

            if (amount > bonus.lockedAmount)
                amount = bonus.lockedAmount;

            unlocked += amount;
            bonus.lockedAmount -= amount;
            locked += bonus.lockedAmount;

            // find max timeleft
            uint256 _timeLeft = 
                bonus.releasePeriod * bonus.lockedAmount / bonus.total;

            if(_timeLeft > timeLeft) timeLeft = _timeLeft;
        }
        
        unlocked += bonusDripped[_generationId][_tokenId];
    }

   /**
     * @notice First elemement shows total claimable amount.
     * @notice Next elements shows claimable amount per next months.
     * @param _generationId StackNFT generation id.
     * @param _tokenId StackNFT token id.
     * @param months Amount of MONTHs to get drip rate for.
     */
    function monthlyDripRateBonus(
        uint256 _generationId, 
        uint256 _tokenId,
        uint256 months
    )
        external
        view
        returns (
            uint256[] memory dripRates
        )
    {
        Deposit memory deposit = deposits[_generationId][_tokenId];

        uint256 bonusesLength = deposit.bonuses.length;
        uint256[] memory monthlyDrip = new uint256[](months);

        uint256 month = MONTH;
        uint256 blockTimestamp = block.timestamp;

        // +1 because we want skip first element
        // as it shows us unlocked amount
        for (uint256 m; m < months+1; m++) {

            uint256 unlocked; 

            for (uint256 i; i < bonusesLength; i++) {
                Bonus memory bonus = deposit.bonuses[i];

                if(bonus.lockedAmount == 0) continue;

                uint256 amount = 
                    (bonus.total / bonus.releasePeriod) * 
                    (blockTimestamp - bonus.lastTxDate);

                if(m == 0)
                    bonus.lastTxDate = blockTimestamp;
                else
                    bonus.lastTxDate += month;

                if (amount > bonus.lockedAmount)
                    amount = bonus.lockedAmount;

                unlocked += amount;
                bonus.lockedAmount -= amount;
            }
            blockTimestamp += month;
            if(m > 0)
                monthlyDrip[m-1] = unlocked;
            unlocked = 0;
        }
        dripRates = monthlyDrip;
    }

    /**
     *  @notice Get active subs pending reward.
     *  @param generationId StackNFT generation id.
     *  @param tokenIds StackNFT token id.
     *  @param periodIds Period ids.
     *  @dev Unsubscribed tokens in period are ignored.
     *  @dev Period ids that are bigger than `currentPeriodId` are ignored.
     */
    function pendingReward(
        uint256 generationId, 
        uint256[] calldata tokenIds,
        uint256[] calldata periodIds
    )
        external
        view
        returns(uint256 withdrawableAmount)
    {
        uint256 _currentPeriodId = currentPeriodId;
        if (periods[_currentPeriodId].endAt < block.timestamp) {
            _currentPeriodId += 1;
        }

        uint256 toWithdraw;
        for (uint256 i; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];

            for (uint256 o; o < periodIds.length; o++) {
                if(periodIds[o] >= currentPeriodId) continue;
                Period storage period = periods[periodIds[o]];
                if(period.subsNum == 0) continue;
                if(!period.tokenData[generationId][tokenId].isSub) continue;
                        
                uint256 share = period.balance / period.subsNum;
                toWithdraw += (share - period.tokenData[generationId][tokenId].withdrawn);
            }
        }
        return toWithdraw;
    }

    /**
     *  @dev Subtract function, on underflow returns zero.
     */
    function subOrZero(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : 0;
    }
}
