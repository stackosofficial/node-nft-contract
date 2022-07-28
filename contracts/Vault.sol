//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.15;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "./Exchange.sol";
import "./StackOsNFTBasic.sol";
import "./Subscription.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "hardhat/console.sol";

contract Vault is Ownable, ReentrancyGuard {
    event Deposit(address indexed depositor);
    event Withdraw(address indexed depositor);

    // this data is stored when NFT is deposited in vault
    struct DepositInfo {
        address depositor; // who deposited NFT and received withdrawn fee and bonus
        uint256 totalFee; // total subscription fee withdrawn
        uint256 totalBonus; // total subscription bonus withdrawn
        // these two are always small numbers, so put them in one slot
        uint128 tax; // tax percent when subscription fee withdrawn
        uint128 date; // block.timestamp when deposit with claim were made
    }

    IERC20 internal immutable stackToken;
    GenerationManager internal immutable generations;
    Subscription internal immutable sub0;
    Subscription internal immutable subscription;
    uint256 public immutable LOCK_DURATION;

    bool public isDepositsOpened = true;

    mapping(address => uint256) public allocations;
    mapping(address => mapping(uint256 => uint256[])) private ownerToTokens;
    mapping(uint256 => mapping(uint256 => DepositInfo)) public depositInfo;

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

    /// @notice returns tokens in generation `generationId` that are in vault and deposited by wallet `owner`.
    function getDepositedTokensOf(address owner, uint256 generationId)
        public
        view
        returns (uint256[] memory)
    {
        return ownerToTokens[owner][generationId];
    }

    function deposit(uint256 generationId, uint256 tokenId)
        public
        nonReentrant
    {
        require(generationId < generations.count(), "Generation doesn't exist");
        require(isDepositsOpened, "Deposits are closed now");
        require(
            depositInfo[generationId][tokenId].depositor == address(0),
            "Cannot redeposit same token"
        );

        IERC721 stackNft = IERC721(
            address(generations.get(generationId))
        );
        stackNft.transferFrom(msg.sender, address(this), tokenId);

        Subscription _subscription = getSubscriptionContract(generationId);
        // withdraw subscription fee to this contract
        (, uint256 tax, ) = _subscription.deposits(generationId, tokenId);
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        uint256 balanceBeforeWithdraw = stackToken.balanceOf(address(this));
        _subscription.withdraw(generationId, tokenIds);
        uint256 balanceAfterWithdraw = stackToken.balanceOf(address(this));

        // save total fee + bonus that this user ever deposited
        (uint256 unlocked, uint256 locked, ) = _subscription.pendingBonus(
            generationId,
            tokenId
        );
        allocations[msg.sender] +=
            (balanceAfterWithdraw - balanceBeforeWithdraw) +
            unlocked +
            locked;

        // claim bonus to this contract
        uint256 balanceBeforeBonus = stackToken.balanceOf(address(this));
        _subscription.claimBonus(generationId, tokenIds);
        uint256 balanceAfterBonus = stackToken.balanceOf(address(this));

        // transfer withdrawn fee and bonus to owner
        if (balanceAfterBonus > 0)
            stackToken.transfer(owner(), balanceAfterBonus);

        // save claim info
        depositInfo[generationId][tokenId] = DepositInfo({
            depositor: msg.sender,
            totalFee: balanceAfterWithdraw - balanceBeforeWithdraw,
            totalBonus: balanceAfterBonus - balanceBeforeBonus,
            tax: uint128(tax),
            date: uint128(block.timestamp)
        });
        ownerToTokens[msg.sender][generationId].push(tokenId);

        emit Deposit(msg.sender);
    }

    function withdraw(uint256 generationId, uint256 tokenId)
        public
        nonReentrant
    {
        require(generationId < generations.count(), "Generation doesn't exist");
        require(
            block.timestamp >
                depositInfo[generationId][tokenId].date + LOCK_DURATION,
            "locked"
        );
        require(
            msg.sender == depositInfo[generationId][tokenId].depositor,
            "Not owner"
        );

        IERC721 stackNft = IERC721(
            address(generations.get(generationId))
        );

        Subscription _subscription = getSubscriptionContract(generationId);
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        // claim bonus to this contract
        try _subscription.claimBonus(generationId, tokenIds) {} catch {}
        uint256 stackTokensBalance = stackToken.balanceOf(address(this));

        // transfer withdrawn bonus to owner
        if (stackTokensBalance > 0)
            stackToken.transfer(owner(), stackTokensBalance);
        stackNft.transferFrom(address(this), msg.sender, tokenId);
        emit Withdraw(msg.sender);
    }

    function ownerClaim(uint256 generationId, uint256 tokenId)
        public
        onlyOwner
        nonReentrant
    {
        require(generationId < generations.count(), "Generation doesn't exist");

        Subscription _subscription = getSubscriptionContract(generationId);

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        try _subscription.withdraw(generationId, tokenIds) {} catch {}
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

    function closeDeposits() external onlyOwner {
        isDepositsOpened = false;
    }

    // should not be able to renounce ownership
    function renounceOwnership() public pure override { revert(); }
}
