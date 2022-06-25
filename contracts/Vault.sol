//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "./Exchange.sol";
import "./StackOsNFTBasic.sol";
import "./Subscription.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Vault is Ownable {
    struct ClaimInfo {
        address depositor; // who deposited NFT and received withdrawn fee and bonus
        uint256 totalFee; // total subscription fee withdrawn
        uint256 totalBonus; // total subscription bonus withdrawn
        uint256 tax; // tax percent when subscription fee withdrawn
        uint256 date; // block.timestamp when deposit with claim were made
    }

    IERC20 internal immutable stackToken;
    GenerationManager internal immutable generations;
    DarkMatter internal immutable darkMatter;
    Subscription internal immutable sub0;
    Subscription internal immutable subscription;

    uint256 internal constant HUNDRED_PERCENT = 10000;
    uint256 public constant LOCK_DURATION = 30 days * 18; // 18 months

    mapping(uint256 => mapping(uint256 => address)) public owners;
    mapping(uint256 => mapping(uint256 => uint256)) public unlockDates;
    mapping(uint256 => mapping(uint256 => ClaimInfo[]))
        public depositClaimHistory;

    constructor(
        IERC20 _stackToken,
        GenerationManager _generations,
        DarkMatter _darkMatter,
        Subscription _sub0,
        Subscription _subscription
    ) {
        stackToken = _stackToken;
        generations = _generations;
        darkMatter = _darkMatter;
        sub0 = _sub0;
        subscription = _subscription;
    }

    function deposit(uint256 generationId, uint256 tokenId) public {
        require(generationId < generations.count(), "Generation doesn't exist");

        ClaimInfo memory claimInfo;
        claimInfo.date = block.timestamp;
        claimInfo.depositor = msg.sender;

        StackOsNFTBasic stackNft = StackOsNFTBasic(
            address(generations.get(generationId))
        );
        stackNft.transferFrom(msg.sender, address(this), tokenId);
        owners[generationId][tokenId] = msg.sender;
        unlockDates[generationId][tokenId] = block.timestamp + LOCK_DURATION;

        Subscription _subscription = getSubscriptionContract(generationId);
        // withdraw subscription fee to this contract
        (, uint256 tax, ) = _subscription.deposits(generationId, tokenId);
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        uint256 balanceBeforeWithdraw = stackToken.balanceOf(address(this));
        _subscription.withdraw(generationId, tokenIds);
        uint256 balanceAfterWithdraw = stackToken.balanceOf(address(this));
        claimInfo.totalFee = balanceAfterWithdraw - balanceBeforeWithdraw;
        claimInfo.tax = tax;

        // claim bonus to this contract
        uint256 balanceBeforeBonus = stackToken.balanceOf(address(this));
        _subscription.claimBonus(generationId, tokenIds);
        uint256 balanceAfterBonus = stackToken.balanceOf(address(this));
        claimInfo.totalBonus = balanceAfterBonus - balanceBeforeBonus;

        // transfer withdrawn fee and bonus to owner
        if (balanceAfterBonus > 0)
            stackToken.transfer(owner(), balanceAfterBonus);

        // save claim info
        depositClaimHistory[generationId][tokenId].push(claimInfo);
    }

    function withdraw(uint256 generationId, uint256 tokenId) public {
        require(generationId < generations.count(), "Generation doesn't exist");
        require(block.timestamp > unlockDates[generationId][tokenId], "locked");
        require(msg.sender == owners[generationId][tokenId], "Not owner");

        StackOsNFTBasic stackNft = StackOsNFTBasic(
            address(generations.get(generationId))
        );
        delete owners[generationId][tokenId];

        Subscription _subscription = getSubscriptionContract(generationId);
        // withdraw subscription fee
        (uint256 balance, , ) = _subscription.deposits(generationId, tokenId);
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        if (balance != 0) {
            _subscription.withdraw(generationId, tokenIds);
        }

        // claim bonus to this contract
        _subscription.claimBonus(generationId, tokenIds);
        uint256 stackTokensBalance = stackToken.balanceOf(address(this));

        // transfer withdraw fee and bonus to user
        if (stackTokensBalance > 0)
            stackToken.transfer(msg.sender, stackTokensBalance);
        stackNft.transferFrom(address(this), msg.sender, tokenId);
    }

    function ownerClaim(uint256 generationId, uint256 tokenId)
        public
        onlyOwner
    {
        require(generationId < generations.count(), "Generation doesn't exist");

        Subscription _subscription = getSubscriptionContract(generationId);

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        _subscription.withdraw(generationId, tokenIds);
        _subscription.claimBonus(generationId, tokenIds);
        uint256 stackTokensBalance = stackToken.balanceOf(address(this));

        // transfer withdrawn fee and bonus to owner
        if (stackTokensBalance > 0)
            stackToken.transfer(msg.sender, stackTokensBalance);
    }

    /// @dev returns correct subscription contract for gen0 and gen1
    function getSubscriptionContract(uint256 generationId)
        private
        view
        returns (Subscription)
    {
        return generationId == 0 ? sub0 : subscription;
    }
}
