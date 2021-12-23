//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./Subscription.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract Sub0 is Subscription {

    uint256 public period;

    struct Period {
        uint256 balance;
        uint256 subsNum;
        uint256 endAt;
        mapping(uint256 => mapping(uint256 => PeriodTokenData)) pd; 
    }

    struct PeriodTokenData {
        bool isSub;
        uint256 withdrawn;
    }

    mapping(uint256 => Period) public p;

    constructor(
        IERC20 _stackToken,
        GenerationManager _generations,
        DarkMatter _darkMatter,
        StableCoinAcceptor _stableAcceptor,
        Exchange _exchange,
        address _taxAddress,
        uint256 _taxResetDeadline,
        uint256 _price,
        uint256 _bonusPercent,
        uint256 _taxReductionAmount
    ) 
        Subscription(
            _stackToken,
            _generations,
            _darkMatter,
            _stableAcceptor,
            _exchange,
            _taxAddress,
            _taxResetDeadline,
            _price,
            _bonusPercent,
            _taxReductionAmount
        )
    {
    }

    /*
     *  @title Same as base, but also calculates active subs rewards.
     */
    function subscribe(
        uint256 generationId,
        uint256 tokenId,
        IERC20 _stablecoin,
        bool _payWithStack
    ) public override {
        super.subscribe(generationId, tokenId, _stablecoin, _payWithStack);

        updatePeriod();

        p[period].subsNum += 1;
        p[period].pd[generationId][tokenId].isSub = true;
    }

    /*
     *  @title End period if its time
     *  @dev Called automatically from other functions, but can be called manually
     */
    function updatePeriod() public {
        if (p[period].endAt < block.timestamp) {
            period += 1;
            p[period].endAt = block.timestamp + MONTH;
        }
        console.log("updatePeriod:", period);
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

        if(p[period - 1].subsNum == 0) {
            console.log("0 subs, sending to dao");
            return false;
        } else {
            stackToken.transferFrom(msg.sender, address(this), _amount);
            p[period - 1].balance += _amount;
            console.log("total received:", p[period - 1].balance);
        }
        return true;
    }

    /*
     *  @title Handle fee sent from minting
     *  @param Generation id
     *  @param Token ids
     *  @param Period ids
     *  @dev Caller must own tokens
     *  @dev Periods must be ended and tokens should have subscription during periods
     */
    function withdraw2(
        uint256 generationId, 
        uint256[] calldata tokenIds,
        uint256[] calldata periods
    )
        external
        nonReentrant
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
            for (uint256 o; o < periods.length; o++) {
                require(periods[o] < period, "Period not ended");
                Period storage pr = p[periods[o]];
                require(pr.subsNum > 0, "No subs in period");
                require(
                    pr.pd[generationId][tokenId].isSub, 
                    "Was not subscribed"
                );
                        
                uint256 share = pr.balance / pr.subsNum;
                console.log("share:", share);
                toWithdraw += (share - pr.pd[generationId][tokenId].withdrawn);
                console.log("toWithdraw:", toWithdraw);
                pr.pd[generationId][tokenId].withdrawn = share; 
            }
        }
        stackToken.transfer(msg.sender, toWithdraw);
    }

    //   The following just add more updatePeriod() calls, maybe we don't even need these overrides?

    /*
     *  @title Same as base, but also update periods
     */
    function withdraw(
        uint256 generationId, 
        uint256[] calldata tokenIds
    )
        external
        override
        nonReentrant
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
     *  @title Same as base, but also update periods
     */
    function purchaseNewNft(
        uint256 withdrawGenerationId,
        uint256[] calldata withdrawTokenIds,
        uint256 purchaseGenerationId,
        uint256 amountToMint,
        IERC20 _stablecoin
    ) 
        external 
        override
        nonReentrant 
    {
        updatePeriod();
        require(stableAcceptor.supportsCoin(_stablecoin), "Unsupported stablecoin");
        require(purchaseGenerationId > 0, "Generation must be >0");
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
}
