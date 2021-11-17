//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IStackOSNFT.sol";
import "./GenerationManager.sol";
import "hardhat/console.sol";

contract MasterNode is ERC721, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    mapping(address => uint256) private deposits; // total tokens deposited, from any generation
    mapping(address => uint256) private lastUserMasterNode; // owner => current incomplete master node id
    mapping(address => uint256[]) private toBeMinted; // owner => MasterNodeNFT ids to be minted
    mapping(uint256 => mapping(uint256 => uint256)) private stackToMaster; // generation => stack id => master node id

    GenerationManager private generations;

    uint256 immutable mintPrice; // number of StackNFTs that must be deposited in order to be able to mint a MasterNode.

    constructor(
        GenerationManager _generations,
        uint256 _mintPrice
    ) ERC721("MasterNode", "MN") {
        generations = _generations;
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
            stack.transferFrom(msg.sender, address(this), tokenId);

            if(deposits[msg.sender] == 0) {
                lastUserMasterNode[msg.sender] = _tokenIdCounter.current();
                _tokenIdCounter.increment();
            }
            deposits[msg.sender] += 1;
            if(deposits[msg.sender] == mintPrice) {
                deposits[msg.sender] -= mintPrice;
                stackToMaster[generationId][tokenId] = lastUserMasterNode[msg.sender];
                toBeMinted[msg.sender].push(lastUserMasterNode[msg.sender]);
            } else {
                stackToMaster[generationId][tokenId] = lastUserMasterNode[msg.sender];
            }
        }

    }

    /*
     *  @title Mints a MasterNodeNFT for the caller.
     *  @dev Caller must have deposited `mintPrice` number of StackNFT of any generation.
     */
    function mint() public nonReentrant {
        require(toBeMinted[msg.sender].length > 0, "Not enough deposited");
        while(toBeMinted[msg.sender].length > 0) {
            _mint(msg.sender, toBeMinted[msg.sender][toBeMinted[msg.sender].length - 1]);
            toBeMinted[msg.sender].pop();
        }
    }
}
