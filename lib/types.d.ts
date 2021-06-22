import { PurposeDeployment } from "@prps/solidity/lib/types";
import { HeroesInstance, PetsInstance } from "../types/contracts";
export interface CosDeployment extends PurposeDeployment {
    Heroes: HeroesInstance;
    Pets: PetsInstance;
}
export declare enum BoostTag {
    Transfer = 5,
    Merge = 6,
    Empower = 7,
    Kill = 8
}
export declare const BoostedSend: {
    name: string;
    type: string;
}[];
export declare const BoostedEmpower: {
    name: string;
    type: string;
}[];
export declare const BoostedMerge: {
    name: string;
    type: string;
}[];
export declare const BoostedKill: {
    name: string;
    type: string;
}[];
