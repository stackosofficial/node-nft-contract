//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./GenerationManager.sol";
import "./DarkMatter.sol";
import "./interfaces/IStackOsNFT.sol";
import "./Exchange.sol";

contract Royalty is Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private counter; // counting cycles

    uint256 private constant HUNDRED_PERCENT = 10000;
    GenerationManager private generations;
    DarkMatter private darkMatter;
    Exchange private exchange;
    IERC20 private WETH; // for Matic network
    address payable private feeAddress; // fee from deposits will be transferred here
    uint256 private feePercent;

    uint256 private minEthToStartCycle; // minimal cycle's balance required to end it
    uint256 private constant CYCLE_DURATION = 30 days; // minimal cycle's duration required to end it

    struct Cycle {
        uint256 startTimestamp; // when cycle started
        uint256 balance; // how much deposited during cycle
        uint256 delegatedCount; // how much tokens delegated when cycle starts
        mapping(uint256 => mapping(uint256 => bool)) isClaimed; // whether reward for this token in this cycle is claimed
    }

    // a new cycle can start when `CYCLE_DURATION` time passed and `minEthToStartCycle` ether deposited
    mapping(uint256 => Cycle) private cycles; 

    constructor(
        GenerationManager _generations,
        DarkMatter _darkMatter,
        Exchange _exchange,
        address payable _feeAddress,
        uint256 _minEthToStartCycle
    ) {
        generations = _generations;
        darkMatter = _darkMatter;
        exchange = _exchange;
        feeAddress = _feeAddress;
        minEthToStartCycle = _minEthToStartCycle;
    }

    /*
     * @title Deposit royalty so that NFT holders can claim it later.
     */
    receive() external payable {
        checkDelegationsForFirstCycle();

        // take fee from deposits
        uint256 feePart = ((msg.value * feePercent) / HUNDRED_PERCENT);

        // is current cycle lasts enough?
        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            // is current cycle got enough ether?
            if (cycles[counter.current()].balance >= minEthToStartCycle) {
                // start new cycle
                counter.increment();
                // save count of delegates that exists on start of cycle
                cycles[counter.current()].delegatedCount = getTotalDelegated();
                cycles[counter.current()].startTimestamp = block.timestamp;

                // previous cycle already got enough balance, otherwise we wouldn't get here, thus we assign this deposit to the new cycle
                cycles[counter.current()].balance += msg.value - feePart;
            } else {
                cycles[counter.current()].balance += msg.value - feePart;
            }
        } else {
            cycles[counter.current()].balance += msg.value - feePart;
        }

        feeAddress.call{value: feePart}("");
    }

    /**
     * @dev Ensures that a cycle cannot start if there is no delegated StackOS NFTs.
     */
    function checkDelegationsForFirstCycle() private {
        // this should be true for the first cycle only, even if there is already delegates exists, this cycle still dont know about it
        if (cycles[counter.current()].delegatedCount == 0) {
            // we can't start first cycle without delegated NFTs, so with this we 'restart' first cycle,
            // this dont allow to end first cycle with perTokenReward = 0 and balance > 0
            cycles[counter.current()].startTimestamp = block.timestamp;
            /*
                The following check is need to prevent ETH hang on first cycle forever.
                If first ever delegation happens at the same block with receiving eth here,
                then no one can claim for the first cycle, because when claiming royalty
                there is check: tokenDelegationTime < cycleStartTime
            */
            uint256 totalDelegatedBeforeCurrentBlock = getTotalDelegatedBeforeCurrentBlock();
            if (totalDelegatedBeforeCurrentBlock > 0) {
                // we can still get 0 here, then in next ifs we will just receive eth for cycle
                cycles[counter.current()]
                    .delegatedCount = totalDelegatedBeforeCurrentBlock;
            }
        }
    }

    /*
     * @title Set fee address
     * @param fee address
     * @dev Could only be invoked by the contract owner.
     */
    function setFeeAddress(address payable _feeAddress) external onlyOwner {
        require(_feeAddress != address(0), "Must be not zero-address");
        feeAddress = _feeAddress;
    }    

    /*
     * @title Set WETH address, probably should be used on Matic network
     * @param WETH address
     * @dev Could only be invoked by the contract owner.
     */
    function setWETH(IERC20 _WETH) external onlyOwner {
        require(address(_WETH) != address(0), "Must be not zero-address");
        WETH = _WETH;
    }

    /*
     * @title Set fee percent taken of each deposit
     * @param fee basis points
     * @dev Could only be invoked by the contract owner.
     */
    function setFeePercent(uint256 _percent) external onlyOwner {
        require(feePercent <= HUNDRED_PERCENT, "invalid fee basis points");
        feePercent = _percent;
    }

    /*
     * @title Get total delegated NFT's that exists prior current block, in all added generations
     * @dev May consume a lot of gas if there is a lot of generations and NFTs.
     * @dev This is called only once, when first cycle start.
     */
    function getTotalDelegatedBeforeCurrentBlock()
        private
        view
        returns (uint256)
    {
        uint256 result = 0;
        for (uint256 i = 0; i < generations.count(); i++) {
            IStackOsNFT stack = generations.get(i);
            uint256 generationTotalDelegated = stack.getTotalDelegated();
            for (
                uint256 tokenId;
                tokenId < generationTotalDelegated;
                tokenId++
            ) {
                uint256 delegationTimestamp = stack.getDelegationTimestamp(
                    tokenId
                );
                if (
                    delegationTimestamp > 0 &&
                    delegationTimestamp < block.timestamp
                ) {
                    result += 1;
                }
            }
        }
        return result;
    }

    /*
     * @titile Get number of delegated tokens in every generation
     */
    function getTotalDelegated() private view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < generations.count(); i++) {
            total += generations.get(i).getTotalDelegated();
        }
        return total;
    }

    /*
     * @title Claim royalty for holding delegated NFTs 
     * @param StackOS generation id 
     * @param Token ids
     * @dev tokens must be delegated and owned by the caller
     */
    function claim(uint256 _generationId, uint256[] calldata _tokenIds)
        external
    {
        _claim(_generationId, _tokenIds, 0, false, IERC20(address(0)), false);
    }

    /*
     * @title Same as `claim` but holders receive WETH
     * @dev tokens must be delegated and owned by the caller
     * @dev WETH address must be set by the admin
     */
    function claimWETH(uint256 _generationId, uint256[] calldata _tokenIds)
        external
    {
        require(address(WETH) != address(0), "Wrong WETH address");
        _claim(_generationId, _tokenIds, 0, false, IERC20(address(0)), true);
    }

    /*
     * @title Purchase StackNFTs for royalties, caller will receive the left over amount of royalties
     * @param StackNFT generation id
     * @param Token ids
     * @param Amount to mint
     * @param Supported stablecoin to use to buy stack token
     * @dev tokens must be delegated and owned by the caller
     */
    function purchaseNewNft(
        uint256 _generationId,
        uint256[] calldata _tokenIds,
        uint256 _mintNum,
        IERC20 _stablecoin 
    ) external {
        require(_generationId > 0, "Must be not first generation");
        _claim(_generationId, _tokenIds, _mintNum, true, _stablecoin, false);
    }

    function _claim(
        uint256 generationId,
        uint256[] calldata tokenIds,
        uint256 _mintNum,
        bool _mint,
        IERC20 _stablecoin,
        bool _claimWETH
    ) internal {
        require(address(this).balance > 0, "No royalty");
        IStackOsNFT stack = generations.get(generationId);
        require(
            stack.balanceOf(msg.sender) > 0 ||
                darkMatter.balanceOf(msg.sender) > 0,
            "You dont have NFTs"
        );

        checkDelegationsForFirstCycle();

        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            if (cycles[counter.current()].balance >= minEthToStartCycle) {
                counter.increment();
                cycles[counter.current()].delegatedCount = getTotalDelegated();
                cycles[counter.current()].startTimestamp = block.timestamp;
            }
        }

        if (counter.current() > 0) {
            uint256 reward;

            // iterate over tokens from args
            for (uint256 i = 0; i < tokenIds.length; i++) {
                uint256 tokenId = tokenIds[i];

                require(
                    darkMatter.isOwnStackOrDarkMatter(
                        msg.sender,
                        generationId,
                        tokenId
                    ),
                    "Not owner"
                );
                require(
                    stack.getDelegatee(tokenId) != address(0),
                    "NFT should be delegated"
                );

                uint256 delegationTimestamp = stack.getDelegationTimestamp(
                    tokenId
                );
                if (delegationTimestamp > 0) {
                    // iterate over cycles, ignoring current one since its not ended
                    for (uint256 o = 0; o < counter.current(); o++) {
                        // generation must be added before start of the cycle (first generation's timestamp = 0)
                        if (
                            generations.getAddedTimestamp(generationId) <
                            cycles[o].startTimestamp
                            // reward for token in this cycle shouldn't be already claimed
                            && cycles[o].isClaimed[generationId][tokenId] == false
                            // is this token delegated earlier than this cycle start?
                            && delegationTimestamp < cycles[o].startTimestamp
                        ) {
                            reward += cycles[o].balance / cycles[o].delegatedCount;
                            cycles[o].isClaimed[generationId][
                                tokenId
                            ] = true;
                        }
                    }
                }
            }

            if (reward > 0) {
                if (_mint == false) {
                    if(_claimWETH) {
                        uint256 wethReceived = exchange.swapExactETHForTokens{value: reward}(WETH);
                        WETH.transfer(msg.sender, wethReceived);
                    } else {
                        (bool success, ) = payable(msg.sender).call{value: reward}(
                            ""
                        );
                        require(success, "Transfer failed");
                    }
                } else {
                    IStackOsNFTBasic stackNFT = IStackOsNFTBasic(address(generations.get(generationId)));
                    uint256 usdReceived = exchange.swapExactETHForTokens{value: reward}(_stablecoin);
                    _stablecoin.approve(address(stackNFT), usdReceived);

                    uint256 spendAmount = stackNFT.mintFromRoyaltyRewards(
                        _mintNum,
                        address(_stablecoin), 
                        msg.sender
                    );
                    _stablecoin.transfer(msg.sender, usdReceived - spendAmount);
                }
            }
        }
    }
}
