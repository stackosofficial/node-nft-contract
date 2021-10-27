//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface StackosDelegate {
    function getTotalDelegators() 
        external
        view
        returns (
            uint256
        );

    function getDelegationTimestamp(
        uint256 _tokenId
    )
        external
        view
        returns (
            uint256
        );

    function getDelegatee(
        address _delegate,
        uint256 _tokenId
    )
        external
        view
        returns (
            address
        );

    function getDelegator(
        uint256 _tokenId
    )
        external
        view
        returns (
            address
        );
}