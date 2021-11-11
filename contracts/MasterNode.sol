//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IERC20.sol";
import "./interfaces/IStackOSNFT.sol";
import "hardhat/console.sol";

contract MasterNode is ERC721, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    IERC20 private stackToken;
    mapping(address => uint256) private deposits; // total tokens deposited, from any generation

    IStackOSNFT[] private generations; // StackNFT contract generations

    uint256 private mintPrice;

    constructor(
        IERC20 _stackToken
    ) ERC721("MasterNode", "MN") {
        stackToken = _stackToken;
    }

    /*
     * @title Set number of StackNFTs that must be deposited in order to mint a MasterNode.
     * @param Number of nodes.
     * @dev Could only be invoked by the contract owner.
     */
    function setMintPrice(uint256 numberOfTokens) public onlyOwner {
        mintPrice = numberOfTokens;
    }

    /*
     * @title Add next generation of StackNFT
     * @param IStackOSNFT compatible address
     * @dev Could only be invoked by the contract owner.
     */
    function addNextGeneration(IStackOSNFT _stackOS) public onlyOwner {
        require(address(_stackOS) != address(0), "Must be not zero-address");
        for(uint256 i; i < generations.length; i++) {
            require(generations[i] != _stackOS, "Address already added");
        }
        generations.push(_stackOS);
    }

    /*
        @title Deposit StackNFT.
        @title Once deposited enough mints a MasterNode for the caller.
    */
    function deposit(uint256 generationId, uint256[] calldata tokenIds) external nonReentrant {

        require(generationId < generations.length, "Generation doesn't exist");

        IStackOSNFT stack = generations[generationId];

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            require(stack.ownerOf(tokenId) == msg.sender, "Not owner");
            stack.transferFrom(msg.sender, address(this), tokenId);
        }

        deposits[msg.sender] += tokenIds.length;

        if(deposits[msg.sender] >= mintPrice) {
            deposits[msg.sender] -= mintPrice;
            _mint(msg.sender, _tokenIdCounter.current());
            _tokenIdCounter.increment();
        }

    }
}
