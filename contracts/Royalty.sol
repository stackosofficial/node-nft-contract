//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "contracts/interfaces/IStackOSNFT.sol";
import "hardhat/console.sol";

contract Royalty is Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private counter; // counting cycles

    address payable private bank; // fee from deposits goes here
    uint256 private bankPercent; // amount of fee from deposits

    uint256 private minEthToStartCycle; // cycle cannot end if its balance is less than this
    uint256 private constant CYCLE_DURATION = 30 days; // cycle cannot end if it started earlier than this

    // StackOsNFT private stackOS; // NFTs contract
    bool private lockClaim; // anti-reentrancy for claim function

    struct Cycle {
        uint256 startTimestamp; // when cycle started
        uint256 perTokenReward; // price of NFT in cycle, calculated when cycle ends
        uint256 balance; // how much deposited during cycle
        uint256 delegatedCount; // how much tokens delegated when cycle starts
        // [generation][tokenId] = true/false
        mapping(uint256 => mapping(uint256 => bool)) isClaimed; // whether or not reward is claimed for certain NFT (the same token can have true and false in different cycles)
    }

    mapping(uint256 => Cycle) private cycles; // a new cycle starts when two conditions met, `CYCLE_DURATION` time passed and `minEthToStartCycle` ether deposited

    mapping(uint256 => IStackOSNFT) private generations; // StackOS NFT contract different generations
    mapping(uint256 => uint256) private generationAddedTimestamp; 
    uint256 private generationsCount; // total stackOS generations added

    constructor(
        IStackOSNFT _stackOS,
        uint256 _minEthToStartCycle,
        address payable _bank,
        uint256 _bankPercent
    ) {
        bank = _bank;
        generations[generationsCount++] = _stackOS; // TODO: what if bad address passed? such as 0, should we revert ?
        bankPercent = _bankPercent;
        minEthToStartCycle = _minEthToStartCycle;
    }

    receive() external payable {

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
                cycles[counter.current()].perTokenReward = getUnitPayment(
                    cycles[counter.current()].balance
                );
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

    function setBank(address payable _bank) external onlyOwner {
        require(_bank != address(0), "Must be not zero-address");
        bank = _bank;
    }

    function setBankPercent(uint256 _percent) external onlyOwner {
        bankPercent = _percent;
    }

    function addNextGeneration(IStackOSNFT _stackOS) public onlyOwner {
        require(address(_stackOS) != address(0), "Must be not zero-address");
        for(uint256 i; i < generationsCount; i++) {
            require(generations[i] != _stackOS, "This generation already exists");
        }
        generations[generationsCount] = _stackOS;
        generationAddedTimestamp[generationsCount] = block.timestamp;
        generationsCount += 1;
    }

    function getTotalDelegatedBeforeCurrentBlock() public view returns (uint256) {
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
        @titile Get number of delegated tokens in every added StackOS generation 
    */
    function getTotalDelegated() public view returns (uint256) {
        uint256 total = 0;
        for(uint256 i = 0; i < generationsCount; i++) {
            total += generations[i].getTotalDelegated();
        }
        return total;
    }

    /*
        @title Calculate how much should get each NFT delegator for one token
        @param _amount Number to divide by total delegated tokens
        @return 
        @dev no need to require(_amount == 0)? amount checked everywhere anyway, so cant be 0 here (currently)
    */
    function getUnitPayment(uint256 _amount) public view returns (uint256) {
        uint256 delegatedCount = cycles[counter.current()].delegatedCount;
        return (delegatedCount > 0) ? (_amount / delegatedCount) : 0;
    }

    /*
        @title User take reward for delegated NFTs that he owns
        @param generationId StackOS generation id to get reward for
        @param tokenIds Token ids to get reward for
        @dev TODO: maybe some requires unnecessery?
    */
    function claim(uint256 generationId, uint256[] calldata tokenIds) external payable {
        require(!lockClaim, "Reentrant call!");
        lockClaim = true;
        require(generationId < generationsCount, "Generation doesn't exist");
        require(address(this).balance > 0, "No royalty");
        require(generations[generationId].balanceOf(msg.sender) > 0, "You dont have NFTs");

        // same 'if' as in `receive()` function, except that here we don't receive ether, but simply start new cycle if it's time
        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            if (cycles[counter.current()].balance >= minEthToStartCycle) {
                cycles[counter.current()].perTokenReward = getUnitPayment(
                    cycles[counter.current()].balance
                );
                counter.increment();
                cycles[counter.current()].delegatedCount = getTotalDelegated();
                cycles[counter.current()].startTimestamp = block.timestamp;
            }
        }
        // we just deployed, cycle with 0 index still not ended, cant claim for it
        require(counter.current() > 0, "Too early");

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
                // iterate over cycles
                for (uint256 o = 0; o < counter.current(); o++) {
                    // only can get reward for ended cycle, so skip currently running cycle (last one)
                    if (cycles[o].perTokenReward > 0) {
                        // generation must be added before start of the cycle
                        if(generationAddedTimestamp[generationId] < cycles[o].startTimestamp) { 
                            // reward for token in this cycle shouldn't be already claimed
                            if (cycles[o].isClaimed[generationId][tokenId] == false) {
                                // is this token delegated earlier than this cycle start?
                                if (
                                    delegationTimestamp < cycles[o].startTimestamp
                                ) {
                                    reward += cycles[o].perTokenReward;
                                    cycles[o].isClaimed[generationId][tokenId] = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        // TODO: should this be replaced with 'if' statement?
        require(reward > 0, "Nothing to claim");
        // finally send reward
        (bool success, ) = payable(msg.sender).call{value: reward}("");
        require(success, "Transfer failed");
        lockClaim = false;
    }
}
