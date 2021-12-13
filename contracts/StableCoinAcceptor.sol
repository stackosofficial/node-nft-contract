//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StableCoinAcceptor {

    IERC20[] public stablecoins;

    constructor(
    ) {
        stablecoins.push(IERC20(0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0));
        stablecoins.push(IERC20(0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9));
        stablecoins.push(IERC20(0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9));
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
