//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";
import "./StackOsNFT.sol";

contract Royalty is Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private counter; // counting cycles

    address payable private bank; // fee from deposits goes here
    uint256 private bankPercent; // amount of fee from deposits

    uint256 private minEthToStartCycle; // cycle cannot end if its balance is less than this
    uint256 private constant CYCLE_DURATION = 30 days; // cycle cannot end if it started earlier than this

    // StackOSInterface private stackOS; // NFTs contract
    bool private lockClaim; // anti-reentrancy for claim function

    struct Cycle {
        uint256 startTimestamp; // when cycle started
        uint256 perTokenReward; // price of NFT in cycle, calculated when cycle ends
        uint256 balance; // how much deposited during cycle
        uint256 delegatesCount; // how much NFT delegators exists when cycle starts
        mapping(uint256 => bool) isClaimed; // whether or not reward is claimed for certain NFT (the same token can have true and false in different cycles)
    }

    mapping(uint256 => Cycle) private cycles; // a new cycle starts when two conditions met, `CYCLE_DURATION` time passed and `minEthToStartCycle` ether deposited

    mapping(uint256 => StackOSInterface) private generations; 
    uint256 private generationsCount; 


    constructor(
        StackOSInterface _stackOS,
        uint256 _minEthToStartCycle,
        address payable _bank,
        uint256 _bankPercent
    ) {
        bank = _bank;
        generations[generationsCount++] = _stackOS;
        bankPercent = _bankPercent;
        minEthToStartCycle = _minEthToStartCycle;
        // start first cycle
        cycles[counter.current()].startTimestamp = block.timestamp;
        cycles[counter.current()].delegatesCount = getTotalDelegators();
    }

    receive() external payable {
        require(msg.value > 0, "Nothing to receive");
        require(getTotalDelegators() > 0, "There is no one with delegated NFTs");

        if(cycles[counter.current()].delegatesCount == 0) {
            cycles[counter.current()].delegatesCount = getTotalDelegators();
        }

        // take fee
        uint256 bankPart = ((msg.value * bankPercent) / 10000);
        if (bankPart > 0) {
            (bool success, ) = bank.call{value: bankPart}("");
            require(success, "Re-route to bank failed");
        }
        // is current cycle lasts enough?
        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            // is current cycle got enough ether?
            if (cycles[counter.current()].balance >= minEthToStartCycle) {
                // before starting next cycle we calculate 'ETH per NFT' for current cycle
                cycles[counter.current()].perTokenReward = getUnitPayment(
                    cycles[counter.current()].balance
                );
                // start new cycle
                counter.increment();
                // save count of delegates that exists on start of cycle
                cycles[counter.current()].delegatesCount = getTotalDelegators();
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

    // TODO: should be there any checks?
    function addNextGeneration(StackOSInterface _stackOS) public onlyOwner {
        for(uint256 i; i < generationsCount; i++) {
            require(generations[i] != _stackOS, "This generation already exists");
        }
        generations[generationsCount++] = _stackOS;
    }

    /*
        @titile Get number of delegators in all StackOS generations
    */
    function getTotalDelegators() public view returns (uint256) {
        uint256 total = 0;
        for(uint256 i = 0; i < generationsCount; i++) {
            total += generations[i].getTotalDelegators();
        }
        return total;
    }

    /*
        @title Calculate how much should get each NFT delegator for one token
        @param _amount Number to divide by total delegators
        @return 
        @dev no need to require(_amount == 0)? amount checked everywhere anyway, so cant be 0 here (currently)
    */
    function getUnitPayment(uint256 _amount) public view returns (uint256) {
        uint256 totalDelegators = cycles[counter.current()].delegatesCount;
        return (totalDelegators > 0) ? (_amount / totalDelegators) : 0;
    }

    /*
        @title User take reward for delegated NFTs that he owns
        @param generationId StackOS generation id to get reward for
        @param tokenIds Token ids to get reward for
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
                cycles[counter.current()].delegatesCount = getTotalDelegators();
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
                        // reward for token in this cycle shouldn't be already claimed
                        if (cycles[o].isClaimed[tokenId] == false) {
                            // is this token delegated earlier than this cycle start?
                            if (
                                delegationTimestamp < cycles[o].startTimestamp
                            ) {
                                reward += cycles[o].perTokenReward;
                                cycles[o].balance -= cycles[o].perTokenReward; // this is unnecessery for now
                                cycles[o].isClaimed[tokenId] = true;
                            }
                        }
                    }
                }
            }
        }

        // should this be replaced with 'if' statement?
        require(reward > 0, "Nothing to claim");

        // finally send reward
        (bool success, ) = payable(msg.sender).call{value: reward}("");
        require(success, "Transfer failed");
        lockClaim = false;

        for (uint256 o = 0; o < counter.current(); o++) {
            console.log(o, reward/10**17, cycles[o].delegatesCount, address(this).balance/10**18);
            // console.log(cycles[o].balance/10**17);
        }
    }
}
