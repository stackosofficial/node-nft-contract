//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IStackOsNFT.sol";
import "./GenerationManager.sol";

abstract contract Whitelist is Ownable {

    mapping(address => bool) _whitelist;
 
    modifier onlyWhitelisted () {
        require(_whitelist[_msgSender()], "Not whitelisted for transfers");
        _;
    }

    /*
     *  @title Whitelist address to transfer tokens.
     *  @param Address to whitelist.
     *  @dev Caller must be owner of the contract.
     */
    function whitelist(address _addr) public onlyOwner {
        _whitelist[_addr] = true;
    }
}
