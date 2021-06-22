// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./CosToken.sol";

/**
 * @dev Heroes contract
 */
contract Heroes is CosToken {
    address internal immutable _petsAddress;

    constructor(
        address optIn,
        address prps,
        address dubi,
        address hodl,
        address pets,
        address externalAddress
    )
        public
        CosToken(
            "Clash of Streamers Heroes",
            "HERO",
            optIn,
            prps,
            dubi,
            hodl,
            externalAddress
        )
    {
        _petsAddress = pets;
    }

    function _applyMerge(
        UnpackedCollectible memory unpackedSource,
        UnpackedCollectible memory unpackedTarget
    ) internal override {
        // Pick source class for target
        unpackedTarget.class = unpackedSource.class;
    }

    function _packCollectibleSpecific(
        UnpackedCollectible memory unpacked,
        uint256 packedData,
        uint256 offset
    ) internal override pure returns (uint256, uint256) {
        // 1) Set next 24 bits to skinDivision
        packedData |= uint256(unpacked.skinDivision) << offset;
        offset += 24;

        // 2) Set next 16 bits to skinSlot
        packedData |= uint256(unpacked.skinSlot) << offset;
        offset += 16;

        // 3) Set next 4 bits to class
        // Since it is stored in a uint8 AND it with a bitmask where the first 4 bits are 1
        uint8 classMask = (1 << 4) - 1;
        packedData |= uint256(unpacked.class & classMask) << offset;

        offset += 4;

        return (packedData, offset);
    }

    function _unpackCollectibleSpecific(
        UnpackedCollectible memory unpacked,
        uint256 packedData,
        uint256 offset
    ) internal override pure returns (uint256) {
        // 1) Read skinDivision from the next 24 bits
        unpacked.skinDivision = uint24(packedData >> offset);
        offset += 24;

        // 2) Read skinSlot from the next 16 bits
        unpacked.skinSlot = uint16(packedData >> offset);
        offset += 16;

        // 3) Read class from the next 4 bits
        uint8 class = uint8(packedData >> offset);
        uint8 classMask = (1 << 4) - 1;
        unpacked.class = class & classMask;
        offset += 4;

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
        if (msg.sender == _petsAddress) {
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
        hashers[4] = _petsAddress;

        return hashers;
    }
}
