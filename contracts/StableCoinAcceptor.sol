//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StableCoinAcceptor {

    IERC20[] public stablecoins;

    constructor(
    ) {
        stablecoins.push(IERC20(0x17cec3137787067579F20994C019e993Bb173B4C));
        stablecoins.push(IERC20(0xCb7F54729c739db4B88C012126caDaF57F3578D3));
        stablecoins.push(IERC20(0x67d5d249D8526f654899BaFE0dD0B7d7D27B5Aa3));
    }

    /*
     * @title Whether provided stablecoin is supported.
     * @param Address to lookup.
     */

    function supportsCoin(IERC20 _address) public view returns (bool) {
        for(uint256 i; i < stablecoins.length; i++) {
            if(_address == stablecoins[i]) {
                return true;
            }
        }
        return false;
    }
}
