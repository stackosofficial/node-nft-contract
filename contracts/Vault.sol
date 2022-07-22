//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.15;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "./Exchange.sol";
import "./StackOsNFTBasic.sol";
import "./Subscription.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "hardhat/console.sol";

contract Vault is Ownable {
    using EnumerableSet for EnumerableSet.UintSet;

    event Deposit(address indexed depositor);
    event Withdraw(address indexed depositor);

    // this data is stored when NFT is deposited in vault
    struct ClaimHistoryEntry {
        address depositor; // who deposited NFT and received withdrawn fee and bonus
        uint256 totalFee; // total subscription fee withdrawn
        uint256 totalBonus; // total subscription bonus withdrawn
        uint256 tax; // tax percent when subscription fee withdrawn
        uint256 date; // block.timestamp when deposit with claim were made
    }

    IERC20 internal immutable stackToken;
    GenerationManager internal immutable generations;
    Subscription internal immutable sub0;
    Subscription internal immutable subscription;
    uint256 public immutable LOCK_DURATION;

    bool public isDepositsOpened = true; 

    mapping(address => mapping(uint256 => EnumerableSet.UintSet)) private depositRecord;
    mapping(uint256 => mapping(uint256 => address)) public owners;
    mapping(uint256 => mapping(uint256 => uint256)) public balanceCounters;
    mapping(uint256 => mapping(uint256 => uint256)) public unlockDates;
    mapping(uint256 => mapping(uint256 => ClaimHistoryEntry[]))
        public depositClaimHistory;

    constructor(
        IERC20 _stackToken,
        GenerationManager _generations,
        Subscription _sub0,
        Subscription _subscription,
        uint256 _LOCK_DURATION
    ) {
        stackToken = _stackToken;
        generations = _generations;
        sub0 = _sub0;
        subscription = _subscription;
        LOCK_DURATION = _LOCK_DURATION;
    }

    function depositClaimHistoryLength(uint256 generationId, uint256 tokenId)
        public
        view
        returns (uint256)
    {
        return depositClaimHistory[generationId][tokenId].length;
    }

    function getDepositRecordArray(address owner, uint256 generationId)
        public
        view
        returns (uint256[] memory)
    {
        return depositRecord[owner][generationId].values();
    }

    function getUserDepositedTokens(address depositor)
        public
        view
        returns (uint256[][] memory tokenIds, uint256 totalBonus, uint256 totalFee)
    {
        uint256 generationsCount = generations.count();
        tokenIds = new uint256[][](generationsCount);
        for (uint256 generationId = 0; generationId < generationsCount; generationId++) {
            uint256 depositRecordLength = depositRecord[depositor][generationId].length();
            tokenIds[generationId] = new uint256[](depositRecordLength);
            for (uint256 o = 0; o < depositRecordLength; o++) {
                uint256 tokenId = depositRecord[depositor][generationId].at(o);
                uint256 _depositClaimHistoryLength = depositClaimHistory[generationId][tokenId].length;
                tokenIds[generationId] = depositRecord[depositor][generationId].values();
                // length -1 is safe here because depositRecordLength non zero here, and thus _depositClaimHistoryLength too
                totalFee += depositClaimHistory[generationId][tokenId][_depositClaimHistoryLength-1].totalFee;
                totalBonus += depositClaimHistory[generationId][tokenId][_depositClaimHistoryLength-1].totalBonus;
            }
        }
        return (tokenIds, totalBonus, totalFee);
    }

    function deposit(uint256 generationId, uint256 tokenId) public {
        require(generationId < generations.count(), "Generation doesn't exist");
        require(isDepositsOpened, "Deposits are closed now");

        ClaimHistoryEntry memory claimInfo;
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
        depositRecord[msg.sender][generationId].add(tokenId);

        emit Deposit(msg.sender);
    }

    function withdraw(uint256 generationId, uint256 tokenId) public {
        require(generationId < generations.count(), "Generation doesn't exist");
        require(block.timestamp > unlockDates[generationId][tokenId], "locked");
        require(msg.sender == owners[generationId][tokenId], "Not owner");

        StackOsNFTBasic stackNft = StackOsNFTBasic(
            address(generations.get(generationId))
        );
        delete owners[generationId][tokenId];
        delete unlockDates[generationId][tokenId];
        depositRecord[msg.sender][generationId].remove(tokenId);

        Subscription _subscription = getSubscriptionContract(generationId);
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        // claim bonus to this contract
        try _subscription.claimBonus(generationId, tokenIds) {} catch {}
        uint256 stackTokensBalance = stackToken.balanceOf(address(this));

        // transfer withdraw fee and bonus to owner
        if (stackTokensBalance > 0)
            stackToken.transfer(owner(), stackTokensBalance);
        stackNft.transferFrom(address(this), msg.sender, tokenId);
        emit Withdraw(msg.sender);
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

    function closeDeposits()
        external
        onlyOwner
    {
        isDepositsOpened = false;
    }
}
