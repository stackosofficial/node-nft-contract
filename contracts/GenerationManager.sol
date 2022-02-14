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
    event SetupDeploy(
        Deployment settings
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
        address royaltyAddress;
        address market;
        string baseURI;
    }

    address private stableAcceptor;
    address private exchange;
    address private dao;

    uint256 private GEN2_MAX_SUPPLY = 1000;

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

    /**
     * @notice Function for convinience when testing.
     * @param maxSupply Max supply to use in generation 2 deployment.
     * @dev Could only be invoked by the contract owner.
     */
    function SET_GEN2_MAX_SUPPLY(
        uint256 maxSupply
    ) public onlyOwner {
        GEN2_MAX_SUPPLY = maxSupply;
    }

    /**
     * @notice Save settings for manual or auto deployment.
     * @param settings Structure of parameters to use for next generation deployment.
     * @dev Could only be invoked by the contract owner.
     */
    function setupDeploy(
        Deployment calldata settings
    ) public onlyOwner {
        deployment = settings;
        emit SetupDeploy(settings);
    }

    /**
     * @notice Called by StackNFTBasic once it reaches max supply.
     * @dev Could only be invoked by the last StackOsNFTBasic generation.
     * @dev Generation id is appended to the name. 
     * @return Address of new StackNFT contract generation.
     */
    function autoDeployNextGeneration() 
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
                uint256(count()).toString()
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

            deployment.transferDiscount
        );
        add(address(stack));
        stack.setFees(deployment.subsFee, deployment.daoFee);
        stack.setRewardDiscount(deployment.rewardDiscount);
        stack.adjustAddressSettings(dao);
        stack.whitelist(address(deployment.darkMatter));
        stack.whitelist(address(deployment.market));
        stack.setBaseURI(deployment.baseURI);
        stack.transferOwnership(Ownable(msg.sender).owner());
        emit NextGenerationDeploy(address(stack), msg.sender, block.timestamp);
        return IStackOsNFTBasic(address(stack));
    }

    /**
     * @notice Add next generation of StackNFT to manager. 
     * @notice To be called automatically, or when adding 1st generation.
     * @notice Royalty address has to be set with setupDeploy.
     * @param _stackOS IStackOsNFT address.
     * @dev Royalty address has to be set with setupDeploy.
     * @dev Could only be invoked by the contract owner to add 1st generation
     *      or by StackNFT contract on auto deployment.
     * @dev Address should be unique.
     */
    function add(address _stackOS) public {
        require(owner() == _msgSender() || isAdded(_msgSender()));
        require(address(_stackOS) != address(0)); // forbid 0 address
        require(isAdded(address(_stackOS)) == false); // forbid duplicates
        ids[address(_stackOS)] = generations.length;
        Royalty(payable(deployment.royaltyAddress))
            .onGenerationAdded(generations.length, _stackOS);
        generations.push(IStackOsNFT(_stackOS));
    }

    /**
     * @notice Deploy new StackOsNFTBasic manually.
     * @notice Deployment structure must be filled before deploy.
     * @notice `adjustAddressSettings` must be called in GenerationManager before deploy. 
     * @param _maxSupply Exact max supply for new NFT contract.
     */
    function deployNextGenerationManually(
        uint256 _maxSupply
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
        stack.setName(
            string(abi.encodePacked(
                deployment.name,
                " ",
                uint256(count()).toString()
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
            _maxSupply,
            deployment.transferDiscount
        );
        add(address(stack));
        stack.setFees(deployment.subsFee, deployment.daoFee);
        stack.setRewardDiscount(deployment.rewardDiscount);
        stack.adjustAddressSettings(dao);
        stack.whitelist(address(deployment.darkMatter));
        stack.whitelist(address(deployment.market));
        stack.setBaseURI(deployment.baseURI);
        stack.transferOwnership(msg.sender);
        emit NextGenerationDeploy(address(stack), msg.sender, block.timestamp);
        return IStackOsNFTBasic(address(stack));
    }

    /**
     * @notice Get total number of generations added.
     */
    function count() public view returns (uint256) {
        return generations.length;
    }

    /**
     * @notice Get address of StackNFT contract by generation id.
     * @param generationId Generation id to lookup.
     * @dev Must be valid generation id to avoid out-of-bounds error.
     * @return Address of StackNFT contract.
     */
    function get(uint256 generationId) public view returns (IStackOsNFT) {
        return generations[generationId];
    }

    /**
     * @notice Get generation id by StackNFT contract address.
     * @param _nftAddress Stack NFT contract address
     * @return Generation id.
     */
    function getIDByAddress(address _nftAddress) public view returns (uint256) {
        uint256 generationID = ids[_nftAddress];
        if (generationID == 0) {
            require(address(get(0)) == _nftAddress);
        }
        return generationID;
    }

    /**
     * @notice Returns whether StackNFT contract is added to this manager.
     * @param _nftAddress Stack NFT contract address.
     * @return Whether StackNFT contract is added to manager.
     */
    function isAdded(address _nftAddress) public view returns (bool) {
        uint256 generationID = ids[_nftAddress];
        return generations.length > generationID && address(get(generationID)) == _nftAddress;
    }
}
