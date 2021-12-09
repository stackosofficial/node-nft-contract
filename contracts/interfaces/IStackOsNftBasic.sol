//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IStackOSNFTBasic {
    function mintFromSubscriptionRewards(
        uint256 _nftAmount,
        address _stablecoin
    ) external returns (uint256);

    function getFromRewardsPrice(uint256 _nftAmount, address _stablecoin)
        external
        view
        returns (uint256);
}
