//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./IStackOSNFT.sol";

interface IStackOSNFTBasic is IStackOSNFT {
    function mintFromSubscriptionRewards(
        uint256 _stackAmount,
        uint256 _nftAmount,
        address _to
    ) external;

    function mintFromRoyaltyRewards(
        uint256 _mintNum,
        address _stablecoin,
        address _to
    ) external returns (uint256);
    

    function getFromRewardsPrice(uint256 _nftAmount, address _stablecoin)
        external
        view
        returns (uint256);

    function price()
        external
        view
        returns (uint256);

    function rewardDiscount()
        external
        view
        returns (uint256);

    function transferFromLastGen(address _ticketOwner, uint256 _amount)
        external;
}
