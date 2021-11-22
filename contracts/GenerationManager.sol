//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IStackOSNFT.sol";
import "./StackOsNFT.sol";

contract GenerationManager is Ownable, ReentrancyGuard {
    IStackOSNFT[] private generations; // StackNFT contract generations
    mapping(address => uint256) private ids; // generation ids
    uint256[] private generationAddedTimestamp; // time when new StackOS added to this contract

    constructor() {}

    /*
     * @title Add next generation of StackNFT.
     * @param IStackOSNFT address.
     * @dev Could only be invoked by the contract owner.
     * @dev Address should be unique.
     */
    function add(IStackOSNFT _stackOS) public onlyOwner {
        require(address(_stackOS) != address(0), "Must be not zero-address");
        for (uint256 i; i < generations.length; i++) {
            require(generations[i] != _stackOS, "Address already added");
        }
        ids[address(_stackOS)] = generations.length;
        generations.push(_stackOS);
        generationAddedTimestamp.push(block.timestamp);
    }

    /*
     * @title Deploy new StackOsNFT.
     * @dev All params should be same as in stack NFT constructor.
     */
    function deployNextGen(
        string memory _name,
        string memory _symbol,
        IERC20 _stackOSTokenToken,
        DarkMatter _darkMatter,
        uint256 _participationFee,
        uint256 _maxSupply,
        uint256 _prizes,
        uint256 _auctionedNFTs,
        // address _vrfCoordinator,
        // address _linkToken,
        bytes32 _keyHash,
        uint256 _transferDiscount,
        uint256 _timeLock
    ) public onlyOwner returns (IStackOSNFT) {
        IStackOSNFT stack = IStackOSNFT(
            address(
                new StackOsNFT(
                    _name,
                    _symbol,
                    _stackOSTokenToken,
                    _darkMatter,
                    _participationFee,
                    _maxSupply,
                    _prizes,
                    _auctionedNFTs,
                    _keyHash,
                    _transferDiscount,
                    _timeLock
                )
            )
        );
        stack.transferOwnership(msg.sender);
        add(stack);
        return stack;
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
     * @title Get generation of StackNFT.
     * @param Stack NFT contract address
     */
    function getIDByAddress(address _nftAddress) public view returns (uint256) {
        uint256 generationID = ids[_nftAddress];
        if (generationID == 0) {
            require(address(get(0)) == _nftAddress, "Not Correct Address");
        }
        return generationID;
    }

    /*
     * @title Get generation added timestamp.
     * @param Generation id.
     */
    function getAddedTimestamp(uint256 generationId)
        public
        view
        returns (uint256)
    {
        return generationAddedTimestamp[generationId];
    }
}
