//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IStackOsNFT.sol";
// import "./interfaces/IStackOsNFTBasic.sol";
import "./StackOsNFTBasic.sol";
import "./Subscription.sol";

contract GenerationManager is Ownable, ReentrancyGuard {
    IStackOsNFT[] private generations; // StackNFT contract generations
    mapping(address => uint256) private ids; // generation ids
    uint256[] private generationAddedTimestamp; // time when new StackOS added to this contract

    struct Deployment {
        string name;
        string symbol;
        IERC20 stackOSTokenToken;
        DarkMatter darkMatter;
        Subscription subscription;
        uint256 participationFee;
        uint256 mintFee;
        uint256 maxSupply;
        uint256 transferDiscount;
        uint256 timeLock;
        address royaltyAddress;
    }
    Deployment deployment;

    modifier onlyOwnerOrStackContract() {
        require(owner() == _msgSender() || isAdded(_msgSender()), "Caller is not the owner or stack contract");
        _;
    }

    constructor() {}

    function setupDeploy(
        string memory _name,
        string memory _symbol,
        IERC20 _stackOSTokenToken,
        DarkMatter _darkMatter,
        Subscription _subscription,
        uint256 _participationFee,
        uint256 _mintFee,
        uint256 _maxSupply,
        uint256 _transferDiscount,
        uint256 _timeLock,
        address _royaltyAddress
    ) public onlyOwner {
        deployment.name = _name;
        deployment.symbol = _symbol;
        deployment.stackOSTokenToken = _stackOSTokenToken;
        deployment.darkMatter = _darkMatter;
        deployment.subscription = _subscription;
        deployment.participationFee = _participationFee;
        deployment.mintFee = _mintFee;
        deployment.maxSupply = _maxSupply;
        deployment.transferDiscount = _transferDiscount;
        deployment.timeLock = _timeLock;
        deployment.royaltyAddress = _royaltyAddress;
    }

    function deployNextGenPreset() public returns (IStackOsNFTBasic) 
    {
        // Can only be called from StackNFT contracts
        uint256 callerGenerationId = getIDByAddress(msg.sender);
        // Cannot deploy next generation if it's already exists
        require(callerGenerationId == generations.length - 1, 
            "Next generation already deployed"
        );
        IStackOsNFTBasic stack = IStackOsNFTBasic(
            address(
                new StackOsNFTBasic(
                    deployment.name,
                    deployment.symbol,
                    deployment.stackOSTokenToken,
                    deployment.darkMatter,
                    deployment.subscription,
                    deployment.participationFee,
                    deployment.mintFee,
                    deployment.maxSupply,
                    deployment.transferDiscount,
                    deployment.timeLock,
                    deployment.royaltyAddress
                )
            )
        );
        stack.transferOwnership(Ownable(msg.sender).owner());
        add(stack);
        return stack;
    }

    /*
     * @title Add next generation of StackNFT.
     * @param IStackOsNFT address.
     * @dev Could only be invoked by the contract owner.
     * @dev Address should be unique.
     */
    function add(IStackOsNFT _stackOS) public onlyOwnerOrStackContract {
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
        Subscription _subscription,
        uint256 _participationFee,
        uint256 _mintFee,
        uint256 _maxSupply,
        uint256 _transferDiscount,
        uint256 _timeLock,
        address _royaltyAddress
    ) public onlyOwner returns (IStackOsNFTBasic) {
        IStackOsNFTBasic stack = IStackOsNFTBasic(
            address(
                new StackOsNFTBasic(
                    _name,
                    _symbol,
                    _stackOSTokenToken,
                    _darkMatter,
                    _subscription,
                    _participationFee,
                    _mintFee,
                    _maxSupply,
                    _transferDiscount,
                    _timeLock,
                    _royaltyAddress
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
    function get(uint256 generationId) public view returns (IStackOsNFT) {
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

    function isAdded(address _nftAddress) public view returns (bool) {
        uint256 generationID = ids[_nftAddress];
        if (generationID == 0) {
                return generations.length > 0 && address(get(0)) == _nftAddress;
        }
        return true;
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
