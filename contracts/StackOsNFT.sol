//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";

contract StackOsNFT is VRFConsumerBase, ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    enum TicketStatus {
        Won,
        Rewarded,
        Withdrawn
    }

    Counters.Counter private _tokenIdCounter;
    uint256 private maxSupply;
    uint256 private totalSupply;
    uint256 private participationFee;
    uint256 private participationTickets;
    uint256 private prizes;
    uint256 public randomNumber;
    mapping(uint256 => address) public ticketOwner;
    mapping(uint256 => TicketStatus) public ticketStatus;
    mapping(address => mapping(bool => uint256)) internal strategicPartner;
    bool public ticketStatusAssigned;
    uint256[] public winningTickets;
    IERC20 private currency;
    bool private salesStarted;
    string private URI;
    bytes32 internal keyHash;
    uint256 internal fee;
    uint256 public timeLock;
    uint256 internal adminWithdrawableAmount;

    mapping(uint256 => uint256) private delegationTimestamp;
    mapping(address => mapping(uint256 => address)) private delegates;
    uint256 private totalDelegators;

    mapping(uint256 => uint256) public top10Bids;
    mapping(uint256 => address) public top10Biders;
    mapping(address => uint256) public bidderBalance;

    bool public auctionClosed;

    constructor(
        string memory _name,
        string memory _symbol,
        IERC20 _currencyToken,
        uint256 _participationFee,
        uint256 _maxSupply,
        string memory uriLink
    )
        ERC721(_name, _symbol)
        VRFConsumerBase(
            0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B, // VRF Coordinator
            0x01BE23585060835E02B77ef475b0Cc51aA1e0709 // LINK Token
        )
    {
        currency = _currencyToken;
        participationFee = _participationFee;
        maxSupply = _maxSupply;
        URI = uriLink;
        keyHash = 0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311;
        fee = 1 * 10**17; // 0.1 LINK (Varies by network)
    }

    function getTotalDelegators() public view returns (uint256) {
        return totalDelegators;
    }

    function getDelegationTimestamp(uint256 _tokenId)
        public
        view
        returns (uint256)
    {
        return delegationTimestamp[_tokenId];
    }

    function getDelegatee(address _delegate, uint256 _tokenId)
        public
        view
        returns (address)
    {
        return delegates[_delegate][_tokenId];
    }

    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    // Next generation ticket multiplier. The multiplier will only take effect if NFT 1 gen is sent to NFT 2

    // Strategic Have to pay the same floor price , but must be whitelisted.
    function stakeForTickets(uint256 _amount) public {
        //add open/close staking
        uint256 depositAmount = participationFee.mul(_amount);
        currency.transferFrom(msg.sender, address(this), depositAmount);
        uint256 nextTicketID = participationTickets;
        for (uint256 i; i < _amount; i++) {
            ticketOwner[nextTicketID] = msg.sender;
            nextTicketID++;
        }
        participationTickets += _amount;
    }

    function claimReward(uint256[] calldata _ticketID) public {
        require(winningTickets.length > 0, "Not Decided Yet.");
        require(ticketStatusAssigned == true, "Not Assigned Yet!");
        for (uint256 i; i < _ticketID.length; i++) {
            require(
                ticketOwner[_ticketID[i]] == msg.sender,
                "Not your ticket."
            );
            if (ticketStatus[_ticketID[i]] == TicketStatus.Won) {
                ticketStatus[_ticketID[i]] = TicketStatus.Rewarded;
                mint(msg.sender);
            } else {
                revert("Ticket Did not win!");
            }
        }
    }

    function returnStake(uint256[] calldata _ticketID) public {
        require(winningTickets.length > 0, "Not Decided Yet.");
        require(ticketStatusAssigned == true, "Not Assigned Yet!");
        for (uint256 i; i < _ticketID.length; i++) {
            require(
                ticketOwner[_ticketID[i]] == msg.sender,
                "Not your ticket."
            );
            if (
                ticketStatus[_ticketID[i]] == TicketStatus.Rewarded ||
                ticketStatus[_ticketID[i]] == TicketStatus.Withdrawn ||
                ticketStatus[_ticketID[i]] == TicketStatus.Won
            ) {
                revert("Ticket Stake Not Returnable");
            } else {
                ticketStatus[_ticketID[i]] = TicketStatus.Withdrawn;
            }
        }
        currency.transfer(msg.sender, _ticketID.length.mul(participationFee));
    }

    function announceWinners(uint256 number) public {
        for (uint256 i; i < prizes; i++) {
            winningTickets.push(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            block.difficulty,
                            block.timestamp,
                            number + i
                        )
                    )
                ) % participationTickets
            );
        }
    }

    function mapOutWinningTickets() public {
        require(winningTickets.length > 0, "Not Decided Yet.");
        require(ticketStatusAssigned == false, "Already Assigned.");
        for (uint256 i; i < winningTickets.length; i++) {
            ticketStatus[winningTickets[i]] = TicketStatus.Won;
        }
        ticketStatusAssigned = true;
        adminWithdrawableAmount += winningTickets.length.mul(participationFee);
    }

    function whitelistPartner(
        address _address,
        bool _whitelist,
        uint256 _amount
    ) public onlyOwner {
        strategicPartner[_address][_whitelist] = _amount;
    }

    function partnerMint(uint256 _amount) public {
        require(strategicPartner[msg.sender][true] <= _amount, "Can't Mint");
        currency.transferFrom(
            msg.sender,
            address(this),
            participationFee.mul(_amount)
        );
        adminWithdrawableAmount += participationFee.mul(_amount);
        for (uint256 i; i < _amount; i++) {
            strategicPartner[msg.sender][true]--;
            mint(msg.sender);
        }
    }

    // Auction
    function placeBid(uint256 _amount) public returns (uint256 i) {
        require(auctionClosed == false, "Auction closed!");
        currency.transferFrom(msg.sender, address(this), _amount);
        for (i = 10; i != 0; i--) {
            if (top10Bids[i] < _amount) {
                if (i > 1) {
                    for (uint256 b; b < i; b++) {
                        //  Start over wrtiting from bottom up.
                        if (b == 0 && top10Bids[b + 1] != 0) {
                            currency.transfer(
                                top10Biders[b + 1],
                                top10Bids[b + 1]
                            );
                        }
                        top10Bids[b] = top10Bids[b + 1];
                        top10Biders[b] = top10Biders[b + 1];
                    }
                }

                top10Bids[i] = _amount;
                top10Biders[i] = msg.sender;

                i = 0;
                return i;
            }
        }
    }

    function finalizeAuction() public onlyOwner {
        for (uint256 i = 1; i < 10; i++) {
            if (top10Biders[i] != address(0)) {
                mint(top10Biders[i]);
            }
        }
    }

    function delegate(address _delegatee, uint256 tokenId) public {
        require(msg.sender != address(0), "Delegate to address-zero");
        require(msg.sender == ownerOf(tokenId), "Not owner");
        require(
            delegates[msg.sender][tokenId] != _delegatee,
            "The same delegatee"
        );
        require(exists(tokenId), "Token must exists");

        delegates[msg.sender][tokenId] = _delegatee;
        if (delegationTimestamp[tokenId] == 0) totalDelegators += 1;
        delegationTimestamp[tokenId] = block.timestamp;
    }

    function startSales() public onlyOwner {
        salesStarted = true;
    }

    function mint(address _address) internal {
        require(salesStarted, "Sales not started");
        require(totalSupply < maxSupply, "Max supply reached");
        _safeMint(_address, _tokenIdCounter.current());
        _setTokenURI(_tokenIdCounter.current(), URI);
        _tokenIdCounter.increment();
        totalSupply += 1;
    }

    // The following functions are overrides required by Solidity.

    function _burn(uint256 tokenId)
        internal
        override(ERC721, ERC721URIStorage)
    {
        super._burn(tokenId);

        totalSupply -= 1;
        totalDelegators -= 1;
        delegates[msg.sender][tokenId] = address(0);
        delegationTimestamp[tokenId] = 0;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function getRandomNumber() internal returns (bytes32 requestId) {
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
        return requestRandomness(keyHash, fee);
    }

    function fulfillRandomness(bytes32 requestId, uint256 randomness)
        internal
        override
    {
        randomNumber = randomness;
        announceWinners(randomness);
    }

    function adminWithdraw() public onlyOwner {
        require(block.timestamp > timeLock);
        currency.transfer(msg.sender, adminWithdrawableAmount);
    }
}
