//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./GenerationManager.sol";
import "./DarkMatter.sol";
import "./interfaces/IStackOSNFT.sol";
import "./Subscription.sol";

contract Royalty is Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private counter; // counting cycles

    uint256 private constant HUNDRED_PERCENT = 10000;
    IUniswapV2Router02 private router;
    GenerationManager private generations; // StackOS NFT generations manager
    DarkMatter private darkMatter;
    Subscription private subscription;
    // IERC20 private stableCoin;
    address payable private feeAddress; // fee from deposits goes here
    uint256 private feePercent; // fee percent taken from deposits

    uint256 private minEthToStartCycle; // minimal cycle's balance required to end it
    uint256 private constant CYCLE_DURATION = 30 days; // minimal cycle's duration required to end it

    struct Cycle {
        uint256 startTimestamp; // when cycle started
        uint256 perTokenReward; // price of 1 NFT, calculated on cycle end
        uint256 balance; // how much deposited during cycle
        uint256 delegatedCount; // how much tokens delegated when cycle starts
        // [generation][tokenId] = true/false
        mapping(uint256 => mapping(uint256 => bool)) isClaimed; // whether reward for this token in this cycle is claimed
    }

    mapping(uint256 => Cycle) private cycles; // a new cycle can start when two conditions met, `CYCLE_DURATION` time passed and `minEthToStartCycle` ether deposited

    constructor(
        // IERC20 _stableCoin,
        IUniswapV2Router02 _router,
        GenerationManager _generations,
        DarkMatter _darkMatter,
        Subscription _subscription,
        address payable _feeAddress,
        uint256 _minEthToStartCycle
    ) {
        // stableCoin = _stableCoin;
        router = _router;
        generations = _generations;
        darkMatter = _darkMatter;
        feeAddress = _feeAddress;
        subscription = _subscription;
        minEthToStartCycle = _minEthToStartCycle;
    }

    /*
     * @title Deposit royalty so that NFT holders can claim it later.
     * TODO: in matic they send wrapped eth
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
                // at the end of cycle we calculate 'ETH per NFT' for it
                cycles[counter.current()].perTokenReward = getUnitPayment();
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

        if (feePart > 0) {
            feeAddress.call{value: feePart}("");
        }
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
     * @title Set fee percent
     * @param fee percent
     * @dev Could only be invoked by the contract owner.
     */
    function setFeePercent(uint256 _percent) external onlyOwner {
        require(feePercent <= HUNDRED_PERCENT, "invalid fee basis points");
        feePercent = _percent;
    }

    /*
     * @title Get total delegated NFT's that exists prior current block, in all added generations
     * @dev May consume a lot of gas if there is a lot of generations and NFTs.
     * @dev O(x * y)
     */
    function getTotalDelegatedBeforeCurrentBlock()
        private
        view
        returns (uint256)
    {
        uint256 result = 0;
        for (uint256 i = 0; i < generations.count(); i++) {
            IStackOSNFT stack = generations.get(i);
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
     * @titile Get number of delegated tokens in every added StackOS generation
     */
    function getTotalDelegated() private view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < generations.count(); i++) {
            total += generations.get(i).getTotalDelegated();
        }
        return total;
    }

    /*
     * @title Get how much current cycle can pay for 1 NFT.
     * @return Amount that can be claimed in current cycle per 1 NFT
     * @dev Make sure cycle's balance is not zero and delegates exists, if it first cycle then delegates must exist prior start of that cycle
     */
    function getUnitPayment() private view returns (uint256) {
        uint256 delegatedCount = cycles[counter.current()].delegatedCount;
        return
            (delegatedCount > 0)
                ? (cycles[counter.current()].balance / delegatedCount)
                : 0;
    }

    /*
     * @title User can take royalty for holding delegated NFTs that he owns
     * @param generationId StackOS generation id to get royalty for
     * @param tokenIds Token ids to get royalty for
     * @dev tokens must be delegated and owned by the caller
     */
    function claim(uint256 _generationId, uint256[] calldata _tokenIds)
        external
    {
        _claim(_generationId, _tokenIds, false, 0, 0, IERC20(address(0)));
    }

    /*
     * @title User can pay subscription with royalty 
     * @param StackNFT generation id to get royalty for
     * @param tokenIds Token ids to get royalty for
     * @param StackNFT generation id to subscribe
     * @param tokenIds Token ids to subscribe
     * @dev tokens must be delegated and owned by the caller
     */
    function paySubscription(
        uint256 _generationId,
        uint256[] calldata _tokenIds,
        uint256 _gen,
        uint256 _id,
        IERC20 _stablecoin
    ) external {
        _claim(_generationId, _tokenIds, true, _gen, _id, _stablecoin);
    }

    function _claim(
        uint256 generationId,
        uint256[] calldata tokenIds,
        bool _subscription,
        uint256 gen,
        uint256 nftID,
        IERC20 _stablecoin
    ) internal {
        require(address(this).balance > 0, "No royalty");
        IStackOSNFT stack = generations.get(generationId);
        require(
            stack.balanceOf(msg.sender) > 0 ||
                darkMatter.balanceOf(msg.sender) > 0,
            "You dont have NFTs"
        );

        checkDelegationsForFirstCycle();

        // similar 'if' as in `receive()`
        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            if (cycles[counter.current()].balance >= minEthToStartCycle) {
                cycles[counter.current()].perTokenReward = getUnitPayment();
                counter.increment();
                cycles[counter.current()].delegatedCount = getTotalDelegated();
                cycles[counter.current()].startTimestamp = block.timestamp;
            }
        }

        // first cycle still not ended, cant claim for it
        if (counter.current() > 0) {
            uint256 reward;
            // iterate over passed tokens
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
                        ) {
                            // reward for token in this cycle shouldn't be already claimed
                            if (
                                cycles[o].isClaimed[generationId][tokenId] ==
                                false
                            ) {
                                // is this token delegated earlier than this cycle start?
                                if (
                                    delegationTimestamp <
                                    cycles[o].startTimestamp
                                ) {
                                    reward += cycles[o].perTokenReward;
                                    cycles[o].isClaimed[generationId][
                                        tokenId
                                    ] = true;
                                }
                            }
                        }
                    }
                }
            }

            if (reward > 0) {
                if (_subscription == false) {
                    (bool success, ) = payable(msg.sender).call{value: reward}(
                        ""
                    );
                    require(success, "Transfer failed");
                } else {
                    uint256 usdReceived = buyStable(reward, _stablecoin);
                    _stablecoin.approve(address(subscription), usdReceived);
                    uint256 nrOfMonth = usdReceived /
                        subscription.viewPrice();
                    subscription.subscribe(gen, nftID, _stablecoin);
                    _stablecoin.transfer(
                        msg.sender,
                        usdReceived - (nrOfMonth * subscription.viewPrice())
                    );
                }
            }
        }
    }

    /*
     *  @title Swap `paymentToken` for `stackToken`.
     *  @param Amount of `paymentToken`.
     */
    function buyStable(uint256 amount, IERC20 _stablecoin) private returns (uint256) {
        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](2);
        path[0] = address(router.WETH());
        path[1] = address(_stablecoin);
        uint256[] memory amountOutMin = router.getAmountsOut(amount, path);
        uint256[] memory amounts = router.swapExactETHForTokens{value: amount}(
            amountOutMin[1],
            path,
            address(this),
            deadline
        );
        return amounts[1];
    }
}
