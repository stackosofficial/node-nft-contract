//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StableCoinAcceptor {

    IERC20[] public stablecoins;

    constructor(
        IERC20[] memory _stables
    ) {
        stablecoins = _stables;
        // stablecoins.push(IERC20(0xeb8f08a975Ab53E34D8a0330E0D34de942C95926));
        // stablecoins.push(IERC20(0xeb8f08a975Ab53E34D8a0330E0D34de942C95926));
        // stablecoins.push(IERC20(0xeb8f08a975Ab53E34D8a0330E0D34de942C95926));
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
