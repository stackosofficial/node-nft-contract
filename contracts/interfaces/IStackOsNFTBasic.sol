//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./IStackOsNFT.sol";

interface IStackOsNFTBasic is IStackOsNFT {

    function setName(
        string memory name_
    ) external;

    function setSymbol(
        string memory symbol_
    ) external;

    function mintFromSubscriptionRewards(
        uint256 _nftAmount,
        uint256 _stackAmount,
        address _to
    ) external;

    function mintFromRoyaltyRewards(
        uint256 _mintNum,
        address _to
    ) external returns (uint256);

    function mintPrice()
        external
        view
        returns (uint256);

    function PRICE_PRECISION()
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
