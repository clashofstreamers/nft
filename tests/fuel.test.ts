
import { accounts, contract } from "@openzeppelin/test-environment";
import { BN, ether, expectRevert } from "@openzeppelin/test-helpers";
import { CosDeployment } from "../src/types";
import { deployTestnet, expectBigNumber, mockHeroAttributes } from "./support";
import { packCollectibleData, createSignedBoostedEmpowerMessage, createSignedBoostedKillMessage, createSignedBoostedMergeMessage, createSignedBoostedSendMessage } from "../src/utils";

import { ZERO } from "@prps/solidity/lib/types";
import { PurposeInstance, DubiInstance } from "@prps/solidity/types/contracts";

const [alice, bob, carl] = accounts;

contract.fromArtifact("Heroes");

let prps: PurposeInstance;
let dubi: DubiInstance;

let deployment: CosDeployment;

beforeEach(async () => {
    deployment = await deployTestnet();

    prps = deployment.Purpose;
    dubi = deployment.Dubi;
});

describe("Fuel - Collectibles", () => {
    describe("boostedSend", () => {
        it("should burn fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            // Mint some DUBI and PRPS for alice
            await dubi.mint(boostedAlice.address, ether("200"));
            await prps.mint(boostedAlice.address, ether("30"));

            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "1");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "2");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "3");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "4");

            // Can use empoweredDUBI as fuel
            await expectBoostedSendFuel(boostedAlice, bob, 1, { intrinsicFuel: ether("5") }, 1);

            // Can use DUBI as fuel
            await expectBoostedSendFuel(boostedAlice, bob, 2, { dubi: ether("5") }, 2);

            // Can use unlocked PRPS as fuel
            await expectBoostedSendFuel(boostedAlice, bob, 3, { unlockedPrps: ether("5") }, 3);

            // Can use locked PRPS as fuel
            await deployment.Hodl.hodl(1, ether("5"), 365, boostedAlice.address, boostedAlice.address, { from: boostedAlice.address });

            let _hodl = await deployment.Hodl.getHodl(1, boostedAlice.address, boostedAlice.address);
            expectBigNumber(_hodl.lockedPrps, ether("5"));

            // Use 5 locked PRPS as fuel which is all alice has
            await expectBoostedSendFuel(boostedAlice, bob, 4, { lockedPrps: ether("5") }, 4);

            // Hodl gone
            _hodl = await deployment.Hodl.getHodl(1, boostedAlice.address, boostedAlice.address);
            expectBigNumber(_hodl.id, ZERO);
        });

        it("should send without a fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await expectMintCollectible(boostedAlice.address, 1);

            // The booster might also waive the fuel
            await expectBoostedSendFuel(boostedAlice, bob, 1, {}, 1);
        });

        it("should revert if out of fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            await dubi.mint(boostedAlice.address, ether("4"));
            await prps.mint(boostedAlice.address, ether("2"));

            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("2"), "1");

            // Token only has 2 empoweredDUBI, but the fuel is 5
            await expectRevert(expectBoostedSendFuel(boostedAlice, bob, 1, { intrinsicFuel: ether("5") }, 1), "COS-21");

            // // Alice only has 2 DUBI, but she needs 5
            await expectRevert(expectBoostedSendFuel(boostedAlice, bob, 1, { dubi: ether("5") }, 1), "DUBI-7");
            // // Alice only has 2 unlocked PRPS, but she needs 6
            await expectRevert(expectBoostedSendFuel(boostedAlice, bob, 1, { unlockedPrps: ether("6") }, 1), "PRPS-7");

            // // Hodl 1 PRPS
            await deployment.Hodl.hodl(1, ether("1"), 365, boostedAlice.address, boostedAlice.address, { from: boostedAlice.address });

            // // Alice only has 1 locked PRPS, but she needs 2 (unlocked PRPS is ignored)
            await expectRevert(expectBoostedSendFuel(boostedAlice, bob, 1, { lockedPrps: ether("2") }, 1), "PRPS-7");
        });

        it("should revert if above MAX_BOOSTER_FUEL", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            await expectMintCollectible(boostedAlice.address, 1);

            await expectRevert(expectBoostedSendFuel(boostedAlice, bob, 1, { dubi: ether("11") }, 1), "DUBI-5");
            await expectRevert(expectBoostedSendFuel(boostedAlice, bob, 1, { lockedPrps: ether("11") }, 1), "PRPS-10");
            await expectRevert(expectBoostedSendFuel(boostedAlice, bob, 1, { unlockedPrps: ether("11") }, 1), "PRPS-10");
            await expectRevert(expectBoostedSendFuel(boostedAlice, bob, 1, { intrinsicFuel: ether("11") }, 1), "COS-21");
        });
    });

    describe("boostedEmpower", () => {
        it("should burn fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            // Mint some DUBI and PRPS for alice
            await dubi.mint(boostedAlice.address, ether("200"));
            await prps.mint(boostedAlice.address, ether("30"));

            await expectMintCollectible(boostedAlice.address, 1);

            // Can use DUBI as fuel
            await expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { dubi: ether("5") }, 1);

            // Can use empoweredDUBI as fuel
            await expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { intrinsicFuel: ether("5") }, 2);

            // Can use unlocked PRPS as fuel
            await expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { unlockedPrps: ether("5") }, 3);

            // Can use locked PRPS as fuel
            await deployment.Hodl.hodl(1, ether("5"), 365, boostedAlice.address, boostedAlice.address, { from: boostedAlice.address });

            let _hodl = await deployment.Hodl.getHodl(1, boostedAlice.address, boostedAlice.address);
            expectBigNumber(_hodl.lockedPrps, ether("5"));

            // Use 5 locked PRPS as fuel which is all alice has
            await expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { lockedPrps: ether("5") }, 4);

            // Hodl gone
            _hodl = await deployment.Hodl.getHodl(1, boostedAlice.address, boostedAlice.address);
            expectBigNumber(_hodl.id, ZERO);
        });

        it("should send without a fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await expectMintCollectible(boostedAlice.address, 1);

            await dubi.mint(boostedAlice.address, ether("1"));

            // The booster might also waive the fuel
            await expectBoostedEmpowerFuel(boostedAlice, 1, ether("1"), {}, 1);
        });

        it("should revert if out of fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            await dubi.mint(boostedAlice.address, ether("4"));
            await prps.mint(boostedAlice.address, ether("2"));

            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("2"), "1");

            // Tokens have 4 empoweredDUBI combined, but the fuel is 5
            await expectRevert(expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { intrinsicFuel: ether("5") }, 1), "COS-21");

            // // Alice only has 2 DUBI, but she needs 5
            await expectRevert(expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { dubi: ether("5") }, 1), "DUBI-7");
            // // Alice only has 2 unlocked PRPS, but she needs 6
            await expectRevert(expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { unlockedPrps: ether("6") }, 1), "PRPS-7");

            // // Hodl 1 PRPS
            await deployment.Hodl.hodl(1, ether("1"), 365, boostedAlice.address, boostedAlice.address, { from: boostedAlice.address });

            // // Alice only has 1 locked PRPS, but she needs 2 (unlocked PRPS is ignored)
            await expectRevert(expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { lockedPrps: ether("2") }, 1), "PRPS-7");
        });

        it("should revert if above MAX_BOOSTER_FUEL", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            await expectMintCollectible(boostedAlice.address, 1);

            await expectRevert(expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { dubi: ether("11") }, 1), "DUBI-5");
            await expectRevert(expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { lockedPrps: ether("11") }, 1), "PRPS-10");
            await expectRevert(expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { unlockedPrps: ether("11") }, 1), "PRPS-10");
            await expectRevert(expectBoostedEmpowerFuel(boostedAlice, 1, ether("5"), { intrinsicFuel: ether("11") }, 1), "COS-21");
        });
    });

    describe("boostedMerge", () => {
        it("should burn fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            // Mint some DUBI and PRPS for alice
            await dubi.mint(boostedAlice.address, ether("200"));
            await prps.mint(boostedAlice.address, ether("30"));

            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "1");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "2");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "3");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "4");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "5");

            // Can use empoweredDUBI as fuel
            await expectBoostedMergeFuel(boostedAlice, 1, 2, { intrinsicFuel: ether("5") }, 1);

            // Can use DUBI as fuel
            await expectBoostedMergeFuel(boostedAlice, 2, 3, { dubi: ether("5") }, 2);

            // Can use unlocked PRPS as fuel
            await expectBoostedMergeFuel(boostedAlice, 3, 4, { unlockedPrps: ether("5") }, 3);

            // Can use locked PRPS as fuel
            await deployment.Hodl.hodl(1, ether("5"), 365, boostedAlice.address, boostedAlice.address, { from: boostedAlice.address });

            let _hodl = await deployment.Hodl.getHodl(1, boostedAlice.address, boostedAlice.address);
            expectBigNumber(_hodl.lockedPrps, ether("5"));

            // Use 5 locked PRPS as fuel which is all alice has
            await expectBoostedMergeFuel(boostedAlice, 4, 5, { lockedPrps: ether("5") }, 4);

            // Hodl gone
            _hodl = await deployment.Hodl.getHodl(1, boostedAlice.address, boostedAlice.address);
            expectBigNumber(_hodl.id, ZERO);
        });

        it("should send without a fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await expectMintCollectible(boostedAlice.address, 1);
            await expectMintCollectible(boostedAlice.address, 2);

            // The booster might also waive the fuel
            await expectBoostedMergeFuel(boostedAlice, 1, 2, {}, 1);
        });

        it("should revert if out of fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            await dubi.mint(boostedAlice.address, ether("4"));
            await prps.mint(boostedAlice.address, ether("2"));

            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("2"), "1");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("2"), "2");

            // Tokens have 4 empoweredDUBI combined, but the fuel is 5
            await expectRevert(expectBoostedMergeFuel(boostedAlice, 1, 2, { intrinsicFuel: ether("5") }, 1), "COS-21");

            // // Alice only has 2 DUBI, but she needs 5
            await expectRevert(expectBoostedMergeFuel(boostedAlice, 1, 2, { dubi: ether("5") }, 1), "DUBI-7");
            // // Alice only has 2 unlocked PRPS, but she needs 6
            await expectRevert(expectBoostedMergeFuel(boostedAlice, 1, 2, { unlockedPrps: ether("6") }, 1), "PRPS-7");

            // // Hodl 1 PRPS
            await deployment.Hodl.hodl(1, ether("1"), 365, boostedAlice.address, boostedAlice.address, { from: boostedAlice.address });

            // // Alice only has 1 locked PRPS, but she needs 2 (unlocked PRPS is ignored)
            await expectRevert(expectBoostedMergeFuel(boostedAlice, 1, 2, { lockedPrps: ether("2") }, 1), "PRPS-7");
        });

        it("should revert if above MAX_BOOSTER_FUEL", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            await expectMintCollectible(boostedAlice.address, 1);
            await expectMintCollectible(boostedAlice.address, 2);

            await expectRevert(expectBoostedMergeFuel(boostedAlice, 1, 2, { dubi: ether("11") }, 1), "DUBI-5");
            await expectRevert(expectBoostedMergeFuel(boostedAlice, 1, 2, { lockedPrps: ether("11") }, 1), "PRPS-10");
            await expectRevert(expectBoostedMergeFuel(boostedAlice, 1, 2, { unlockedPrps: ether("11") }, 1), "PRPS-10");
            await expectRevert(expectBoostedMergeFuel(boostedAlice, 1, 2, { intrinsicFuel: ether("11") }, 1), "COS-21");
        });

    });

    describe("boostedKill", () => {
        it("should burn fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            // Mint some DUBI and PRPS for alice
            await dubi.mint(boostedAlice.address, ether("200"));
            await prps.mint(boostedAlice.address, ether("30"));

            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "1");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "2");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "3");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "4");
            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("10"), "5");

            // Can use empoweredDUBI as fuel
            await expectBoostedKillFuel(boostedAlice, 1, { intrinsicFuel: ether("5") }, 1, ether("5"));

            // Can use DUBI as fuel
            await expectBoostedKillFuel(boostedAlice, 2, { dubi: ether("5") }, 2, ether("10"));

            // Can use unlocked PRPS as fuel
            await expectBoostedKillFuel(boostedAlice, 3, { unlockedPrps: ether("5") }, 3, ether("10"));

            // Can use locked PRPS as fuel
            await deployment.Hodl.hodl(1, ether("5"), 365, boostedAlice.address, boostedAlice.address, { from: boostedAlice.address });

            let _hodl = await deployment.Hodl.getHodl(1, boostedAlice.address, boostedAlice.address);
            expectBigNumber(_hodl.lockedPrps, ether("5"));

            // Use 5 locked PRPS as fuel which is all alice has
            await expectBoostedKillFuel(boostedAlice, 4, { lockedPrps: ether("5") }, 4, ether("10"));

            // Hodl gone
            _hodl = await deployment.Hodl.getHodl(1, boostedAlice.address, boostedAlice.address);
            expectBigNumber(_hodl.id, ZERO);
        });

        it("should send without a fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await expectMintCollectible(boostedAlice.address, 1);

            // The booster might also waive the fuel
            await expectBoostedKillFuel(boostedAlice, 1, {}, 1, ZERO);
        });

        it("should revert if out of fuel", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            await dubi.mint(boostedAlice.address, ether("4"));
            await prps.mint(boostedAlice.address, ether("2"));

            await expectMintedCollectibleWithApprovalAndDUBI(boostedAlice.address, ether("2"), "1");

            // Tokens have 4 empoweredDUBI combined, but the fuel is 5
            await expectRevert(expectBoostedKillFuel(boostedAlice, 1, { intrinsicFuel: ether("5") }, 1, ZERO), "COS-21");

            // // Alice only has 2 DUBI, but she needs 5
            await expectRevert(expectBoostedKillFuel(boostedAlice, 1, { dubi: ether("5") }, 1, ZERO), "DUBI-7");
            // // Alice only has 2 unlocked PRPS, but she needs 6
            await expectRevert(expectBoostedKillFuel(boostedAlice, 1, { unlockedPrps: ether("6") }, 1, ZERO), "PRPS-7");

            // // Hodl 1 PRPS
            await deployment.Hodl.hodl(1, ether("1"), 365, boostedAlice.address, boostedAlice.address, { from: boostedAlice.address });

            // // Alice only has 1 locked PRPS, but she needs 2 (unlocked PRPS is ignored)
            await expectRevert(expectBoostedKillFuel(boostedAlice, 1, { lockedPrps: ether("2") }, 1, ZERO), "PRPS-7");
        });

        it("should revert if above MAX_BOOSTER_FUEL", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            await expectMintCollectible(boostedAlice.address, 1);

            await expectRevert(expectBoostedKillFuel(boostedAlice, 1, { dubi: ether("11") }, 1, ZERO), "DUBI-5");
            await expectRevert(expectBoostedKillFuel(boostedAlice, 1, { lockedPrps: ether("11") }, 1, ZERO), "PRPS-10");
            await expectRevert(expectBoostedKillFuel(boostedAlice, 1, { unlockedPrps: ether("11") }, 1, ZERO), "PRPS-10");
            await expectRevert(expectBoostedKillFuel(boostedAlice, 1, { intrinsicFuel: ether("11") }, 1, ZERO), "COS-21");
        });
    });
});

const expectMintedCollectibleWithApprovalAndDUBI = async (from, amount, tokenId) => {
    await expectMintCollectible(from, tokenId);

    await dubi.approve(deployment.Heroes.address, amount, { from });

    await deployment.Heroes.empower(tokenId, amount.toString(), {
        from,
        gas: 350_000,
    });
}

const expectMintCollectible = async (owner: string, tokenId: number) => {
    const attributes = mockHeroAttributes({});
    const packedData = packCollectibleData(deployment.Heroes, deployment, attributes);

    await deployment.Heroes.mint(tokenId, owner, packedData.toString(), [], [], "0xb0b", { from: deployment.owner, gas: 1_000_000 });
}

const expectBoostedSendFuel = async (signer, to: string, tokenId, fuel, nonce) => {
    await expectBalances(signer, to, tokenId, tokenId, fuel, async () => {
        const { message, signature } = await createSignedBoostedSendMessage(deployment.web3, {
            from: signer.address,
            to,
            tokenId: new BN(tokenId),
            nonce: new BN(nonce),
            signer,
            verifyingContract: deployment.Heroes.address,
            fuel,
            booster: deployment.booster,
        });

        await deployment.Heroes.boostedSend(message, signature, { from: deployment.booster, gas: 200_000 });
    })
}

const expectBoostedEmpowerFuel = async (signer, tokenId, empoweredDUBIAmount, fuel, nonce) => {
    await expectBalances(signer, signer.address, tokenId, tokenId, fuel, async () => {
        await dubi.approve(deployment.Heroes.address, empoweredDUBIAmount, { from: signer.address });

        const { message, signature } = await createSignedBoostedEmpowerMessage(deployment.web3, {
            amount: empoweredDUBIAmount,
            funder: signer.address,
            tokenId: new BN(tokenId),
            nonce: new BN(nonce),
            signer,
            verifyingContract: deployment.Heroes.address,
            fuel,
            booster: deployment.booster,
        });

        await deployment.Heroes.boostedEmpower(message, signature, {
            from: deployment.booster,
            gas: 350_000,
        });

    }, undefined, empoweredDUBIAmount)
}

const expectBoostedKillFuel = async (signer, tokenId, fuel, nonce, refundedDUBIOnKill) => {
    await expectBalances(signer, signer.address, tokenId, tokenId, fuel, async () => {
        const { message, signature } = await createSignedBoostedKillMessage(deployment.web3, {
            tokenId: new BN(tokenId),
            nonce: new BN(nonce),
            signer,
            verifyingContract: deployment.Heroes.address,
            fuel,
            booster: deployment.booster,
        });

        await deployment.Heroes.boostedKill(message, signature, {
            from: deployment.booster,
            gas: 350_000,
        });

    }, refundedDUBIOnKill)
}

const expectBoostedMergeFuel = async (signer, tokenIdSource, tokenIdTarget, fuel, nonce) => {
    await expectBalances(signer, signer.address, tokenIdSource, tokenIdTarget, fuel, async () => {
        const { message, signature } = await createSignedBoostedMergeMessage(deployment.web3, {
            tokenIdSource: new BN(tokenIdSource),
            tokenIdTarget: new BN(tokenIdTarget),
            nonce: new BN(nonce),
            signer,
            verifyingContract: deployment.Heroes.address,
            fuel,
            booster: deployment.booster,
        });

        await deployment.Heroes.boostedMerge(message, signature, { from: deployment.booster, gas: 200_000 });
    })
}

const expectBalances = async (signer, to, tokenIdA, tokenIdB, fuel, fn, refundedDUBIOnKill?, empoweredDUBIAmount?) => {
    const balancesFromBefore = await getBalances(signer.address, tokenIdA, tokenIdB);
    const balancesToBefore = await getBalances(to, 0, 0);

    await fn();

    const balancesFromAfter = await getBalances(signer.address, 0, 0);
    const balancesToAfter = await getBalances(to, tokenIdA, tokenIdB);

    // To's balances didn't change, except for the empoweredDUBI on his received token if it was used to as fuel
    if (signer.address !== to) {
        expectBigNumber(balancesToAfter.unlockedPrps, balancesToBefore.unlockedPrps);
        expectBigNumber(balancesToAfter.dubi, balancesToBefore.dubi);
        expectBigNumber(balancesToAfter.lockedPrps, balancesToBefore.lockedPrps);
    }

    const intrinsicFuel = fuel.intrinsicFuel || ZERO;

    // If both are distinc, it's a merge and token A (source) does NOT change for efficiency reasons.
    let empoweredDUBIFromMerge = ZERO;
    if (tokenIdA !== tokenIdB) {
        expectBigNumber(balancesToAfter.empoweredDUBITokenA, balancesFromBefore.empoweredDUBITokenA);
        empoweredDUBIFromMerge = balancesFromBefore.empoweredDUBITokenA;

        expectBigNumber(balancesToAfter.empoweredDUBITokenB, balancesFromBefore.empoweredDUBITokenB.add(empoweredDUBIAmount || ZERO).add(empoweredDUBIFromMerge).sub(intrinsicFuel));
    } else {

        // On kill the intrinsicFee is NOT taken from the collectible to save a write.
        if (refundedDUBIOnKill) {
            expectBigNumber(balancesToAfter.empoweredDUBITokenA, balancesFromBefore.empoweredDUBITokenA);
            await expectRevert(deployment.Heroes.ownerOf(tokenIdA), "ERC721-6");
        } else {
            expectBigNumber(balancesToAfter.empoweredDUBITokenA, balancesFromBefore.empoweredDUBITokenA.sub(intrinsicFuel).add(empoweredDUBIAmount || ZERO));
        }
    }

    if (fuel.dubi) {
        expectBigNumber(balancesFromAfter.dubi, balancesFromBefore.dubi.sub(fuel.dubi).add(refundedDUBIOnKill || ZERO).sub(empoweredDUBIAmount || ZERO));
        expectBigNumber(balancesFromAfter.unlockedPrps, balancesFromBefore.unlockedPrps);
        expectBigNumber(balancesFromAfter.lockedPrps, balancesFromBefore.lockedPrps);
    }

    if (fuel.unlockedPrps) {
        expectBigNumber(balancesFromAfter.dubi, balancesFromBefore.dubi.add(refundedDUBIOnKill || ZERO).sub(empoweredDUBIAmount || ZERO));
        expectBigNumber(balancesFromAfter.unlockedPrps, balancesFromBefore.unlockedPrps.sub(fuel.unlockedPrps));
        expectBigNumber(balancesFromAfter.lockedPrps, balancesFromBefore.lockedPrps)
    }

    if (fuel.lockedPrps) {
        expectBigNumber(balancesFromAfter.dubi, balancesFromBefore.dubi.add(refundedDUBIOnKill || ZERO).sub(empoweredDUBIAmount || ZERO));
        expectBigNumber(balancesFromAfter.unlockedPrps, balancesFromBefore.unlockedPrps);
        expectBigNumber(balancesFromAfter.lockedPrps, balancesFromBefore.lockedPrps.sub(fuel.lockedPrps));
    }
}

const getBalances = async (from: string, tokenIdA, tokenIdB): Promise<{ dubi: any, unlockedPrps: any, lockedPrps: any, empoweredDUBITokenA: any, empoweredDUBITokenB: any }> => {
    const collectibleDataA = await deployment.Heroes.getCollectibleData(tokenIdA);
    const collectibleDataB = await deployment.Heroes.getCollectibleData(tokenIdB);

    return {
        dubi: await dubi.balanceOf(from),
        unlockedPrps: await prps.balanceOf(from),
        lockedPrps: await prps.hodlBalanceOf(from),
        empoweredDUBITokenA: new BN(collectibleDataA.empoweredDUBI),
        empoweredDUBITokenB: new BN(collectibleDataB.empoweredDUBI),
    };
}
