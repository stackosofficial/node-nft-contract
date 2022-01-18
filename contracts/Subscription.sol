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

contract Subscription is Ownable, ReentrancyGuard {

    event SetOnlyFirstGeneration();
    event SetDripPeriod(uint256 _seconds);
    event SetPrice(uint256 price);
    event SetMaxPrice(uint256 maxPrice);
    event SetBonusPercent(uint256 _percent);
    event SetTaxReductionAmount(uint256 _amount);
    event SetForgivenessPeriod(uint256 _seconds);

    IERC20 internal immutable stackToken;
    GenerationManager internal immutable generations;
    DarkMatter internal immutable darkMatter;
    StableCoinAcceptor internal immutable stableAcceptor;
    Exchange internal immutable exchange;
    address internal immutable taxAddress;

    uint256 internal constant HUNDRED_PERCENT = 10000;
    uint256 public constant MONTH = 28 days;

    uint256 public dripPeriod = 700 days;
    uint256 public forgivenessPeriod = 7 days;
    uint256 public price = 1e18;
    uint256 public maxPrice = 5000e18;
    uint256 public bonusPercent = 2000;
    uint256 public taxReductionAmount = 2500;
    uint256 public currentPeriodId;
    bool public isOnlyFirstGeneration;

    uint256 public constant PRICE_PRECISION = 1e18;

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
     * @title Reverts if passed generationId doesn't match desired generation by the contract.
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
     *  @dev Caller must approve us to spend `price` amount of `_stablecoin` or stack token.
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
        if(!_payWithStack)
            require(
                stableAcceptor.supportsCoin(_stablecoin), 
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

        _subscribe(generationId, tokenId, _price, _stablecoin, _payWithStack);

        // active sub reward logic
        updatePeriod();
        periods[currentPeriodId].subsNum += 1;
        periods[currentPeriodId].tokenData[generationId][tokenId].isSub = true;
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

        // convert stablecoin to stack token
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
    function withdraw2(
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
                toWithdraw += (share - period.tokenData[generationId][tokenId].withdrawn);
                period.tokenData[generationId][tokenId].withdrawn = share; 
            }
        }
        stackToken.transfer(msg.sender, toWithdraw);
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
     *  @title Withdraw deposit taking into account bonus and tax
     *  @param Generation id
     *  @param Token ids
     *  @dev Caller must own `tokenIds`
     *  @dev Tax resets to maximum on withdraw
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
                0,
                IERC20(address(0))
            );
        }
    }

   /*
     * @title Purchase StackNFTs
     * @param Generation id to withdraw
     * @param Token ids to withdraw
     * @param Generation id to mint
     * @param Amount to mint
     * @param Supported stablecoin to use to buy stack token
     * @dev Withdraw tokens must be owned by the caller
     * @dev Generation should be greater than 0
     */
    function purchaseNewNft(
        uint256 withdrawGenerationId,
        uint256[] calldata withdrawTokenIds,
        uint256 purchaseGenerationId,
        uint256 amountToMint,
        IERC20 _stablecoin
    ) 
        external 
        nonReentrant
        restrictGeneration(withdrawGenerationId)
    {
        require(stableAcceptor.supportsCoin(_stablecoin), "Unsupported stablecoin");
        require(purchaseGenerationId > 0, "Cant purchase generation 0");
        updatePeriod();

        for (uint256 i; i < withdrawTokenIds.length; i++) {
            _withdraw(
                withdrawGenerationId,
                withdrawTokenIds[i],
                withdrawStatus.purchase,
                purchaseGenerationId,
                amountToMint,
                _stablecoin
            );
        }
    }

    function _withdraw(
        uint256 generationId,
        uint256 tokenId,
        withdrawStatus allocationStatus,
        uint256 purchaseGenerationId,
        uint256 amountToMint,
        IERC20 _stablecoin
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

        // if not subscribed
        if (deposit.nextPayDate < block.timestamp) {
            deposit.nextPayDate = 0;
            deposit.tax = HUNDRED_PERCENT - taxReductionAmount;
        }

        uint256 amountWithdraw = deposit.balance;
        updateBonuses(generationId, tokenId);
        uint256 bonusAmount = bonusDripped[generationId][tokenId];
        bonusDripped[generationId][tokenId] = 0;

        require(
            amountWithdraw + bonusAmount <= stackToken.balanceOf(address(this)),
            "Not enough balance on bonus wallet"
        );

        deposit.balance = 0;

        // early withdraw tax
        if (deposit.tax > 0) {
            uint256 tax = (amountWithdraw * deposit.tax) / HUNDRED_PERCENT;
            amountWithdraw -= tax;
            stackToken.transfer(taxAddress, tax);
        }

        amountWithdraw += bonusAmount;
        require(amountWithdraw > 0, "Already withdrawn");

        if (allocationStatus == withdrawStatus.purchase) {

            IStackOsNFTBasic stack = IStackOsNFTBasic(
                address(generations.get(purchaseGenerationId))
            );

            uint256 amountToConvert = (
                    (stack.mintPrice() * (10000 - stack.rewardDiscount()) / 10000)
                ) * 
                amountToMint * 10**IDecimals(address(_stablecoin)).decimals() /
                stack.PRICE_PRECISION();

            amountToConvert = exchange.getAmountIn(
                amountToConvert, 
                IERC20(_stablecoin), 
                stackToken
            );

            require(amountWithdraw > amountToConvert, "Not enough earnings");

            stackToken.approve(
                address(generations.get(purchaseGenerationId)), 
                amountToConvert
            );

            IStackOsNFTBasic(
                address(generations.get(purchaseGenerationId))
            ).mintFromSubscriptionRewards(
                amountToMint, 
                amountToConvert, 
                msg.sender
            );

            // Add rest back to pending rewards
            amountWithdraw -= amountToConvert;
            bonusDripped[generationId][tokenId] = amountWithdraw;
        } else {
            stackToken.transfer(msg.sender, amountWithdraw);
            deposit.tax = HUNDRED_PERCENT;
        }
    }

   /*
     * @title Get pending reward amount
     * @param StackNFT generation id
     * @param Token id
     * @dev Doesn't account deposit amount, only bonuses
     */
    function pendingReward(uint256 _generationId, uint256 _tokenId)
        public
        view
        returns (uint256)
    {
        Deposit memory deposit = deposits[_generationId][_tokenId];

        uint256 totalPending;

        for (uint256 i; i < deposit.bonuses.length; i++) {
            Bonus memory bonus = deposit.bonuses[i];

            uint256 amount = 
                (bonus.total / bonus.releasePeriod) * 
                (block.timestamp - bonus.lastTxDate);

            if (amount > bonus.lockedAmount)
                amount = bonus.lockedAmount;
            totalPending += amount;
        }

        return totalPending + bonusDripped[_generationId][_tokenId];
    }
    
    /*
     *  @title Subtract function, on underflow returns zero.
     */
    function subOrZero(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : 0;
    }
}
