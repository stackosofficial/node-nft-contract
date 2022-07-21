//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "./Exchange.sol";
import "./StackOsNFTBasic.sol";
import "./Subscription.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

contract GetTokensOwnedBy {
    GenerationManager internal immutable generations;

    constructor(GenerationManager _generations) {
        generations = _generations;
    }

    /**
     * @dev Returns an array of ERC721Enumerable token IDs owned by `owner`.
     *
     * This function is O(ownerBalance) in complexity.
     * Order of token IDs is undefined.
     * It is meant to be called off-chain.
     */
    function getTokensOfOwner(address owner, IERC721Enumerable enumerable)
        public
        view
        returns (uint256[] memory tokenIds)
    {
        uint256 balance = enumerable.balanceOf(owner);
        tokenIds = new uint256[](balance);
        for (uint256 i = 0; i < balance; i++) {
            tokenIds[i] = enumerable.tokenOfOwnerByIndex(owner, i);
        }
    }

    /**
     * @dev Returns an array of ERC721Enumerable token IDs owned by `owner`,
     * in the range [`start`, `stop`].
     *
     * This function allows for tokens to be queried if the collection
     * grows too big for a single call of {getTokensOfOwner}.
     *
     * Requirements:
     *
     * - `start <= tokenId < stop`
     */
    function getTokensOfOwnerIn(
        address owner,
        IERC721Enumerable enumerable,
        uint256 start,
        uint256 stop
    ) public view returns (uint256[] memory tokenIds) {
        require(start < stop, "InvalidQueryRange");
        uint256 stopLimit = enumerable.totalSupply();
        // Set `stop = min(stop, stopLimit)`.
        if (stop > stopLimit) {
            // At this point `start` could be greater than `stop`.
            stop = stopLimit;
        }
        uint256 tokenIdsMaxLength = enumerable.balanceOf(owner);
        // Set `tokenIdsMaxLength = min(balanceOf(owner), stop - start)`,
        // to cater for cases where `balanceOf(owner)` is too big.
        if (start < stop) {
            uint256 rangeLength = stop - start;
            if (rangeLength < tokenIdsMaxLength) {
                tokenIdsMaxLength = rangeLength;
            }
        } else {
            return tokenIds; // empty
        }

        tokenIds = new uint256[](tokenIdsMaxLength);
        for (uint256 i = start; i != stop && i <= tokenIdsMaxLength; i++) {
        console.log(i, start, stop);
            tokenIds[i] = enumerable.tokenOfOwnerByIndex(owner, i);
        }

        return tokenIds;
    }
}
