//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IStackOSNFT.sol";
import "hardhat/console.sol";

contract MasterNode is ERC721, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    mapping(address => uint256) private deposits; // total tokens deposited, from any generation

    IStackOSNFT[] private generations; // StackNFT contract generations

    uint256 public mintPrice;

    constructor(
        IStackOSNFT _stackOS, 
        uint256 _mintPrice
    ) ERC721("MasterNode", "MN") {
        mintPrice = _mintPrice;
        addNextGeneration(_stackOS);
    }

    /*
     * @title Set number of StackNFTs that must be deposited in order to mint a MasterNode.
     * @param Number of nodes.
     * @dev Could only be invoked by the contract owner.
     */
    function setMintPrice(uint256 _mintPrice) public onlyOwner {
        mintPrice = _mintPrice;
    }

    /*
     * @title Add next generation of StackNFT.
     * @param IStackOSNFT compatible address. Should be unique and non-zero.
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
        @dev StackNFT generation must be added prior to deposit.
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
    }

    /*
        @title Mints a MasterNode for the caller.
        @dev Caller must have deposited `mintPrice` number of StackNFT of any generation.
    */
    function mint() public nonReentrant {
        require(deposits[msg.sender] >= mintPrice, "Not enough deposited");
        deposits[msg.sender] -= mintPrice;
        _mint(msg.sender, _tokenIdCounter.current());
        _tokenIdCounter.increment();
    }
}
