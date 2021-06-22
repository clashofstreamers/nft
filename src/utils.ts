import { BoostTag, BoostedSend, BoostedEmpower, BoostedKill, BoostedMerge } from "./types";
import { createEIP712Domain, blockchainTimestampWithOffset, signEIP712, getTypedMessageBytes } from "@prps/solidity/lib/utils";
import { EIP712Domain, BoosterFuel, BoosterPayload, EIP712SignedMessage } from "@prps/solidity/lib/types";
import { BN } from "@openzeppelin/test-helpers";
import { TypedDataUtils } from "eth-sig-util";

export const createSignedBoostedSendMessage = async (web3, { from, to, tokenId, nonce, timestamp, fuel, booster, isLegacySignature, verifyingContract, signer: { privateKey } }: { from: string; to: string; tokenId: BN; nonce: BN; isLegacySignature?: boolean; timestamp?: number, fuel?: { dubi?: BN, unlockedPrps?: BN, lockedPrps?: BN, intrinsicFuel?: BN }, booster: string, verifyingContract: string, signer: { privateKey: string }; }): Promise<EIP712SignedMessage> => {
    const typedData = {
        types: {
            EIP712Domain,
            BoostedSend,
            BoosterFuel,
            BoosterPayload,
        } as any,
        domain: createEIP712Domain("Clash Of Streamers", verifyingContract),
        primaryType: "BoostedSend",
        message: {
            tag: BoostTag.Transfer,
            from,
            to,
            tokenId: tokenId.toString(),
            fuel: {
                dubi: (fuel?.dubi ?? 0).toString(),
                unlockedPrps: (fuel?.unlockedPrps ?? 0).toString(),
                lockedPrps: (fuel?.lockedPrps ?? 0).toString(),
                intrinsicFuel: (fuel?.intrinsicFuel ?? 0).toString(),
            },
            boosterPayload: {
                booster,
                timestamp: timestamp ?? await blockchainTimestampWithOffset(web3, 0),
                nonce: nonce.toString(),
                isLegacySignature: (isLegacySignature || false),
            }
        }
    };

    return {
        message: typedData.message,
        signature: signEIP712(typedData, { privateKey }),
        messageBytes: getTypedMessageBytes(web3, typedData),
        messageHash: `0x${TypedDataUtils.sign(typedData).toString("hex")}`,
    };
}

export const createSignedBoostedEmpowerMessage = async (web3, { funder, tokenId, amount, nonce, timestamp, fuel, booster, isLegacySignature, verifyingContract, signer: { privateKey } }: { funder: string; tokenId: string; amount: BN; isLegacySignature?: boolean; nonce: BN; timestamp?: number, fuel?: { dubi?: BN, unlockedPrps?: BN, lockedPrps?: BN, intrinsicFuel?: BN }, booster: string, verifyingContract: string, signer: { privateKey: string }; }): Promise<EIP712SignedMessage> => {
    const typedData = {
        types: {
            EIP712Domain,
            BoostedEmpower,
            BoosterFuel,
            BoosterPayload,
        } as any,
        domain: createEIP712Domain("Clash Of Streamers", verifyingContract),
        primaryType: "BoostedEmpower",
        message: {
            tag: BoostTag.Empower,
            funder,
            tokenId: tokenId.toString(),
            amount: amount.toString(),
            fuel: {
                dubi: (fuel?.dubi ?? 0).toString(),
                unlockedPrps: (fuel?.unlockedPrps ?? 0).toString(),
                lockedPrps: (fuel?.lockedPrps ?? 0).toString(),
                intrinsicFuel: (fuel?.intrinsicFuel ?? 0).toString(),
            },
            boosterPayload: {
                booster,
                timestamp: timestamp ?? await blockchainTimestampWithOffset(web3, 0),
                nonce: nonce.toString(),
                isLegacySignature: (isLegacySignature || false),
            }
        }
    };

    return {
        message: typedData.message,
        signature: signEIP712(typedData, { privateKey }),
        messageBytes: getTypedMessageBytes(web3, typedData),
        messageHash: `0x${TypedDataUtils.sign(typedData).toString("hex")}`,
    };
}

export const createSignedBoostedMergeMessage = async (web3, { tokenIdSource, tokenIdTarget, nonce, timestamp, fuel, booster, isLegacySignature, verifyingContract, signer: { privateKey } }: { tokenIdSource: string; tokenIdTarget: string; nonce: BN; timestamp?: number, isLegacySignature?: boolean; fuel?: { dubi?: BN, unlockedPrps?: BN, lockedPrps?: BN, intrinsicFuel?: BN }, booster: string, verifyingContract: string, signer: { privateKey: string }; }): Promise<EIP712SignedMessage> => {
    const typedData = {
        types: {
            EIP712Domain,
            BoostedMerge,
            BoosterFuel,
            BoosterPayload,
        } as any,
        domain: createEIP712Domain("Clash Of Streamers", verifyingContract),
        primaryType: "BoostedMerge",
        message: {
            tag: BoostTag.Merge,
            tokenIdSource: tokenIdSource.toString(),
            tokenIdTarget: tokenIdTarget.toString(),
            fuel: {
                dubi: (fuel?.dubi ?? 0).toString(),
                unlockedPrps: (fuel?.unlockedPrps ?? 0).toString(),
                lockedPrps: (fuel?.lockedPrps ?? 0).toString(),
                intrinsicFuel: (fuel?.intrinsicFuel ?? 0).toString(),
            },
            boosterPayload: {
                booster,
                timestamp: timestamp ?? await blockchainTimestampWithOffset(web3, 0),
                nonce: nonce.toString(),
                isLegacySignature: (isLegacySignature || false),
            }
        }
    };

    return {
        message: typedData.message,
        signature: signEIP712(typedData, { privateKey }),
        messageBytes: getTypedMessageBytes(web3, typedData),
        messageHash: `0x${TypedDataUtils.sign(typedData).toString("hex")}`,
    };
}

export const createSignedBoostedKillMessage = async (web3, { tokenId, nonce, timestamp, fuel, booster, isLegacySignature, verifyingContract, signer: { privateKey } }: { tokenId: string; nonce: BN; timestamp?: number, isLegacySignature?: boolean; fuel?: { dubi?: BN, unlockedPrps?: BN, lockedPrps?: BN, intrinsicFuel?: BN }, booster: string, verifyingContract: string, signer: { privateKey: string }; }): Promise<EIP712SignedMessage> => {
    const typedData = {
        types: {
            EIP712Domain,
            BoostedKill,
            BoosterFuel,
            BoosterPayload,
        } as any,
        domain: createEIP712Domain("Clash Of Streamers", verifyingContract),
        primaryType: "BoostedKill",
        message: {
            tag: BoostTag.Kill,
            tokenId: tokenId.toString(),
            fuel: {
                dubi: (fuel?.dubi ?? 0).toString(),
                unlockedPrps: (fuel?.unlockedPrps ?? 0).toString(),
                lockedPrps: (fuel?.lockedPrps ?? 0).toString(),
                intrinsicFuel: (fuel?.intrinsicFuel ?? 0).toString(),
            },
            boosterPayload: {
                booster,
                timestamp: timestamp ?? await blockchainTimestampWithOffset(web3, 0),
                nonce: nonce.toString(),
                isLegacySignature: (isLegacySignature || false),
            }
        }
    };

    return {
        message: typedData.message,
        signature: signEIP712(typedData, { privateKey }),
        messageBytes: getTypedMessageBytes(web3, typedData),
        messageHash: `0x${TypedDataUtils.sign(typedData).toString("hex")}`,
    };
}

export const mockHeroAttributes = (attributes?: Record<string, any>): Record<string, any> => ({ ...heroAttributes, ...attributes });
export const mockPetAttributes = (attributes?: Record<string, any>): Record<string, any> => ({ ...petAttributes, ...attributes });

export const mockAttributes = (attributes?: {}): Record<string, any> => ({ ...defaultAttributes, ...attributes });

export const toNumberHex = (input: number): string => `0x${input.toString(16).padStart(64, "0")}`;
export const toStringHex = (input: string): string => `0x${Buffer.from(input).toString("hex").padEnd(64, "0")}`;

export const mockExtraAttributes = (attributes?: {}): { keys: string[], values: (string | number)[] } => {
    const keys: string[] = [];
    const values: string[] = [];
    for (const [key, value] of Object.entries({ ...defaultAttributes, ...attributes })) {
        keys.push(toStringHex(key));
        values.push(typeof value === "string" ? toStringHex(value) : toNumberHex(value))
    }

    return {
        keys,
        values,
    }
}

export const defaultAttributes = {
    level: 1,
    stars: 2,
    faction: 3,
    abilities: 1234,
    season: 9,
}

export const heroAttributes = {
    ...defaultAttributes,
    headIdAlias: "88",
    skinSlot: 1,
    skinDivision: 12,
    class: 3,
}

export const petAttributes = {
    ...defaultAttributes,
    headIdAlias: "123",
    shinyHue: 255,
}

export const packCollectibleData = (contract, deployment, attributes) => {

    // We need to pack the attributes into a uint256
    const packedData = new BN(0);
    let offset = 0;
    // 24 bit headId
    packedData.ior(new BN(attributes.headIdAlias))
    offset += 24;
    // 96 bit empoweredDUBI
    packedData.ior(new BN(attributes.empoweredDUBI).shln(offset));
    offset += 96;
    // 32 bit season
    packedData.ior(new BN(attributes.season).shln(offset));
    offset += 32;
    // 32 bit abilities
    packedData.ior(new BN(attributes.abilities).shln(offset));
    offset += 32;
    // 8 bit stars
    packedData.ior(new BN(attributes.stars).shln(offset));
    offset += 8;
    // 8 bit level
    packedData.ior(new BN(attributes.level).shln(offset));
    offset += 8;
    // 4 bit faction
    // Since it is stored in a uint8 AND it with a bitmask where the first 4 bits are 1
    packedData.ior(new BN(attributes.faction).shln(offset));
    offset += 4;

    // Skip 2 bits for the flags which are 0 by default
    if (attributes.isFraud) {
        packedData.ior(new BN(1).shln(offset + 0))
    }
    if (attributes.hasDependentOp) {
        packedData.ior(new BN(1).shln(offset + 1))
    }
    offset += 2;

    if (contract.address === deployment.Heroes.address) {
        // 24 bit skinDvision
        packedData.ior(new BN(attributes.skinDivision).shln(offset));
        offset += 24;
        // 16 bit skinSlot
        packedData.ior(new BN(attributes.skinSlot).shln(offset));
        offset += 16;
        // 4 bit class
        packedData.ior(new BN(attributes.class).shln(offset));
        offset += 4;
    } else {
        // 8 bit shinyHue
        packedData.ior(new BN(attributes.shinyHue).shln(offset));
        offset += 8;
    }

    return packedData;
}
