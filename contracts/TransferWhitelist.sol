//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./DarkMatter.sol";
import "./GenerationManager.sol";
import "./StableCoinAcceptor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "hardhat/console.sol";

abstract contract TransferWhitelist {

    mapping(address => bool) _whitelist;

    function whitelist(address _addr) public {
        _whitelist[_addr] = true;
    }

    function isWhitelisted(address _addr) public view returns (bool) {
        return _whitelist[_addr];
    }
}
