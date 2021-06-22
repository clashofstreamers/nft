import { EIP712SignedMessage } from "@prps/solidity/lib/types";
import { BN } from "@openzeppelin/test-helpers";
export declare const createSignedBoostedSendMessage: (web3: any, { from, to, tokenId, nonce, timestamp, fuel, booster, isLegacySignature, verifyingContract, signer: { privateKey } }: {
    from: string;
    to: string;
    tokenId: any;
    nonce: any;
    isLegacySignature?: boolean | undefined;
    timestamp?: number | undefined;
    fuel?: {
        dubi?: any;
        unlockedPrps?: any;
        lockedPrps?: any;
        intrinsicFuel?: any;
    } | undefined;
    booster: string;
    verifyingContract: string;
    signer: {
        privateKey: string;
    };
}) => Promise<EIP712SignedMessage>;
export declare const createSignedBoostedEmpowerMessage: (web3: any, { funder, tokenId, amount, nonce, timestamp, fuel, booster, isLegacySignature, verifyingContract, signer: { privateKey } }: {
    funder: string;
    tokenId: string;
    amount: any;
    isLegacySignature?: boolean | undefined;
    nonce: any;
    timestamp?: number | undefined;
    fuel?: {
        dubi?: any;
        unlockedPrps?: any;
        lockedPrps?: any;
        intrinsicFuel?: any;
    } | undefined;
    booster: string;
    verifyingContract: string;
    signer: {
        privateKey: string;
    };
}) => Promise<EIP712SignedMessage>;
export declare const createSignedBoostedMergeMessage: (web3: any, { tokenIdSource, tokenIdTarget, nonce, timestamp, fuel, booster, isLegacySignature, verifyingContract, signer: { privateKey } }: {
    tokenIdSource: string;
    tokenIdTarget: string;
    nonce: any;
    timestamp?: number | undefined;
    isLegacySignature?: boolean | undefined;
    fuel?: {
        dubi?: any;
        unlockedPrps?: any;
        lockedPrps?: any;
        intrinsicFuel?: any;
    } | undefined;
    booster: string;
    verifyingContract: string;
    signer: {
        privateKey: string;
    };
}) => Promise<EIP712SignedMessage>;
export declare const createSignedBoostedKillMessage: (web3: any, { tokenId, nonce, timestamp, fuel, booster, isLegacySignature, verifyingContract, signer: { privateKey } }: {
    tokenId: string;
    nonce: any;
    timestamp?: number | undefined;
    isLegacySignature?: boolean | undefined;
    fuel?: {
        dubi?: any;
        unlockedPrps?: any;
        lockedPrps?: any;
        intrinsicFuel?: any;
    } | undefined;
    booster: string;
    verifyingContract: string;
    signer: {
        privateKey: string;
    };
}) => Promise<EIP712SignedMessage>;
export declare const mockHeroAttributes: (attributes?: Record<string, any> | undefined) => Record<string, any>;
export declare const mockPetAttributes: (attributes?: Record<string, any> | undefined) => Record<string, any>;
export declare const mockAttributes: (attributes?: {} | undefined) => Record<string, any>;
export declare const toNumberHex: (input: number) => string;
export declare const toStringHex: (input: string) => string;
export declare const mockExtraAttributes: (attributes?: {} | undefined) => {
    keys: string[];
    values: (string | number)[];
};
export declare const defaultAttributes: {
    level: number;
    stars: number;
    faction: number;
    abilities: number;
    season: number;
};
export declare const heroAttributes: {
    headIdAlias: string;
    skinSlot: number;
    skinDivision: number;
    class: number;
    level: number;
    stars: number;
    faction: number;
    abilities: number;
    season: number;
};
export declare const petAttributes: {
    headIdAlias: string;
    shinyHue: number;
    level: number;
    stars: number;
    faction: number;
    abilities: number;
    season: number;
};
export declare const packCollectibleData: (contract: any, deployment: any, attributes: any) => any;
