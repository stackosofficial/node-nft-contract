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
    event SetMinEthPerCycle(uint256 amount);

    Counters.Counter public counter; // counting cycles

    uint256 private constant HUNDRED_PERCENT = 10000;
    GenerationManager private immutable generations;
    DarkMatter private immutable darkMatter;
    Exchange private immutable exchange;
    IERC20 private WETH; // for Matic network
    address payable private feeAddress;
    IERC20 private stackToken;
    uint256 private feePercent;

    uint256 public minEthPerCycle;
    uint256 public constant CYCLE_DURATION = 30 days;

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
        // per generation balance
        mapping(uint256 => GenData) genData; 
    }

    mapping(uint256 => Cycle) public cycles; 
    // generationId => total maxSupply of generations below plus this one
    mapping(uint256 => uint256) public maxSupplys; 

    constructor(
        GenerationManager _generations,
        DarkMatter _darkMatter,
        Exchange _exchange,
        address payable _feeAddress,
        IERC20 _stackToken,
        uint256 _minEthPerCycle
    ) {
        generations = _generations;
        darkMatter = _darkMatter;
        exchange = _exchange;
        feeAddress = _feeAddress;
        stackToken = _stackToken;
        minEthPerCycle = _minEthPerCycle;

        cycles[counter.current()].startTimestamp = block.timestamp;
    }

    /** 
     * @notice Deposit royalty so that NFT holders can claim it later.
     * @notice Deposits to the latest generation at this time,
     *         so that any generation below can claim that.
     */
    receive() external payable {

        uint256 generationId = generations.count() - 1;

        // take fee from deposits
        uint256 feePart = msg.value * feePercent / HUNDRED_PERCENT;
        uint256 valuePart = msg.value - feePart;

        updateCycle();

        // console.log(valuePart, counter.current());

        cycles[counter.current()].totalBalance += valuePart;
        cycles[counter.current()].genData[generationId].balance += valuePart;

        (bool success, ) = feeAddress.call{value: feePart}("");
        require(success, "Transfer failed.");
    }

    /**
     * @notice Deposit royalty so that NFT holders can claim it later.
     * @notice To be called by Market contract.
     */
    function onReceive(uint256 generationId) external payable nonReentrant {
        require(generationId < generations.count(), "Wrong generationId");

        // take fee from deposits
        uint256 feePart = msg.value * feePercent / HUNDRED_PERCENT;
        uint256 valuePart = msg.value - feePart;

        updateCycle();

        console.log("onReceive", generationId, counter.current(), valuePart);
        cycles[counter.current()].totalBalance += valuePart;
        cycles[counter.current()].genData[generationId].balance += valuePart;

        (bool success, ) = feeAddress.call{value: feePart}("");
        require(success, "Transfer failed.");
    }

    function updateCycle() private {
        // is current cycle lasts enough?
        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            // is current cycle got enough ether?
            if (cycles[counter.current()].totalBalance >= minEthPerCycle) {
                // start new cycle
                counter.increment();
                cycles[counter.current()].startTimestamp = block.timestamp;
            }
        }
    }

    function onGenerationAdded(
        uint256 generationId, 
        address stack
    ) external {
        require(address(msg.sender) == address(generations));
        if(generationId == 0) {
            maxSupplys[generationId] = IStackOsNFT(stack).getMaxSupply();
        } else {
            maxSupplys[generationId] =
                maxSupplys[generationId - 1] + IStackOsNFT(stack).getMaxSupply();
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
     * @title Set WETH address
     * @param WETH address
     * @dev Could only be invoked by the contract owner.
     */
    function setWETH(IERC20 _WETH) external onlyOwner {
        require(address(_WETH) != address(0), "Must be not zero-address");
        WETH = _WETH;
        emit SetWETH(_WETH);
    }

    /**
     * @notice Set minimum eth needed to end cycle
     * @param amount Amount eth
     * @dev Could only be invoked by the contract owner.
     */
    function setMinEthPerCycle(uint256 amount) external onlyOwner {
        require(amount > 0);
        minEthPerCycle = amount;
        emit SetMinEthPerCycle(amount);
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

    /**
     * @notice Claim royalty for holding tokens
     * @param _generationId Generation id of tokens to claim royalty
     * @param _tokenIds Token ids who will claim royalty
     * @param _cycleIds Cycle ids to claim royalties
     * @param _genIds Ids of generations to claim royalties
     * @dev Tokens must be owned by the caller
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
     * @dev Tokens must be owned by the caller
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

    /**
     * @notice Purchase StackNFTs for royalties
     * @notice Caller will receive the left over amount of royalties as STACK tokens
     * @param _generationId Generation id to claim royalty for and purchase, should be greater than 0
     * @param _tokenIds Token ids that can claim royalty 
     * @param _mintNum Amount to mint
     * @param _cycleIds Cycle ids to claim royalties
     * @param _genIds Ids of generations to claim royalties
     * @dev Tokens must be owned by the caller
     * @dev `_generationId` should be greater than 0
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

        updateCycle();

        if (counter.current() > 0) {
            uint256 reward;

            // iterate over tokens from args
            for (uint256 i; i < tokenIds.length; i++) {
                
                // console.log("tokenId claim ", tokenIds[i]);
                require(
                    darkMatter.isOwnStackOrDarkMatter(
                        msg.sender,
                        generationId,
                        tokenIds[i]
                    ),
                    "Not owner"
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

                    // console.log("MINT:", _mintNum);
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
        for (uint256 o; o < _cycleIds.length; o++) {
            uint256 cycleId = _cycleIds[o];
            require(cycleId < counter.current(), "Bad cycle id");

            for (uint256 j; j < _genIds.length; j++) {
                require(_genIds[j] >= generationId, "Bad gen id");
                require(_genIds[j] < generations.count(), "genId not exists");
                GenData storage genData = cycles[cycleId].genData[_genIds[j]];

                if (
                    genData.balance > 0 &&
                    // verify reward is unclaimed
                    genData.isClaimed[generationId][tokenId] == false
                ) {
                    reward += genData.balance / maxSupplys[_genIds[j]];
                    genData.isClaimed[generationId][tokenId] = true;
                    // console.log(123, address(this).balance);
                }
                // console.log(cycleId, _genIds[j], genData.balance, reward);
            }
        }
    }

    /*
     * @title Get pending royalty for NFT
     * @param StackOS generation id 
     * @param Token ids
     */
    function pendingRoyalty(
        uint256 generationId,
        uint256[] calldata tokenIds
    ) external view returns (uint256 withdrawableRoyalty) {

        uint256 _counterCurrent = counter.current();
        if (
            cycles[counter.current()].startTimestamp + CYCLE_DURATION <
            block.timestamp
        ) {
            if (cycles[counter.current()].totalBalance >= minEthPerCycle) {
                _counterCurrent += 1;
            }
        }

        if (_counterCurrent > 0) {
            uint256 reward;

            // iterate over tokens from args
            for (uint256 i; i < tokenIds.length; i++) {
                uint256 tokenId = tokenIds[i];

                for (uint256 o; o < _counterCurrent; o++) {
                    // id is zero-based, that's why <=
                    for (uint256 j; j <= generationId; j++) {
                        if (
                            cycles[o].genData[j].balance > 0 &&
                            // verify reward is unclaimed
                            cycles[o].genData[j].isClaimed[generationId][tokenId] == false
                        ) {
                            reward += cycles[o].genData[j].balance / maxSupplys[j];
                            // console.log("pending", 
                            // o, j,
                            // reward / 1e18);
                        }
                    }
                }
            }

            withdrawableRoyalty = reward;
        }
    }
}
