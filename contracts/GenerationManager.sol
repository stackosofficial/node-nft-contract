//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IStackOsNFT.sol";
import "./StackOsNFTBasic.sol";

contract GenerationManager is Ownable, ReentrancyGuard {
    using Strings for uint256;

    IStackOsNFT[] private generations;
    mapping(address => uint256) private ids;
    uint256[] private generationAddedTimestamp; // time when generation was added

    struct Deployment {
        string name;
        string symbol;
        address stackOSTokenToken;
        address darkMatter;
        address subscription;
        uint256 participationFee;
        uint256 mintFee;
        uint256 maxSupplyGrowthPercent;
        uint256 transferDiscount;
        uint256 timeLock;
        address royaltyAddress;
        address router;
        address market;
    }
    Deployment deployment;

    modifier onlyOwnerOrStackContract() {
        require(owner() == _msgSender() || isAdded(_msgSender()), "Caller is not the owner or stack contract");
        _;
    }

    constructor() {}

    /*
     * @title Save settings for auto deployment.
     * @title Has the same params as StackNFTBasic constructor with one exception.
     * @param _maxSupplyGrowthPercent increase max supply for new contract by this percent.
     * @dev Could only be invoked by the contract owner.
     */
    function setupDeploy(
        string memory _name,
        string memory _symbol,
        address _stackOSTokenToken,
        address _darkMatter,
        address _subscription,
        uint256 _participationFee,
        uint256 _mintFee,
        uint256 _maxSupplyGrowthPercent,
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
        require(_maxSupplyGrowthPercent <= 10000, "invalid basis points");
        deployment.maxSupplyGrowthPercent = _maxSupplyGrowthPercent;
        deployment.transferDiscount = _transferDiscount;
        deployment.timeLock = _timeLock;
        deployment.royaltyAddress = _royaltyAddress;
    }

    /*
     * @title Save additional settings for auto deployment.
     * @param Address of router.
     * @dev Could only be invoked by the contract owner.
     * @dev Must be called along with first setup function.
     */
    function setupDeploy2(
        address _router,
        address _market
    ) public onlyOwner {
        deployment.router = _router;
        deployment.market = _market;
    }

    /*
     * @title Called by StackNFTBasic once it reaches max supply.
     * @dev Could only be invoked by the last StackOsNFTBasic generation.
     */
    function deployNextGenPreset() public returns (IStackOsNFTBasic) 
    {
        // Can only be called from StackNFT contracts
        uint256 callerGenerationId = getIDByAddress(msg.sender);
        // Cannot deploy next generation if it's already exists
        require(callerGenerationId == generations.length - 1, 
            "Next generation already deployed"
        );

        IStackOsNFT caller = get(callerGenerationId);
        uint256 maxSupply = caller.getMaxSupply() * 
            (deployment.maxSupplyGrowthPercent + 10000) / 10000;
        string memory name = string(abi.encodePacked(
            deployment.name,
            " ",
            uint256(count() + 1).toString()
        ));
        IStackOsNFTBasic stack = IStackOsNFTBasic(
            address(
                new StackOsNFTBasic(
                    name,
                    deployment.symbol,
                    deployment.stackOSTokenToken,
                    deployment.darkMatter,
                    deployment.subscription,
                    deployment.participationFee,
                    deployment.mintFee,
                    maxSupply,
                    deployment.transferDiscount,
                    deployment.timeLock,
                    deployment.royaltyAddress
                )
            )
        );
        stack.transferOwnership(Ownable(msg.sender).owner());
        add(stack);
        stack.adjustAddressSettings(
            address(this),
            deployment.router
        );
        stack.whitelist(address(deployment.darkMatter));
        stack.whitelist(address(deployment.market));
        return stack;
    }

    /*
     * @title Add next generation of StackNFT.
     * @param IStackOsNFT address.
     * @dev Could only be invoked by the contract owner or StackOsNFTBasic.
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
     * @dev All params should be the same as in StackOsNFTBasic constructor.
     * @dev Additional setup is required on newly deployed contract, please refer to deploy scripts or tests.
     */
    function deployNextGen(
        string memory _name,
        string memory _symbol,
        address _stackOSTokenToken,
        address _darkMatter,
        address _subscription,
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
     * @title Get generation of StackNFT contract by id.
     * @param Generation id.
     * @dev Must be valid generation id to avoid out-of-bounds error.
     */
    function get(uint256 generationId) public view returns (IStackOsNFT) {
        return generations[generationId];
    }

    /*
     * @title Get generation ID by address.
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
     * @title Returns whether StackNFT contract is added to this manager.
     * @param Stack NFT contract address
     */
    function isAdded(address _nftAddress) public view returns (bool) {
        uint256 generationID = ids[_nftAddress];
        return generations.length > 0 && address(get(generationID)) == _nftAddress;
    }

    /*
     * @title Get timestamp when generation was added.
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
