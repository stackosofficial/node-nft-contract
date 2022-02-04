//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./GenerationManager.sol";
import "./DarkMatter.sol";
import "./interfaces/IStackOsNFT.sol";
import "./interfaces/IStackOsNFTBasic.sol";
import "./Exchange.sol";
import "hardhat/console.sol";

contract Royalty is Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    event SetFeeAddress(address payable _feeAddress);
    event SetWETH(IERC20 WETH);
    event SetFeePercent(uint256 _percent);

    Counters.Counter private counter; // counting cycles

    uint256 private constant HUNDRED_PERCENT = 10000;
    GenerationManager private immutable generations;
    DarkMatter private immutable darkMatter;
    Exchange private immutable exchange;
    IERC20 private WETH; // for Matic network
    address payable private feeAddress;
    IERC20 private stackToken;
    uint256 private feePercent;

    uint256 private minEthToStartCycle;
    uint256 private constant CYCLE_DURATION = 30 days;

    struct GenData {
        // total received by each generation in cycle
        uint256 balance;
        // whether reward for this token in this cycle for this generation is claimed
        mapping(uint256 => mapping(uint256 => bool)) isClaimed; 
    }

    struct Cycle {
        // cycle started timestamp
        uint256 startTimestamp; 
        // total received in cycle
        uint256 totalBalance; 
        // total delegated tokens when cycle started
        uint256 delegatedCount; 
        // per generation balance
        mapping(uint256 => GenData) genData; 
    }

    mapping(uint256 => Cycle) public cycles; 
    mapping(uint256 => mapping(uint256 => int256)) public addedAt; // at which cycle the token were added
    uint256 public totalDelegated;

    constructor(
        GenerationManager _generations,
        DarkMatter _darkMatter,
        Exchange _exchange,
        address payable _feeAddress,
        IERC20 _stackToken,
        uint256 _minEthToStartCycle
    ) {
        generations = _generations;
        darkMatter = _darkMatter;
        exchange = _exchange;
        feeAddress = _feeAddress;
        stackToken = _stackToken;
        minEthToStartCycle = _minEthToStartCycle;
    }

    /*
     * @title Callback called when Stack NFT is delegated.
     */
    function onDelegate(uint256 tokenId) public {
        require(
            generations.isAdded(msg.sender), 
            "Caller must be StackNFT contract"
        );
        uint256 generationId = generations.getIDByAddress(msg.sender);
        addedAt[generationId][tokenId] = int256(counter.current());
        if (cycles[counter.current()].delegatedCount == 0)
            addedAt[generationId][tokenId] = -1;
        totalDelegated += 1;
    }

    /*
     * @title Deposit royalty so that NFT holders can claim it later.
     */
    receive() external payable {
        checkDelegationsForFirstCycle();

        uint256 generationId = 0;

        // take fee from deposits
        uint256 feePart = msg.value * feePercent / HUNDRED_PERCENT;
        uint256 valuePart = msg.value - feePart;

        // is current cycle lasts enough?
        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            // is current cycle got enough ether?
            if (cycles[counter.current()].totalBalance >= minEthToStartCycle) {
                // start new cycle
                counter.increment();
                // save count of delegates that exists on start of cycle
                cycles[counter.current()].delegatedCount = totalDelegated;
                cycles[counter.current()].startTimestamp = block.timestamp;
            }
        }

        console.log(valuePart / 1e18, counter.current(), cycles[counter.current()].delegatedCount);

        cycles[counter.current()].totalBalance += valuePart;
        cycles[counter.current()].genData[generationId].balance += valuePart;

        (bool success, ) = feeAddress.call{value: feePart}("");
        require(success, "Transfer failed.");
    }

    /*
     * @title Deposit royalty so that NFT holders can claim it later.
     */
    function onReceive(uint256 generationId) external payable nonReentrant {
        checkDelegationsForFirstCycle();

        // take fee from deposits
        uint256 feePart = msg.value * feePercent / HUNDRED_PERCENT;
        uint256 valuePart = msg.value - feePart;

        // is current cycle lasts enough?
        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            // is current cycle got enough ether?
            if (cycles[counter.current()].totalBalance >= minEthToStartCycle) {
                // start new cycle
                counter.increment();
                // save count of delegates that exists on start of cycle
                cycles[counter.current()].delegatedCount = totalDelegated;
                cycles[counter.current()].startTimestamp = block.timestamp;
            }
        }
        
        cycles[counter.current()].totalBalance += valuePart;
        cycles[counter.current()].genData[generationId].balance += valuePart;

        (bool success, ) = feeAddress.call{value: feePart}("");
        require(success, "Transfer failed.");
    }

    /**
     * @dev Ensures that a cycle cannot start if there is no delegated StackOS NFTs.
     */
    function checkDelegationsForFirstCycle() private {
        // this should be true for the first cycle only, 
        // even if there is already delegates exists, this cycle still dont know about it
        if (cycles[counter.current()].delegatedCount == 0) {
            // we can't start first cycle without delegated NFTs, so with this we 'restart' first cycle,
            // this dont allow to end first cycle with perTokenReward = 0 and balance > 0
            cycles[counter.current()].startTimestamp = block.timestamp;
            /*
                The following check is need to prevent ETH hang on first cycle.
                If first ever delegation happens at the same block with receiving eth here,
                then no one can claim for the first cycle, because when claiming royalty
                there is check: tokenDelegationTime < cycleStartTime
            */
            if (totalDelegated > 0) {
                // we can still get 0 here, then in next ifs we will just receive eth for cycle
                cycles[counter.current()]
                    .delegatedCount = totalDelegated;
            }
        }
    }

    /*
     * @title Set fee address
     * @param fee address
     * @dev Could only be invoked by the contract owner.
     */
    function setFeeAddress(address payable _feeAddress) external onlyOwner {
        require(_feeAddress != address(0), "Must be not zero-address");
        feeAddress = _feeAddress;
        emit SetFeeAddress(_feeAddress);
    }    

    /*
     * @title Set WETH address, probably should be used on Matic network
     * @param WETH address
     * @dev Could only be invoked by the contract owner.
     */
    function setWETH(IERC20 _WETH) external onlyOwner {
        require(address(_WETH) != address(0), "Must be not zero-address");
        WETH = _WETH;
        emit SetWETH(_WETH);
    }

    /*
     * @title Set fee percent taken of each deposit
     * @param fee basis points
     * @dev Could only be invoked by the contract owner.
     */
    function setFeePercent(uint256 _percent) external onlyOwner {
        require(feePercent <= HUNDRED_PERCENT, "invalid fee basis points");
        feePercent = _percent;
        emit SetFeePercent(_percent);
    }

    /*
     * @title Claim royalty for holding delegated NFTs 
     * @param StackOS generation id 
     * @param Token ids
     * @dev tokens must be delegated and owned by the caller
     */
    function claim(
        uint256 _generationId, 
        uint256[] calldata _tokenIds,
        uint256[] calldata _cycleIds,
        uint256[] calldata _genIds
    )
        external
    {
        _claim(_generationId, _tokenIds, 0, false, _cycleIds, _genIds);
    }

    /*
     * @title Same as `claim` but holders receive WETH
     * @dev tokens must be delegated and owned by the caller
     * @dev WETH address must be set by the admin
     */
    function claimWETH(
        uint256 _generationId, 
        uint256[] calldata _tokenIds,
        uint256[] calldata _cycleIds,
        uint256[] calldata _genIds
    )
        external
    {
        require(address(WETH) != address(0), "Wrong WETH address");
        _claim(_generationId, _tokenIds, 0, true, _cycleIds, _genIds);
    }

    /*
     * @title Purchase StackNFTs for royalties, caller will receive the left over amount of royalties
     * @param StackNFT generation id
     * @param Token ids
     * @param Amount to mint
     * @param Supported stablecoin to use to buy stack token
     * @dev tokens must be delegated and owned by the caller
     */
    function purchaseNewNft(
        uint256 _generationId,
        uint256[] calldata _tokenIds,
        uint256 _mintNum,
        uint256[] calldata _cycleIds,
        uint256[] calldata _genIds
    ) 
        external 
        nonReentrant 
    {
        require(_generationId > 0, "Must be not first generation");
        require(_mintNum > 0, "Mint num is 0");
        _claim(_generationId, _tokenIds, _mintNum, false, _cycleIds, _genIds);
    }

    function _claim(
        uint256 generationId,
        uint256[] calldata tokenIds,
        uint256 _mintNum,
        bool _claimWETH,
        uint256[] calldata _cycleIds,
        uint256[] calldata _genIds
    ) internal {
        require(address(this).balance > 0, "No royalty");
        IStackOsNFTBasic stack = 
            IStackOsNFTBasic(address(generations.get(generationId)));
        require(
            stack.balanceOf(msg.sender) > 0 ||
                darkMatter.balanceOf(msg.sender) > 0,
            "You dont have NFTs"
        );

        checkDelegationsForFirstCycle();

        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            if (
                cycles[counter.current()].totalBalance >= minEthToStartCycle
            ) {
                counter.increment();
                cycles[counter.current()].delegatedCount = totalDelegated;
                cycles[counter.current()].startTimestamp = block.timestamp;
            }
        }

        console.log(counter.current());

        if (counter.current() > 0) {
            uint256 reward;

            // iterate over tokens from args
            for (uint256 i; i < tokenIds.length; i++) {

                require(
                    darkMatter.isOwnStackOrDarkMatter(
                        msg.sender,
                        generationId,
                        tokenIds[i]
                    ),
                    "Not owner"
                );
                require(
                    stack.getDelegatee(tokenIds[i]) != address(0),
                    "NFT should be delegated"
                );

                reward += calcReward(generationId, tokenIds[i], _cycleIds, _genIds);

            }

            if (reward > 0) {
                if (_mintNum == 0) {
                    if(_claimWETH) {
                        uint256 wethReceived = exchange.swapExactETHForTokens{value: reward}(WETH);
                        require(WETH.transfer(msg.sender, wethReceived), "WETH: transfer failed");
                    } else {
                        (bool success, ) = payable(msg.sender).call{value: reward}(
                            ""
                        );
                        require(success, "Transfer failed");
                    }
                } else {
                    uint256 stackReceived = 
                        exchange.swapExactETHForTokens{value: reward}(stackToken);
                    stackToken.approve(address(stack), stackReceived);

                    console.log("MINT:", _mintNum);
                    uint256 spendAmount = stack.mintFromRoyaltyRewards(
                        _mintNum,
                        msg.sender
                    );
                    stackToken.transfer(msg.sender, stackReceived - spendAmount);
                }
            }
        }
    }

    function calcReward(
        uint256 generationId,
        uint256 tokenId,
        uint256[] calldata _cycleIds,
        uint256[] calldata _genIds
    )   
        private 
        returns (uint256 reward) 
    {
        console.log("kek");
        for (uint256 o; o < _cycleIds.length; o++) {
            uint256 cycleId = _cycleIds[o];
            require(cycleId < counter.current(), "Bad cycle id");

            // verify token is delegated before this cycle start
            if(addedAt[generationId][tokenId] < int256(cycleId)) {
                for (uint256 j; j < _genIds.length; j++) {
                    require(_genIds[j] <= generationId, "Bad gen id");
                    GenData storage genData = cycles[cycleId].genData[_genIds[j]];

                    if (
                        genData.balance > 0 &&
                        // verify reward is unclaimed
                        genData.isClaimed[generationId][tokenId] == false
                    ) {
                        reward += genData.balance / cycles[cycleId].delegatedCount;
                        console.log(counter.current(), genData.balance, cycles[cycleId].delegatedCount, reward / 1e18);
                        genData.isClaimed[generationId][tokenId] = true;
                    }
                }
            }
        }
    }

    /*
     * @title Get pending royalty for NFT
     * @param StackOS generation id 
     * @param Token ids
     * @dev Not delegated tokens are ignored
     */
    function pendingRoyalty(
        uint256 generationId,
        uint256[] calldata tokenIds
    ) external view returns (uint256 withdrawableRoyalty) {
        IStackOsNFT stack = generations.get(generationId);

        uint256 _counterCurrent = counter.current();
        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            if (cycles[counter.current()].totalBalance >= minEthToStartCycle) {
                _counterCurrent += 1;
            }
        }

        if (_counterCurrent > 0) {
            uint256 reward;

            // iterate over tokens from args
            for (uint256 i; i < tokenIds.length; i++) {
                uint256 tokenId = tokenIds[i];

                if(stack.getDelegatee(tokenId) == address(0))
                    continue;

                for (uint256 o; o < _counterCurrent; o++) {
                    // verify token is delegated before this cycle start
                    if(addedAt[generationId][tokenId] < int256(o)) {
                        // id is zero-based, that's why <=
                        for (uint256 j; j <= generationId; j++) {
                            if (
                                cycles[o].genData[j].balance > 0 &&
                                // verify reward is unclaimed
                                cycles[o].genData[j].isClaimed[generationId][tokenId] == false
                            ) {
                                reward += cycles[o].genData[j].balance / cycles[o].delegatedCount;
                                console.log("pending", 
                                o, j,
                                reward / 1e18);
                            }
                        }
                    }
                }
            }

            withdrawableRoyalty = reward;
        }
    }
}
