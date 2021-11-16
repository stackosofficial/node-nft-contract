//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IStackOSNFT.sol";
import "hardhat/console.sol";

contract GenerationManager is Ownable, ReentrancyGuard {

    IStackOSNFT[] private generations; // StackNFT contract generations
    uint256[] private generationAddedTimestamp; // time when new StackOS added to this contract

    constructor(
        IStackOSNFT _stackOS 
    ) {
        generations.push(_stackOS);
        generationAddedTimestamp.push(0);
    }

    /*
     * @title Add next generation of StackNFT.
     * @param IStackOSNFT address. 
     * @dev Could only be invoked by the contract owner.
     * @dev Address should be unique.
     */
    function add(IStackOSNFT _stackOS) public onlyOwner {
        require(address(_stackOS) != address(0), "Must be not zero-address");
        for(uint256 i; i < generations.length; i++) {
            require(generations[i] != _stackOS, "Address already added");
        }
        generations.push(_stackOS);
        generationAddedTimestamp.push(block.timestamp);
    }

    /*
     * @title Get total number of generations added.
     */
    function count() public view returns (uint256) {
        return generations.length;
    }


    /*
     * @title Get generation of StackNFT.
     * @param Generation id. 
     */
    function get(uint256 generationId) public view returns (IStackOSNFT) {
        return generations[generationId];
    }

    /*
     * @title Get generation added timestamp.
     * @param Generation id. 
     */
    function getAddedTimestamp(uint256 generationId) public view returns (uint256) {
        return generationAddedTimestamp[generationId];
    }

}
