//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./DarkMatter.sol";
import "./interfaces/IStackOSNFT.sol";
import "./GenerationManager.sol";

contract StackOsNFTBase is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    Counters.Counter private _tokenIdCounter;
    IERC20 private stackOSToken;
    DarkMatter private darkMatter;
    GenerationManager private generations;

    uint256 public timeLock;
    uint256 public adminWithdrawableAmount;
    uint256 private maxSupply;
    uint256 private totalSupply;
    uint256 private participationFee;
    uint256 private transferDiscount;
    uint256 private totalDelegated;
    uint256 internal fee;

    mapping(uint256 => uint256) private delegationTimestamp;
    mapping(uint256 => address) private delegates;

    IERC20[] public stablecoins;

    bool private salesStarted;
    string private URI = "https://google.com/";

    constructor(
        string memory _name,
        string memory _symbol,
        IERC20 _stackOSTokenToken,
        DarkMatter _darkMatter,
        uint256 _maxSupply,
        uint256 _transferDiscount,
        uint256 _timeLock
    )
        ERC721(_name, _symbol)
    {
        stackOSToken = _stackOSTokenToken;
        darkMatter = _darkMatter;
        maxSupply = _maxSupply;
        transferDiscount = _transferDiscount;
        timeLock = block.timestamp + _timeLock;
        generations = GenerationManager(msg.sender);

        stablecoins.push(_stackOSTokenToken); // stackOs token 
        stablecoins.push(IERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7)); // usdt
        stablecoins.push(IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)); // usdc
        stablecoins.push(IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F)); // dai
    }

    /*
     * @title On first NFT contract deployment the msg.sender is the deployer not contract
     * @param address of generation manager contract
     */

    function adjustGenerationManagerAddress(address _genManager)
        public
        onlyOwner
    {
        generations = GenerationManager(_genManager);
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

    // TODO: it should just receive `_amount`?
    function transferFromLastGen(address _ticketOwner, uint256 _amount) public {
        require(
            address(this) != address(msg.sender),
            "Cant transfer to the same address"
        );
        // TODO: wtf? (same line in full nft, but why)
        // generations.getIDByAddress(msg.sender);
        uint256 participationFeeDiscount = participationFee
            .mul(10000 - transferDiscount)
            .div(10000);
        uint256 ticketAmount = _amount.div(participationFeeDiscount);
        // from stakeForTickets function
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
            // TODO: should be _mint or mint? the later one has some check such as salesStared.
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
     * @title Whether or not stackNFT can be bought for `_address` coin.
     */

    function supportsCoin(IERC20 _address) public view returns (bool) {
        for(uint256 i; i < stablecoins.length; i++) {
            if(_address == stablecoins[i]) {
                return true;
            }
        }
        return false;
    }

    /*
     * @title User mint a token amount that he has been allowed to mint. Partner sales have to be activated.
     * @param Number of tokens to mint.
     */

    function mint(uint256 _nftAmount, IERC20 _stablecoin) public {
        require(salesStarted, "Sales not started");
        require(supportsCoin(_stablecoin), "Unsupported payment coin");

        _stablecoin.transferFrom(
            msg.sender,
            address(this),
            participationFee.mul(_nftAmount)
        );
        adminWithdrawableAmount += participationFee.mul(_nftAmount);
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

    function delegate(address _delegatee, uint256 tokenId) public {
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

    function _mint(address _address) internal {
        require(totalSupply < maxSupply, "Max supply reached");
        _safeMint(_address, _tokenIdCounter.current());
        _setTokenURI(_tokenIdCounter.current(), URI);
        _tokenIdCounter.increment();
        totalSupply += 1;
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
}
