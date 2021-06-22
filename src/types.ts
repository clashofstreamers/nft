import { PurposeDeployment } from "@prps/solidity/lib/types";
import { HeroesInstance, PetsInstance } from "../types/contracts";

export interface CosDeployment extends PurposeDeployment {
    Heroes: HeroesInstance,
    Pets: PetsInstance,
}

// EIP712

export enum BoostTag {
    Transfer = 5,
    Merge = 6,
    Empower = 7,
    Kill = 8,
}

export const BoostedSend = [
    { name: "tag", type: "uint8" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "tokenId", type: "uint96" },
    { name: "fuel", type: "BoosterFuel" },
    { name: "boosterPayload", type: "BoosterPayload" }
]

export const BoostedEmpower = [
    { name: "tag", type: "uint8" },
    { name: "funder", type: "address" },
    { name: "tokenId", type: "uint96" },
    { name: "amount", type: "uint96" },
    { name: "fuel", type: "BoosterFuel" },
    { name: "boosterPayload", type: "BoosterPayload" }
]

export const BoostedMerge = [
    { name: "tag", type: "uint8" },
    { name: "tokenIdSource", type: "uint96" },
    { name: "tokenIdTarget", type: "uint96" },
    { name: "fuel", type: "BoosterFuel" },
    { name: "boosterPayload", type: "BoosterPayload" }
]

export const BoostedKill = [
    { name: "tag", type: "uint8" },
    { name: "tokenId", type: "uint96" },
    { name: "fuel", type: "BoosterFuel" },
    { name: "boosterPayload", type: "BoosterPayload" }
]
