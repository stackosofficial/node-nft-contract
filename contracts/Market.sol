//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "hardhat/console.sol";

contract Market is OwnableUpgradeable, ReentrancyGuardUpgradeable {

    DarkMatter private darkMatter;
    GenerationManager private generations;

    address private daoAddress;
    address private royaltyAddress;

    uint256 private constant MAX_PERCENT = 10000; // must be 10 000

    uint256 public daoFee; 
    uint256 public royaltyFee; 

    struct StackLot {
        uint256 price;
        uint256 generationId;
        uint256 tokenId;
        address seller;
    }

    struct DarkMatterLot {
        uint256 price;
        uint256 tokenId;
        address seller;
    }

    mapping(uint256 => mapping(uint256 => StackLot)) public stackToLot;
    mapping(uint256 => DarkMatterLot) public darkMatterToLot;

    function initialize(
        GenerationManager _generations,
        DarkMatter _darkMatter,
        address _daoAddress,
        address _royaltyAddress,
        uint256 _daoFee,
        uint256 _royaltyFee
    ) initializer public {
        generations = _generations;
        darkMatter = _darkMatter;
        daoAddress = _daoAddress;
        royaltyAddress = _royaltyAddress;
        daoFee = _daoFee;
        royaltyFee = _royaltyFee;
        __Ownable_init();
        __ReentrancyGuard_init();
    }

    function setDaoFee(uint256 _percent) public onlyOwner {
        require(_percent <= MAX_PERCENT, "Max is 10000");
        daoFee = _percent;
    }

    function setRoyaltyFee(uint256 _percent) public onlyOwner {
        require(_percent <= MAX_PERCENT, "Max is 10000");
        royaltyFee = _percent;
    }

    // function viewLots() public view returns (Lot[] memory) {
    //     return lots;
    // }

    function sellDarkMatter(
        uint256 tokenId,
        uint256 price 
    ) public nonReentrant {

        DarkMatterLot storage lot = darkMatterToLot[tokenId];
        require(lot.seller == address(0), "Already listed");

        lot.price = price;
        lot.seller = msg.sender;
        lot.tokenId = tokenId;

        darkMatter.transferFrom(msg.sender, address(this), tokenId);
    }

    function sellStack(
        uint256 generationId,
        uint256 tokenId,
        uint256 price
    ) public nonReentrant {
        require(generationId < generations.count(), "Generation doesn't exist");

        StackLot storage lot = stackToLot[generationId][tokenId];
        require(lot.seller == address(0), "Already listed");
        generations.get(generationId).transferFrom(msg.sender, address(this), tokenId);

        lot.price = price;
        lot.seller = msg.sender;
        lot.generationId = generationId;
        lot.tokenId = tokenId;
    }

    function buyStack(
        uint256 generationId,
        uint256 tokenId
    ) public payable nonReentrant {
        require(generationId < generations.count(), "Generation doesn't exist");

        StackLot storage lot = stackToLot[generationId][tokenId];
        require(lot.seller != address(0), "Not listed");

        uint256 daoPart = lot.price * daoFee / MAX_PERCENT;
        uint256 royaltyPart = lot.price * royaltyFee / MAX_PERCENT;
        uint256 sellerPart = lot.price - daoPart - royaltyPart;

        daoAddress.call{value: daoPart}("");
        royaltyAddress.call{value: royaltyPart}("");
        payable(lot.seller).call{value: sellerPart}("");

        delete stackToLot[generationId][tokenId];

        generations.get(generationId).transferFrom(address(this), msg.sender, tokenId);
    }

    function buyDarkMatter(
        uint256 tokenId
    ) public payable nonReentrant {
        DarkMatterLot storage lot = darkMatterToLot[tokenId];
        require(lot.seller != address(0), "Not listed");

        uint256 daoPart = lot.price * daoFee / MAX_PERCENT;
        uint256 royaltyPart = lot.price * royaltyFee / MAX_PERCENT;
        uint256 sellerPart = lot.price - daoPart - royaltyPart;

        daoAddress.call{value: daoPart}("");
        royaltyAddress.call{value: royaltyPart}("");
        payable(lot.seller).call{value: sellerPart}("");

        delete darkMatterToLot[tokenId];

        darkMatter.transferFrom(address(this), msg.sender, tokenId);
    }
}
