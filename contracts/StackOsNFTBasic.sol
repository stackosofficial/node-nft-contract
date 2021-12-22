//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

// import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./ERC721/CustomERC721.sol";
import "./ERC721/extensions/ERC721URIStorage2.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IStackOsNFT.sol";
import "./Subscription.sol";
import "./Sub0.sol";
import "./StableCoinAcceptor.sol";
import "./Exchange.sol";
import "hardhat/console.sol";
import "./Whitelist.sol";

contract StackOsNFTBasic is
    Whitelist,
    CustomERC721,
    ERC721URIStorage2
{
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    Counters.Counter private _tokenIdCounter;
    IERC20 private stackOSToken;
    DarkMatter private darkMatter;
    Subscription private subscription;
    Sub0 private sub0;
    address private royaltyAddress;
    StableCoinAcceptor stableAcceptor;
    GenerationManager private generations;
    Exchange private exchange;
    address private daoAddress;
    address private royaltyDistrAddress;

    uint256 public timeLock;
    uint256 public adminWithdrawableAmount;
    uint256 public rewardDiscount;
    uint256 private maxSupply;
    uint256 private totalSupply;
    uint256 private participationFee;
    uint256 private transferDiscount;
    uint256 private totalDelegated;
    uint256 internal subsFee;
    uint256 internal daoFee;
    uint256 internal distrFee;
    uint256 constant maxMintRate = 10;

    mapping(uint256 => uint256) private delegationTimestamp;
    mapping(uint256 => address) private delegates;
    mapping(address => uint256) private totalMinted;
    mapping(address => uint256) private lastMintAt;

    bool private salesStarted;
    string private URI = "https://google.com/";

    bool private initialized;

    modifier onlyGenerationManager() {
        // Naive check, this should revert if msg.sender is wallet
        GenerationManager(_msgSender()).count();
        _;
    }

    /*
     * @title Must be deployed only by GenerationManager
     */
    constructor() onlyGenerationManager {
        generations = GenerationManager(msg.sender);
    }

    function initialize(
        address _stackOSTokenToken,
        address _darkMatter,
        address _subscription,
        address _sub0,
        address _royaltyAddress,
        address _stableAcceptor,
        address _exchange,
        uint256 _participationFee,
        uint256 _maxSupply,
        uint256 _transferDiscount,
        uint256 _timeLock
    ) public onlyOwner {
        require(initialized == false, "Already initialized");
        initialized = true;
        
        stackOSToken = IERC20(_stackOSTokenToken);
        darkMatter = DarkMatter(_darkMatter);
        subscription = Subscription(_subscription);
        sub0 = Sub0(_sub0);
        royaltyAddress = _royaltyAddress;
        stableAcceptor = StableCoinAcceptor(_stableAcceptor);
        exchange = Exchange(_exchange);

        participationFee = _participationFee;
        maxSupply = _maxSupply;
        transferDiscount = _transferDiscount;
        timeLock = block.timestamp + _timeLock;
    }

    /*
     * @title Set token name.
     * @dev Could only be invoked by the contract owner.
     */
    function setName(string memory name_) public onlyOwner {
        _name = name_;
    }

    /*
     * @title Set token symbol.
     * @dev Could only be invoked by the contract owner.
     */
    function setSymbol(string memory symbol_) public onlyOwner {
        _symbol = symbol_;
    }

    /*
     * @title Adjust address settings
     * @dev Could only be invoked by the contract owner.
     */

    function adjustAddressSettings(
        address _dao, 
        address _distr
    )
        public
        onlyOwner
    {
        daoAddress = _dao;
        royaltyDistrAddress = _distr;
    }

    /*
     * @title Set discont appliend on mint from subscription or royalty rewards
     * @param percent
     * @dev Could only be invoked by the contract owner.
     */

    function setRewardDiscount(uint256 _rewardDiscount) public onlyOwner {
        require(_rewardDiscount <= 10000, "invalid basis points");
        rewardDiscount = _rewardDiscount;
    }

    /*
     * @title Set amounts taken from mint
     * @param % that is sended to Subscription contract 
     * @param % that is sended to dao
     * @param % that is sended to royalty distribution
     * @dev Could only be invoked by the contract owner.
     */

    function setFees(uint256 _subs, uint256 _dao, uint256 _distr)
        public
        onlyOwner
    {
        require(_subs <= 10000 && _dao <= 10000 && _distr <= 10000, "invalid fee basis points");
        subsFee = _subs;
        daoFee = _dao;
        distrFee = _distr;
    }

    /*
     * @title Get max supply
     */
    function getMaxSupply() public view returns (uint256) {
        return maxSupply;
    }
    
    /*
     * @title Get total delegated NFTs.
     */

    function getTotalDelegated() public view returns (uint256) {
        return totalDelegated;
    }

    /*
     * @title Get timestamp of the block when token was delegated.
     * @dev Returns zero if token not delegated.
     */

    function getDelegationTimestamp(uint256 _tokenId)
        public
        view
        returns (uint256)
    {
        return delegationTimestamp[_tokenId];
    }

    /*
     * @title Get token's delegatee.
     * @dev Returns zero-address if token not delegated.
     */

    function getDelegatee(uint256 _tokenId) public view returns (address) {
        return delegates[_tokenId];
    }

    /*
     * @title Get token's owner.
     * @dev Token might be not delegated though.
     */

    function getDelegator(uint256 _tokenId) public view returns (address) {
        return
            darkMatter.ownerOfStackOrDarkMatter(
                IStackOsNFT(address(this)),
                _tokenId
            );
    }

    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }
    
    /*
     * @title Get mint price in USD
     */
    function price() public view returns (uint256) {
        return participationFee;
    }

    /*
     * @title Called by 1st generation as part of `transferTickets`
     * @param Wallet to mint tokens to
     * @dev Could only be invoked by the StackNFT contract.
     * @dev It receives stack token and use it to mint NFTs at a discount
     */
    function transferFromLastGen(address _ticketOwner, uint256 _amount) public {

        // check that caller is generation 1 contract 
        require(
            address(generations.get(0)) == msg.sender, 
            "Not Correct Address"
        );
        IERC20 stablecoin = stableAcceptor.stablecoins(0);
        stackOSToken.transferFrom(msg.sender, address(this), _amount);
        stackOSToken.approve(address(exchange), _amount);
        uint256 usdAmount = exchange.swapExactTokensForTokens(
            _amount, 
            stackOSToken, 
            stablecoin
        );

        uint256 participationFeeDiscount = participationFee
            .mul(10000 - transferDiscount)
            .div(10000);

        uint256 ticketAmount = usdAmount.div(participationFeeDiscount);
        uint256 depositAmount = participationFeeDiscount.mul(ticketAmount);

        // stablecoin.transferFrom(msg.sender, address(this), amount);
        stablecoin.approve(address(exchange), usdAmount);
        uint256 stackDepositAmount = exchange.swapExactTokensForTokens(
            depositAmount, 
            stablecoin,
            stackOSToken
        );
        uint256 stackLeftOverAmount = exchange.swapExactTokensForTokens(
            usdAmount - depositAmount,
            stablecoin,
            stackOSToken
        );

        stackOSToken.transfer(
            _ticketOwner,
            stackLeftOverAmount
        );

        stackDepositAmount = sendFees(stackDepositAmount);

        adminWithdrawableAmount += stackDepositAmount;
        for (uint256 i; i < ticketAmount; i++) {
            _mint(_ticketOwner);
        }
    }

    /*
     * @title Allow to buy NFT's.
     * @dev Could only be invoked by the contract owner.
     */

    function startSales() public onlyOwner {
        salesStarted = true;
    }

    /*
     * @title User mint a token amount.
     * @param Number of tokens to mint.
     * @param Address of supported stablecoin to pay for mint
     * @dev Sales should be started before mint.
     */

    function mint(uint256 _nftAmount, IERC20 _stablecoin) public {
        require(salesStarted, "Sales not started");
        require(stableAcceptor.supportsCoin(_stablecoin), "Unsupported payment coin");

        uint256 amountIn = participationFee.mul(_nftAmount);
        _stablecoin.transferFrom(msg.sender, address(this), amountIn);
        _stablecoin.approve(address(exchange), amountIn);
        uint256 stackAmount = exchange.swapExactTokensForTokens(
            amountIn, 
            _stablecoin,
            stackOSToken
        );

        stackAmount = sendFees(stackAmount);

        adminWithdrawableAmount += stackAmount;
        for (uint256 i; i < _nftAmount; i++) {
            _mint(msg.sender);
        }
    }

    /*
     * @title Called when user want to mint and pay with bonuses from subscriptions.
     * @param Amount to mint
     * @param Address of supported stablecoin
     * @param Address to mint to
     * @dev Can only be called by Subscription contract.
     * @dev Sales should be started before mint.
     */

    function mintFromSubscriptionRewards(
        uint256 _nftAmount,
        uint256 _stackAmount,
        address _to
    ) external {
        require(salesStarted, "Sales not started");
        require(
            msg.sender == address(subscription),
            "Not Subscription Address"
        );

        stackOSToken.transferFrom(msg.sender, address(this), _stackAmount);

        _stackAmount = sendFees(_stackAmount);

        adminWithdrawableAmount += _stackAmount;
        for (uint256 i; i < _nftAmount; i++) {
            _mint(_to);
        }

    }

    /*
     * @title Get how much stack token we need to sell to receive amount of USD needed to mint `_nftAmount`
     * @param Amount to mint
     * @param Address of supported stablecoin
     */
    function getFromRewardsPrice(uint256 _nftAmount, address _stablecoin)
        external 
        view
        returns (uint256)
    {
        uint256 discountAmount = participationFee -
            (participationFee * rewardDiscount) /
            10000;
        uint256 amountOut = discountAmount.mul(_nftAmount);
        return exchange.getAmountIn(amountOut, IERC20(_stablecoin), stackOSToken);
    }

    /*
     * @title Called when user want to mint and pay with bonuses from royalties.
     * @param Amount to mint
     * @param Address of supported stablecoin
     * @param Address to mint to
     * @dev Can only be called by Royalty contract.
     * @dev Sales should be started before mint.
     */

    function mintFromRoyaltyRewards(uint256 _mintNum, address _stablecoin, address _to) 
        public
        returns (uint256)
    {
        require(salesStarted, "Sales not started");
        require(msg.sender == address(royaltyAddress), "Not Royalty Address");
        uint256 discountAmount = participationFee -
            (participationFee * rewardDiscount) /
            10000;
        // console.log("mint from royalty: ", _usdAmount/1e18, discountAmount /1e18);
        // uint256 _nftAmount = _usdAmount / discountAmount;
        uint256 amountIn = discountAmount.mul(_mintNum);
        IERC20(_stablecoin).transferFrom(msg.sender, address(this), amountIn);
        IERC20(_stablecoin).approve(address(exchange), amountIn);
        uint256 stackAmount = exchange.swapExactTokensForTokens(
            amountIn, 
            IERC20(_stablecoin),
            stackOSToken
        );

        stackAmount = sendFees(stackAmount);

        adminWithdrawableAmount += stackAmount;
        for (uint256 i; i < _mintNum; i++) {
            _mint(_to);
        }
        return amountIn;
    }

    function sendFees(uint256 _amount) internal returns (uint256) {

        uint256 subsPart = _amount * subsFee / 10000;
        uint256 daoPart = _amount * daoFee / 10000;
        uint256 distrPart = _amount * distrFee / 10000;
        _amount = _amount - subsPart - daoPart - distrPart;

        stackOSToken.approve(address(sub0), subsPart / 2);
        // if subs contract don't take it, send to dao 
        if(sub0.onReceiveStack(subsPart / 2) == false) {
            stackOSToken.transfer(address(daoAddress), subsPart / 2);
        }
        stackOSToken.transfer(address(subscription), subsPart / 2);
        stackOSToken.transfer(address(daoAddress), daoPart);
        stackOSToken.transfer(address(royaltyDistrAddress), distrPart);

        return _amount;
    }

    function _delegate(address _delegatee, uint256 tokenId) private {
        require(
            msg.sender ==
                darkMatter.ownerOfStackOrDarkMatter(
                    IStackOsNFT(address(this)),
                    tokenId
                ),
            "Not owner"
        );
        require(delegates[tokenId] == address(0), "Already delegated");
        delegates[tokenId] = _delegatee;
        if (delegationTimestamp[tokenId] == 0) totalDelegated += 1;
        delegationTimestamp[tokenId] = block.timestamp;
    }

    /*
     * @title Delegate NFT.
     * @param Address of delegatee.
     * @param tokenIds to delegate.
     * @dev Caller must be owner of NFT.
     * @dev Delegation can be done only once.
     */

    function delegate(address _delegatee, uint256[] calldata tokenIds) public {
        for (uint256 i; i < tokenIds.length; i++) {
            _delegate(_delegatee, tokenIds[i]);
        }
    }

    // is reentrancy attack possible?
    function _mint(address _address) internal {
        require(totalSupply < maxSupply, "Max supply reached");

        uint256 timeSinceLastMint = block.timestamp - lastMintAt[_address];
        uint256 unlocked = timeSinceLastMint / 1 minutes;
        if (unlocked > totalMinted[_address])
            unlocked = totalMinted[_address];
        totalMinted[_address] -= unlocked;

        lastMintAt[_address] = block.timestamp;

        require(
            totalMinted[_address] < maxMintRate,
            "Minting too fast"
        );

        totalMinted[_address] += 1;

        uint256 _current = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        totalSupply += 1;
        _safeMint(_address, _current);
        _setTokenURI(_current, URI);

        if(totalSupply == maxSupply) {
            generations.deployNextGenPreset();
        }
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) 
        internal 
        override(CustomERC721) 
        onlyWhitelisted 
    {
        super._transfer(from, to, tokenId);
    }

    // The following functions are overrides required by Solidity.

    function _burn(uint256 tokenId)
        internal
        override(CustomERC721, ERC721URIStorage2)
    {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(CustomERC721, ERC721URIStorage2)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /*
     * @title Contract owner can withdraw collected fees.
     * @dev Caller must be contract owner, timelock should be passed.
     */
    function adminWithdraw() public onlyOwner {
        require(block.timestamp > timeLock, "Locked!");
        stackOSToken.transfer(msg.sender, adminWithdrawableAmount);
        adminWithdrawableAmount = 0;
    }

}
