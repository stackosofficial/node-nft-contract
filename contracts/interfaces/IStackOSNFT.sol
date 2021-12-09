//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IStackOSNFT {
    function getTotalDelegated() external view returns (uint256);

    function getDelegationTimestamp(uint256 _tokenId)
        external
        view
        returns (uint256);

    function getDelegatee(uint256 _tokenId) external view returns (address);

    function getDelegator(uint256 _tokenId) external view returns (address);

    function transferFromLastGen(address _ticketOwner, uint256 _amount)
        external;

    // From IERC721
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;

    function balanceOf(address owner) external view returns (uint256 balance);

    function ownerOf(uint256 tokenId) external view returns (address owner);

    function transferOwnership(address newOwner) external;

    function isApprovedForAll(address owner, address operator)
        external
        view
        returns (bool);
}
