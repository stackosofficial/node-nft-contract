//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./interfaces/IStackOsNFT.sol";
import "./Subscription.sol";
import "./StableCoinAcceptor.sol";
import "hardhat/console.sol";

contract StackOsNFTBasic is
    ERC721,
    ERC721URIStorage,
    Ownable
{
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    Counters.Counter private _tokenIdCounter;
    IERC20 private stackOSToken;
    DarkMatter private darkMatter;
    Subscription private subscription;
    address private royaltyAddress;
    StableCoinAcceptor stableAcceptor;
    GenerationManager private generations;
    IUniswapV2Router02 private router;

    uint256 public timeLock;
    uint256 public adminWithdrawableAmount;
    uint256 public rewardDiscount;
    uint256 private maxSupply;
    uint256 private totalSupply;
    uint256 private participationFee;
    uint256 private transferDiscount;
    uint256 private totalDelegated;
    uint256 internal mintFee;

    mapping(uint256 => uint256) private delegationTimestamp;
    mapping(uint256 => address) private delegates;
    mapping(address => bool) _whitelist;

    bool private salesStarted;
    string private URI = "https://google.com/";

    bool private initialized;

    modifier onlyGenerationManager() {
        // Naive check, this should revert if msg.sender is wallet
        GenerationManager(_msgSender()).count();
        _;
    }

    // Must be deployed only by GenerationManager
    constructor() ERC721("", "") onlyGenerationManager {
        generations = GenerationManager(msg.sender);
    }

    function initialize(
        address _stackOSTokenToken,
        address _darkMatter,
        address _subscription,
        address _royaltyAddress,
        address _stableAcceptor,
        uint256 _participationFee,
        uint256 _mintFee,
        uint256 _maxSupply,
        uint256 _transferDiscount,
        uint256 _timeLock
    ) public onlyOwner {
        console.log(address(generations), msg.sender);
        require(initialized == false, "Already initialized");
        initialized = true;
        
        stackOSToken = IERC20(_stackOSTokenToken);
        darkMatter = DarkMatter(_darkMatter);
        subscription = Subscription(_subscription);
        royaltyAddress = _royaltyAddress;
        stableAcceptor = StableCoinAcceptor(_stableAcceptor);

        participationFee = _participationFee;
        mintFee = _mintFee;
        maxSupply = _maxSupply;
        transferDiscount = _transferDiscount;
        timeLock = block.timestamp + _timeLock;
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
     * @title Set % that is sended to Subscription contract on mint
     * @param percent
     * @dev Could only be invoked by the contract owner.
     */

    function setMintFee(uint256 _fee) public onlyOwner {
        require(_fee <= 10000, "invalid fee basis points");
        mintFee = _fee;
    }

    /*
     * @title Adjust address settings
     * @param address of router contract
     * @dev Could only be invoked by the contract owner or generation manager contract
     */
// TODO: should be called only once?
    function adjustAddressSettings(address _router)
        public
        onlyOwner
    {
        router = IUniswapV2Router02(_router);
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

        stackOSToken.transferFrom(msg.sender, address(this), _amount);
        uint256 usdAmount = sellStackToken(_amount, stableAcceptor.stablecoins(0));

        uint256 participationFeeDiscount = participationFee
            .mul(10000 - transferDiscount)
            .div(10000);

        uint256 ticketAmount = usdAmount.div(participationFeeDiscount);
        uint256 depositAmount = participationFeeDiscount.mul(ticketAmount);

        uint256 stackDepositAmount = buyStackToken(
            depositAmount, 
            stableAcceptor.stablecoins(0)
        );
        uint256 stackLeftOverAmount = buyStackToken(
            usdAmount - depositAmount,
            stableAcceptor.stablecoins(0)
        );

        stackOSToken.transfer(
            _ticketOwner,
            stackLeftOverAmount
        );

        uint256 subscriptionPart = (stackDepositAmount * mintFee) / 10000;
        stackDepositAmount -= subscriptionPart;
        stackOSToken.transfer(address(subscription), subscriptionPart);

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
        uint256 stackAmount = buyStackToken(amountIn, _stablecoin);

        uint256 subscriptionPart = (stackAmount * mintFee) / 10000;
        stackAmount -= subscriptionPart;
        stackOSToken.transfer(address(subscription), subscriptionPart);

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
        address _stablecoin,
        address _to
    ) external returns (uint256) {
        require(salesStarted, "Sales not started");
        require(
            msg.sender == address(subscription),
            "Not Subscription Address"
        );

        uint256 discountAmount = participationFee -
            (participationFee * rewardDiscount) /
            10000;

        uint256 amountIn = discountAmount.mul(_nftAmount);
        console.log("mintFromSub amountIn:", amountIn);

        IERC20(_stablecoin).transferFrom(msg.sender, address(this), amountIn);
        uint256 stackAmount = buyStackToken(amountIn, IERC20(_stablecoin));

        uint256 subscriptionPart = (stackAmount * mintFee) / 10000;
        stackAmount -= subscriptionPart;

        stackOSToken.transfer(address(subscription), subscriptionPart);

        adminWithdrawableAmount += stackAmount;
        for (uint256 i; i < _nftAmount; i++) {
            _mint(_to);
        }
        return amountIn;
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
        address[] memory path = new address[](3);
        path[0] = address(stackOSToken);
        path[1] = address(router.WETH());
        path[2] = address(_stablecoin);
        uint256[] memory amountInMin = router.getAmountsIn(amountOut, path);
        console.log("getAmountsIn: want usd & got stack: ", amountOut, amountInMin[0]);
        return amountInMin[0];
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
        uint256 stackAmount = buyStackToken(amountIn, IERC20(_stablecoin));

        uint256 subscriptionPart = (stackAmount * mintFee) / 10000;
        stackAmount -= subscriptionPart;
        stackOSToken.transfer(address(subscription), subscriptionPart);

        adminWithdrawableAmount += stackAmount;
        for (uint256 i; i < _mintNum; i++) {
            _mint(_to);
        }
        return amountIn;
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
        uint256 _current = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        totalSupply += 1;
        _safeMint(_address, _current);
        _setTokenURI(_current, URI);

        if(totalSupply == maxSupply) {
            generations.deployNextGenPreset();
        }
    }

    /*
     *  @title Override to make use of whitelist.
     */
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721) {
        require(isWhitelisted(msg.sender), "Not whitelisted for transfers");
        super._transfer(from, to, tokenId);
    }

    /*
     *  @title Whitelist address to transfer tokens.
     *  @param Address to whitelist.
     *  @dev Could only be invoked by the contract owner or generation manager contract
     */
    function whitelist(address _addr) public onlyOwner {
        _whitelist[_addr] = true;
    }

    /*
     *  @title Whether or not an address is allowed to transfer tokens. 
     *  @param Address to check.
     *  @dev Caller must be owner of the contract.
     */
    function isWhitelisted(address _addr) public view returns (bool) {
        return _whitelist[_addr];
    }


    // The following functions are overrides required by Solidity.

    function _burn(uint256 tokenId)
        internal
        override(ERC721, ERC721URIStorage)
    {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
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

    /*
     *  @title Buy `stackToken` for `amount` of _stablecoin.
     *  @param Amount of `_stablecoin` to sell.
     *  @param Address of supported stablecoin
     */
    function buyStackToken(uint256 amount, IERC20 _stablecoin)
        private
        returns (uint256)
    {
        _stablecoin.approve(address(router), amount);

        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](3);
        path[0] = address(_stablecoin);
        path[1] = address(router.WETH());
        path[2] = address(stackOSToken);
        uint256[] memory amountOutMin = router.getAmountsOut(amount, path);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amount,
            amountOutMin[2],
            path,
            address(this),
            deadline
        );

        return amounts[2];
    }

    /*
     *  @title Sell `amount` of `stackToken`.
     *  @param Amount of `stackToken` to sell.
     *  @param Address of supported stablecoin
     */

    function sellStackToken(uint256 amount, IERC20 _stablecoin)
        private
        returns (uint256)
    {
        stackOSToken.approve(address(router), amount);

        uint256 deadline = block.timestamp + 1200;
        address[] memory path = new address[](3);
        path[0] = address(stackOSToken);
        path[1] = address(router.WETH());
        path[2] = address(_stablecoin);
        uint256[] memory amountOutMin = router.getAmountsOut(amount, path);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amount,
            amountOutMin[2],
            path,
            address(this),
            deadline
        );

        return amounts[2];
    }
}
