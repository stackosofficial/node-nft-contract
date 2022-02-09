//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract Whitelist is Ownable {

    mapping(address => bool) public _whitelist;
 
    modifier onlyWhitelisted () {
        require(_whitelist[_msgSender()], "Not whitelisted for transfers");
        _;
    }

    /**
     *  @notice Whitelist address to transfer tokens.
     *  @param _addres Address to whitelist.
     *  @dev Caller must be owner of the contract.
     */
    function whitelist(address _addres) public onlyOwner {
        _whitelist[_addres] = true;
    }
}
