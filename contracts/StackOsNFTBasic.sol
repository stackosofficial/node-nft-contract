//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./interfaces/IStackOSNFT.sol";
import "./Subscription.sol";
import "./StableCoinAcceptor.sol";
import "./TransferWhitelist.sol";
import "hardhat/console.sol";

contract StackOsNFTBasic is
    TransferWhitelist,
    ERC721,
    StableCoinAcceptor,
    ERC721URIStorage,
    Ownable
{
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    Counters.Counter private _tokenIdCounter;
    IERC20 private stackOSToken;
    DarkMatter private darkMatter;
    GenerationManager private generations;
    IUniswapV2Router02 private router;
    Subscription private subscription;

    address private royaltyAddress;

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

    bool private salesStarted;
    string private URI = "https://google.com/";

    constructor(
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
    ) ERC721(_name, _symbol) {
        stackOSToken = _stackOSTokenToken;
        darkMatter = _darkMatter;
        subscription = _subscription;
        participationFee = _participationFee;
        mintFee = _mintFee;
        maxSupply = _maxSupply;
        transferDiscount = _transferDiscount;
        timeLock = block.timestamp + _timeLock;
        royaltyAddress = _royaltyAddress;
        generations = GenerationManager(msg.sender);
    }

    /*
     * @title Set % that is sended to Subscription contract on mint
     * @param percent
     * @dev Could only be invoked by the contract owner.
     */

    function setRewardDiscount(uint256 _rewardDiscount) public onlyOwner {
        require(_rewardDiscount <= 10000, "invalid fee basis points");
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
     * @title On first NFT contract deployment the msg.sender is the deployer not contract
     * @param address of generation manager contract
     * @dev Could only be invoked by the contract owner.
     */

    function adjustAddressSettings(address _genManager, address _router)
        public
        onlyOwner
    {
        generations = GenerationManager(_genManager);
        router = IUniswapV2Router02(_router);
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
                IStackOSNFT(address(this)),
                _tokenId
            );
    }

    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    function transferFromLastGen(address _ticketOwner, uint256 _amount) public {
        require(
            address(this) != address(msg.sender),
            "Cant transfer to the same address"
        );
        // check that caller is stackNFT contract
        generations.getIDByAddress(msg.sender);

        uint256 participationFeeDiscount = participationFee
            .mul(10000 - transferDiscount)
            .div(10000);

        uint256 ticketAmount = _amount.div(participationFeeDiscount);

        uint256 depositAmount = participationFeeDiscount.mul(ticketAmount);

        stackOSToken.transferFrom(
            address(msg.sender),
            address(this),
            depositAmount
        );
        stackOSToken.transferFrom(
            address(msg.sender),
            _ticketOwner,
            _amount - depositAmount
        );

        for (uint256 i; i < ticketAmount; i++) {
            _mint(msg.sender);
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
     * @title User mint a token amount that he has been allowed to mint. Partner sales have to be activated.
     * @param Number of tokens to mint.
     */

    function mint(uint256 _nftAmount, IERC20 _stablecoin) public {
        require(salesStarted, "Sales not started");
        require(supportsCoin(_stablecoin), "Unsupported payment coin");

        uint256 amountIn = participationFee.mul(_nftAmount);
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
     * @title User mint a token amount that he has been allowed to mint. Partner sales have to be activated.
     * @param Number of tokens to mint.
     */

    function mintFromSubscriptionRewards(
        uint256 _nftAmount,
        address _stablecoin
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
        console.log(amountIn);
        IERC20(_stablecoin).transferFrom(msg.sender, address(this), amountIn);

        uint256 stackAmount = buyStackToken(amountIn, stablecoins[0]);

        uint256 subscriptionPart = (stackAmount * mintFee) / 10000;
        stackAmount -= subscriptionPart;
        stackOSToken.transfer(address(subscription), subscriptionPart);

        adminWithdrawableAmount += stackAmount;
        for (uint256 i; i < _nftAmount; i++) {
            _mint(msg.sender);
        }
        return stackAmount;
    }

    /*
     * @title User mint a token amount that he has been allowed to mint. Partner sales have to be activated.
     * @param Number of tokens to mint.
     */

    function getFromRewardsPrice(uint256 _nftAmount, address _stablecoin)
        external
        view
        returns (uint256)
    {
        // calculate amount of `_stablecoin` needed to buy `stackAmount`
        uint256 discountAmount = participationFee -
            (participationFee * rewardDiscount) /
            10000;
        uint256 amountIn = discountAmount.mul(_nftAmount);
        console.log("This number: ", amountIn);
        address[] memory path = new address[](3);
        path[0] = address(_stablecoin);
        path[1] = address(router.WETH());
        path[2] = address(stackOSToken);
        uint256[] memory amountOutMin = router.getAmountsOut(amountIn, path);
        return amountOutMin[2];
    }

    /*
     * @title User mint a token amount that he has been allowed to mint. Partner sales have to be activated.
     * @param Number of tokens to mint.
     */

    function mintFromRoyaltyRewards(uint256 _nftAmount) public {
        require(salesStarted, "Sales not started");
        require(msg.sender == address(royaltyAddress), "Not Royalty Address");
        uint256 discountAmount = participationFee -
            (participationFee * rewardDiscount) /
            10000;
        uint256 amountIn = discountAmount.mul(_nftAmount);
        uint256 stackAmount = buyStackToken(amountIn, stablecoins[0]);

        uint256 subscriptionPart = (stackAmount * mintFee) / 10000;
        stackAmount -= subscriptionPart;
        stackOSToken.transfer(address(subscription), subscriptionPart);

        adminWithdrawableAmount += stackAmount;
        for (uint256 i; i < _nftAmount; i++) {
            _mint(msg.sender);
        }
    }

    /*
     * @title Delegate NFT.
     * @param _delegatee Address of delegatee.
     * @param tokenId token id to delegate.
     * @dev Caller must be owner of NFT, caller and delegatee must not be zero-address.
     * @dev Delegation can be done only once.
     */

    function _delegate(address _delegatee, uint256 tokenId) private {
        require(
            msg.sender ==
                darkMatter.ownerOfStackOrDarkMatter(
                    IStackOSNFT(address(this)),
                    tokenId
                ),
            "Not owner"
        );
        require(delegates[tokenId] == address(0), "Already delegated");
        delegates[tokenId] = _delegatee;
        if (delegationTimestamp[tokenId] == 0) totalDelegated += 1;
        delegationTimestamp[tokenId] = block.timestamp;
    }

    function delegate(address _delegatee, uint256[] calldata tokenIds) public {
        for (uint256 i; i < tokenIds.length; i++) {
            _delegate(_delegatee, tokenIds[i]);
        }
    }

    function _mint(address _address) internal {
        require(totalSupply < maxSupply, "Max supply reached");
        _safeMint(_address, _tokenIdCounter.current());
        _setTokenURI(_tokenIdCounter.current(), URI);
        _tokenIdCounter.increment();
        totalSupply += 1;
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721) {
        require(isWhitelisted(msg.sender), "Not whitelisted for transfers");
        super._transfer(from, to, tokenId);
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
        adminWithdrawableAmount.sub(adminWithdrawableAmount);
    }

    function getAmountIn(uint256 amount, IERC20 _stablecoin)
        private
        view
        returns (uint256)
    {
        address[] memory path = new address[](3);
        path[0] = address(_stablecoin);
        path[1] = address(router.WETH());
        path[2] = address(stackOSToken);
        uint256[] memory amountsIn = router.getAmountsIn(amount, path);
        return amountsIn[0];
    }

    function buyStackToken(uint256 amount, IERC20 _stablecoin)
        private
        returns (uint256)
    {
        _stablecoin.transferFrom(msg.sender, address(this), amount);
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
}
