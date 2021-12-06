//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StableCoinAcceptor {

    IERC20[] public stablecoins;

    constructor(
    ) {
        stablecoins.push(IERC20(0xB678B953dD909a4386ED1cA7841550a89fb508cc));
        stablecoins.push(IERC20(0x6Aea593F1E70beb836049929487F7AF3d5e4432F));
        stablecoins.push(IERC20(0x89842f40928f81FC4415b39bfBFC3205eB6161cB));
    }

    /*
     * @title Whether or not provided stablecoin is supported.
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
