//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IStackOsNFT.sol";
import "./interfaces/IDecimals.sol";
import "./Subscription.sol";
import "./StableCoinAcceptor.sol";
import "./Exchange.sol";
import "./Whitelist.sol";
import "./Royalty.sol";


contract StackOsNFTBasic is
    Whitelist,
    ERC721
{
    using Counters for Counters.Counter;
    using SafeMath for uint256;
    using Strings for uint256;

    event SetPrice(uint256 _price);
    event SetBaseURI(string uri);
    event SetName(string name);
    event SetSymbol(string symbol);
    event AdjustAddressSettings(
        address dao 
    );
    event SetRewardDiscount(uint256 _rewardDiscount);
    event SetFees(uint256 subs, uint256 dao);
    event AdminWithdraw(address admin, uint256 withdrawAmount);

    string private _name;
    string private _symbol;

    uint256 public constant PRICE_PRECISION = 1e18;

    Counters.Counter private _tokenIdCounter;
    IERC20 private stackToken;
    DarkMatter private darkMatter;
    Subscription private subscription;
    Subscription private sub0;
    Royalty private royaltyAddress;
    StableCoinAcceptor private stableAcceptor;
    GenerationManager private immutable generations;
    Exchange private exchange;
    address private daoAddress;

    uint256 public rewardDiscount;
    uint256 private maxSupply;
    uint256 public totalSupply;
    uint256 public mintPrice;
    uint256 public transferDiscount;
    uint256 private subsFee;
    uint256 private daoFee;
    // this is max amount to drip, dripping is 1 per minute
    uint256 public constant maxMintRate = 10;

    mapping(address => uint256) private totalMinted;
    mapping(address => uint256) private lastMintAt;

    string private baseURI;

    bool private initialized;

    /*
     * @title Must be deployed only by GenerationManager
     */
    constructor() ERC721("", "") {
        
        require(Address.isContract(msg.sender));
        generations = GenerationManager(msg.sender);
    }

    function initialize(
        address _stackToken,
        address _darkMatter,
        address _subscription,
        address _sub0,
        address _royaltyAddress,
        address _stableAcceptor,
        address _exchange,
        uint256 _mintPrice,
        uint256 _maxSupply,
        uint256 _transferDiscount
    ) external onlyOwner {
        require(initialized == false);
        initialized = true;
        
        stackToken = IERC20(_stackToken);
        darkMatter = DarkMatter(_darkMatter);
        subscription = Subscription(_subscription);
        sub0 = Subscription(_sub0);
        royaltyAddress = Royalty(payable(_royaltyAddress));
        stableAcceptor = StableCoinAcceptor(_stableAcceptor);
        exchange = Exchange(_exchange);

        mintPrice = _mintPrice;
        maxSupply = _maxSupply;
        transferDiscount = _transferDiscount;
    }

    /**
     *  @notice `_price` should have 18 decimals
     */
    function setPrice(uint256 _price) external onlyOwner {
        mintPrice = _price;
        emit SetPrice(_price);
    }

    // Set baseURI that is used for new tokens
    function setBaseURI(string memory _uri) external onlyOwner {
        baseURI = _uri;
        emit SetBaseURI(_uri);
    }

    /*
     * @title Set token name.
     * @dev Could only be invoked by the contract owner.
     */
    function setName(string memory name_) external onlyOwner {
        _name = name_;
        emit SetName(name_);
    }

    /*
     * @title Set token symbol.
     * @dev Could only be invoked by the contract owner.
     */
    function setSymbol(string memory symbol_) external onlyOwner {
        _symbol = symbol_;
        emit SetSymbol(symbol_);
    }

    /**
     * @dev Override so that it returns what we set with setName.
     */
    function name() public view virtual override returns (string memory) {
        return _name;
    }

    /**
     * @dev Override so that it returns what we set with setSybmol.
     */
    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    /*
     * @title Adjust address settings
     * @param Dao address
     * @param Royalty distribution address
     * @dev Could only be invoked by the contract owner.
     */

    function adjustAddressSettings(
        address _dao 
    )
        external
        onlyOwner
    {
        daoAddress = _dao;
        emit AdjustAddressSettings(_dao);
    }

    /*
     * @title Set discont applied on mint from subscription or royalty rewards
     * @param percent
     * @dev Could only be invoked by the contract owner.
     */

    function setRewardDiscount(uint256 _rewardDiscount) external onlyOwner {
        require(_rewardDiscount <= 10000);
        rewardDiscount = _rewardDiscount;
        emit SetRewardDiscount(_rewardDiscount);
    }

    /*
     * @title Set amounts taken from mint
     * @param % that is sended to Subscription contract 
     * @param % that is sended to dao
     * @dev Could only be invoked by the contract owner.
     */

    function setFees(uint256 _subs, uint256 _dao)
        external
        onlyOwner
    {
        require(_subs + _dao <= 10000);
        subsFee = _subs;
        daoFee = _dao;
        emit SetFees(_subs, _dao);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    /*
     * @title Get max supply
     */
    function getMaxSupply() external view returns (uint256) {
        return maxSupply;
    }
    
    /*
     * @title Called by 1st generation as part of `transferTickets`
     * @param Wallet to mint tokens to
     * @param Amount of STACK token received
     * @dev Could only be invoked by the StackNFT contract.
     * @dev It receives stack token and use it to mint NFTs at a discount
     */
    function transferFromLastGen(address _ticketOwner, uint256 _amount) external {

        // check that caller is generation 1 contract 
        require(address(generations.get(0)) == msg.sender);

        stackToken.transferFrom(msg.sender, address(this), _amount);

        IERC20 stablecoin = stableAcceptor.stablecoins(0);
        uint256 amountUsd = exchange.getAmountIn(
            _amount,
            stackToken,
            stablecoin
        );
        uint256 price = adjustDecimals(
            mintPrice, 
            stablecoin
        );

        uint256 mintPriceDiscounted = price
            .mul(10000 - transferDiscount)
            .div(10000);


        uint256 ticketAmount = amountUsd.div(mintPriceDiscounted);

        ticketAmount = clampToMaxSupply(ticketAmount);


        uint256 usdToSpend = mintPriceDiscounted.mul(ticketAmount);
        uint256 stackToSpend = exchange.getAmountIn(
            usdToSpend,
            stablecoin,
            stackToken
        );

        // transfer left over amount to user
        stackToken.transfer(
            _ticketOwner,
            _amount - stackToSpend 
        );

        stackToSpend = sendFees(stackToSpend);

        // admin gets the payment after fees
        stackToken.transfer(owner(), stackToSpend);

        for (uint256 i; i < ticketAmount; i++) {
            _mint(_ticketOwner);
        }
    }

    /*
     * @title User mint a token amount for stack tokens.
     * @param Number of tokens to mint.
     * @dev Sales should be started before mint.
     */

    function mint(uint256 _nftAmount) external {

        _nftAmount = clampToMaxSupply(_nftAmount);

        IERC20 stablecoin = stableAcceptor.stablecoins(0);
        uint256 amountOut = adjustDecimals(
            mintPrice, 
            stablecoin
        );
        amountOut = amountOut.mul(_nftAmount);

        uint256 stackAmount = exchange.getAmountIn(
            amountOut, 
            stablecoin,
            stackToken
        );

        stackToken.transferFrom(msg.sender, address(this), stackAmount);

        stackAmount = sendFees(stackAmount);

        // admin gets the payment after fees
        stackToken.transfer(owner(), stackAmount);

        for (uint256 i; i < _nftAmount; i++) {
            _mint(msg.sender);
        }
    }

    /*
     * @title User mint a token amount for stablecoin.
     * @param Number of tokens to mint.
     * @param Supported stablecoin.
     * @dev Sales should be started before mint.
     */

    function mintForUsd(uint256 _nftAmount, IERC20 _stablecoin) external {
        require(stableAcceptor.supportsCoin(_stablecoin));

        _nftAmount = clampToMaxSupply(_nftAmount);

        uint256 usdToSpend = adjustDecimals(
            mintPrice, 
            _stablecoin
        );
        usdToSpend = usdToSpend.mul(_nftAmount);

        _stablecoin.transferFrom(msg.sender, address(this), usdToSpend);
        _stablecoin.approve(address(exchange), usdToSpend);
        uint256 stackAmount = exchange.swapExactTokensForTokens(
            usdToSpend,
            _stablecoin,
            stackToken
        );

        stackAmount = sendFees(stackAmount);

        // admin gets the payment after fees
        stackToken.transfer(owner(), stackAmount);

        for (uint256 i; i < _nftAmount; i++) {
            _mint(msg.sender);
        }
    }

    /*
     * @title Called when user want to mint and pay with bonuses from subscriptions.
     * @param Amount to mint
     * @param Stack token amount to spend
     * @param Address to receive minted tokens
     * @dev Can only be called by Subscription contract.
     * @dev Sales should be started before mint.
     */

    function mintFromSubscriptionRewards(
        uint256 _nftAmount,
        uint256 _stackAmount,
        address _to
    ) external {
        require(
            msg.sender == address(subscription) ||
            msg.sender == address(sub0)
        );

        _stackAmount = sendFees(_stackAmount);

        // admin gets the payment after fees
        stackToken.transfer(owner(), _stackAmount);

        for (uint256 i; i < _nftAmount; i++) {
            // frontrun protection is in Subscription contract
            _mint(_to);
        }

    }

    /*
     * @title Called when user want to mint and pay with bonuses from royalties.
     * @param Amount to mint
     * @param Address to mint to
     * @dev Can only be called by Royalty contract.
     * @dev Sales should be started before mint.
     */

    function mintFromRoyaltyRewards(
        uint256 _mintNum, 
        address _to
    ) 
        external
        returns (uint256 amountSpend)
    {
        require(msg.sender == address(royaltyAddress));

        _mintNum = clampToMaxSupply(_mintNum);
        
        IERC20 stablecoin = stableAcceptor.stablecoins(0);
        uint256 price = adjustDecimals(
            mintPrice, 
            stablecoin
        );

        uint256 discountPrice = price
            .mul(10000 - rewardDiscount)
            .div(10000);

        uint256 amountUsd = discountPrice.mul(_mintNum);
        uint256 stackAmount = exchange.getAmountIn(
            amountUsd,
            stablecoin,
            stackToken
        );
        // console.log("mint price discounted * 5", amountUsd, stackAmount);
        
        amountSpend = stackAmount;
        stackToken.transferFrom(msg.sender, address(this), stackAmount);

        stackAmount = sendFees(stackAmount);

        // admin gets the payment after fees
        stackToken.transfer(owner(), stackAmount);

        for (uint256 i; i < _mintNum; i++) {
            _mint(_to);
        }
    }

    /*
     * @returns left over amount after fees subtracted
     * @dev Take fees out of `_amount`
     */

    function sendFees(uint256 _amount) internal returns (uint256 amountAfterFees) {

        uint256 subsPart = _amount * subsFee / 10000;
        uint256 daoPart = _amount * daoFee / 10000;
        amountAfterFees = _amount - subsPart - daoPart;

        uint256 subsPartHalf = subsPart / 2;
        uint256 subsPartHalfTwo = subsPart - subsPartHalf;

        stackToken.approve(address(sub0), subsPartHalf);
        stackToken.approve(address(subscription), subsPartHalfTwo);
        // if subs contract don't take it, send to dao 
        if(sub0.onReceiveStack(subsPartHalf) == false) {
            daoPart += (subsPartHalf);
        }
        if(subscription.onReceiveStack(subsPartHalfTwo) == false) {
            daoPart += (subsPartHalfTwo);
        }
        stackToken.transfer(address(daoAddress), daoPart);
    }

    function _mint(address _address) internal {
        require(totalSupply < maxSupply);

        uint256 timeSinceLastMint = block.timestamp - lastMintAt[_address];
        uint256 unlocked = timeSinceLastMint / 1 minutes;
        if (unlocked > totalMinted[_address])
            unlocked = totalMinted[_address];

        totalMinted[_address] -= unlocked;

        lastMintAt[_address] = block.timestamp;

        require(
            totalMinted[_address] < maxMintRate
        );

        totalMinted[_address] += 1;

        uint256 _current = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        totalSupply += 1;
        _safeMint(_address, _current);

        if(
            totalSupply == maxSupply && 
            generations.getIDByAddress(address(this)) == generations.count() - 1
        ) {
            generations.autoDeployNextGeneration();
        }
    }
 
    // frontrun protection helper function
    function clampToMaxSupply(uint256 value) 
        public
        view
        returns (uint256 clamped)
    {
        // frontrun protection
        if (value > maxSupply - totalSupply)
            value = maxSupply - totalSupply;
        return value;
    }

    // Adjusts amount's decimals to token's decimals
    function adjustDecimals(uint256 amount, IERC20 token) 
        private 
        view 
        returns (uint256) 
    {
        return amount   
            .mul(10 ** IDecimals(address(token)).decimals())
            .div(PRICE_PRECISION); 
    }

    // notice the onlyWhitelisted modifier
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) 
        internal 
        override(ERC721) 
        onlyWhitelisted 
    {
        super._transfer(from, to, tokenId);
    }

    function _burn(uint256 tokenId)
        internal
        override(ERC721)
    {
        super._burn(tokenId);
    }

    /**
     * @dev Returns URI in a form of "baseURI + generationId/tokenId".
     * @dev BaseURI should have slash at the end.
     */
    function tokenURI(uint256 tokenId) 
        public 
        view 
        virtual 
        override(ERC721)
        returns (string memory) 
    {
        require(_exists(tokenId), "URI query for nonexistent token");

        string memory baseURI_ = _baseURI();
        string memory generationId = 
            generations.getIDByAddress(address(this)).toString();

        return bytes(baseURI_).length > 0 ?
            string(abi.encodePacked(baseURI_, generationId, "/", tokenId.toString())) :
            "";
    }
}
