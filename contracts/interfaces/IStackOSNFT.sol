//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IStackOSNFT is IERC721 {
    function getTotalDelegated() external view returns (uint256);

    function getDelegationTimestamp(uint256 _tokenId)
        external
        view
        returns (uint256);

    function getDelegatee(uint256 _tokenId) external view returns (address);

    function getDelegator(uint256 _tokenId) external view returns (address);

    function transferOwnership(address newOwner) external;

}
