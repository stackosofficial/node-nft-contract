//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "./Exchange.sol";
import "./StackOsNFTBasic.sol";
import "./Subscription.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// import "hardhat/console.sol";

contract GetTokensOwnedBy {

    /**
     * @dev Returns an array of ERC721Enumerable token IDs owned by `owner` in all generations.
     * @return tokenIds is two-dimensional array where first dimension is generation id,
     * and second dimension is token IDs of owner in that generation.
     */
    function getTokensOfOwnerInAllGenerations(address owner, GenerationManager generations)
        public
        view
        returns (uint256[][] memory tokenIds)
    {
        uint256 generationsCount = generations.count();
        tokenIds = new uint256[][](generationsCount);
        for (uint256 i = 0; i < generationsCount; i++) {
            IERC721Enumerable enumerable = IERC721Enumerable(address(generations.get(i)));
            uint256 balance = enumerable.balanceOf(owner);
            tokenIds[i] = new uint256[](balance);
            for (uint256 o = 0; o < balance; o++) {
                tokenIds[i][o] = enumerable.tokenOfOwnerByIndex(owner, o);
            }
                
        }
    }

    /**
     * @dev Returns an array of ERC721Enumerable token IDs owned by `owner`.
     * @return tokenIds array of token IDs.
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
     * - `start <= tokenId < stop`
     *
     * @return tokenIds array of token IDs.
     */
    function getTokensOfOwnerIn(
        address owner,
        IERC721Enumerable enumerable,
        uint256 start,
        uint256 stop
    ) public view returns (uint256[] memory tokenIds) {
        require(start < stop, "InvalidQueryRange");
        uint256 userBalance = enumerable.balanceOf(owner);
        if (stop > userBalance) {
            stop = userBalance;
        }
        if (start < stop) {
            uint256 rangeLength = stop - start;
            if (rangeLength < userBalance) {
                userBalance = rangeLength;
            }
        } else userBalance = 0;

        tokenIds = new uint256[](userBalance);
        if(userBalance == 0) return tokenIds; // empty

        for (uint256 i = 0; i < userBalance && start <= stop; ) {
            tokenIds[i++] = enumerable.tokenOfOwnerByIndex(owner, start++);
        }

        return tokenIds;
    }
}
