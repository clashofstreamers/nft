// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@prps/solidity/contracts/BoostableLib.sol";

/**
 * @dev A struct representing the payload of the ERC721 `boostedSend` function.
 */
struct BoostedSend {
    uint8 tag;
    address from;
    address to;
    uint96 tokenId;
    BoosterFuel fuel;
    BoosterPayload boosterPayload;
}

/**
 * @dev A struct representing the payload of the CosToken_V1 `boostedEmpower` function.
 */
struct BoostedEmpower {
    uint8 tag;
    address funder;
    uint96 tokenId;
    uint96 amount;
    BoosterFuel fuel;
    BoosterPayload boosterPayload;
}

/**
 * @dev A struct representing the payload of the CosToken_V1 `boostedMerge` function.
 */
struct BoostedMerge {
    uint8 tag;
    uint96 tokenIdSource;
    uint96 tokenIdTarget;
    BoosterFuel fuel;
    BoosterPayload boosterPayload;
}

/**
 * @dev A struct representing the payload of the CosToken_V1 `boostedKill` function.
 */
struct BoostedKill {
    uint8 tag;
    uint96 tokenId;
    BoosterFuel fuel;
    BoosterPayload boosterPayload;
}

library CosBoostableLib {
    uint8 internal constant BOOST_TAG_TRANSFER = 5; // where ERC20 boostables left off
    uint8 internal constant BOOST_TAG_MERGE = 6;
    uint8 internal constant BOOST_TAG_EMPOWER = 7;
    uint8 internal constant BOOST_TAG_KILL = 8;

    bytes32 private constant BOOSTED_SEND_TYPEHASH = keccak256(
        "BoostedSend(uint8 tag,address from,address to,uint96 tokenId,BoosterFuel fuel,BoosterPayload boosterPayload)BoosterFuel(uint96 dubi,uint96 unlockedPrps,uint96 lockedPrps,uint96 intrinsicFuel)BoosterPayload(address booster,uint64 timestamp,uint64 nonce,bool isLegacySignature)"
    );

    bytes32 private constant BOOSTED_MERGE_TYPEHASH = keccak256(
        "BoostedMerge(uint8 tag,uint96 tokenIdSource,uint96 tokenIdTarget,BoosterFuel fuel,BoosterPayload boosterPayload)BoosterFuel(uint96 dubi,uint96 unlockedPrps,uint96 lockedPrps,uint96 intrinsicFuel)BoosterPayload(address booster,uint64 timestamp,uint64 nonce,bool isLegacySignature)"
    );

    bytes32 private constant BOOSTED_EMPOWER_TYPEHASH = keccak256(
        "BoostedEmpower(uint8 tag,address funder,uint96 tokenId,uint96 amount,BoosterFuel fuel,BoosterPayload boosterPayload)BoosterFuel(uint96 dubi,uint96 unlockedPrps,uint96 lockedPrps,uint96 intrinsicFuel)BoosterPayload(address booster,uint64 timestamp,uint64 nonce,bool isLegacySignature)"
    );

    bytes32 private constant BOOSTED_KILL_TYPEHASH = keccak256(
        "BoostedKill(uint8 tag,uint96 tokenId,BoosterFuel fuel,BoosterPayload boosterPayload)BoosterFuel(uint96 dubi,uint96 unlockedPrps,uint96 lockedPrps,uint96 intrinsicFuel)BoosterPayload(address booster,uint64 timestamp,uint64 nonce,bool isLegacySignature)"
    );

    /**
     * @dev Returns the hash of `boostedSend`.
     */
    function hashBoostedSend(
        bytes32 domainSeparator,
        BoostedSend memory send,
        address booster
    ) internal pure returns (bytes32) {
        return
            BoostableLib.hashWithDomainSeparator(
                domainSeparator,
                keccak256(
                    abi.encode(
                        BOOSTED_SEND_TYPEHASH,
                        BOOST_TAG_TRANSFER,
                        send.from,
                        send.to,
                        send.tokenId,
                        BoostableLib.hashBoosterFuel(send.fuel),
                        BoostableLib.hashBoosterPayload(
                            send.boosterPayload,
                            booster
                        )
                    )
                )
            );
    }

    /**
     * @dev Returns the hash of `boostedMerge`.
     */
    function hashBoostedMerge(
        bytes32 domainSeparator,
        BoostedMerge memory merge,
        address booster
    ) internal pure returns (bytes32) {
        return
            BoostableLib.hashWithDomainSeparator(
                domainSeparator,
                keccak256(
                    abi.encode(
                        BOOSTED_MERGE_TYPEHASH,
                        BOOST_TAG_MERGE,
                        merge.tokenIdSource,
                        merge.tokenIdTarget,
                        BoostableLib.hashBoosterFuel(merge.fuel),
                        BoostableLib.hashBoosterPayload(
                            merge.boosterPayload,
                            booster
                        )
                    )
                )
            );
    }

    /**
     * @dev Returns the hash of `boostedEmpower`.
     */
    function hashBoostedEmpower(
        bytes32 domainSeparator,
        BoostedEmpower memory empower,
        address booster
    ) internal pure returns (bytes32) {
        return
            BoostableLib.hashWithDomainSeparator(
                domainSeparator,
                keccak256(
                    abi.encode(
                        BOOSTED_EMPOWER_TYPEHASH,
                        BOOST_TAG_EMPOWER,
                        empower.funder,
                        empower.tokenId,
                        empower.amount,
                        BoostableLib.hashBoosterFuel(empower.fuel),
                        BoostableLib.hashBoosterPayload(
                            empower.boosterPayload,
                            booster
                        )
                    )
                )
            );
    }

    /**
     * @dev Returns the hash of `boostedKill`.
     */
    function hashBoostedKill(
        bytes32 domainSeparator,
        BoostedKill memory kill,
        address booster
    ) internal pure returns (bytes32) {
        return
            BoostableLib.hashWithDomainSeparator(
                domainSeparator,
                keccak256(
                    abi.encode(
                        BOOSTED_KILL_TYPEHASH,
                        BOOST_TAG_KILL,
                        kill.tokenId,
                        BoostableLib.hashBoosterFuel(kill.fuel),
                        BoostableLib.hashBoosterPayload(
                            kill.boosterPayload,
                            booster
                        )
                    )
                )
            );
    }

    /**
     * @dev Tries to interpret the given boosterMessage and
     * return it's hash plus creation timestamp.
     */
    function decodeAndHashBoosterMessage(
        address targetBooster,
        bytes32 domainSeparator,
        bytes memory boosterMessage
    ) public pure returns (bytes32, uint64) {
        require(boosterMessage.length > 0, "PB-7");

        uint8 tag = BoostableLib._readBoosterTag(boosterMessage);
        if (tag == BOOST_TAG_TRANSFER) {
            BoostedSend memory send = abi.decode(boosterMessage, (BoostedSend));
            return (
                hashBoostedSend(domainSeparator, send, targetBooster),
                send.boosterPayload.timestamp
            );
        }

        if (tag == BOOST_TAG_MERGE) {
            BoostedMerge memory merge = abi.decode(
                boosterMessage,
                (BoostedMerge)
            );
            return (
                hashBoostedMerge(domainSeparator, merge, targetBooster),
                merge.boosterPayload.timestamp
            );
        }

        if (tag == BOOST_TAG_EMPOWER) {
            BoostedEmpower memory empower = abi.decode(
                boosterMessage,
                (BoostedEmpower)
            );
            return (
                hashBoostedEmpower(domainSeparator, empower, targetBooster),
                empower.boosterPayload.timestamp
            );
        }

        if (tag == BOOST_TAG_KILL) {
            BoostedKill memory kill = abi.decode(boosterMessage, (BoostedKill));
            return (
                hashBoostedKill(domainSeparator, kill, targetBooster),
                kill.boosterPayload.timestamp
            );
        }

        // Unknown tag, so just return an empty result
        return ("", 0);
    }
}
