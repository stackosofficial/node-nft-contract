//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StableCoinAcceptor {

    IERC20[] public stablecoins;

    constructor(
        IERC20[] memory _stables
    ) {
        require(_stables.length > 0, "Empty data");
        for(uint256 i; i < _stables.length; i++) {
            require(
                address(_stables[i]) != address(0), 
                "Should not be zero-address"
            );
        }
        stablecoins = _stables;
    }

    /**
     * @notice Returns whether provided stablecoin is supported.
     * @param _address Address to lookup.
     */
    function supportsCoin(IERC20 _address) public view returns (bool) {
        uint256 len = stablecoins.length;
        for(uint256 i; i < len; i++) {
            if(_address == stablecoins[i]) {
                return true;
            }
        }
        return false;
    }
}
