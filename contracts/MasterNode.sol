//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IStackOSNFT.sol";
import "hardhat/console.sol";
import "./GenerationManager.sol";

contract MasterNode is ERC721, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    mapping(address => uint256) private deposits; // total tokens deposited, from any generation
    mapping(uint256 => mapping(uint256 => uint256)) private stackToMaster; // generation => stack id => master node id
    mapping(address => uint256) private lastUserMasterNode; // owner => current incomplete master node id

    GenerationManager private generations;

    uint256 public mintPrice;

    constructor(
        GenerationManager _generations,
        uint256 _mintPrice
    ) ERC721("MasterNode", "MN") {
        generations = _generations;
        mintPrice = _mintPrice;
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
     * @title Returns true if StackNFT token is locked in MasterNode.
     * @param StackNFT generation id.
     * @param StackNFT token id.
     */
    function isLocked(uint256 generationId, uint256 tokenId) public view returns (bool) {
        return _exists(stackToMaster[generationId][tokenId]);
    }

    /*
     * @title Returns true if `_wallet` own either StackNFT or MasterNodeNFT that owns StackNFT.
     * @param StackNFT generation id.
     * @param StackNFT token id.
     */
    function isOwnStackOrMasterNode(address _wallet, uint256 generationId, uint256 tokenId) public view returns (bool) {
        if(_exists(stackToMaster[generationId][tokenId]) &&
                ownerOf(generationId, tokenId) == _wallet) {
            return true;
        }
        return generations.get(generationId).ownerOf(tokenId) == _wallet;
    }

    /*
     * @title Returns owner of the MasterNodeNFT that owns designated StackNFT.
     * @param StackNFT generation id.
     * @param StackNFT token id.
     */
    function ownerOf(uint256 generationId, uint256 tokenId) public view returns (address) {
        return ownerOf(stackToMaster[generationId][tokenId]);
    }

    /*
     *  @title Deposit StackNFT.
     *  @dev StackNFT generation must be added prior to deposit.
     */
    function deposit(uint256 generationId, uint256[] calldata tokenIds) external nonReentrant {

        require(generationId < generations.count(), "Generation doesn't exist");

        IStackOSNFT stack = generations.get(generationId);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            require(stack.ownerOf(tokenId) == msg.sender, "Not owner");
            stack.transferFrom(msg.sender, address(this), tokenId);
            stackToMaster[generationId][tokenId] = lastUserMasterNode[msg.sender];
        }

        deposits[msg.sender] += tokenIds.length;
    }

    /*
     *  @title Mints a MasterNodeNFT for the caller.
     *  @dev Caller must have deposited `mintPrice` number of StackNFT of any generation.
     */
    function mint() public nonReentrant {
        require(deposits[msg.sender] >= mintPrice, "Not enough deposited");
        deposits[msg.sender] -= mintPrice;
        _mint(msg.sender, _tokenIdCounter.current());
        _tokenIdCounter.increment();
        lastUserMasterNode[msg.sender] = _tokenIdCounter.current();
    }
}
