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
        None,
        Won,
        Rewarded,
        Withdrawn
    }

    Counters.Counter private _tokenIdCounter;
    IERC20 private stackOSToken;

    uint256 private maxSupply;
    uint256 private totalSupply;
    uint256 private participationFee;
    uint256 private participationTickets;
    uint256 private prizes;
    uint256 public randomNumber;
    uint256 internal fee;
    uint256 public timeLock;
    uint256 internal adminWithdrawableAmount;
    uint256 private totalDelegators;
    uint256 public auctionCloseTime;
    uint256[] public winningTickets;

    mapping(uint256 => address) public ticketOwner;
    mapping(uint256 => TicketStatus) public ticketStatus;
    mapping(address => mapping(bool => uint256)) internal strategicPartner;
    mapping(uint256 => uint256) private delegationTimestamp;
    mapping(uint256 => address) private delegates;
    mapping(uint256 => uint256) public top10Bids;
    mapping(uint256 => address) public top10Biders;
    mapping(address => uint256) public bidderBalance;

    bool public ticketStatusAssigned;
    bool private salesStarted;
    bool private lotteryActive;
    string private URI;
    bytes32 internal keyHash;

    constructor(
        string memory _name,
        string memory _symbol,
        IERC20 _stackOSTokenToken,
        uint256 _participationFee,
        uint256 _maxSupply,
        uint256 _prizes,
        string memory uriLink
    )
        ERC721(_name, _symbol)
        VRFConsumerBase(
            0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0, // VRF Coordinator
            0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 // LINK Token
        )
    {
        stackOSToken = _stackOSTokenToken;
        participationFee = _participationFee;
        maxSupply = _maxSupply;
        prizes = _prizes;
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
        return delegates[_tokenId];
    }

    function getDelegator(uint256 _tokenId) public view returns (address) {
        return ownerOf(_tokenId);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    // Next generation ticket multiplier. The multiplier will only take effect if NFT 1 gen is sent to NFT 2

    // Strategic Have to pay the same floor price , but must be whitelisted.
    function stakeForTickets(uint256 _ticketAmount) public {
        require(lotteryActive, "Lottery inactive");
        require(randomNumber == 0, "Random Number already assigned!");
        uint256 depositAmount = participationFee.mul(_ticketAmount);
        stackOSToken.transferFrom(msg.sender, address(this), depositAmount);
        uint256 nextTicketID = participationTickets;
        for (uint256 i; i < _ticketAmount; i++) {
            ticketOwner[nextTicketID] = msg.sender;
            nextTicketID++;
        }
        participationTickets += _ticketAmount;
    }

    function announceLottery() public onlyOwner {
        require(randomNumber == 0, "Random Number already assigned!");
        require(participationTickets > 10, "No enough participants.");
        getRandomNumber();
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
    }

    function announceWinners() public onlyOwner {
        require(winningTickets.length == 0, "Already Announced");
        uint256 runs = prizes;
        for (uint256 i; i < prizes; i++) {
            uint256 nr = uint256(keccak256(abi.encode(randomNumber + i))) %
                participationTickets;
            bool hasDuplicate;
            for (uint256 b; b < winningTickets.length; b++) {
                if (winningTickets[b] == nr) {
                    hasDuplicate = true;
                }
            }
            if (hasDuplicate == false) {
                winningTickets.push(nr);
            } else {
                runs++;
            }
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
                revert("Ticket Did not win or awarded already!");
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
        stackOSToken.transfer(
            msg.sender,
            _ticketID.length.mul(participationFee)
        );
    }

    function whitelistPartner(
        address _address,
        bool _whitelist,
        uint256 _amount
    ) public onlyOwner {
        strategicPartner[_address][_whitelist] = _amount;
    }

    function startPartnerSales() public onlyOwner {
        salesStarted = true;
    }

    function activateLottery() public onlyOwner {
        lotteryActive = true;
    }

    function adjustAuctionCloseTime(uint256 _time) public onlyOwner {
        auctionCloseTime = _time;
    }

    function partnerMint(uint256 _nftAmount) public {
        require(salesStarted, "Sales not started");
        require(
            strategicPartner[msg.sender][true] >= _nftAmount,
            "Amount Too Big"
        );
        stackOSToken.transferFrom(
            msg.sender,
            address(this),
            participationFee.mul(_nftAmount)
        );
        adminWithdrawableAmount += participationFee.mul(_nftAmount);
        for (uint256 i; i < _nftAmount; i++) {
            strategicPartner[msg.sender][true]--;
            mint(msg.sender);
        }
    }

    // Auction
    function placeBid(uint256 _amount) public returns (uint256 i) {
        require(block.timestamp < auctionCloseTime, "Auction closed!");
        stackOSToken.transferFrom(msg.sender, address(this), _amount);
        for (i = 10; i != 0; i--) {
            if (top10Bids[i] < _amount) {
                if (i > 1) {
                    for (uint256 b; b < i; b++) {
                        if (b == 0 && top10Bids[b + 1] != 0) {
                            stackOSToken.transfer(
                                top10Biders[b + 1],
                                top10Bids[b + 1]
                            );
                            adminWithdrawableAmount -= top10Bids[b + 1];
                        }
                        top10Bids[b] = top10Bids[b + 1];
                        top10Biders[b] = top10Biders[b + 1];
                    }
                }
                top10Bids[i] = _amount;
                adminWithdrawableAmount += _amount;
                top10Biders[i] = msg.sender;
                return i;
            }
        }
    }

    function finalizeAuction() public onlyOwner {
        require(block.timestamp > auctionCloseTime, "Auction still ongoing.");
        for (uint256 i = 1; i < 10; i++) {
            if (top10Biders[i] != address(0)) {
                mint(top10Biders[i]);
            }
        }
    }

    function delegate(address _delegatee, uint256 tokenId) public {
        require(msg.sender != address(0), "Delegate to address-zero");
        require(msg.sender == ownerOf(tokenId), "Not owner");
        require(delegates[tokenId] == address(0), "Already delegated");
        delegates[tokenId] = _delegatee;
        if (delegationTimestamp[tokenId] == 0) totalDelegators += 1;
        delegationTimestamp[tokenId] = block.timestamp;
    }

    function mint(address _address) internal {
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
        delegates[tokenId] = address(0);
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

    function adminWithdraw() public onlyOwner {
        require(block.timestamp > timeLock);
        // console.log("0.", adminWithdrawableAmount / 10**17);
        stackOSToken.transfer(msg.sender, adminWithdrawableAmount);
    }
}
