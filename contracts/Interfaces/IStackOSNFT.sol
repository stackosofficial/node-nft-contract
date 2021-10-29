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

    function balanceOf(address owner) external view returns (uint256 balance);

    function ownerOf(uint256 tokenId) external view returns (address owner);

    function transferFromLastGen(address _ticketOwner, uint256 _amount)
        external;
}
