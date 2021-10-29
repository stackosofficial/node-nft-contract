//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "./interfaces/IStackOSNFT.sol";

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

    uint256[] public winningTickets;
    // SET TIMELOCK!
    uint256 public timeLock = block.timestamp + 60 minutes;
    uint256 public randomNumber;
    uint256 public auctionedNFTs;
    uint256 public auctionCloseTime;
    uint256 public adminWithdrawableAmount;
    uint256 private maxSupply;
    uint256 private totalSupply;
    uint256 private participationFee;
    uint256 private participationTickets;
    uint256 private prizes;
    uint256 private totalDelegated;
    uint256 private iterationCount;
    uint256 internal fee;

    mapping(uint256 => bool) public randomUniqueNumbers;
    mapping(uint256 => address) public ticketOwner;
    mapping(uint256 => TicketStatus) public ticketStatus;
    mapping(uint256 => uint256) public topBids;
    mapping(uint256 => address) public topBiders;
    mapping(uint256 => uint256) private delegationTimestamp;
    mapping(uint256 => address) private delegates;
    mapping(address => uint256) private strategicPartner;

    bool private auctionFinalized;
    bool private ticketStatusAssigned;
    bool private salesStarted;
    bool private lotteryActive;
    string private URI = "https://google.com/";
    bytes32 internal keyHash;

    constructor(
        string memory _name,
        string memory _symbol,
        IERC20 _stackOSTokenToken,
        uint256 _participationFee,
        uint256 _maxSupply,
        uint256 _prizes,
        uint256 _auctionedNFTs,
        address _vrfCoordinator,
        address _linkToken,
        bytes32 _keyHash,
        uint256 _fee
    )
        ERC721(_name, _symbol)
        VRFConsumerBase(
            _vrfCoordinator, // VRF Coordinator
            _linkToken // LINK Token
        )
    {
        stackOSToken = _stackOSTokenToken;
        participationFee = _participationFee;
        maxSupply = _maxSupply;
        prizes = _prizes;
        keyHash = _keyHash;
        fee = _fee;
        auctionedNFTs = _auctionedNFTs;
    }

    /*
     * @title Get total delegated NFTs.
     */

    function getTotalDelegated() public view returns (uint256) {
        return totalDelegated;
    }

    /*
     * @title Get timestamp of the block when token was delegated.
     * @dev Returns zero if token not delegated.
     */

    function getDelegationTimestamp(uint256 _tokenId)
        public
        view
        returns (uint256)
    {
        return delegationTimestamp[_tokenId];
    }

    /*
     * @title Get token's delegatee.
     * @dev Returns zero-address if token not delegated.
     */

    function getDelegatee(uint256 _tokenId) public view returns (address) {
        return delegates[_tokenId];
    }

    /*
     * @title Get token's owner.
     * @dev Token might be not delegated though.
     */

    function getDelegator(uint256 _tokenId) public view returns (address) {
        return ownerOf(_tokenId);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    /*
     * @title Wallets choose how many tickets they want to stake for.
     * @title Each ticket has a number which can can be selected in the lottery.
     * @param Amount on of tickets you stake for.
     * @dev Lottery has to be active
     */

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

    /*
     * @title Request a random number from chainlink!
     * @dev Could only be invoked by the contract owner.
     * @dev Has to have more tickets than the prizes will be given.
     */

    function announceLottery() public onlyOwner returns (bytes32 requestId) {
        require(randomNumber == 0, "Random Number already assigned!");
        require(participationTickets > prizes, "No enough participants.");
        requestId = getRandomNumber();
    }

    function getRandomNumber() internal returns (bytes32 requestId) {
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
        return requestRandomness(keyHash, fee);
    }

    /*
     * @title Chainlink callback set's random number.
     */

    function fulfillRandomness(bytes32 requestId, uint256 randomness)
        internal
        override
    {
        randomNumber = randomness;
    }

    /*
     * @title Request random numbers. Might have to call multiple times as not unique numbers will be ignored.
     * @param Amount of unique random numbers expected to receive.
     * @dev Could only be invoked by the contract owner.
     */

    function announceWinners(uint256 _numbers) public onlyOwner {
        for (uint256 i; i < _numbers; i++) {
            if (winningTickets.length < prizes) {
                uint256 nr = uint256(
                    keccak256(abi.encode(randomNumber + iterationCount))
                ) % participationTickets;
                iterationCount++;
                bool hasDuplicate;
                if (randomUniqueNumbers[nr] == true) {
                    hasDuplicate = true;
                }
                if (hasDuplicate == false) {
                    winningTickets.push(nr);
                    randomUniqueNumbers[nr] = true;
                }
            }
        }
    }

    /*
     * @title Map out the winning tickets.
     * @param From ID
     * @param To ID
     * @dev Could only be invoked by the contract owner.
     */

    function mapOutWinningTickets(uint256 _startingIndex, uint256 _endingIndex)
        public
        onlyOwner
    {
        require(winningTickets.length == prizes, "Not Decided Yet.");
        require(ticketStatusAssigned == false, "Already Assigned.");
        require(_endingIndex <= prizes);
        for (uint256 i = _startingIndex; i < _endingIndex; i++) {
            ticketStatus[winningTickets[i]] = TicketStatus.Won;
        }
    }

    /*
     * @title Once we change ticket assigned Status. People will be start being able to withdraw and claim their NFT
     * @title Assigns admin withdrawable amount == winning numbers.
     * @dev Could only be invoked by the contract owner. All prizes have to be assigned.
     */

    function changeTicketStatus() public onlyOwner {
        require(ticketStatusAssigned == false, "Already Assigned.");
        require(winningTickets.length == prizes);
        ticketStatusAssigned = true;
        adminWithdrawableAmount += winningTickets.length.mul(participationFee);
    }

    /*
     * @title Winning NFT tickets will be able to withdraw their NFT prize
     * @param List of Ticket Numbers that were winners.
     * @dev Could only be invoked by the contract owner.
     */

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
                revert("Awarded Or Not Won");
            }
        }
    }

    /*
     * @title Tickets that did not will be able to withdraw their stake.
     * @param List of Ticket Numbers that did not win.
     */

    function returnStake(uint256[] calldata _ticketID) public {
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
                revert("Stake Not Returnable");
            } else {
                ticketStatus[_ticketID[i]] = TicketStatus.Withdrawn;
            }
        }
        stackOSToken.transfer(
            msg.sender,
            _ticketID.length.mul(participationFee)
        );
    }

    /*
     * @title Transfer out stake to the next generation, and receive a bonus.
     * @param List of Ticket Numbers that are transferable.
     */

    function transferTicket(uint256[] calldata _ticketID, address _address)
        public
    {
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
                revert("Stake Not Returnable");
            } else {
                ticketStatus[_ticketID[i]] = TicketStatus.Withdrawn;
            }
        }
        uint256 amount = _ticketID.length.mul(participationFee);
        stackOSToken.approve(_address, amount);
        IStackOSNFT(_address).transferFromLastGen(msg.sender, amount);
    }

    /*
     * @title Whitelist and address that will be able to do strategy purchaise.
     * @param Address of the partner.
     * @param Whitelist - TRUE/FALSE
     * @param Number of tokens will be able to mint.
     */

    function whitelistPartner(
        address _address,
        uint256 _amount
    ) public onlyOwner {
        strategicPartner[_address] = _amount;
    }

    /*
     * @title Allow partners to buy NFT's
     */

    function startPartnerSales() public onlyOwner {
        salesStarted = true;
    }

    /*
     * @title Allow wallets to start staking for lottery tickets.
     */

    function activateLottery() public onlyOwner {
        lotteryActive = true;
    }

    /*
     * @title Adjust auction closing time.
     * @param Timestamp when it closes.
     * @dev Could only be invoked by the contract owner and when the auction has not been finalized.
     */

    function adjustAuctionCloseTime(uint256 _time) public onlyOwner {
        require(auctionFinalized == false, "Auction Already Finalized");
        auctionCloseTime = _time;
    }

    /*
     * @title Partner can mint a token amount that he has been allowed to mint. Partner sales have to be activated.
     * @param Number of tokens to mint.
     */

    function partnerMint(uint256 _nftAmount) public {
        require(salesStarted, "Sales not started");
        require(
            strategicPartner[msg.sender] >= _nftAmount,
            "Amount Too Big"
        );
        stackOSToken.transferFrom(
            msg.sender,
            address(this),
            participationFee.mul(_nftAmount)
        );
        adminWithdrawableAmount += participationFee.mul(_nftAmount);
        for (uint256 i; i < _nftAmount; i++) {
            strategicPartner[msg.sender] --;
            mint(msg.sender);
        }
    }

    /*
     * @title Place bid on auction.
     * @param Amount to place.
     * @dev Could only be invoked when the auction is open.
     */

    function placeBid(uint256 _amount) public returns (uint256 i) {
        require(block.timestamp < auctionCloseTime, "Auction closed!");
        require(topBids[1] < _amount, "Bid too small");
        stackOSToken.transferFrom(msg.sender, address(this), _amount);
        for (i = auctionedNFTs; i != 0; i--) {
            if (topBids[i] < _amount) {
                if (i > 1) {
                    for (uint256 b; b < i; b++) {
                        if (b == 0 && topBids[b + 1] != 0) {
                            stackOSToken.transfer(
                                topBiders[b + 1],
                                topBids[b + 1]
                            );
                            adminWithdrawableAmount -= topBids[b + 1];
                        }
                        topBids[b] = topBids[b + 1];
                        topBiders[b] = topBiders[b + 1];
                    }
                }
                topBids[i] = _amount;
                adminWithdrawableAmount += _amount;
                topBiders[i] = msg.sender;
                return i;
            }
        }
    }

    /*
     * @title Finalize auction and mint NFT for top biders.
     * @dev Could only be invoked by the contract owner, when auction out of time and not finalized.
     */

    function finalizeAuction() public onlyOwner {
        require(block.timestamp > auctionCloseTime, "Auction still ongoing.");
        require(auctionFinalized == false, "Auction Already Finalized");
        auctionFinalized = true;
        for (uint256 i = 1; i < 10; i++) {
            if (topBiders[i] != address(0)) {
                mint(topBiders[i]);
            }
        }
    }

    /*
     * @title Delegate NFT.
     * @param _delegatee Address of delegatee.
     * @param tokenId token id to delegate.
     * @dev Caller must be owner of NFT, caller and delegatee must not be zero-address.
     */

    function delegate(address _delegatee, uint256 tokenId) public {
        require(msg.sender != address(0), "Delegate is address-zero");
        require(msg.sender == ownerOf(tokenId), "Not owner");
        require(delegates[tokenId] == address(0), "Already delegated");
        delegates[tokenId] = _delegatee;
        if (delegationTimestamp[tokenId] == 0) totalDelegated += 1;
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
        totalDelegated -= 1;
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

    /*
     * @title Owner can withdraw collected fees.
     * @dev Caller must be contract owner, timelock should be passed.
     */
    function adminWithdraw() public onlyOwner {
        require(block.timestamp > timeLock, "Locked!");
        require(ticketStatusAssigned == false, "Already Assigned.");
        stackOSToken.transfer(msg.sender, adminWithdrawableAmount);
        adminWithdrawableAmount.sub(adminWithdrawableAmount);
    }
}
