//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IStackOsNFT.sol";
import "./GenerationManager.sol";
import "./Whitelist.sol";

contract DarkMatter is Whitelist, ERC721, ReentrancyGuard {
    using Counters for Counters.Counter;

    event Deposit(
        address indexed _wallet, 
        uint256 generationId,
        uint256[] tokenIds
    );

    Counters.Counter private _tokenIdCounter;
    
    GenerationManager private immutable generations;
    
    // number of StackNFTs that must be deposited in order to be able to mint a DarkMatter.
    uint256 immutable mintPrice; 
    bool isActive; 

    // total amount of NFT deposited from any generation
    mapping(address => uint256) private deposits; 
    // owner => current incomplete DarkMatter id
    mapping(address => uint256) private lastUserDarkMatter; 
    // owner => DarkMatter ids
    mapping(address => uint256[]) private toBeMinted; 

    // need this to distinguish from default 0
    struct ValidId {
        uint256 id;
        bool written;
    }
    // generation => StackNFT id => DarkMatter id
    mapping(uint256 => mapping(uint256 => ValidId)) private stackToDarkMatter; 

    // DarkMatter id => generation => StackNFT ids 
    mapping(uint256 => mapping(uint256 => uint256[])) private darkMatterToStack; 


    constructor(GenerationManager _generations, uint256 _mintPrice)
        ERC721("DarkMatter", "DM")
    {
        generations = _generations;
        mintPrice = _mintPrice;
    }

    function activate() external onlyOwner {
        isActive = true;
    }

    /**
     * @notice Get stack token ids used to mint this DarkMatterNFT.
     * @param _darkMatterId DarkMatter token id.
     * @return Stack token ids owned by DarkMatterNFT.
     */
    function ID(uint256 _darkMatterId)
        external 
        view
        returns (uint256[][] memory)
    {
        uint256[][] memory stackTokenIds = new uint256[][](generations.count());
        for(uint256 i; i < stackTokenIds.length; i ++) {
            stackTokenIds[i] = darkMatterToStack[_darkMatterId][i];
        }
        return stackTokenIds;
    }

    /**
     * @notice Get whether wallet owns StackNFT or DarkMatter that owns this StackNFT
     * @param _wallet Address of wallet.
     * @param generationId StackNFT generation id.
     * @param tokenId StackNFT token id.
     * @return Whether `_wallet` owns either StackNFT or DarkMatterNFT that owns this StackNFT.
     */
    function isOwnStackOrDarkMatter(
        address _wallet,
        uint256 generationId,
        uint256 tokenId
    ) external view returns (bool) {
        if (
            stackToDarkMatter[generationId][tokenId].written &&
            _exists(stackToDarkMatter[generationId][tokenId].id) &&
            ownerOf(generationId, tokenId) == _wallet
        ) {
            return true;
        }
        return generations.get(generationId).ownerOf(tokenId) == _wallet;
    }

    /**
     * @notice Returns owner of either StackNFT or DarkMatter that owns StackNFT. 
     * @param _stackOsNFT StackNFT address.
     * @param tokenId StackNFT token id.
     * @return Address that owns StackNFT or DarkMatter that owns this StackNFT. 
     */
    function ownerOfStackOrDarkMatter(IStackOsNFT _stackOsNFT, uint256 tokenId)
        external
        view
        returns (address)
    {
        uint256 generationId = generations.getIDByAddress(address(_stackOsNFT));
        if (
            stackToDarkMatter[generationId][tokenId].written &&
            _exists(stackToDarkMatter[generationId][tokenId].id)
        ) {
            return ownerOf(generationId, tokenId);
        }
        return _stackOsNFT.ownerOf(tokenId);
    }

    /**
     * @notice Get owner of the DarkMatterNFT that owns StackNFT.
     * @param generationId StackNFT generation id.
     * @param tokenId StackNFT token id.
     * @return Owner of the DarkMatterNFT that owns StackNFT.
     */
    function ownerOf(uint256 generationId, uint256 tokenId)
        public
        view
        returns (address)
    {
        require(stackToDarkMatter[generationId][tokenId].written);
        return ownerOf(stackToDarkMatter[generationId][tokenId].id);
    }

    /**
     *  @notice Deposit enough StackNFTs in order to be able to mint DarkMatter.
     *  @param generationId StackNFT generation id.
     *  @param tokenIds Token ids.
     *  @dev StackNFT generation must be added in manager prior to deposit.
     */
    function deposit(uint256 generationId, uint256[] calldata tokenIds)
        external
        nonReentrant
    {
        require(isActive, "Inactive");
        require(generationId < generations.count(), "Generation doesn't exist");
        IStackOsNFT stackNFT = generations.get(generationId);

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
                darkMatterToStack[lastUserDarkMatter[msg.sender]][generationId].push(tokenId);
                toBeMinted[msg.sender].push(lastUserDarkMatter[msg.sender]);
            } else {
                darkMatterToStack[lastUserDarkMatter[msg.sender]][generationId].push(tokenId);
            }
            stackToDarkMatter[generationId][tokenId].written = true;
            stackToDarkMatter[generationId][tokenId].id = lastUserDarkMatter[
                msg.sender
            ];
        }

        emit Deposit(msg.sender, generationId, tokenIds);
    }

    /**
     *  @notice Mints a DarkMatterNFT for the caller.
     *  @dev Caller must have deposited `mintPrice` number of StackNFT of any generation.
     */
    function mint() external nonReentrant {
        require(toBeMinted[msg.sender].length > 0, "Not enough deposited");
        while (toBeMinted[msg.sender].length > 0) {
            _mint(
                msg.sender,
                toBeMinted[msg.sender][toBeMinted[msg.sender].length - 1]
            );
            toBeMinted[msg.sender].pop();
        }
    }

    /*
     *  @title Override to make use of whitelist.
     */
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

}
