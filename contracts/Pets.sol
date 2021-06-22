// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./CosToken.sol";

/**
 * @dev Pets contract
 */
contract Pets is CosToken {
    address internal immutable _heroesAddress;

    constructor(
        address optIn,
        address prps,
        address dubi,
        address hodl,
        address heroes,
        address externalAddress
    )
        public
        CosToken(
            "Clash of Streamers Pets",
            "PET",
            optIn,
            prps,
            dubi,
            hodl,
            externalAddress
        )
    {
        _heroesAddress = heroes;
    }

    function _applyMerge(
        UnpackedCollectible memory unpackedSource,
        UnpackedCollectible memory unpackedTarget
    ) internal override {}

    function _packCollectibleSpecific(
        UnpackedCollectible memory unpacked,
        uint256 packedData,
        uint256 offset
    ) internal override pure returns (uint256, uint256) {
        // 1) Set next 8 bits to shinyHue
        packedData |= uint256(unpacked.shinyHue) << offset;
        offset += 8;

        return (packedData, offset);
    }

    function _unpackCollectibleSpecific(
        UnpackedCollectible memory unpacked,
        uint256 packedData,
        uint256 offset
    ) internal override pure returns (uint256) {
        // 1) Read shinyHue from the next 8 bits
        unpacked.shinyHue = uint8(packedData >> offset);
        offset += 8;

        return offset;
    }

    /**
     * @dev Checks whether msg.sender is a deploy-time known contract or not.
     */
    function _callerIsDeployTimeKnownContract()
        internal
        override
        view
        returns (bool)
    {
        if (msg.sender == _heroesAddress) {
            return true;
        }

        return super._callerIsDeployTimeKnownContract();
    }

    //---------------------------------------------------------------
    // Pending ops
    //---------------------------------------------------------------
    function _getHasherContracts()
        internal
        override
        returns (address[] memory)
    {
        address[] memory hashers = new address[](5);
        hashers[0] = address(this);
        hashers[1] = _prpsAddress;
        hashers[2] = _dubiAddress;
        hashers[3] = _hodlAddress;
        hashers[4] = _heroesAddress;

        return hashers;
    }
}
