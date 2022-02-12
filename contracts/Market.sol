//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./Royalty.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract Market is OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {

    event SetRoyaltyFee(uint256 _percent);
    event SetDaoFee(uint256 _percent);

    event StackSale(
        address indexed seller,
        address indexed buyer,
        uint256 generationId,
        uint256 tokenId,
        uint256 sellerReceived
    );

    event StackListing(
        address indexed seller,
        uint256 generationId,
        uint256 tokenId,
        uint256 price
    );

    event DarkMatterSale(
        address indexed seller,
        address indexed buyer,
        uint256 tokenId,
        uint256 sellerReceived
    );

    event DarkMatterListing(
        address indexed seller,
        uint256 tokenId,
        uint256 price
    );

    DarkMatter private darkMatter;
    GenerationManager private generations;

    address private daoAddress;
    address private royaltyAddress;

    uint256 private constant HUNDRED_PERCENT = 10000;

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
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Set dao fee taken of each sell.
     * @param _percent Fee basis points.
     * @dev Could only be called by the contract owner.
     */
    function setDaoFee(uint256 _percent) public onlyOwner {
        require(_percent <= HUNDRED_PERCENT, "invalid fee basis points");
        daoFee = _percent;
        emit SetDaoFee(_percent);
    }

    /**
     * @notice Set Royalty contract fee percent that is taken of each sell.
     * @param _percent Fee basis points.
     * @dev Could only be called by the contract owner.
     */
    function setRoyaltyFee(uint256 _percent) public onlyOwner {
        require(_percent <= HUNDRED_PERCENT, "invalid fee basis points");
        royaltyFee = _percent;
        emit SetRoyaltyFee(_percent);
    }

    /**
     * @notice List DarkMatterNFT for selling.
     * @param tokenId DarkMatterNFT token id.
     * @param price Price that buyer will pay in matic.
     * @dev Caller should own the token.
     */
    function listDarkMatterNFT(
        uint256 tokenId,
        uint256 price 
    ) public nonReentrant {
        DarkMatterLot storage lot = darkMatterToLot[tokenId];
        require(lot.seller == address(0), "Already listed");
        require(darkMatter.ownerOf(tokenId) == msg.sender, "Not token owner");

        lot.price = price;
        lot.seller = msg.sender;
        lot.tokenId = tokenId;

        emit DarkMatterListing(msg.sender, tokenId, price);
    }

    /**
     * @notice List StackNFT for selling.
     * @param generationId StackNFT generation id.
     * @param tokenId StackNFT token id.
     * @param price Price that buyer will pay in matic.
     * @dev Caller should own the token.
     */
    function listStackNFT(
        uint256 generationId,
        uint256 tokenId,
        uint256 price
    ) public nonReentrant {
        require(generationId < generations.count(), "Generation doesn't exist");
        require(generations.get(generationId).ownerOf(tokenId) == msg.sender, "Not token owner");

        StackLot storage lot = stackToLot[generationId][tokenId];
        require(lot.seller == address(0), "Already listed");

        lot.price = price;
        lot.seller = msg.sender;
        lot.generationId = generationId;
        lot.tokenId = tokenId;

        emit StackListing(msg.sender, generationId, tokenId, price);
    }

    /**
     * @notice Delist DarkMatterNFT from selling.
     * @param tokenId DarkMatterNFT token id.
     */
    function deListDarkMatterNFT(
        uint256 tokenId
    ) public nonReentrant {
        bool isApproved = darkMatter
            .isApprovedForAll(darkMatterToLot[tokenId].seller, address(this));
        require(darkMatterToLot[tokenId].seller == msg.sender || !isApproved, 'Not an owner');
        require(darkMatterToLot[tokenId].seller != address(0), 'Not a listing');
        delete darkMatterToLot[tokenId];
    }

    /**
     * @notice Delist StackNFT from selling.
     * @param generationId StackNFT generation id.
     * @param tokenId StackNFT token id.
     */
    function deListStackNFT(
        uint256 generationId,
        uint256 tokenId
    ) public nonReentrant {
        bool isApproved = generations.get(generationId)
            .isApprovedForAll(stackToLot[generationId][tokenId].seller, address(this));
        require(stackToLot[generationId][tokenId].seller == msg.sender || !isApproved, 'Not an owner');
        require(stackToLot[generationId][tokenId].seller != address(0), 'Not a listing');
        delete stackToLot[generationId][tokenId];
    }

    /**
     * @notice Buy listed StackNFT.
     * @param generationId StackNFT generation id.
     * @param tokenId StackNFT token id.
     * @dev Seller should approve market to spend `tokenId`.
     * @dev Market contract must be whitelisted in StackNFT contract to transfer tokens.
     */
    function buyStack(
        uint256 generationId,
        uint256 tokenId
    ) public payable nonReentrant {
        require(generationId < generations.count(), "Generation doesn't exist");

        StackLot storage lot = stackToLot[generationId][tokenId];
        require(lot.seller != address(0), "Not listed");
        require(lot.price <= msg.value, "Not enough MATIC");

        uint256 daoPart = lot.price * daoFee / HUNDRED_PERCENT;
        uint256 royaltyPart = lot.price * royaltyFee / HUNDRED_PERCENT;
        uint256 sellerPart = lot.price - daoPart - royaltyPart;

        generations.get(generationId).transferFrom(lot.seller, msg.sender, tokenId);

        (bool success, ) = daoAddress.call{value: daoPart}("");
        require(success, "Transfer failed");

        Royalty(payable(royaltyAddress)).onReceive{value: royaltyPart}(generationId);

        (success, ) = payable(lot.seller).call{value: sellerPart}("");
        require(success, "Transfer failed");

        (success, ) = payable(msg.sender).call{value: msg.value - lot.price}("");
        require(success, "Transfer failed");

        emit StackSale(lot.seller, msg.sender, generationId, tokenId, sellerPart);
        delete stackToLot[generationId][tokenId];
    }

    /**
     * @notice Buy listed DarkMatter NFT.
     * @param tokenId DarkMatterNFT token id.
     * @dev Seller should approve market to spend `tokenId`.
     * @dev Market contract must be whitelisted in StackNFT contract to transfer tokens.
     */
    function buyDarkMatter(
        uint256 tokenId
    ) public payable nonReentrant {
        DarkMatterLot storage lot = darkMatterToLot[tokenId];
        require(lot.seller != address(0), "Not listed");
        require(lot.price <= msg.value, "Not enough MATIC");

        uint256 daoPart = lot.price * daoFee / HUNDRED_PERCENT;
        uint256 royaltyPart = lot.price * royaltyFee / HUNDRED_PERCENT;
        uint256 sellerPart = lot.price - daoPart - royaltyPart;

        darkMatter.transferFrom(lot.seller, msg.sender, tokenId);

        (bool success, ) = daoAddress.call{value: daoPart}("");
        require(success, "Transfer failed");

        (success, ) = royaltyAddress.call{value: royaltyPart}("");
        require(success, "Transfer failed");

        (success, ) = payable(lot.seller).call{value: sellerPart}("");
        require(success, "Transfer failed");

        (success, ) = payable(msg.sender).call{value: msg.value - lot.price}("");
        require(success, "Transfer failed");

        emit DarkMatterSale(lot.seller, msg.sender, tokenId, sellerPart);
        delete darkMatterToLot[tokenId];
    }

    function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner{}
}
