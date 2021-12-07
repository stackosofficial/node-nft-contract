//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IStackOSNFT.sol";
import "./GenerationManager.sol";

contract DarkMatter is TransferWhitelist, ERC721, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    mapping(address => uint256) private deposits; // total tokens deposited, from any generation
    mapping(address => uint256) private lastUserDarkMatter; // owner => current incomplete darkmatter id
    mapping(address => uint256[]) private toBeMinted; // owner => DarkMatterNFT ids to be minted
    mapping(uint256 => mapping(uint256 => uint256)) private stackToMaster; // generation => stackNFT id => darkmatter id

    mapping(uint256 => mapping(uint256 => uint256[])) private masterToStack; // darkmatter id => generation => stackNFT ids 

    GenerationManager private generations;

    uint256 immutable mintPrice; // number of StackNFTs that must be deposited in order to be able to mint a DarkMatter.

    constructor(GenerationManager _generations, uint256 _mintPrice)
        ERC721("DarkMatter", "MN")
    {
        generations = _generations;
        mintPrice = _mintPrice;
    }

    /*
     * @title Return stack token ids owned by DarkMatter token.
     * @param DarkMatter token id.
     */
    function ID(uint256 _darkMatterId)
        public
        view
        returns (uint256[][] memory)
    {
        uint256[][] memory stackTokenIds = new uint256[][](generations.count());
        for(uint256 i; i < stackTokenIds.length; i ++) {
            stackTokenIds[i] = masterToStack[_darkMatterId][i];
        }
        return stackTokenIds;
    }

    /*
     * @title Returns true if StackNFT token is locked in DarkMatter.
     * @param StackNFT generation id.
     * @param StackNFT token id.
     */
    function isLocked(uint256 generationId, uint256 tokenId)
        public
        view
        returns (bool)
    {
        return _exists(stackToMaster[generationId][tokenId]);
    }

    /*
     * @title Returns true if `_wallet` own either StackNFT or DarkMatterNFT that has locked this StackNFT.
     * @param Token holder address.
     * @param StackNFT generation id.
     * @param StackNFT token id.
     */
    function isOwnStackOrDarkMatter(
        address _wallet,
        uint256 generationId,
        uint256 tokenId
    ) public view returns (bool) {
        if (
            _exists(stackToMaster[generationId][tokenId]) &&
            ownerOf(generationId, tokenId) == _wallet
        ) {
            return true;
        }
        return generations.get(generationId).ownerOf(tokenId) == _wallet;
    }

    /*
     * @title Returns owner of StackNFT.
     * @param StackNFT address.
     * @param StackNFT token id.
     * @dev The returned address owns StackNFT or DarkMatter that has locked this StackNFT. 
     */
    function ownerOfStackOrDarkMatter(IStackOSNFT _stackOsNFT, uint256 tokenId)
        public
        view
        returns (address)
    {
        uint256 generationId = generations.getIDByAddress(address(_stackOsNFT));
        if (_exists(stackToMaster[generationId][tokenId])) {
            return ownerOf(generationId, tokenId);
        }
        return _stackOsNFT.ownerOf(tokenId);
    }

    /*
     * @title Returns owner of the DarkMatterNFT that owns designated StackNFT.
     * @param StackNFT generation id.
     * @param StackNFT token id.
     */
    function ownerOf(uint256 generationId, uint256 tokenId)
        public
        view
        returns (address)
    {
        return ownerOf(stackToMaster[generationId][tokenId]);
    }

    /*
     *  @title Deposit StackNFT.
     *  @param StackNFT generation id.
     *  @param Token ids.
     *  @dev StackNFT generation must be added prior to deposit.
     */
    function deposit(uint256 generationId, uint256[] calldata tokenIds)
        external
        nonReentrant
    {
        require(generationId < generations.count(), "Generation doesn't exist");
        IStackOSNFT stackNFT = generations.get(generationId);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            stackNFT.transferFrom(msg.sender, address(this), tokenId);


            if (deposits[msg.sender] == 0) {
                lastUserDarkMatter[msg.sender] = _tokenIdCounter.current();
                _tokenIdCounter.increment();
            }
            deposits[msg.sender] += 1;
            if (deposits[msg.sender] == mintPrice) {
                deposits[msg.sender] -= mintPrice;
                stackToMaster[generationId][tokenId] = lastUserDarkMatter[
                    msg.sender
                ];
                masterToStack[lastUserDarkMatter[msg.sender]][generationId].push(tokenId);
                toBeMinted[msg.sender].push(lastUserDarkMatter[msg.sender]);
            } else {
                stackToMaster[generationId][tokenId] = lastUserDarkMatter[
                    msg.sender
                ];
                masterToStack[lastUserDarkMatter[msg.sender]][generationId].push(tokenId);
            }
        }
    }

    /*
     *  @title Mints a DarkMatterNFT for the caller.
     *  @dev Caller must have deposited `mintPrice` number of StackNFT of any generation.
     */
    function mint() public nonReentrant {
        require(toBeMinted[msg.sender].length > 0, "Not enough deposited");
        while (toBeMinted[msg.sender].length > 0) {
            _mint(
                msg.sender,
                toBeMinted[msg.sender][toBeMinted[msg.sender].length - 1]
            );
            toBeMinted[msg.sender].pop();
        }
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) 
        internal
        override(ERC721)
    {
        require(isWhitelisted(msg.sender), "Not whitelisted for transfers");
        super._transfer(from, to, tokenId);
    }
}
