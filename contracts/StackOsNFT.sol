//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "./DarkMatter.sol";
import "./interfaces/IStackOsNFT.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "./Exchange.sol";


contract StackOsNFT is VRFConsumerBase, ERC721, Whitelist {
    using Counters for Counters.Counter;
    using SafeMath for uint256;
    using Strings for uint256;

    event SetBaseURI(string uri);
    event AdjustAddressSettings(
        address genManager, 
        address stableAcceptor,
        address stackToken,
        address darkMatter,
        address exchange
    );
    event StakeForTickets(
        address indexed participant, 
        uint256 ticketAmount,
        uint256 latestTicketID
    );
    event AnnounceLottery(bytes32 requestId);
    event ChangeTicketStatus();
    event ClaimReward(
        address indexed participant,
        uint256[] ticketIDs
    );
    event ReturnStake(
        address indexed participant,
        uint256[] ticketIDs
    );
    event TransferTicket(
        address indexed participant, 
        uint256[] ticketIDs, 
        address nextGenerationAddress, 
        uint256 stackTransfered
    );
    event WhitelistPartner(
        address indexed partner, 
        uint256 amount
    );
    event StartPartnerSales();
    event ActivateLottery();
    event PlaceBid(
        address indexed bider, 
        uint256 amount, 
        uint256 placeInAuction
    );
    event AdminWithdraw(address admin, uint256 withdrawAmount);

    enum TicketStatus {
        None,
        Won,
        Rewarded,
        Withdrawn
    }

    Counters.Counter private _tokenIdCounter;
    IERC20 private stackToken;
    DarkMatter private darkMatter;
    Exchange exchange;
    GenerationManager private generations;
    StableCoinAcceptor stableAcceptor;
    Royalty royaltyAddress;

    uint256[] public winningTickets;
    uint256 public immutable timeLock;
    uint256 public randomNumber;
    uint256 public immutable auctionedNFTs;
    uint256 public adminWithdrawableAmount;
    uint256 private immutable maxSupply;
    uint256 public totalSupply;
    uint256 private immutable participationFee;
    uint256 public participationTickets;
    uint256 private immutable prizes;
    uint256 internal constant fee = 1e14; // 0.0001 (1e14) on MATIC, 0.1 (1e17) on eth

    mapping(uint256 => address) public ticketOwner;
    mapping(uint256 => uint256) public shuffle;
    mapping(uint256 => TicketStatus) public ticketStatus;
    mapping(uint256 => uint256) public topBids;
    mapping(uint256 => address) public topBiders;
    mapping(address => uint256) private strategicPartner;

    bool private auctionFinalized;
    bool private ticketStatusAssigned;
    bool private salesStarted;
    bool private lotteryActive;
    string private baseURI;
    bytes32 internal immutable keyHash;

    constructor(
        string memory _name,
        string memory _symbol,
        address _vrfCoordinator,
        address _link,
        uint256 _participationFee,
        uint256 _maxSupply,
        uint256 _prizes,
        uint256 _auctionedNFTs,
        bytes32 _keyHash,
        uint256 _timeLock,
        address _royaltyAddress
    )
        ERC721(_name, _symbol)
        VRFConsumerBase(
            _vrfCoordinator,
            _link
        )
    {
        participationFee = _participationFee;
        maxSupply = _maxSupply;
        prizes = _prizes;
        keyHash = _keyHash;
        auctionedNFTs = _auctionedNFTs;
        timeLock = block.timestamp + _timeLock;
        royaltyAddress = Royalty(payable(_royaltyAddress));
    }

    /*
     * @title Adjust address settings
     * @param address of GenerationManager 
     * @param address of StablecoinAcceptor
     * @param address of STACK token
     * @param address of DarkMatter
     * @param address of Exchange
     * @dev Could only be invoked by the contract owner.
     */

    function adjustAddressSettings(
        address _genManager, 
        address _stableAcceptor,
        address _stackToken,
        address _darkMatter,
        address _exchange
    )
        public
        onlyOwner
    {
        generations = GenerationManager(_genManager);
        stableAcceptor = StableCoinAcceptor(_stableAcceptor);
        stackToken = IERC20(_stackToken);
        darkMatter = DarkMatter(_darkMatter);
        exchange = Exchange(_exchange);
        emit AdjustAddressSettings(
            _genManager, 
            _stableAcceptor,
            _stackToken,
            _darkMatter,
            _exchange
        );
    }

    // Set baseURI that is used for new tokens
    function setBaseURI(string memory _uri) external onlyOwner {
        baseURI = _uri;
        emit SetBaseURI(_uri);
    }

    /*
     * @title Get max supply
     */
    function getMaxSupply() external view returns (uint256) {
        return maxSupply;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    /*
     * @title Wallets choose how many tickets they want to stake for.
     * @title Each ticket has a number which can be selected in the lottery.
     * @param Amount of tickets you stake for.
     * @dev Lottery has to be active.
     * @dev Don't try to get too much, you may encounter 'ran out of gas' error.
     */

    function stakeForTickets(uint256 _ticketAmount) external {
        require(lotteryActive, "Lottery inactive");
        require(randomNumber == 0, "Random Number already assigned!");
        uint256 depositAmount = participationFee.mul(_ticketAmount);
        stackToken.transferFrom(msg.sender, address(this), depositAmount);
        uint256 desiredTotalTickets = participationTickets + _ticketAmount;
        for (uint256 i = participationTickets; i < desiredTotalTickets; i++) {
            ticketOwner[i] = msg.sender;
        }
        participationTickets += _ticketAmount;
        emit StakeForTickets(msg.sender, _ticketAmount, participationTickets - 1);
    }

    /*
     * @title Request a random number from chainlink!
     * @dev Could only be invoked by the contract owner.
     * @dev Has to have more tickets than the prizes will be given.
     */

    function announceLottery() external onlyOwner returns (bytes32 requestId) {
        require(randomNumber == 0, "Random Number already assigned!");
        require(participationTickets > prizes, "No enough participants.");
        requestId = getRandomNumber();
        emit AnnounceLottery(requestId);
    }

    function getRandomNumber() internal returns (bytes32 requestId) {
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK");
        return requestRandomness(keyHash, fee);
    }

    /*
     * @title Chainlink callback set's random number.
     */
     
    function fulfillRandomness(bytes32 , uint256 randomness)
        internal
        override
    {
        randomNumber = randomness;
    }

    /*
     * @title Get winning tickets, you able to call it multiple times to avoid gas error.
     * @param Amount of unique random numbers expected to receive.
     * @dev Could only be invoked by the contract owner.
     */

    function announceWinners(uint256 _amount) external onlyOwner {
        require(randomNumber != 0, "No random number");
        uint256 i = participationTickets - 1 - winningTickets.length;
        for (; 0 < _amount; _amount--) {
            if (winningTickets.length < prizes) {
                uint256 j = uint256(
                    keccak256(abi.encode(randomNumber + winningTickets.length))
                ) % i;

                if(shuffle[i] == 0) shuffle[i] = i;
                if(shuffle[j] == 0) shuffle[j] = j;
                (shuffle[i], shuffle[j]) = (shuffle[j], shuffle[i]);

                winningTickets.push(shuffle[i]);
                ticketStatus[shuffle[i]] = TicketStatus.Won;
                
                i --;
            } else break;
        }
    }

    /*
     * @title Once we change ticket assigned Status. People will be start being able to withdraw and claim their NFT.
     * @title Assigns admin withdrawable amount to the number of winning tickets multiplied by participation fee.
     * @dev Could only be invoked by the contract owner. All prizes have to be assigned.
     */

    function changeTicketStatus() external onlyOwner {
        require(ticketStatusAssigned == false, "Already Assigned.");
        require(winningTickets.length == prizes);
        ticketStatusAssigned = true;
        adminWithdrawableAmount += winningTickets.length.mul(participationFee);
        emit ChangeTicketStatus();
    }

    /*
     * @title Winning NFT tickets will be able to withdraw their NFT prize.
     * @param List of Ticket Numbers that were winners.
     */

    function claimReward(uint256[] calldata _ticketIDs) external {
        require(ticketStatusAssigned == true, "Not Assigned Yet!");
        for (uint256 i; i < _ticketIDs.length; i++) {
            require(
                ticketOwner[_ticketIDs[i]] == msg.sender,
                "Not your ticket."
            );
            require(
                ticketStatus[_ticketIDs[i]] == TicketStatus.Won, 
                "Awarded Or Not Won"
            );
            ticketStatus[_ticketIDs[i]] = TicketStatus.Rewarded;
            mint(msg.sender);
        }
        emit ClaimReward(msg.sender, _ticketIDs);
    }

    /*
     * @title Tickets that didn't win will be able to withdraw their stake.
     * @param List of Ticket Numbers that did not win.
     */

    function returnStake(uint256[] calldata _ticketIDs) external {
        require(ticketStatusAssigned == true, "Not Assigned Yet!");
        for (uint256 i; i < _ticketIDs.length; i++) {
            require(
                ticketOwner[_ticketIDs[i]] == msg.sender,
                "Not your ticket."
            );

            require(
                ticketStatus[_ticketIDs[i]] == TicketStatus.None,
                "Stake Not Returnable"
            );
            ticketStatus[_ticketIDs[i]] = TicketStatus.Withdrawn;
        }
        stackToken.transfer(
            msg.sender,
            _ticketIDs.length.mul(participationFee)
        );
        emit ReturnStake(msg.sender, _ticketIDs);
    }

    /*
     * @title Transfer out stake to the next generation, and receive a bonus.
     * @param List of Ticket Numbers that are transferable.
     * @param StackNFT generation address.
     */

    function transferTicket(uint256[] calldata _ticketIDs, address _address)
        external
    {
        require(generations.isAdded(_address), "Wrong stack contract");
        require(ticketStatusAssigned == true, "Not Assigned Yet!");
        for (uint256 i; i < _ticketIDs.length; i++) {
            require(
                ticketOwner[_ticketIDs[i]] == msg.sender,
                "Not your ticket."
            );
            require(
                ticketStatus[_ticketIDs[i]] == TicketStatus.None,
                "Stake Not Returnable"
            );
            ticketStatus[_ticketIDs[i]] = TicketStatus.Withdrawn;
        }
        uint256 amount = _ticketIDs.length.mul(participationFee);
        stackToken.approve(_address, amount);
        IStackOsNFTBasic(_address).transferFromLastGen(msg.sender, amount);
        emit TransferTicket(msg.sender, _ticketIDs, _address, amount);
    }

    /*
     * @title Whitelist an address that will be able to do strategy purchase.
     * @param Address of the partner.
     * @param Number of tokens will be able to mint.
     * @dev Could only be invoked by the contract owner.
     */

    function whitelistPartner(address _address, uint256 _amount)
        external
        onlyOwner
    {
        strategicPartner[_address] = _amount;
        emit WhitelistPartner(_address, _amount);
    }

    /*
     * @title Start partner sales.
     * @dev Could only be invoked by the contract owner.
     */

    function startPartnerSales() external onlyOwner {
        salesStarted = true;
        emit StartPartnerSales();
    }

    /*
     * @title Allow wallets to start staking for lottery tickets.
     * @dev Could only be invoked by the contract owner.
     */

    function activateLottery() external onlyOwner {
        lotteryActive = true;
        emit ActivateLottery();
    }

    /*
     * @title Partner can mint a token amount that he has been allowed to mint.
     * @param Number of tokens to mint.
     * @dev Partner sales should be started before mint.
     */

    function partnerMint(uint256 _nftAmount) external {
        require(salesStarted, "Sales not started");
        require(strategicPartner[msg.sender] >= _nftAmount, "Amount Too Big");

        for (uint256 i; i < _nftAmount; i++) {
            strategicPartner[msg.sender]--;
            mint(msg.sender);
        }
    }

    /*
     * @title Place bid on auction.
     * @param Amount of stack token to place.
     * @dev Could only be invoked when the auction is open.
     */

    function placeBid(uint256 _amount) external returns (uint256 i) {
        require(auctionFinalized == false, "Auction closed!");
        require(topBids[1] < _amount, "Bid too small");
        stackToken.transferFrom(msg.sender, address(this), _amount);
        for (i = auctionedNFTs; i != 0; i--) {
            if (topBids[i] < _amount) {
                for (uint256 b; b < i; b++) {
                    if (b == 0 && topBids[b + 1] != 0) {
                        stackToken.transfer(
                            topBiders[b + 1],
                            topBids[b + 1]
                        );
                        adminWithdrawableAmount -= topBids[b + 1];
                    }
                    topBids[b] = topBids[b + 1];
                    topBiders[b] = topBiders[b + 1];
                }
                topBids[i] = _amount;
                adminWithdrawableAmount += _amount;
                topBiders[i] = msg.sender;
                break;
            }
        }
        emit PlaceBid(msg.sender, _amount, i);
    }

    /*
     * @title Finalize auction and mint NFT for top biders.
     * @dev Could only be invoked by the contract owner.
     * @dev Shouldn't be already finalized.
     */

    function finalizeAuction() external onlyOwner {
        require(auctionFinalized == false, "Auction Already Finalized");
        auctionFinalized = true;
        for (uint256 i = 1; i <= auctionedNFTs; i++) {
            if (topBiders[i] != address(0)) {
                mint(topBiders[i]);
            }
        }
    }

    function mint(address _address) internal {
        require(totalSupply < maxSupply, "Max supply reached");
        uint256 _current = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        totalSupply += 1;
        _safeMint(_address, _current);
        if(
            totalSupply == maxSupply &&
            generations.getIDByAddress(address(this)) == generations.count()-1
        ) {
            generations.autoDeployNextGeneration();
        }
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) 
        internal
        override(ERC721)
        onlyWhitelisted
    {
        super._transfer(from, to, tokenId);
    }

    /**
     * @dev Returns URI in a form of "baseURI + generationId/tokenId".
     * @dev BaseURI should have slash at the end.
     */
    function tokenURI(uint256 tokenId) 
        public 
        view 
        virtual 
        override(ERC721)
        returns (string memory) 
    {
        require(_exists(tokenId), "URI query for nonexistent token");

        string memory baseURI_ = _baseURI();
        string memory generationId = 
            generations.getIDByAddress(address(this)).toString();

        return bytes(baseURI_).length > 0 ?
            string(abi.encodePacked(baseURI_, generationId, "/", tokenId.toString())) :
            "";
    }

    function _burn(uint256 tokenId)
        internal
        override(ERC721)
    {
        super._burn(tokenId);
    }

    /*
     * @title Contract owner can withdraw collected fees.
     * @dev Caller must be contract owner, timelock should be passed.
     * @dev Tickets statuses must be assigned.
     */
    function adminWithdraw() external onlyOwner {
        require(block.timestamp > timeLock, "Locked!");
        require(ticketStatusAssigned == true, "Not Assigned.");
        emit AdminWithdraw(msg.sender, adminWithdrawableAmount);
        stackToken.transfer(msg.sender, adminWithdrawableAmount);
        adminWithdrawableAmount = 0;
    }
}
