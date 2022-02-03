//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "./Exchange.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./interfaces/IStackOsNFTBasic.sol";
import "./interfaces/IDecimals.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "hardhat/console.sol";

contract Subscription is Ownable, ReentrancyGuard {

    event SetOnlyFirstGeneration();
    event SetDripPeriod(uint256 _seconds);
    event SetPrice(uint256 price);
    event SetMaxPrice(uint256 maxPrice);
    event SetBonusPercent(uint256 _percent);
    event SetTaxReductionAmount(uint256 _amount);
    event SetForgivenessPeriod(uint256 _seconds);

    event Subscribe(
        address indexed subscriberWallet,
        uint256 blockTimestamp,
        uint256 generationId,
        uint256 tokenId,
        uint256 _price,
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

    event HarvestBonus(
        address indexed subscriberWallet,
        uint256 generationId,
        uint256 tokenId,
        uint256 bonusHarvested
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
    mapping(uint256 => mapping(uint256 => uint256)) public bonusDripped; // generationId => tokenId => withdraw amount

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
    
    /*
     * @title If set, then only 1st generation allowed to use contract, otherwise only generations above 1st can.
     * @dev Could only be invoked by the contract owner.
     */
    function setOnlyFirstGeneration() external onlyOwner {
        isOnlyFirstGeneration = true;
        emit SetOnlyFirstGeneration();
    }

    /*
     * @title Set drip perdiod
     * @param Amount of seconds required to release bonus
     * @dev Could only be invoked by the contract owner.
     */
    function setDripPeriod(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Cant be zero");
        dripPeriod = _seconds;
        emit SetDripPeriod(_seconds);
    }

    /*
     * @title Set subscription price
     * @param New price in USD
     * @dev Could only be invoked by the contract owner.
     */
    function setPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Cant be zero");
        price = _price;
        emit SetPrice(_price);
    }

    /*
     * @title Set max subscription price, usde only if contract locked to 1st generation
     * @param New price in USD
     * @dev Could only be invoked by the contract owner.
     */
    function setMaxPrice(uint256 _maxPrice) external onlyOwner {
        require(_maxPrice > 0, "Cant be zero");
        maxPrice = _maxPrice;
        emit SetMaxPrice(_maxPrice);
    }

    /*
     * @title Set bonus added for each subscription on top of it's price
     * @param Bonus percent
     * @dev Could only be invoked by the contract owner.
     */
    function setBonusPercent(uint256 _percent) external onlyOwner {
        require(_percent <= HUNDRED_PERCENT, "invalid basis points");
        bonusPercent = _percent;
        emit SetBonusPercent(_percent);
    }

    /*
     * @title Set tax reduction amount
     * @param Amount to subtract from tax on each subscribed month in a row
     * @dev Could only be invoked by the contract owner
     */
    function setTaxReductionAmount(uint256 _amount) external onlyOwner {
        require(_amount <= HUNDRED_PERCENT, "invalid basis points");
        taxReductionAmount = _amount;
        emit SetTaxReductionAmount(_amount);
    }

    /*
     * @title Set time frame that you have to resubscribe to keep TAX reducing
     * @param Amount of seconds
     * @dev Could only be invoked by the contract owner
     */
    function setForgivenessPeriod(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Cant be zero");
        forgivenessPeriod = _seconds;
        emit SetForgivenessPeriod(_seconds);
    }  
    
    /*
     * @title Reverts if generationId doesn't match contract's desired generation.
     * @title This is used in modifier.
     * @dev Could only be invoked by the contract owner.
     */
    function requireCorrectGeneration(uint256 generationId) internal view {
        if(isOnlyFirstGeneration)
            require(generationId == 0, "Generaion should be 0");
        else
            require(generationId > 0, "Generaion shouldn't be 0");
    }

    /*
     *  @title Pay subscription
     *  @param Generation id
     *  @param Token id
     *  @param Amount user wish to pay, used only in 1st generation subscription contract
     *  @param Address of supported stablecoin, unused when pay with STACK
     *  @param Whether to pay with STACK token
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

        if (deposit.nextPayDate == 0) {
            deposit.nextPayDate = block.timestamp;
            deposit.tax = HUNDRED_PERCENT;
        }

        // Paid after deadline?
        if (deposit.nextPayDate + forgivenessPeriod < block.timestamp) {
            deposit.nextPayDate = block.timestamp;
            deposit.tax = HUNDRED_PERCENT;
        }

        deposit.tax = subOrZero(deposit.tax, taxReductionAmount);
        deposit.nextPayDate += MONTH;

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
        // TODO: can add `totalBonuses` also, and remove other totals
        uint256 bonusAmount = amount * bonusPercent / HUNDRED_PERCENT;
        deposit.bonuses.push(Bonus({
            total: bonusAmount,
            lastTxDate: block.timestamp,
            releasePeriod: dripPeriod,
            lockedAmount: bonusAmount
        }));
        emit Subscribe(
            msg.sender,
            block.timestamp,
            generationId,
            tokenId,
            _price,
            _stablecoin,
            _payWithStack,
            currentPeriodId
        );
    }

    /*
     *  @title End period if its time
     *  @dev Called automatically from other functions, but can be called manually
     */
    function updatePeriod() public {
        if (periods[currentPeriodId].endAt < block.timestamp) {
            currentPeriodId += 1;
            periods[currentPeriodId].endAt = block.timestamp + MONTH;
        }
    }    

    /*
     *  @title Handle fee sent from minting
     *  @return Whether fee received or not
     *  @dev Called automatically from stack NFT contract, but can be called manually
     *  @dev Will receive tokens if previous period has active subs
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

    /*
     *  @title Withdraw active subs reward
     *  @param Generation id
     *  @param Token ids
     *  @param Period ids
     *  @dev Caller must own tokens
     *  @dev Periods must be ended and tokens should have subscription during periods
     */
     
    function harvestReward(
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

        require(
            stackToken.balanceOf(address(this)) - totalDeposited >= toWithdraw,
            "Rewards balance is too low"
        );

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

    /*
     *  @dev Calculate dripped amount and remove fully released bonuses from array.
     */
    function updateBonuses(
        uint256 generationId,
        uint256 tokenId
    ) private {
        Deposit storage deposit = deposits[generationId][tokenId];
        uint256 index;
        uint256 len = deposit.bonuses.length;
        uint256 drippedAmount;

        for (uint256 i; i < len; i++) {
            Bonus storage bonus = deposit.bonuses[i];

            uint256 withdrawAmount = 
                (bonus.total / bonus.releasePeriod) * 
                (block.timestamp - bonus.lastTxDate);

            if (withdrawAmount > bonus.lockedAmount)
                withdrawAmount = bonus.lockedAmount;
            
            drippedAmount += withdrawAmount;
            bonus.lockedAmount -= withdrawAmount;
            bonus.lastTxDate = block.timestamp;

            // We assume that bonuses drained one by one starting from the first one.
            // Then if our array looks like this [--++] where - is drained bonuses,
            // we shift all + down to replace all -, then our array is [++--]
            // Then we can pop all - as we only able to remove elements from the end of array.
            if(bonus.lockedAmount == 0) 
                index = i+1;
            else if(index > 0) {
                uint256 currentIndex = i - index;
                // TODO: probably should be able to optimize but will loss a lot of readability 
                // (replace bonuses[i] with bonus, and make it memory)
                deposit.bonuses[currentIndex] = 
                    deposit.bonuses[i];
                delete deposit.bonuses[i];
            }
        }
        bonusDripped[generationId][tokenId] += drippedAmount;

        for (uint256 i = deposit.bonuses.length; i > 0; i--) {
            if(deposit.bonuses[i - 1].lockedAmount > 0) break;
            deposit.bonuses.pop();
        }
    }

    /*
     *  @title Withdraw deposit, accounting for tax
     *  @param Generation id
     *  @param Token ids
     *  @dev Caller must own `tokenIds`
     *  @dev Tax resets to maximum after withdraw
     */
    function withdraw(uint256 generationId, uint256[] calldata tokenIds)
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

   /*
     * @title Purchase StackNFTs using money in deposit
     * @param Generation id to withdraw
     * @param Token ids to withdraw
     * @param Generation id to mint
     * @param Amount to mint
     * @dev Withdraw tokens must be owned by the caller
     * @dev Purchase Generation should be greater than 0
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
        deposit.balance = 0;

        require(
            // make sure it won't touch balance of rewards or bonuses
            // TODO: if `.balance` is constant, then this check probably unnecessery
            amountWithdraw <= totalDeposited,
            "Contract balance is too low"
        );

        totalDeposited -= amountWithdraw;

        if (allocationStatus == withdrawStatus.purchase) {

            IStackOsNFTBasic stack = IStackOsNFTBasic(
                address(generations.get(purchaseGenerationId))
            );

            // frontrun protection
            // most of the following should be on stack contract side, but code size limit...
            if (amountToMint > stack.getMaxSupply() - stack.totalSupply())
                amountToMint = stack.getMaxSupply() - stack.totalSupply();

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

            stackToken.approve(
                address(generations.get(purchaseGenerationId)), 
               stackToSpend 
            );

            stack.mintFromSubscriptionRewards(
                amountToMint, 
                stackToSpend, 
                msg.sender
            );

            // Add rest back to pending rewards
            amountWithdraw -= stackToSpend;
            // TODO: should not touch bonuses when dealing with deposits!
            bonusDripped[generationId][tokenId] = amountWithdraw;

            emit PurchaseNewNft(
                msg.sender,
                generationId,
                tokenId,
                purchaseGenerationId,
                // TODO: need return actual minted amount I guess! from mintFromSubscriptionRewards
                amountToMint
            );
        } else {

            // if not subscribed - max taxes
            if (deposit.nextPayDate < block.timestamp) {
                deposit.nextPayDate = 0;
                deposit.tax = HUNDRED_PERCENT - taxReductionAmount;
            }

            console.log(amountWithdraw, deposit.tax);
            
            // early withdraw tax
            if (deposit.tax > 0) {
                uint256 tax = (amountWithdraw * deposit.tax) / HUNDRED_PERCENT;
                amountWithdraw -= tax;
                stackToken.transfer(taxAddress, tax);
            }

            stackToken.transfer(msg.sender, amountWithdraw);
            deposit.tax = HUNDRED_PERCENT;

            emit Withdraw(
                msg.sender,
                generationId,
                tokenId,
                amountWithdraw
            );
        }
    }

    /*
     *  @title Withdraw dripped bonuses
     *  @param Generation id
     *  @param Token ids
     *  @dev Caller must own `tokenIds`
     */
     
    // TODO: maybe good idea to add control on amount of bonuses to withdraw, to reduce gas problem
    function harvestBonus(
        uint256 generationId,
        uint256[] calldata tokenIds
    ) external {

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
            uint256 bonusAmount = bonusDripped[generationId][tokenId];
            bonusDripped[generationId][tokenId] = 0;

            uint256 contractBalance = stackToken.balanceOf(address(this));
            // TODO: redo this maybe
            require(
                // make sure bonus amount won't touch balances of deposits or rewards 
                bonusAmount <= 
                    contractBalance - totalRewards - totalDeposited,
                "Bonus balance is too low"
            );

            stackToken.transfer(msg.sender, bonusAmount);

            emit HarvestBonus(
                msg.sender,
                generationId,
                tokenId,
                bonusAmount
            );
        }
    }

   /*
     * @title Get pending bonus amount and locked amount
     * @param StackNFT generation id
     * @param Token id
     * @returns Withdrawable amount of bonuses
     * @returns Locked amount of bonuses
     * @returns Array contains seconds needed to fully release locked amount (so this is per bonus array)
     */

    function pendingBonus(uint256 _generationId, uint256 _tokenId)
        external
        view
        returns (uint256 withdrawable, uint256 locked, uint256[] memory fullRelease)
    {
        Deposit memory deposit = deposits[_generationId][_tokenId];

        uint256 totalPending; 
        uint256 len = deposit.bonuses.length;
        fullRelease = new uint256[](len);

        for (uint256 i; i < len; i++) {
            Bonus memory bonus = deposit.bonuses[i];

            uint256 amount = 
                (bonus.total / bonus.releasePeriod) * 
                (block.timestamp - bonus.lastTxDate);

            if (amount > bonus.lockedAmount)
                amount = bonus.lockedAmount;
            totalPending += amount;
            bonus.lockedAmount -= amount;
            locked += bonus.lockedAmount;

            fullRelease[i] = 
                (bonus.releasePeriod) * bonus.lockedAmount / bonus.total;
        }

        withdrawable = totalPending + bonusDripped[_generationId][_tokenId];
    }

    /*
     *  @title Get active subs pending reward
     *  @param Generation id
     *  @param Token ids
     *  @param Period ids
     *  @dev Unsubscribed tokens in period are ignored
     *  @dev Period ids that are bigger than `currentPeriodId` are ignored
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

    /*
     *  @title Subtract function, on underflow returns zero.
     */
    function subOrZero(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : 0;
    }
}
