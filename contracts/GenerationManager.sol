//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IStackOsNFT.sol";
import "./StackOsNFTBasic.sol";

contract GenerationManager is Ownable, ReentrancyGuard {
    using Strings for uint256;

    event NextGenerationDeploy(
        address StackNFT, 
        address deployer, 
        uint256 deployTimestamp
    );
    event AdjustAddressSettings(
        address _stableAcceptor,
        address _exchange,
        address _dao
    );

    struct Deployment {
        string name;
        string symbol;
        address stackToken;
        address darkMatter;
        address subscription;
        address sub0;
        uint256 mintPrice;
        uint256 subsFee;
        uint256 daoFee;
        uint256 maxSupplyGrowthPercent;
        uint256 transferDiscount;
        uint256 rewardDiscount;
        uint256 timeLock;
        address royaltyAddress;
        address market;
        string URI;
    }

    address private stableAcceptor;
    address private exchange;
    address private dao;

    uint256 private constant GEN2_MAX_SUPPLY = 1000;

    Deployment private deployment;
    IStackOsNFT[] private generations;
    mapping(address => uint256) private ids;

    constructor() {}

    function getDeployment() 
        external 
        view 
        returns 
        (Deployment memory) 
    {
        return deployment;
    }

    function adjustAddressSettings(
        address _stableAcceptor,
        address _exchange,
        address _dao
    )
        public
        onlyOwner
    {
        stableAcceptor = _stableAcceptor;
        exchange = _exchange;
        dao = _dao;
        emit AdjustAddressSettings(
            _stableAcceptor,
            _exchange,
            _dao
        );
    }

    /*
     * @title Save settings for auto deployment.
     * @param _maxSupplyGrowthPercent increase max supply for new contract by this percent.
     * @dev Could only be invoked by the contract owner.
     */
    function setupDeploy(
        string memory _name,
        string memory _symbol,
        address _stackToken,
        address _darkMatter,
        address _subscription,
        address _sub0,
        uint256 _mintPrice,
        uint256 _subsFee,
        uint256 _maxSupplyGrowthPercent,
        uint256 _transferDiscount,
        uint256 _timeLock,
        address _royaltyAddress
    ) public onlyOwner {
        deployment.name = _name;
        deployment.symbol = _symbol;
        deployment.stackToken = _stackToken;
        deployment.darkMatter = _darkMatter;
        deployment.subscription = _subscription;
        deployment.sub0 = _sub0;
        deployment.mintPrice = _mintPrice;
        deployment.subsFee = _subsFee;
        deployment.maxSupplyGrowthPercent = _maxSupplyGrowthPercent;
        deployment.transferDiscount = _transferDiscount;
        deployment.timeLock = _timeLock;
        deployment.royaltyAddress = _royaltyAddress;
    }

    /*
     * @title Save additional settings for auto deployment.
     * @param Address of market.
     * @dev Could only be invoked by the contract owner.
     * @dev Must be called along with first setup function.
     */
    function setupDeploy2(
        address _market,
        uint256 _daoFee,
        string calldata _uri,
        uint256 _rewardDiscount
    ) public onlyOwner {
        deployment.market = _market;
        deployment.daoFee = _daoFee;
        deployment.URI = _uri;
        deployment.rewardDiscount = _rewardDiscount;
    }

    /*
     * @title Called by StackNFTBasic once it reaches max supply.
     * @dev Could only be invoked by the last StackOsNFTBasic generation.
     * @dev Generation id is appended to the name. 
     */
    function deployNextGenPreset() 
        public 
        nonReentrant
        returns 
        (IStackOsNFTBasic) 
    {
        // Can only be called from StackNFT contracts
        // Cannot deploy next generation if it's already exists
        require(getIDByAddress(msg.sender) == generations.length - 1);

        StackOsNFTBasic stack = StackOsNFTBasic(
            address(
                new StackOsNFTBasic()
            )
        );
        stack.setName(
            string(abi.encodePacked(
                deployment.name,
                " ",
                uint256(count() + 1).toString()
            ))
        );
        stack.setSymbol(deployment.symbol);
        stack.initialize(
            deployment.stackToken,
            deployment.darkMatter,
            deployment.subscription,
            deployment.sub0,
            deployment.royaltyAddress,
            stableAcceptor,
            exchange,
            deployment.mintPrice,
                // if kicking 2nd generation, use constant, otherwise apply growth % 
                count() == 1 ? GEN2_MAX_SUPPLY : 
                get(getIDByAddress(msg.sender)).getMaxSupply() * 
                (deployment.maxSupplyGrowthPercent + 10000) / 10000,

            deployment.transferDiscount,
            deployment.timeLock
        );
        add(IStackOsNFT(address(stack)));
        stack.setFees(deployment.subsFee, deployment.daoFee);
        stack.setRewardDiscount(deployment.rewardDiscount);
        stack.adjustAddressSettings(dao);
        stack.whitelist(address(deployment.darkMatter));
        stack.whitelist(address(deployment.market));
        stack.setUri(deployment.URI);
        stack.transferOwnership(Ownable(msg.sender).owner());
        emit NextGenerationDeploy(address(stack), msg.sender, block.timestamp);
        return IStackOsNFTBasic(address(stack));
    }

    /*
     * @title Add next generation of StackNFT.
     * @param IStackOsNFT address.
     * @dev Could only be invoked by the contract owner or StackNFT contract.
     * @dev Address should be unique.
     */
    function add(IStackOsNFT _stackOS) public {
        require(owner() == _msgSender() || isAdded(_msgSender()));
        require(address(_stackOS) != address(0)); // forbid 0 address
        require(isAdded(address(_stackOS)) == false); // forbid duplicates
        ids[address(_stackOS)] = generations.length;
        generations.push(_stackOS);
    }

    /*
     * @title Deploy new StackOsNFTBasic manually.
     * @dev Deployment structure must be filled prior to calling this.
     * @dev adjustAddressSettings must be called in manager prior to calling this.
     */

    function deployNextGen(
        string memory _name,
        string memory _symbol,
        address _stackToken,
        address _darkMatter,
        address _subscription,
        address _sub0,
        uint256 _mintPrice,
        uint256 _maxSupply,
        uint256 _transferDiscount,
        uint256 _timeLock,
        address _royaltyAddress
    ) 
        public 
        onlyOwner 
        nonReentrant
        returns 
        (IStackOsNFTBasic) 
    {
        StackOsNFTBasic stack = StackOsNFTBasic(
            address(
                new StackOsNFTBasic()
            )
        );
        stack.setName(_name);
        stack.setSymbol(_symbol);
        stack.initialize(
            _stackToken,
            _darkMatter,
            _subscription,
            _sub0,
            _royaltyAddress,
            stableAcceptor,
            exchange,
            _mintPrice,
            _maxSupply,
            _transferDiscount,
            _timeLock
        );
        add(IStackOsNFT(address(stack)));
        stack.setFees(deployment.subsFee, deployment.daoFee);
        stack.setRewardDiscount(deployment.rewardDiscount);
        stack.adjustAddressSettings(dao);
        stack.whitelist(address(deployment.darkMatter));
        stack.whitelist(address(deployment.market));
        stack.setUri(deployment.URI);
        stack.transferOwnership(msg.sender);
        emit NextGenerationDeploy(address(stack), msg.sender, block.timestamp);
        return IStackOsNFTBasic(address(stack));
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
            require(address(get(0)) == _nftAddress);
        }
        return generationID;
    }

    /*
     * @title Returns whether StackNFT contract is added to this manager.
     * @param Stack NFT contract address
     */
    function isAdded(address _nftAddress) public view returns (bool) {
        uint256 generationID = ids[_nftAddress];
        return generations.length > generationID && address(get(generationID)) == _nftAddress;
    }
}
