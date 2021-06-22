// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@prps/solidity/contracts/ProtectedBoostableLib.sol";
import "@prps/solidity/contracts/ProtectedBoostable.sol";
import "./CosBoostableLib.sol";

abstract contract Boostable is ProtectedBoostable {
    constructor(address optIn)
        public
        ProtectedBoostable(
            optIn,
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    keccak256("Clash Of Streamers"),
                    keccak256("1"),
                    _getChainId(),
                    address(this)
                )
            )
        )
    {}

    /**
     * @dev Tries to interpret the given boosterMessage and
     * return it's hash plus creation timestamp.
     *
     * Calls a public library function for bytecode size reasons.
     */
    function decodeAndHashBoosterMessage(
        address targetBooster,
        bytes memory boosterMessage
    ) external override view returns (bytes32, uint64) {
        return
            CosBoostableLib.decodeAndHashBoosterMessage(
                targetBooster,
                _DOMAIN_SEPARATOR,
                boosterMessage
            );
    }
}
