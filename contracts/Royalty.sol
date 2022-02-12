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
// import "hardhat/console.sol";

contract Royalty is Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    event SetFeeAddress(address payable _feeAddress);
    event SetWETH(IERC20 WETH);
    event SetFeePercent(uint256 _percent);
    event SetMinEthPerCycle(uint256 amount);
    event NewCycle(uint256 newCycleId);
    event SetCycleDuration(uint256 _seconds);

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
    uint256 public cycleDuration = 30 days;

    uint256 public adminWithdrawable;

    struct GenData {
        // total received by each generation in cycle
        uint256 balance;
        // whether reward for this token in this cycle for this generation is claimed
        mapping(uint256 => mapping(uint256 => bool)) isClaimed; 
    }

    struct Cycle {
        // cycle started timestamp
        uint256 startTimestamp; 
        // this is used in admin withdrawable
        // and for cycle ending condition
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


        // console.log("receive", generationId, counter.current(), valuePart);

        cycles[counter.current()].totalBalance += valuePart;
        cycles[counter.current()].genData[generationId].balance += valuePart;

        (bool success, ) = feeAddress.call{value: feePart}("");
        require(success, "Transfer failed.");
    }

    /**
     * @notice Deposit royalty so that NFT holders can claim it later.
     * @param generationId Which generation balance receives royalty.
     */
    function onReceive(uint256 generationId) external payable nonReentrant {
        require(generationId < generations.count(), "Wrong generationId");

        // take fee from deposits
        uint256 feePart = msg.value * feePercent / HUNDRED_PERCENT;
        uint256 valuePart = msg.value - feePart;

        updateCycle();

        // console.log("onReceive", generationId, counter.current(), valuePart);
        cycles[counter.current()].totalBalance += valuePart;
        cycles[counter.current()].genData[generationId].balance += valuePart;

        (bool success, ) = feeAddress.call{value: feePart}("");
        require(success, "Transfer failed.");
    }

    function updateCycle() private {
        // is current cycle lasts enough?
        if (
            cycles[counter.current()].startTimestamp + cycleDuration <
            block.timestamp
        ) {
            // is current cycle got enough ether?
            if (cycles[counter.current()].totalBalance >= minEthPerCycle) {
                // start new cycle
                counter.increment();
                cycles[counter.current()].startTimestamp = block.timestamp;

                if(counter.current() > 3) {
                    // subtract 4 because need to ignore current cycle + 3 cycles before it
                    uint256 removeIndex = counter.current() - 4;
                    adminWithdrawable += cycles[removeIndex].totalBalance;
                    // console.log("adminWithdrawable: %s, added: %s", adminWithdrawable, cycles[removeIndex].totalBalance);
                    cycles[removeIndex].totalBalance = 0;
                }

                emit NewCycle(counter.current());
            }
        }
    }

    function genDataBalance(
        uint256 cycleId,
        uint256 generationFeeBalanceId
    ) 
        external 
        view
        returns (uint256) 
    {
        return cycles[cycleId].genData[generationFeeBalanceId].balance;
    }

    function isClaimed(
        uint256 cycleId,
        uint256 generationFeeBalanceId,
        uint256 generationId,
        uint256 tokenId
    ) 
        external 
        view
        returns (bool) 
    {
        return cycles[cycleId]
                .genData[generationFeeBalanceId]
                    .isClaimed[generationId][tokenId];
    }

    /**
     * @dev Save total max supply of all preveious generations + added one. 
     */
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

    /**
     * @notice Set cycle duration.
     * @dev Could only be invoked by the contract owner.
     */
    function setCycleDuration(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Must be not zero");
        cycleDuration = _seconds;
        emit SetCycleDuration(_seconds);
    }   

    /**
     * @notice Set fee address.
     * @notice Fee transfered when contract receives new royalties.
     * @param _feeAddress Fee address.
     * @dev Could only be invoked by the contract owner.
     */
    function setFeeAddress(address payable _feeAddress) external onlyOwner {
        require(_feeAddress != address(0), "Must be not zero-address");
        feeAddress = _feeAddress;
        emit SetFeeAddress(_feeAddress);
    }    

    /**
     * @notice Set WETH address.
     * @notice Used to claim royalty in weth instead of matic.
     * @param _WETH WETH address.
     * @dev Could only be invoked by the contract owner.
     */
    function setWETH(IERC20 _WETH) external onlyOwner {
        require(address(_WETH) != address(0), "Must be not zero-address");
        WETH = _WETH;
        emit SetWETH(_WETH);
    }

    /**
     * @notice Set minimum eth needed to end cycle.
     * @param amount Amount of eth.
     * @dev Could only be invoked by the contract owner.
     */
    function setMinEthPerCycle(uint256 amount) external onlyOwner {
        require(amount > 0);
        minEthPerCycle = amount;
        emit SetMinEthPerCycle(amount);
    }

    /**
     * @notice Set fee percent taken everytime royalties recieved.
     * @param _percent Fee basis points.
     * @dev Could only be invoked by the contract owner.
     */
    function setFeePercent(uint256 _percent) external onlyOwner {
        require(feePercent <= HUNDRED_PERCENT, "invalid fee basis points");
        feePercent = _percent;
        emit SetFeePercent(_percent);
    }

    /**
     * @notice Claim royalty for tokens.
     * @param _generationId Generation id of tokens that will claim royalty.
     * @param _tokenIds Token ids who will claim royalty.
     * @param _genIds Ids of generation balances to claim royalties.
     * @dev Tokens must be owned by the caller.
     * @dev When generation tranded on market, fee is transfered to
     *      dedicated balance of this generation in royalty contract (_genIds).
     *      Then tokens that have lower generation id can claim part of this.
     *      So token of generation 1 can claim from genId 1,2,3.
     *      But token of generation 5 can't claim from genId 1.
     */
    function claim(
        uint256 _generationId, 
        uint256[] calldata _tokenIds,
        uint256[] calldata _genIds
    )
        external
    {
        _claim(_generationId, _tokenIds, 0, false, _genIds);
    }

    /**
     * @notice Same as `claim` but caller receives WETH.
     * @dev WETH address must be set in the contract.
     */
    function claimWETH(
        uint256 _generationId, 
        uint256[] calldata _tokenIds,
        uint256[] calldata _genIds
    )
        external
    {
        require(address(WETH) != address(0), "Wrong WETH address");
        _claim(_generationId, _tokenIds, 0, true, _genIds);
    }

    /**
     * @notice Purchase StackNFTs for royalties.
     * @notice Caller will receive the left over amount of royalties as STACK tokens.
     * @param _generationId Generation id to claim royalty and purchase, should be greater than 0.
     * @param _tokenIds Token ids that claim royalty.
     * @param _mintNum Amount to mint.
     * @param _genIds Ids of generation balances to claim royalties.
     * @dev Tokens must be owned by the caller.
     * @dev `_generationId` should be greater than 0.
     * @dev See `claim` function description for info on `_genIds`.
     */
    function purchaseNewNft(
        uint256 _generationId,
        uint256[] calldata _tokenIds,
        uint256 _mintNum,
        uint256[] calldata _genIds
    ) 
        external 
        nonReentrant 
    {
        require(_generationId > 0, "Must be not first generation");
        require(_mintNum > 0, "Mint num is 0");
        _claim(_generationId, _tokenIds, _mintNum, false, _genIds);
    }

    function _claim(
        uint256 generationId,
        uint256[] calldata tokenIds,
        uint256 _mintNum,
        bool _claimWETH,
        uint256[] calldata _genIds
    ) internal {
        require(_genIds.length > 0, "No gen ids");
        require(address(this).balance > 0, "No royalty");
        IStackOsNFTBasic stack = 
            IStackOsNFTBasic(address(generations.get(generationId)));

        updateCycle();

        // console.log("current cycle in _claim", counter.current());

        require(counter.current() > 0, "Still first cycle");

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

            reward += calcReward(generationId, tokenIds[i], _genIds);
        }

        require(reward > 0, "Nothing to claim");
        // console.log("reward claim:", reward);

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


            uint256 spendAmount = stack.mintFromRoyaltyRewards(
                _mintNum,
                msg.sender
            );
            // console.log("reward claim stack:", stackReceived, stackReceived - spendAmount);
            stackToken.transfer(msg.sender, stackReceived - spendAmount);
        }

    }

    function calcReward(
        uint256 generationId,
        uint256 tokenId,
        uint256[] calldata _genIds
    )   
        private 
        returns (uint256 reward) 
    {
        for (uint256 o = 1; o <= 3; o++) {
            uint256 cycleId = counter.current() - o;

            uint256 removeFromCycle;
            for (uint256 j; j < _genIds.length; j++) {
                require(_genIds[j] >= generationId, "Bad gen id");
                require(_genIds[j] < generations.count(), "genId not exists");
                GenData storage genData = cycles[cycleId].genData[_genIds[j]];

                if (
                    genData.balance > 0 &&
                    genData.isClaimed[generationId][tokenId] == false
                ) {
                    uint256 claimAmount = genData.balance / maxSupplys[_genIds[j]];
                    reward += claimAmount;
                    removeFromCycle += claimAmount;

                    genData.isClaimed[generationId][tokenId] = true;
                    // console.log(address(this).balance, maxSupplys[ _genIds[j]]);
                }
                // console.log(cycleId, _genIds[j], genData.balance, reward);
            }

            cycles[cycleId].totalBalance -= removeFromCycle;
            if(cycleId == 0) break;
        }
    }

    /**
     * @notice Get pending royalty for NFT.
     * @param generationId StackOS generation id.
     * @param tokenIds Token ids.
     * @return withdrawableRoyalty Total withdrawable royalty from all cycles and all balances.
     */
    function pendingRoyalty(
        uint256 generationId,
        uint256[] calldata tokenIds
    ) external view returns (uint256 withdrawableRoyalty) {
        require(generationId < generations.count(), "Wrong generation id");

        uint256 _counterCurrent = counter.current();
        if (
            cycles[counter.current()].startTimestamp + cycleDuration <
            block.timestamp
        ) {
            if (cycles[counter.current()].totalBalance >= minEthPerCycle) {
                _counterCurrent += 1;
            }
        }

        require(_counterCurrent > 0, "Still first cycle");
        uint256 reward;

        // iterate over tokens from args
        for (uint256 i; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];

            for (uint256 o = 1; o <= 3; o++) {
                uint256 cycleId = _counterCurrent - o;
                // console.log("pending", cycleId, _counterCurrent);
                // j is pool id, should be greater or equal than token generation
                for (uint256 j = generationId; j < generations.count(); j++) {

                    GenData storage genData = cycles[cycleId].genData[j];
                    if (
                        genData.balance > 0 &&
                        // verify reward is unclaimed
                        genData.isClaimed[generationId][tokenId] == false
                    ) {
                        reward += genData.balance / maxSupplys[j];
                    }
                }

                if(cycleId == 0) break;
            }
        }

        withdrawableRoyalty = reward;
    }

    function adminWithdraw()
        external
        onlyOwner
    {
        require(adminWithdrawable > 0, "Nothing to withdraw");
        (bool success, ) = payable(msg.sender).call{value: adminWithdrawable}(
            ""
        );
        require(success, "Transfer failed");
    }
}
