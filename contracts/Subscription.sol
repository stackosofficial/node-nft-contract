//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./interfaces/IStackOsNFT.sol";
import "./interfaces/IStackOsNftBasic.sol";
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
    uint256 public taxReductionAmount = 2500;

    enum withdrawStatus {
        withdraw,
        purchase
    }

    struct Bonus {
        uint256 total;
        uint256 lastTxDate;
        uint256 releasePeriod;
        uint256 lockedAmount;
    }

    struct Deposit {
        uint256 balance; // amount without bonus
        Bonus[] reward; // bonuses
        uint256 tax; // tax percent on withdraw
        uint256 withdrawableNum; // number of months that you able to withdraw
        uint256 nextPayDate; // you can subscribe after this date, but before deadline to reduce tax
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
        uint256 _taxReductionAmount
    ) {
        stackToken = _stackToken;
        generations = _generations;
        darkMatter = _darkMatter;
        router = _router;
        taxAddress = _taxAddress;
        taxResetDeadline = _taxResetDeadline;
        price = _price;
        bonusPercent = _bonusPercent;
        taxReductionAmount = _taxReductionAmount;
    }

    /*
     * @title Set drip perdiod
     * @param Amount of seconds required to release bonus fully
     * @dev Could only be invoked by the contract owner.
     */
    function setDripPeriod(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Cant be zero");
        dripPeriod = _seconds;
    }

    /*
     * @title Set subscription price
     * @param New price in USD
     * @dev Could only be invoked by the contract owner.
     */
    function setPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Cant be zero");
        price = _price;
    }

    /*
     * @title Set bonus percent added for each subscription on top of it's price
     * @param Bonus basis points
     * @dev Could only be invoked by the contract owner.
     */
    function setBonusPercent(uint256 _percent) external onlyOwner {
        require(_percent <= HUNDRED_PERCENT, "invalid basis points");
        bonusPercent = _percent;
    }

    /*
     * @title Set tax reduction amount on subscription
     * @param Amount to subtract from tax amount at the moment
     * @dev Could only be invoked by the contract owner
     * @dev Tax reduced by subtracting this value from it
     */
    function settaxReductionAmount(uint256 _percent) external onlyOwner {
        require(_percent <= HUNDRED_PERCENT, "invalid basis points");
        taxReductionAmount = _percent;
    }

    /*
     * @title Set time window after `nextPayDate` when tax will reduce
     * @param Amount of seconds
     * @dev Could only be invoked by the contract owner
     * @dev If you miss that time window then the tax will reset
     */
    function setTaxResetDeadline(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Cant be zero");
        taxResetDeadline = _seconds;
    }

    /*
     *  @title Pay subscription
     *  @param StackNFT generation id
     *  @param Token id
     *  @param Address of supported stablecoin
     *  @dev Caller must approve us to spend `price` amount of `_stablecoin`.
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
        IERC20 _stablecoin,
        bool externalBuyer
    ) internal {
        require(generationId < generations.count(), "Generation doesn't exist");
        // check token exists
        IERC721(address(generations.get(generationId))).ownerOf(tokenId);

        Deposit storage deposit = deposits[generationId][tokenId];
        require(deposit.nextPayDate < block.timestamp, "Cant pay in advance");

        if (deposit.nextPayDate == 0) {
            deposit.nextPayDate = block.timestamp;
            deposit.tax = HUNDRED_PERCENT;
        }

        // Paid after deadline?
        if (deposit.nextPayDate + taxResetDeadline < block.timestamp) {
            deposit.nextPayDate = block.timestamp;
            deposit.tax = HUNDRED_PERCENT;
        }

        deposit.tax = subOrZero(deposit.tax, taxReductionAmount);
        deposit.withdrawableNum += 1;
        deposit.nextPayDate += MONTH;

        // convert stablecoin to stack token
        uint256 amount = buyStackToken(price, _stablecoin, externalBuyer);
        deposit.balance += amount;

        // bonuses logic
        updateBonuses(generationId, tokenId);
        uint256 bonusAmount = amount * bonusPercent / HUNDRED_PERCENT;
        deposit.reward.push(Bonus({
            total: bonusAmount, 
            lastTxDate: block.timestamp, 
            releasePeriod: dripPeriod, 
            lockedAmount: bonusAmount
        }));
    }

    function updateBonuses(
        uint256 generationId,
        uint256 tokenId
    ) private {
        Deposit storage deposit = deposits[generationId][tokenId];
        uint256 index;
        for (uint256 i; i < deposit.reward.length; i++) {
            Bonus storage bonus = deposit.reward[i];

            uint256 withdrawAmount = 
                (bonus.total / bonus.releasePeriod) * 
                (block.timestamp - bonus.lastTxDate);

            if (withdrawAmount > bonus.lockedAmount)
                withdrawAmount = bonus.lockedAmount;
            
            overflow[generationId][tokenId] += withdrawAmount;
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

                deposit.reward[currentIndex] = 
                    deposit.reward[i];
                delete deposit.reward[i];
            }
        }

        for (uint256 i = deposit.reward.length; i > 0; i--) {
            Bonus memory bonus = deposit.reward[i - 1];
            if(bonus.lockedAmount > 0) break;
            deposit.reward.pop();
        }
    }

    /*
     *  @title Withdraw deposit taking into account bonus and tax
     *  @param StackNFT generation id
     *  @param Token ids
     *  @dev Caller must own `tokenIds`
     *  @dev Tax reduced by `taxReductionAmount` each month subscribed in a row, unless already 0
     *  @dev Tax resets to maximum on withdraw
     */
    function withdraw(uint256 generationId, uint256[] calldata tokenIds)
        external
        nonReentrant
    {
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
     * @title Purchase StackNFTs, caller will receive the left over amount of royalties
     * @param StackNFT generation id
     * @param Token ids
     * @param Amount to mint
     * @param Supported stablecoin to use to buy stack token
     * @dev tokens must be delegated and owned by the caller
     */
    function purchaseNewNft(
        uint256 withdrawGenerationId,
        uint256[] calldata withdrawTokenIds,
        uint256 purchaseGenerationId,
        uint256 amountToMint,
        IERC20 _stablecoin
    ) external nonReentrant {
        require(supportsCoin(_stablecoin), "Unsupported payment coin");
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

        // if not subscribed
        if (deposit.nextPayDate < block.timestamp) {
            deposit.nextPayDate = 0;
            deposit.tax = HUNDRED_PERCENT - taxReductionAmount;
        }

        uint256 amountWithdraw = deposit.balance;
        updateBonuses(generationId, tokenId);
        uint256 bonusAmount = overflow[generationId][tokenId];
        overflow[generationId][tokenId] = 0;
        require(
            amountWithdraw + bonusAmount <= stackToken.balanceOf(address(this)),
            "Not enough balance on bonus wallet"
        );

        deposit.withdrawableNum = 0;
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

            uint256 amountToConvert = IStackOsNFTBasic(
                address(generations.get(purchaseGenerationId))
            ).getFromRewardsPrice(amountToMint, address(_stablecoin));

            require(amountWithdraw > amountToConvert, "Not enough earnings");

            uint256 usdForMint = sellStackToken(amountToConvert, _stablecoin);

            _stablecoin.approve(
                address(generations.get(purchaseGenerationId)),
                usdForMint
            );

            uint256 usdUsed = IStackOsNFTBasic(
                address(generations.get(purchaseGenerationId))
            ).mintFromSubscriptionRewards(amountToMint, address(_stablecoin), msg.sender);

            // send left over USD back to user
            _stablecoin.transfer(msg.sender, usdForMint - usdUsed);

            // Add rest back to pending rewards
            amountWithdraw -= amountToConvert;
            overflow[generationId][tokenId] = amountWithdraw;
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

        for (uint256 i; i < deposit.reward.length; i++) {
            Bonus memory bonus = deposit.reward[i];

            uint256 amount = 
                (bonus.total / bonus.releasePeriod) * 
                (block.timestamp - bonus.lastTxDate);

            if (amount > bonus.lockedAmount)
                amount = bonus.lockedAmount;
            totalPending += amount;
        }

        return totalPending + overflow[_generationId][_tokenId];
    }

    /*
     *  @title Buy `stackToken` for `amount` of _stablecoin.
     *  @param Amount of `_stablecoin` to sell.
     *  @param Called by external wallet or by this contract?
     */
    function buyStackToken(
        uint256 amount,
        IERC20 _stablecoin,
        bool externalBuyer
    ) private returns (uint256) {
        if (externalBuyer) {
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
     *  @title Buy `_stablecoin` for `amount` of stackToken.
     *  @param Amount of `stackToken` to sell.
     */
    function sellStackToken(uint256 amount, IERC20 _stablecoin)
        private
        returns (uint256)
    {
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
     *  @title Subtract function, on underflow returns zero.
     */
    function subOrZero(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : 0;
    }
}
