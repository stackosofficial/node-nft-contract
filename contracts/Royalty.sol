//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IStackOSNFT.sol";

contract Royalty is Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private counter; // counting cycles

    address payable private bank; // fee from deposits goes here
    uint256 private bankPercent; // amount of fee from deposits

    uint256 private minEthToStartCycle; // minimal cycle's balance required to end it
    uint256 private constant CYCLE_DURATION = 30 days; // minimal cycle's duration required to end it

    bool private lockClaim; // anti-reentrancy for claim function

    struct Cycle {
        uint256 startTimestamp; // when cycle started
        uint256 perTokenReward; // price of 1 NFT, calculated on cycle end
        uint256 balance; // how much deposited during cycle
        uint256 delegatedCount; // how much tokens delegated when cycle starts
        // [generation][tokenId] = true/false
        mapping(uint256 => mapping(uint256 => bool)) isClaimed; // whether reward for this token in this cycle is claimed
    }

    mapping(uint256 => Cycle) private cycles; // a new cycle can start when two conditions met, `CYCLE_DURATION` time passed and `minEthToStartCycle` ether deposited

    mapping(uint256 => IStackOSNFT) private generations; // StackOS NFT contract different generations
    mapping(uint256 => uint256) private generationAddedTimestamp; // time when new StackOS added to this contract
    uint256 private generationsCount; // total stackOS generations added

    constructor(
        IStackOSNFT _stackOS,
        uint256 _minEthToStartCycle,
        address payable _bank,
        uint256 _bankPercent
    ) {
        bank = _bank;
        generations[generationsCount++] = _stackOS;
        bankPercent = _bankPercent;
        minEthToStartCycle = _minEthToStartCycle;
    }

    /*
     * @title Deposit royalty so that NFT holders can claim it later.
     */
    receive() external payable {

        checkDelegationsForFirstCycle();

        // take fee
        uint256 bankPart = ((msg.value * bankPercent) / 10000);
        if (bankPart > 0) {
            (bool success, ) = bank.call{value: bankPart}("");
        }
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
                cycles[counter.current()].balance += msg.value - bankPart;
            } else {
                cycles[counter.current()].balance += msg.value - bankPart;
            }
        } else {
            cycles[counter.current()].balance += msg.value - bankPart;
        }
    }

    /**
     * @dev this is for first cycle, safety checks
     */
    function checkDelegationsForFirstCycle() private {
        // this should be true for the first cycle only, even if there is already delegates exists, this cycle still dont know about it
        if(cycles[counter.current()].delegatedCount == 0) {
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
            if(totalDelegatedBeforeCurrentBlock > 0) {
                // we can still get 0 here, then in next ifs we will just receive eth for cycle
                cycles[counter.current()].delegatedCount = totalDelegatedBeforeCurrentBlock;
            }
        }
    }

    /*
     * @title Set fee address
     * @param fee address
     * @dev Could only be invoked by the contract owner.
     */
    function setBank(address payable _bank) external onlyOwner {
        require(_bank != address(0), "Must be not zero-address");
        bank = _bank;
    }

    /*
     * @title Set fee percent
     * @param fee percent
     * @dev Could only be invoked by the contract owner.
     */
    function setBankPercent(uint256 _percent) external onlyOwner {
        bankPercent = _percent;
    }

    /*
     * @title Add another StackOS NFT contract to be counted for royalty
     * @param IStackOSNFT compatible address
     * @dev Could only be invoked by the contract owner.
     */
    function addNextGeneration(IStackOSNFT _stackOS) public onlyOwner {
        require(address(_stackOS) != address(0), "Must be not zero-address");
        for(uint256 i; i < generationsCount; i++) {
            require(generations[i] != _stackOS, "Address already added");
        }
        generations[generationsCount] = _stackOS;
        generationAddedTimestamp[generationsCount] = block.timestamp;
        generationsCount += 1;
    }

    /*
     * @title Get total delegated NFT's that exists prior current block, in all added generations
     */
    function getTotalDelegatedBeforeCurrentBlock() private view returns (uint256) {
        uint256 result = 0;
        for(uint256 i = 0; i < generationsCount; i++) {
            uint256 generationTotalDelegated = generations[i].getTotalDelegated();
            for(uint256 tokenId; tokenId < generationTotalDelegated; tokenId ++) {
                uint256 delegationTimestamp = generations[i].getDelegationTimestamp(tokenId);
                if(delegationTimestamp > 0 && delegationTimestamp < block.timestamp) {
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
        for(uint256 i = 0; i < generationsCount; i++) {
            total += generations[i].getTotalDelegated();
        }
        return total;
    }

    /*
     * @title Get how much current cycle can pay for 1 NFT.
     * @return Amount that can be claimed in current cycle per 1 NFT
     * @dev Make sure cycle's balance is not zero and delegates exists, if its 1 cycle then delegates must exist prior start of the cycle
     */
    function getUnitPayment() private view returns (uint256) {
        uint256 delegatedCount = cycles[counter.current()].delegatedCount;
        return (delegatedCount > 0) ? (cycles[counter.current()].balance / delegatedCount) : 0;
    }

    /*
     * @title User can take royalty for delegated NFTs that he owns
     * @param generationId StackOS generation id to get royalty for
     * @param tokenIds Token ids to get royalty for
     * @dev tokens must be delegated and owned by the caller, otherwise transaction reverted
     */
    function claim(uint256 generationId, uint256[] calldata tokenIds) external payable {
        require(!lockClaim, "Reentrant call!");
        lockClaim = true;
        require(generationId < generationsCount, "Generation doesn't exist");
        require(address(this).balance > 0, "No royalty");
        require(generations[generationId].balanceOf(msg.sender) > 0, "You dont have NFTs");

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
        if(counter.current() > 0) {
            uint256 reward;
            // iterate over passed tokens
            for (uint256 i = 0; i < tokenIds.length; i++) {
                uint256 tokenId = tokenIds[i];
                require(generations[generationId].ownerOf(tokenId) == msg.sender, "Not owner");
                require(
                    generations[generationId].getDelegatee(tokenId) != address(0),
                    "NFT should be delegated"
                );

                uint256 delegationTimestamp = generations[generationId].getDelegationTimestamp(tokenId);
                if (delegationTimestamp > 0) {
                    // iterate over cycles, ignoring current one since its not ended
                    for (uint256 o = 0; o < counter.current(); o++) {
                        // generation must be added before start of the cycle (first generation's timestamp = 0)
                        if(generationAddedTimestamp[generationId] < cycles[o].startTimestamp) { 
                            // reward for token in this cycle shouldn't be already claimed
                            if (cycles[o].isClaimed[generationId][tokenId] == false) {
                                // is this token delegated earlier than this cycle start?
                                if ( delegationTimestamp < cycles[o].startTimestamp) {
                                    reward += cycles[o].perTokenReward;
                                    cycles[o].isClaimed[generationId][tokenId] = true;
                                }
                            }
                        }
                    }
                }
            }

            if(reward > 0) {
                // finally send reward
                (bool success, ) = payable(msg.sender).call{value: reward}("");
                require(success, "Transfer failed");
            }
        }

        lockClaim = false;
    }
}
