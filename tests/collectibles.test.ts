import { accounts, contract } from "@openzeppelin/test-environment";
import { BN, expectEvent, expectRevert, constants, ether, time } from "@openzeppelin/test-helpers";
import { expectBigNumber, mockHeroAttributes, mockPetAttributes, mockAttributes, mockExtraAttributes, toNumberHex, deployTestnet } from "./support";
import { expect } from "chai";
import { HeroesInstance, PetsInstance } from "../types/contracts";
import { OptInInstance } from "@prps/solidity/types/contracts";
import { CosDeployment } from "../src/types";
import { createSignedBoostedEmpowerMessage, createSignedBoostedKillMessage, createSignedBoostedMergeMessage, createSignedBoostedSendMessage, packCollectibleData } from "../src/utils";
import { ZERO } from "@prps/solidity/lib/types";

const [alice, bob, charlie, dave, emil] = accounts;

contract.fromArtifact("Heroes");

let deployment: CosDeployment;
let defaultSender: string;
let optIn: OptInInstance;

beforeEach(async () => {
    deployment = await deployTestnet();
    defaultSender = deployment.owner;
    optIn = deployment.OptIn;
});

describe("Collectibles", () => {
    const fixtures = () => [
        { contract: deployment.Heroes, attributes: mockHeroAttributes(), funder: charlie, owner: alice },
        { contract: deployment.Pets, attributes: mockPetAttributes(), funder: dave, owner: bob },
    ]

    describe("Create", () => {
        it("should create hero / pet", async () => {
            for (const { contract, attributes, owner } of fixtures()) {
                await expectCreateCollectible(contract, 1, owner, attributes);
                await expectCollectibleData(contract, 1, attributes);
            }
        });

        it("zero token id reverts", async () => {
            const RevertReasonTokenIdMustBeGreaterThan0 = "3";

            for (const { contract, attributes, owner } of fixtures()) {
                await expectRevertCreateCollectible(contract, 0, owner, attributes, RevertReasonTokenIdMustBeGreaterThan0);
            }
        });

        it("should batch create hero / pet", async () => {
            await expectCreateCollectibles(deployment.Heroes, [1, 2, 3, 4, 5], [alice, bob, charlie, dave, emil], [
                mockHeroAttributes(),
                mockHeroAttributes(),
                mockHeroAttributes(),
                mockHeroAttributes(),
                mockHeroAttributes(),
            ]);

            await expectCreateCollectibles(deployment.Pets, [1, 2, 3, 4, 5], [alice, bob, charlie, dave, emil], [
                mockPetAttributes(),
                mockPetAttributes(),
                mockPetAttributes(),
                mockPetAttributes(),
                mockPetAttributes(),
            ]);
        });

        it("should batch create hero / pet for the same user", async () => {
            await expectCreateCollectibles(deployment.Heroes, [1, 2, 3, 4, 5], [alice, alice, alice, alice, alice], [
                mockHeroAttributes(),
                mockHeroAttributes(),
                mockHeroAttributes(),
                mockHeroAttributes(),
                mockHeroAttributes(),
            ]);

            await expectCreateCollectibles(deployment.Pets, [1, 2, 3, 4, 5], [bob,bob,bob,bob,bob], [
                mockPetAttributes(),
                mockPetAttributes(),
                mockPetAttributes(),
                mockPetAttributes(),
                mockPetAttributes(),
            ]);
        });

        it("batch create hero / pet with duplicate id should revert", async () => {
            const RevertReasonRequireNeverExisted = "4";

            await expectRevertCreateCollectibles(deployment.Heroes, [1, 1, 1, 1, 1], [alice, alice, alice, alice, alice], [
                mockHeroAttributes(),
                mockHeroAttributes(),
                mockHeroAttributes(),
                mockHeroAttributes(),
                mockHeroAttributes(),
            ], RevertReasonRequireNeverExisted);

            await expectRevertCreateCollectibles(deployment.Pets, [1, 1, 1, 1, 1], [bob,bob,bob,bob,bob], [
                mockPetAttributes(),
                mockPetAttributes(),
                mockPetAttributes(),
                mockPetAttributes(),
                mockPetAttributes(),
            ], RevertReasonRequireNeverExisted);
        });

        it("batch create gas", async () => {
            const batchSizes = [1, 5, 10, 20, 50, 100];
            
            const sumIterationsToBatch = (batch) => batchSizes.slice(0, batch).reduce((tot, s) => tot + s, 0);
            for (let batch = 0; batch < batchSizes.length; batch++) {
                const ids: number[] = [];
                const owners: string[] = [];
                const heroAttributes: Record<string, any>[] = [];
                const petAttributes: Record<string, any>[] = [];
                for (let i = 0; i < batchSizes[batch]; i++) {
                    const id = sumIterationsToBatch(batch) + i + 1;
                    ids.push(id);
                    owners.push(accounts[i % accounts.length]);
                    heroAttributes.push(mockHeroAttributes());
                    petAttributes.push(mockPetAttributes());
                }

                await expectCreateCollectibles(deployment.Heroes, ids, owners, heroAttributes);
                await expectCreateCollectibles(deployment.Pets, ids, owners, petAttributes);
            }
        });

        it.only("batch create gas limit", async () => {
            const GasLimit = 8_000_000;
            const batches = [{ size: 168 }, { size: 169, error: /out of gas/ }, { size: 170, error: /out of gas/ }];
            
            const sumIterationsToBatch = (batch) => batches.slice(0, batch).reduce((tot, b) => tot + b.size, 0);
            for (let batch = 0; batch < batches.length; batch++) {
                const ids: number[] = [];
                const owners: string[] = [];
                const heroAttributes: Record<string, any>[] = [];
                const petAttributes: Record<string, any>[] = [];
                for (let i = 0; i < batches[batch].size; i++) {
                    const id = sumIterationsToBatch(batch) + i + 1;
                    ids.push(id);
                    owners.push(accounts[i % accounts.length]);
                    heroAttributes.push(mockHeroAttributes());
                    petAttributes.push(mockPetAttributes());
                }
                
                const expectedError = batches[batch].error;
                if (expectedError) {
                    await expectCreateCollectiblesError(deployment.Heroes, ids, owners, heroAttributes, expectedError, { gas: GasLimit });
                    await expectCreateCollectiblesError(deployment.Pets, ids, owners, petAttributes, expectedError, { gas: GasLimit });
                } else {
                    await expectCreateCollectibles(deployment.Heroes, ids, owners, heroAttributes, { gas: GasLimit });
                    await expectCreateCollectibles(deployment.Pets, ids, owners, petAttributes, { gas: GasLimit });
                }
            }
        });

        it("should create hero / pet and update total supply", async () => {
            for (const { contract, attributes, owner } of fixtures()) {
                const packedData = packCollectibleData(contract, deployment, attributes);

                let totalSupplyBefore: any = await contract.totalSupply();

                let upperHalf = totalSupplyBefore
                    .add(new BN(1));
                let lowerHalf = new BN(1); // tokenId
                let tokenIdWithTotalSupply = upperHalf.shln(96).or(lowerHalf);

                await contract.mint(tokenIdWithTotalSupply.toString(), owner, packedData, [], [], "0xb0b", { from: defaultSender, gas: 1_000_000 });

                await expectCollectibleData(contract, 1, attributes);

                let totalSupplyAfter: any = await contract.totalSupply();
                expectBigNumber(totalSupplyAfter, totalSupplyBefore.add(new BN(1)));

                // This time increase supply by 1999
                totalSupplyBefore = await contract.totalSupply();

                upperHalf = totalSupplyBefore
                    .add(new BN(1999));
                lowerHalf = new BN(2); // tokenId
                tokenIdWithTotalSupply = upperHalf.shln(96).or(lowerHalf);
                await contract.mint(tokenIdWithTotalSupply.toString(), owner, packedData, [], [], "0xb0b", { from: defaultSender, gas: 1_000_000 });

                await expectCollectibleData(contract, 2, attributes);

                totalSupplyAfter = await contract.totalSupply();
                expectBigNumber(totalSupplyAfter, totalSupplyBefore.add(new BN(1999)));

                // Increase supply by 2**96 + 1 which causes an overflow so it ends up being set to 1 again
                totalSupplyBefore = await contract.totalSupply();

                upperHalf = new BN("79228162514264337593543950337");
                lowerHalf = new BN(3); // tokenId
                tokenIdWithTotalSupply = upperHalf.shln(96).or(lowerHalf);
                await contract.mint(tokenIdWithTotalSupply.toString(), owner, packedData, [], [], "0xb0b", { from: defaultSender, gas: 1_000_000 });

                await expectCollectibleData(contract, 3, attributes);

                totalSupplyAfter = await contract.totalSupply();
                expectBigNumber(totalSupplyAfter, new BN(1));
            }
        });

        it("should create hero / pet with all attributes maxed out (all bits set)", async () => {
            const defaultAttributes = {
                // 24 bits
                headIdAlias: 2 ** 24 - 1,
                // 96 bits, 2**96
                empoweredDUBI: "79228162514264337593543950335",
                // 8 bits
                level: 2 ** 8 - 1,
                // 8 bits
                stars: 2 ** 8 - 1,
                // 32 bits
                season: 2 ** 32 - 1,
                // 32 bits
                abilities: 2 ** 32 - 1,
                // 4 bits
                faction: 2 ** 4 - 1,
                // 1 bit
                isFraud: true,
                // 1 bit
                hasDependentOp: true,
            }
            for (const { contract, owner } of fixtures()) {
                let attributes;
                if (contract.address === deployment.Heroes.address) {
                    attributes = {
                        ...defaultAttributes,
                        // 16 bits
                        skinDivision: 2 ** 24 - 1,
                        // 24 bits
                        skinSlot: 2 ** 16 - 1,
                        // 4 bits
                        class: 2 ** 4 - 1,
                    }
                } else {
                    attributes = {
                        ...defaultAttributes,
                        // 8 bits
                        shinyHue: 2 ** 8 - 1,
                    }
                }

                await expectCreateCollectible(contract, 1, owner, attributes);
                await expectCollectibleData(contract, 1, attributes);
            }
        });

        it("should create hero / pet with all attributes MAX_VALUE - 1", async () => {
            const defaultAttributes = {
                // 24 bits
                headIdAlias: 2 ** 24 - 2,
                // 96 bits, 2**96 - 2
                empoweredDUBI: "79228162514264337593543950334",
                // 8 bits
                level: 2 ** 8 - 2,
                // 8 bits
                stars: 2 ** 8 - 2,
                // 32 bits
                season: 2 ** 32 - 2,
                // 32 bits
                abilities: 2 ** 32 - 2,
                // 4 bits
                faction: 2 ** 4 - 2,
                // 1 bit
                isFraud: true,
                // 1 bit
                hasDependentOp: false,
            }
            for (const { contract, owner } of fixtures()) {
                let attributes;
                if (contract.address === deployment.Heroes.address) {
                    attributes = {
                        ...defaultAttributes,
                        // 16 bits
                        skinDivision: 2 ** 24 - 2,
                        // 24 bits
                        skinSlot: 2 ** 16 - 2,
                        // 4 bits
                        class: 2 ** 4 - 2,
                    }
                } else {
                    attributes = {
                        ...defaultAttributes,
                        // 8 bits
                        shinyHue: 2 ** 8 - 2,
                    }
                }

                await expectCreateCollectible(contract, 1, owner, attributes);
                await expectCollectibleData(contract, 1, attributes);
            }
        });

        it("should not create hero / pet when using id of a killed token", async () => {
            for (const { contract, attributes, owner } of fixtures()) {
                await expectCreateCollectible(contract, 1, owner, attributes);
                await expectKillCollectible(contract, 1, owner, owner);

                await expectRevert(contract.mint(1, owner, 213, [], [], "0xb0b", { from: defaultSender, gas: 1_000_000 }), "4");
            }
        });

        it("should not create hero / pet if not owner or secondary minter", async () => {
            for (const { contract, attributes, owner } of fixtures()) {
                await expectRevert(contract.mint(1, owner, 213, [], [], "0xb0b", { from: bob, gas: 1_000_000 }), "00");
                await expectRevert(contract.batchMint([1], [owner], [213], [[]], [[]], ["0xb0b"], { from: bob, gas: 1_000_000 }), "00");

                // By default the secondary minter is the owner
                expect(await contract.secondaryMinter()).to.eq(await contract.owner());

                // Bob cannot set himself a secondary minter
                await expectRevert(contract.setSecondaryMinter(bob, { from: bob }), "Ownable: caller is not the owner");

                // The owner on the other hand can
                await contract.setSecondaryMinter(bob, { from: defaultSender });
                expect(await contract.secondaryMinter()).to.eq(bob);

                // Bob still cannot change the secondary minter
                await expectRevert(contract.setSecondaryMinter(bob, { from: bob }), "Ownable: caller is not the owner");

                // But bob can mint now
                await contract.mint(1, owner, 213, [], [], "0xb0b", { from: bob, gas: 1_000_000 });
                await contract.batchMint([2], [owner], [213], [[]], [[]], ["0xb0b"], { from: bob, gas: 1_000_000 });

                await contract.mint(3, owner, 213, [], [], "0xb0b", { from: await contract.owner(), gas: 1_000_000 });
                await contract.batchMint([4], [owner], [213], [[]], [[]], ["0xb0b"], { from: await contract.owner(), gas: 1_000_000 });

                // But not if the owner revokes it again
                await contract.setSecondaryMinter(constants.ZERO_ADDRESS, { from: defaultSender });
                // Owner is again the secondary minter
                expect(await contract.secondaryMinter()).to.eq(await contract.owner());

                // Bob can no longer mint
                await expectRevert(contract.setSecondaryMinter(bob, { from: bob }), "Ownable: caller is not the owner");
                await expectRevert(contract.mint(1, owner, 213, [], [], "0xb0b", { from: bob }), "00");
                await expectRevert(contract.batchMint([4], [owner], [213], [[]], [[]], ["0xb0b"], { from: bob }), "00");
            }
        });

        it("should not create hero / pet if id already exists", async () => {
            for (const { contract, attributes, owner } of fixtures()) {
                await expectCreateCollectible(contract, 1, owner, attributes);
                await expectRevert(contract.mint(1, owner, 213, [], [], "0xb0b", { from: defaultSender, gas: 1_000_000 }), "4");
            }
        });

        it("should not create hero / pet if id doesn't exist, because got killed", async () => {
            for (const { contract, attributes, owner } of fixtures()) {
                await expectCreateCollectible(contract, 1, owner, attributes);
                await expectKillCollectible(contract, 1, owner, owner);
                await expectRevert(contract.mint(1, owner, 213, [], [], "0xb0b", { from: defaultSender, gas: 1_000_000 }), "4");
            }
        });

        it("should not create hero / pet if token id is invalid", async () => {
            for (const { contract, attributes, owner } of fixtures()) {
                await expectRevert(contract.mint(0, owner, 123, [], [], "0xb0b", { from: defaultSender, gas: 1_000_000 }), "3");
            }
        });

        it("should not create hero / pet if extra attribute keys/values mismatch", async () => {
            for (const { contract, attributes, owner } of fixtures()) {
                const extraAttributes = mockExtraAttributes();
                await expectRevert(contract.mint(1, owner, 123, extraAttributes.keys, [], "0xb0b", { from: defaultSender, gas: 1_000_000 }), "5");
            }
        });
    });

    describe("Empower", () => {
        it("should empower hero / pet", async () => {
            for (const { contract, funder, attributes } of fixtures()) {
                const tokenId = 1;

                await deployment.Dubi.mint(funder, ether("10"), { from: defaultSender });

                await expectCreateCollectible(contract, tokenId, defaultSender, attributes);
                await expectEmpowerCollectible(contract, tokenId, ether("5"), ether("5"), defaultSender, funder);

                expectBigNumber(await deployment.Dubi.balanceOf(contract.address), ether("5"));
                expectBigNumber(await deployment.Dubi.balanceOf(funder), ether("5"));
            }
        });

        it("should not empower hero / pet if amount is zero", async () => {
            for (const { contract, funder, attributes } of fixtures()) {
                const tokenId = 1;
                await expectCreateCollectible(contract, tokenId, defaultSender, attributes);
                await expectRevert(expectEmpowerCollectible(contract, tokenId, ether("0"), ether("5"), defaultSender, funder), "8");
            }
        });

        it("should not empower hero / pet if amount is more than owned", async () => {
            for (const { contract, funder, attributes } of fixtures()) {
                const tokenId = 1;

                await expectCreateCollectible(contract, tokenId, defaultSender, attributes);
                await expectRevert(expectEmpowerCollectible(contract, tokenId, ether("10000000"), ether("5"), defaultSender, funder), "ERC20-10");
            }
        });

        it("should not empower hero / pet if token id does not exist", async () => {
            for (const { contract, funder, attributes } of fixtures()) {
                const tokenId = 1;
                await expectRevert(expectEmpowerCollectible(contract, tokenId, ether("5"), ether("5"), defaultSender, funder), "ERC721-6");
            }
        });

        it("should not empower hero / pet if token id does not exist and got killed", async () => {
            for (const { contract, funder, attributes } of fixtures()) {
                const tokenId = 1;
                await expectCreateCollectible(contract, tokenId, defaultSender, attributes);
                await expectKillCollectible(contract, tokenId, defaultSender, defaultSender);
                await expectRevert(expectEmpowerCollectible(contract, tokenId, ether("5"), ether("5"), defaultSender, funder), "ERC721-6");
            }
        });
    })

    describe("Kill", () => {
        it("should kill hero / pet", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                const tokenId = 1;

                await expectCreateCollectible(contract, tokenId, owner, attributes);
                await expectKillCollectible(contract, tokenId, owner, owner);
            }
        });

        it("should revert if killing a hero / pet twice", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                const tokenId = 1;

                await expectCreateCollectible(contract, tokenId, owner, attributes);
                await expectKillCollectible(contract, tokenId, owner, owner);

                await expectRevert(contract.kill(tokenId, {
                    from: owner,
                    gas: 200_000,
                }), "ERC721-6");
            }
        });

        it("should not kill hero / pet if not owner, but approved sender", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                await deployment.Dubi.mint(charlie, ether("5"));

                const tokenId = 1;
                await expectCreateCollectible(contract, tokenId, owner, attributes);
                await expectApprovalForAll(contract, owner, charlie);
                await expectEmpowerCollectible(contract, tokenId, ether("5"), ether("5"), owner, charlie);
                await expectRevert(expectKillCollectible(contract, tokenId, owner, charlie), "20");
            }
        });

        it("should kill hero / pet and return empoweredDUBI to the owner", async () => {
            for (const { contract, owner, funder, attributes } of fixtures()) {
                const tokenId = 1;

                await deployment.Dubi.mint(funder, ether("10"), { from: defaultSender });
                await deployment.Dubi.mint(owner, ether("10"), { from: defaultSender });

                await expectCreateCollectible(contract, tokenId, owner, attributes);

                // Funder and owner both empower the same collectible
                await expectEmpowerCollectible(contract, tokenId, ether("5"), ether("5"), owner, owner);
                await expectEmpowerCollectible(contract, tokenId, ether("5"), ether("10"), owner, funder);

                // The contract now has 10 DUBI
                expectBigNumber(await deployment.Dubi.balanceOf(contract.address), ether("10"));
                expectBigNumber(await deployment.Dubi.balanceOf(owner), ether("5"));
                expectBigNumber(await deployment.Dubi.balanceOf(funder), ether("5"));

                // Killing the token, transfers the 10 DUBI to the owner only
                await expectKillCollectible(contract, tokenId, owner, owner, true);

                expectBigNumber(await deployment.Dubi.balanceOf(contract.address), ether("0"));
                expectBigNumber(await deployment.Dubi.balanceOf(owner), ether("15"));
                expectBigNumber(await deployment.Dubi.balanceOf(funder), ether("5"));
            }
        });

        it("should not kill hero / pet if token id does not exist", async () => {
            for (const { contract, owner } of fixtures()) {
                await expectRevert(expectKillCollectible(contract, 0, owner, owner), "ERC721-6");
            }
        });

        it("should not kill hero / pet if not owner", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                const tokenId = 1;
                await expectCreateCollectible(contract, tokenId, owner, attributes);
                await expectRevert(expectKillCollectible(contract, tokenId, charlie, charlie), "20");
            }
        });
    })

    describe("Merge", () => {
        it("should merge hero / pet", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                await expectCreateCollectible(contract, tokenIdA, owner, attributes);
                await expectCreateCollectible(contract, tokenIdB, owner, attributes);

                await expectMergeCollectible(contract, tokenIdA, tokenIdB, owner);
            }
        });

        it("should merge hero / pet and transfer empowered DUBI to target", async () => {
            for (const { contract, owner, funder } of fixtures()) {
                await deployment.Dubi.mint(funder, ether("15"), { from: defaultSender });

                const tokenIdA = 1;
                const tokenIdB = 2;

                const sourceAttributes = mockAttributes();
                const targetAttributes = mockAttributes();

                await expectCreateCollectible(contract, tokenIdA, owner, sourceAttributes);
                await expectCreateCollectible(contract, tokenIdB, owner, targetAttributes);

                // Source gets 10 DUBI
                await expectEmpowerCollectible(contract, tokenIdA, ether("10"), ether("10"), owner, funder);
                // Target gets 5 DUBI
                await expectEmpowerCollectible(contract, tokenIdB, ether("5"), ether("5"), owner, funder);

                await expectMergeCollectible(contract, tokenIdA, tokenIdB, owner);

                // Target gets DUBI from source added to his own
                const data = await getCollectibleData(contract, tokenIdB);
                expect(data.empoweredDUBI).to.eq(ether("15").toString());
            }
        });

        it("should merge hero / pet and use the highest stars", async () => {
            for (const { contract, owner } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                const sourceAttributes = mockAttributes({ stars: 5 });
                const targetAttributes = mockAttributes({ stars: 1 });

                await expectCreateCollectible(contract, tokenIdA, owner, sourceAttributes);
                await expectCreateCollectible(contract, tokenIdB, owner, targetAttributes);

                await expectMergeCollectible(contract, tokenIdA, tokenIdB, owner);

                // Target assumes max(source.stars, target.stars)
                const data = await getCollectibleData(contract, tokenIdB);
                expect(data.stars).to.eq("5");
            }
        });

        it("should merge hero / pet and use the highest level", async () => {
            for (const { contract, owner } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                const sourceAttributes = mockAttributes({ level: 5 });
                const targetAttributes = mockAttributes({ level: 1 });

                await expectCreateCollectible(contract, tokenIdA, owner, sourceAttributes);
                await expectCreateCollectible(contract, tokenIdB, owner, targetAttributes);

                await expectMergeCollectible(contract, tokenIdA, tokenIdB, owner);

                // Target assumes max(source.level, target.level)
                const data = await getCollectibleData(contract, tokenIdB);
                expect(data.level).to.eq("5");
            }
        });

        it("should merge hero / pet and change target class to source class", async () => {
            for (const { contract, owner } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                const sourceAttributes = mockAttributes({ class: 4 });
                const targetAttributes = mockAttributes({ class: 9 });

                await expectCreateCollectible(contract, tokenIdA, owner, sourceAttributes);
                await expectCreateCollectible(contract, tokenIdB, owner, targetAttributes);

                await expectMergeCollectible(contract, tokenIdA, tokenIdB, owner);

                // Target class is overwritten by source class
                const data = await getCollectibleData(contract, tokenIdB);
                if (contract.address === deployment.Heroes.address) {
                    expect(data.class).to.eq("4");
                }
            }
        });

        it("should merge hero and change target abilities to source abilities", async () => {
            for (const { contract, owner } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                const sourceAttributes = mockAttributes({ abilities: 1234 });
                const targetAttributes = mockAttributes({ abilities: 5678 });

                await expectCreateCollectible(contract, tokenIdA, owner, sourceAttributes);
                await expectCreateCollectible(contract, tokenIdB, owner, targetAttributes);

                await expectMergeCollectible(contract, tokenIdA, tokenIdB, owner);

                // Target class is overwritten by source class
                const data = await getCollectibleData(contract, tokenIdB);
                expect(data.abilities).to.eq("1234");
            }
        });

        it("should not merge hero / pet if source/target does not exist", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                await expectCreateCollectible(contract, tokenIdA, owner, attributes);
                await expectCreateCollectible(contract, tokenIdB, owner, attributes);

                await expectRevert(expectMergeCollectible(contract, 3, tokenIdB, owner), "ERC721-6");

                await expectRevert(expectMergeCollectible(contract, tokenIdA, 4, owner), "ERC721-6");
            }
        });

        it("should not merge hero / pet if `from` has approval but is not the owner", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                await expectCreateCollectible(contract, tokenIdA, owner, attributes);
                await expectCreateCollectible(contract, tokenIdB, owner, attributes);

                // Give bob approval for tokens
                await contract.approve(charlie, tokenIdA, { from: owner });
                await contract.approve(charlie, tokenIdB, { from: owner });

                await expectRevert(expectMergeCollectible(contract, tokenIdA, tokenIdB, charlie), "14");
            }
        });

        it("should not merge hero / pet if source/target got killed", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                await expectCreateCollectible(contract, tokenIdA, owner, attributes);
                await expectCreateCollectible(contract, tokenIdB, owner, attributes);

                await expectKillCollectible(contract, tokenIdB, owner, owner);
                await expectRevert(expectMergeCollectible(contract, tokenIdA, tokenIdB, owner), "ERC721-6");

                await expectKillCollectible(contract, tokenIdA, owner, owner);
                await expectRevert(expectMergeCollectible(contract, tokenIdA, tokenIdB, owner), "ERC721-6");
            }
        });

        it("should not merge hero / pet if source and target id is the same", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                const tokenIdA = 1;
                await expectCreateCollectible(contract, tokenIdA, owner, attributes);
                await expectRevert(expectMergeCollectible(contract, tokenIdA, tokenIdA, owner), "13");
            }
        });

        it("should not merge hero / pet if source/target faction doesn't match", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                const sourceAttributes = mockHeroAttributes({ faction: 10 });

                await expectCreateCollectible(contract, tokenIdA, owner, sourceAttributes);
                await expectCreateCollectible(contract, tokenIdB, owner, attributes);

                await expectRevert(expectMergeCollectible(contract, tokenIdA, tokenIdB, owner), "16");
            }
        });

        it("should not merge hero / pet if target season is older than source", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                const targetAttributes = mockHeroAttributes({ season: 10 });

                await expectCreateCollectible(contract, tokenIdA, owner, attributes);
                await expectCreateCollectible(contract, tokenIdB, owner, targetAttributes);

                await expectRevert(expectMergeCollectible(contract, tokenIdA, tokenIdB, owner), "16");
            }
        });

        it("should not merge hero / pet if not owner of source and target", async () => {
            for (const { contract, owner, funder: ownerB, attributes } of fixtures()) {
                const tokenIdA = 1;
                const tokenIdB = 2;

                await expectCreateCollectible(contract, tokenIdA, owner, attributes);
                await expectCreateCollectible(contract, tokenIdB, ownerB, attributes);

                await expectRevert(expectMergeCollectible(contract, tokenIdA, tokenIdB, owner), "14");

                await expectRevert(expectMergeCollectible(contract, tokenIdA, tokenIdB, ownerB), "14");
            }
        });
    });

    describe("Misc", () => {

        it("should mark collectible as fraud", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                await expectCreateCollectible(contract, 1, owner, attributes);

                let collectibleData = await contract.getCollectibleData(1);
                expect(collectibleData.isFraud).to.be.false;

                await contract.setFraudulent(1, true, { from: deployment.owner });

                collectibleData = await contract.getCollectibleData(1);
                expect(collectibleData.isFraud).to.be.true;

                await contract.setFraudulent(1, false, { from: deployment.owner });

                collectibleData = await contract.getCollectibleData(1);
                expect(collectibleData.isFraud).to.be.false;
            }
        });

        it("should not mark collectible as fraud", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                await expectCreateCollectible(contract, 1, owner, attributes);
                await expectRevert(contract.setFraudulent(1, true, { from: alice }), "00");
                await expectRevert(contract.setFraudulent(2, true, { from: deployment.owner }), "1");
            }
        });

        it("should set extra attribute", async () => {
            for (const { contract, owner, attributes } of fixtures()) {
                await expectCreateCollectible(contract, 1, owner, attributes);

                const bestKey = deployment.web3.utils.stringToHex("best");

                let best = await contract.getCollectibleExtraAttribute(1, bestKey);
                expect(best.slice(-1)).to.eq("0");

                await contract.setExtraAttribute(1, bestKey, toNumberHex(1234));

                best = await contract.getCollectibleExtraAttribute(1, bestKey);
                expect(parseInt(best.slice(-4), 16)).to.eq(1234);

                await contract.setExtraAttribute(1, bestKey, toNumberHex(0), { from: deployment.owner });

                best = await contract.getCollectibleExtraAttribute(1, bestKey);
                expect(parseInt(best.slice(-4), 16)).to.eq(0);
            }
        });
    });
});

describe("Collectibles - OptIn", () => {
    const collectible = () => deployment.Heroes;

    beforeEach(async () => {
        await optIn.activateAndRenounceOwnership();

        // Contracts are also opted-in by default
        await optIn.instantOptOut(deployment.Heroes.address, { from: deployment.booster })
        await optIn.instantOptOut(deployment.Pets.address, { from: deployment.booster })
    });

    describe("Unboosted", () => {

        it("should empower and finalize pending op", async () => {
            await deployment.Dubi.mint(alice, ether("10"));

            // Export collectible for alice
            await expectCreateCollectible(collectible(), 1, alice, mockHeroAttributes());

            // Call empower
            await expectPendingEmpowerCollectible({ contract: collectible(), opId: 1, amount: 1, tokenId: 1, from: alice });

            // Finalize empower
            await expectFinalizeEmpowerCollectible({ contract: collectible(), opId: 1, tokenId: 1, from: alice, amount: 1 });
        });

        it("should empower and revert pending op", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await deployment.Dubi.mint(boostedAlice.address, ether("10"));

            // Export collectible for alice
            await expectCreateCollectible(collectible(), 1, boostedAlice.address, mockHeroAttributes());

            // Empower
            await expectPendingEmpowerCollectible({ contract: collectible(), opId: 1, tokenId: 1, amount: 1, from: boostedAlice.address });

            // Revert
            await expectRevertEmpowerCollectible({ contract: collectible(), opId: 1, tokenId: 1, amount: 1, from: boostedAlice.address, signer: boostedAlice });
        });

        it("should not empower if funder isn't owner of opted-in token", async () => {
            await deployment.Dubi.mint(bob, ether("10"));

            // Export collectible for alice
            await expectCreateCollectible(collectible(), 1, alice, mockHeroAttributes());

            // Fails because bob is not the owner and the owner is opted-in
            await expectRevert(collectible().empower("1", "1", { from: bob, gas: 500_000 }), "7");
            await optIn.instantOptOut(bob, { from: deployment.booster });
            await expectRevert(collectible().empower("1", "1", { from: bob, gas: 500_000 }), "7");
            await optIn.optIn(deployment.booster, { from: bob });

            // Opt-out owner of token
            await optIn.instantOptOut(alice, { from: deployment.booster });

            // Bob still cannot empower, because he's opted-in and not the owner
            await expectRevert(collectible().empower("1", "1", { from: bob, gas: 500_000 }), "7");

            // Bob can empower, if both are opted-out
            await optIn.instantOptOut(bob, { from: deployment.booster });
            await expectEmpowerCollectible(collectible(), 1, new BN(1), new BN(1), alice, bob);
        });

        it("should kill and finalize pending op", async () => {
            await deployment.Dubi.mint(alice, ether("10"));

            // Export collectible for alice
            await expectCreateCollectible(collectible(), 1, alice, mockHeroAttributes());

            await expectPendingKillCollectible({ contract: collectible(), opId: 1, tokenId: 1, from: alice });
            await expectFinalizeKillCollectible({ contract: collectible(), opId: 1, tokenId: 1, from: alice, hasRefund: false });
        });

        it("should kill after empower and finalize pending op", async () => {
            await deployment.Dubi.mint(alice, ether("10"));

            // Export collectible for alice and empower it with 1 DUBI
            await expectCreateCollectible(collectible(), 1, alice, mockHeroAttributes());
            await expectPendingEmpowerCollectible({ contract: collectible(), opId: 1, amount: 1, tokenId: 1, from: alice });
            await expectFinalizeEmpowerCollectible({ contract: collectible(), opId: 1, tokenId: 1, from: alice, amount: 1 });

            // Kill it
            await expectPendingKillCollectible({ contract: collectible(), opId: 2, tokenId: 1, from: alice });
            await expectFinalizeKillCollectible({ contract: collectible(), opId: 2, tokenId: 1, from: alice, hasRefund: true });
        });

        it("should kill and revert pending op", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await deployment.Dubi.mint(boostedAlice.address, ether("10"));

            // Export collectible for alice
            await expectCreateCollectible(collectible(), 1, boostedAlice.address, mockHeroAttributes());

            // Kill it
            await expectPendingKillCollectible({ contract: collectible(), opId: 1, tokenId: 1, from: boostedAlice.address });
            // Revert
            await expectRevertKillCollectible({ contract: collectible(), opId: 1, tokenId: 1, from: boostedAlice.address, signer: boostedAlice });
        });

        it("should merge and finalize pending op", async () => {
            // Create two collectibles
            await expectCreateCollectible(collectible(), 1, alice, mockHeroAttributes());
            await expectCreateCollectible(collectible(), 2, alice, mockHeroAttributes());

            // Merge them
            await expectPendingMergeCollectibles({ contract: collectible(), opId: 1, tokenIdSource: 1, tokenIdTarget: 2, from: alice });
            await expectFinalizeMergeCollectibles({ contract: collectible(), opId: 1, tokenIdSource: 1, tokenIdTarget: 2, from: alice });
        });

        it("should merge after empower and finalize pending op", async () => {
            await deployment.Dubi.mint(alice, ether("10"));

            // Create two collectibles
            await expectCreateCollectible(collectible(), 1, alice, mockHeroAttributes());
            await expectCreateCollectible(collectible(), 2, alice, mockHeroAttributes());

            // Export collectibles for alice and empower it with 1 DUBI
            await expectPendingEmpowerCollectible({ contract: collectible(), opId: 1, amount: 1, tokenId: 1, from: alice });
            await expectPendingEmpowerCollectible({ contract: collectible(), opId: 2, amount: 5, tokenId: 2, from: alice });

            await expectFinalizeEmpowerCollectible({ contract: collectible(), opId: 1, tokenId: 1, from: alice, amount: 1 });
            await expectFinalizeEmpowerCollectible({ contract: collectible(), opId: 2, tokenId: 2, from: alice, amount: 5 });

            // Merge them
            await expectPendingMergeCollectibles({ contract: collectible(), opId: 3, tokenIdSource: 1, tokenIdTarget: 2, from: alice });
            await expectFinalizeMergeCollectibles({ contract: collectible(), opId: 3, tokenIdSource: 1, tokenIdTarget: 2, from: alice });
        });

        it("should merge and revert pending op", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await deployment.Dubi.mint(boostedAlice.address, ether("10"));

            // Export collectible for alice
            await expectCreateCollectible(collectible(), 1, boostedAlice.address, mockHeroAttributes());
            await expectCreateCollectible(collectible(), 2, boostedAlice.address, mockHeroAttributes());

            // Merge them
            await expectPendingMergeCollectibles({ contract: collectible(), opId: 1, tokenIdSource: 1, tokenIdTarget: 2, from: boostedAlice.address });

            // Revert
            await expectRevertMergeCollectibles({ contract: collectible(), opId: 1, tokenIdSource: 1, tokenIdTarget: 2, from: boostedAlice.address, signer: boostedAlice });
        });

        it("should transfer and finalize pending op", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            // Export collectible for alice
            await expectCreateCollectible(collectible(), 1, boostedAlice.address, mockHeroAttributes());

            let from = boostedAlice.address;
            let to = bob;

            for (let transferOp of ["transferFrom", "safeTransferFrom"]) {
                // Create pending transfer
                await expectPendingTransferCollectible({ functionName: transferOp as any, contract: collectible(), opId: 1, tokenId: 1, from, to });

                // Finalize
                await expectFinalizeTransferCollectible({ contract: collectible(), opId: 1, tokenId: 1, from, to });

                from = bob;
                to = boostedAlice.address;
            }
        });

        it("should not transfer and finalize pending op", async () => {
            // Export collectible for alice
            await expectCreateCollectible(collectible(), 1, alice, mockHeroAttributes());

            // Make bob an operator while alice is opted-in
            await expectApprovalForAll(collectible(), alice, bob);

            for (let { op: transferOp, revertReason } of [
                { op: "transferFrom", revertReason: "ERC721-8" },
                { op: "safeTransferFrom", revertReason: "ERC721-8" }
            ]) {
                // Bobs attempt to transfer collectible fails, because alice is opted-in
                await expectRevert(collectible()[transferOp](alice, charlie, 1, {
                    from: bob,
                    gas: 350_000,
                }), revertReason);
            }

            // Same if bob opts-out
            await optIn.instantOptOut(bob, { from: deployment.booster });

            for (let { op: transferOp, revertReason } of [
                { op: "transferFrom", revertReason: "ERC721-8" },
                { op: "safeTransferFrom", revertReason: "ERC721-8" }
            ]) {
                // Bobs attempt to transfer collectible fails, because alice is opted-in
                await expectRevert(collectible()[transferOp](alice, charlie, 1, {
                    from: bob,
                    gas: 350_000,
                }), revertReason);
            }
        });

        it("should transfer and revert pending op", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            // Export collectible for alice
            await expectCreateCollectible(collectible(), 1, boostedAlice.address, mockHeroAttributes());

            let opId = 1;
            for (let transferOp of ["transferFrom", "safeTransferFrom"]) {
                // Create pending transfer
                await expectPendingTransferCollectible({ functionName: transferOp as any, contract: collectible(), opId, tokenId: 1, from: boostedAlice.address, to: bob });

                // Revert
                await expectRevertTransferCollectible({ contract: collectible(), opId, tokenId: 1, from: boostedAlice.address, to: bob, signer: boostedAlice });
                opId += 1;
            }
        });

        it("should still receive while opted-in from a non-opted in address", async () => {
            await expectCreateCollectible(collectible(), 1, bob, mockHeroAttributes());
            await expectCreateCollectible(collectible(), 2, bob, mockHeroAttributes());

            expect(await collectible().ownerOf("1")).to.eq(bob);
            expect(await collectible().ownerOf("2")).to.eq(bob);
            await optIn.instantOptOut(bob, { from: deployment.booster });

            await collectible().transferFrom(bob, alice, "1", { from: bob, gas: 200000 });
            await collectible().safeTransferFrom(bob, alice, "2", { from: bob, gas: 200000 });

            expect(await collectible().ownerOf("1")).to.eq(alice);
            expect(await collectible().ownerOf("2")).to.eq(alice);
        });
    });

    describe("Boosted", () => {

        it("should empower", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await deployment.Dubi.mint(boostedAlice.address, ether("1"), { from: defaultSender });

            await expectCreateCollectible(collectible(), 1, boostedAlice.address, mockHeroAttributes());

            const { message, signature } = await createSignedBoostedEmpowerMessage(deployment.web3, {
                funder: boostedAlice.address,
                tokenId: new BN(1),
                amount: ether("1"),
                nonce: new BN(1),
                signer: boostedAlice,
                verifyingContract: collectible().address,
                booster: deployment.booster,
            });

            const amount = ether("1").toString();
            const receipt = await collectible().boostedEmpower(message, signature, {
                from: deployment.booster,
                gas: 250_000,
            });

            await expectEvent(receipt, "Empowered", {
                id: "1",
                owner: boostedAlice.address,
                funder: boostedAlice.address,
                empoweredAmount: amount,
                totalAmount: amount,
            });
        });

        it("should kill", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await deployment.Dubi.mint(boostedAlice.address, ether("1"), { from: defaultSender });

            await expectCreateCollectible(collectible(), 1, boostedAlice.address, mockHeroAttributes());

            const { message, signature } = await createSignedBoostedKillMessage(deployment.web3, {
                tokenId: new BN(1),
                nonce: new BN(1),
                signer: boostedAlice,
                verifyingContract: collectible().address,
                booster: deployment.booster,
            });

            const receipt = await collectible().boostedKill(message, signature, {
                from: deployment.booster,
                gas: 200_000,
            });

            console.log("BOOSTED KILL: " + receipt.receipt.gasUsed);

            await expectEvent(receipt, "Transfer", {
                from: boostedAlice.address,
                to: constants.ZERO_ADDRESS,
                tokenId: "1",
            });
        });

        it("should kill and refund DUBI", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await deployment.Dubi.mint(boostedAlice.address, ether("100"), { from: defaultSender });

            await expectCreateCollectible(collectible(), 1, boostedAlice.address, mockHeroAttributes());

            let { message, signature } = await createSignedBoostedEmpowerMessage(deployment.web3, {
                amount: ether("100"),
                funder: boostedAlice.address,
                tokenId: new BN(1),
                nonce: new BN(1),
                signer: boostedAlice,
                verifyingContract: collectible().address,
                booster: deployment.booster,
            });

            let receipt = await collectible().boostedEmpower(message, signature, {
                from: deployment.booster,
                gas: 200_000,
            });

            console.log("BOOSTED EMPOWER: " + receipt.receipt.gasUsed);

            ({ message, signature } = await createSignedBoostedKillMessage(deployment.web3, {
                tokenId: new BN(1),
                nonce: new BN(2),
                signer: boostedAlice,
                verifyingContract: collectible().address,
                booster: deployment.booster,
            }));

            // Used all her DUBI for empowerment
            expectBigNumber(await deployment.Dubi.balanceOf(boostedAlice.address), ZERO);

            receipt = await collectible().boostedKill(message, signature, {
                from: deployment.booster,
                gas: 300_000,
            });

            console.log("BOOSTED KILL: " + receipt.receipt.gasUsed);

            // Got all her DUBIs back
            expectBigNumber(await deployment.Dubi.balanceOf(boostedAlice.address), ether("100"));

            await expectEvent(receipt, "Transfer", {
                from: boostedAlice.address,
                to: constants.ZERO_ADDRESS,
                tokenId: "1",
            });
        });

        it("should merge", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await deployment.Dubi.mint(boostedAlice.address, ether("1"), { from: defaultSender });

            await expectCreateCollectible(collectible(), 1, boostedAlice.address, mockHeroAttributes());
            await expectCreateCollectible(collectible(), 2, boostedAlice.address, mockHeroAttributes());

            const { message, signature } = await createSignedBoostedMergeMessage(deployment.web3, {
                tokenIdSource: new BN(1),
                tokenIdTarget: new BN(2),
                nonce: new BN(1),
                signer: boostedAlice,
                verifyingContract: collectible().address,
                booster: deployment.booster,
            });

            const receipt = await collectible().boostedMerge(message, signature, {
                from: deployment.booster,
                gas: 250_000,
            });

            await expectEvent(receipt, "Merged", {
                targetId: "2",
                sourceId: "1",
                owner: boostedAlice.address,
            });
        });

        it("should send", async () => {
            const [boostedAlice, boostedBob] = deployment.boostedAddresses;
            await deployment.Dubi.mint(boostedAlice.address, ether("1"), { from: defaultSender });

            await expectCreateCollectible(collectible(), 1, boostedAlice.address, mockHeroAttributes());

            let { message, signature } = await createSignedBoostedSendMessage(deployment.web3, {
                from: boostedAlice.address,
                to: boostedBob.address,
                tokenId: new BN(1),
                nonce: new BN(1),
                signer: boostedAlice,
                verifyingContract: collectible().address,
                booster: deployment.booster,
            });

            let receipt = await collectible().boostedSend(message, signature, {
                from: deployment.booster,
                gas: 200_000,
            });

            console.log("BOOSTED SEND 1: " + receipt.receipt.gasUsed);

            await expectEvent(receipt, "Transfer", {
                from: boostedAlice.address,
                to: boostedBob.address,
                tokenId: "1",
            });

            ({ message, signature } = await createSignedBoostedSendMessage(deployment.web3, {
                from: boostedBob.address,
                to: boostedAlice.address,
                tokenId: new BN(1),
                nonce: new BN(1),
                signer: boostedBob,
                verifyingContract: collectible().address,
                booster: deployment.booster,
            }));

            receipt = await collectible().boostedSend(message, signature, {
                from: deployment.booster,
                gas: 200_000,
            });

            console.log("BOOSTED SEND 2: " + receipt.receipt.gasUsed);

            ({ message, signature } = await createSignedBoostedSendMessage(deployment.web3, {
                from: boostedAlice.address,
                to: boostedBob.address,
                tokenId: new BN(1),
                nonce: new BN(2),
                signer: boostedAlice,
                verifyingContract: collectible().address,
                booster: deployment.booster,
            }));

            receipt = await collectible().boostedSend(message, signature, {
                from: deployment.booster,
                gas: 200_000,
            });

            console.log("BOOSTED SEND 2: " + receipt.receipt.gasUsed);
        });
    });

    describe("Boosted - Batch", () => {

        it("should batch empower", async () => {
            const [boostedAlice] = deployment.boostedAddresses;
            await deployment.Dubi.mint(boostedAlice.address, ether("5"), { from: defaultSender });

            // Create 5 collectibles for alice to empower
            for (let i = 0; i < 5; i++) {
                await expectCreateCollectible(collectible(), i + 1, boostedAlice.address, mockHeroAttributes());
            }

            // Empower the 5 tokens with 1 DUBI each 
            const messages: any[] = [];
            const signatures: any[] = [];

            for (let i = 0; i < 5; i++) {
                const { message, signature } = await createSignedBoostedEmpowerMessage(deployment.web3, {
                    funder: boostedAlice.address,
                    tokenId: new BN(i + 1),
                    amount: ether("1"),
                    nonce: new BN(i + 1),
                    signer: boostedAlice,
                    verifyingContract: collectible().address,
                    booster: deployment.booster,
                });

                messages.push(message);
                signatures.push(signature);
            }

            await collectible().boostedEmpowerBatch(messages, signatures, {
                from: deployment.booster,
                gas: 1_000_000,
            });

            expectBigNumber(await deployment.Dubi.balanceOf(boostedAlice.address), ZERO);
        });

        it("should batch merge", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            // Create 6 collectibles for alice to merge
            for (let i = 0; i < 6; i++) {
                await expectCreateCollectible(collectible(), i + 1, boostedAlice.address, mockHeroAttributes());
            }

            // Merge 5 times the (i + 1) token with (i + 2)
            const messages: any[] = [];
            const signatures: any[] = [];

            for (let i = 0; i < 5; i++) {
                const { message, signature } = await createSignedBoostedMergeMessage(deployment.web3, {
                    tokenIdSource: new BN(i + 1),
                    tokenIdTarget: new BN(i + 2),
                    nonce: new BN(i + 1),
                    signer: boostedAlice,
                    verifyingContract: collectible().address,
                    booster: deployment.booster,
                });

                messages.push(message);
                signatures.push(signature);
            }

            await collectible().boostedMergeBatch(messages, signatures, {
                from: deployment.booster,
                gas: 900_000,
            });

            // 5 out of 6 tokens are dead
            for (let i = 0; i < 5; i++) {
                await expectRevert(collectible().ownerOf(i + 1), "ERC721-6");
            }

            const owner = await collectible().ownerOf(6);
            expect(owner).to.equal(boostedAlice.address);
        });

        it("should batch kill", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            // Create 5 collectibles for alice to kill
            for (let i = 0; i < 5; i++) {
                await expectCreateCollectible(collectible(), i + 1, boostedAlice.address, mockHeroAttributes());
            }

            const messages: any[] = [];
            const signatures: any[] = [];

            for (let i = 0; i < 5; i++) {
                const { message, signature } = await createSignedBoostedKillMessage(deployment.web3, {
                    tokenId: new BN(i + 1),
                    nonce: new BN(i + 1),
                    signer: boostedAlice,
                    verifyingContract: collectible().address,
                    booster: deployment.booster,
                });

                messages.push(message);
                signatures.push(signature);
            }

            await collectible().boostedKillBatch(messages, signatures, {
                from: deployment.booster,
                gas: 700_000,
            });

            // All tokens got killed
            for (let i = 0; i < 5; i++) {
                await expectRevert(collectible().ownerOf(i + 1), "ERC721-6");
            }
        });

        it("should batch send", async () => {
            const [boostedAlice] = deployment.boostedAddresses;

            // Create 5 collectibles for alice
            for (let i = 0; i < 5; i++) {
                await expectCreateCollectible(collectible(), i + 1, boostedAlice.address, mockHeroAttributes());
            }

            // Batch send 5 collectibles from alice to bob
            const messages: any[] = [];
            const signatures: any[] = [];

            for (let i = 0; i < 5; i++) {
                const { message, signature } = await createSignedBoostedSendMessage(deployment.web3, {
                    from: boostedAlice.address,
                    to: bob,
                    tokenId: new BN(i + 1),
                    nonce: new BN(i + 1),
                    signer: boostedAlice,
                    verifyingContract: collectible().address,
                    booster: deployment.booster,
                });

                messages.push(message);
                signatures.push(signature);
            }

            await collectible().boostedSendBatch(messages, signatures, {
                from: deployment.booster,
                gas: 700_000,
            });

            // All tokens were sent to bob
            for (let i = 0; i < 5; i++) {
                expect(await collectible().ownerOf(i + 1)).to.equal(bob);
            }
        });
    });
});

const expectCreateCollectible = async (contract: HeroesInstance | PetsInstance, id: number, owner: string, attributes: Record<string, any>, options?: { gas?: number }): Promise<void> => {
    const gas = options?.gas ?? 1_000_000;

    // We need to pack the attributes into a uint256
    const packedData = packCollectibleData(contract, deployment, attributes);

    const receipt = await (contract.mint(id, owner, packedData.toString(), [], [] /* no extra attributes */, "0xb0b", { from: deployment.owner, gas }));
    await expectEvent(receipt, "Transfer", {
        from: constants.ZERO_ADDRESS,
        to: owner,
        tokenId: id.toString(),
    });
    console.log("CREATED: " + receipt.receipt.gasUsed);
}

const expectRevertCreateCollectible = async (contract: HeroesInstance | PetsInstance, id: number, owner: string, attributes: Record<string, any>, reason: string, options?: { gas?: number }): Promise<void> => {
    const gas = options?.gas ?? 1_000_000;

    // We need to pack the attributes into a uint256
    const packedData = packCollectibleData(contract, deployment, attributes);

    await expectRevert(contract.mint(id, owner, packedData.toString(), [], [] /* no extra attributes */, "0xb0b", { from: deployment.owner, gas }), reason);
}

const expectCreateCollectiblesError = async (contract: HeroesInstance | PetsInstance, ids: number[], owners: string[], attributes: Record<string, any>[], errorPattern: RegExp, options?: { gas?: number }): Promise<void> => {
    let receivedError: Error | undefined;
    try {
        await expectCreateCollectibles(contract, ids, owners, attributes, options);
    } catch(err) {
        receivedError = err;
    }

    if(!receivedError) {
        throw new Error(`expected error ${errorPattern}`)
    }

    expect(`${receivedError}`).to.match(errorPattern)
}

const expectCreateCollectibles = async (contract: HeroesInstance | PetsInstance, ids: number[], owners: string[], attributes: Record<string, any>[], options?: { gas?: number }): Promise<Truffle.TransactionResponse> => {
    const gas = options?.gas ?? 8_000_000 

    // We need to pack the attributes into a uint256
    const packedData: string[] = [];
    const extraAttributeKeys: any[] = [];
    const extraAttributeValues: any[] = [];
    for (const _attribues of attributes) {
        packedData.push(packCollectibleData(contract, deployment, _attribues).toString());
        extraAttributeKeys.push([]);
        extraAttributeValues.push([]);
    }

    const receipt = await (contract.batchMint(ids, owners, packedData, extraAttributeKeys, extraAttributeValues, owners, { from: deployment.owner, gas }));
    for (let i = 0; i < ids.length; i++) {
        await expectEvent(receipt, "Transfer", {
            from: constants.ZERO_ADDRESS,
            to: owners[i],
            tokenId: ids[i].toString(),
        });
    }

    console.log("CREATED: " + receipt.receipt.gasUsed);

    for (let i = 0; i < ids.length; i++) {
        await expectCollectibleData(contract, ids[i], attributes[i]);
    }
    
    return receipt;
}

const expectRevertCreateCollectibles = async (contract: HeroesInstance | PetsInstance, ids: number[], owners: string[], attributes: Record<string, any>[], reason: string, options?: { gas?: number }): Promise<void> => {
    const gas = options?.gas ?? 8_000_000;

    // We need to pack the attributes into a uint256
    const packedData: string[] = [];
    const extraAttributeKeys: any[] = [];
    const extraAttributeValues: any[] = [];
    for (const _attribues of attributes) {
        packedData.push(packCollectibleData(contract, deployment, _attribues).toString());
        extraAttributeKeys.push([]);
        extraAttributeValues.push([]);
    }

    await expectRevert(contract.batchMint(ids, owners, packedData, extraAttributeKeys, extraAttributeValues, owners, { from: deployment.owner, gas }), reason);
}

const expectEmpowerCollectible = async (contract: HeroesInstance | PetsInstance, tokenId: number, amount: BN, totalAmount: BN, owner: string, from: string): Promise<void> => {
    const receipt = await contract.empower(tokenId, amount.toString(), {
        from: from,
        gas: 200_000,
    });

    await expectEvent(receipt, "Empowered", {
        id: tokenId.toString(),
        owner,
        funder: from,
        empoweredAmount: amount,
        totalAmount,
    });

    // empoweredDUBI on token
    const data = await getCollectibleData(contract, tokenId);
    expectBigNumber(data.empoweredDUBI, totalAmount);
}

const expectKillCollectible = async (contract: HeroesInstance | PetsInstance, tokenId: number, owner: string, from: string, hasRefund?: boolean): Promise<void> => {
    // Get empowered DUBI of collectible
    const empoweredDUBI = await getEmpoweredDUBI(contract, tokenId);
    const ownerDubiBeforeKill: any = await deployment.Dubi.balanceOf(owner);

    // WORKAROUND: https://github.com/ethereum/web3.js/issues/2104
    const receipt = await contract.kill(tokenId, {
        from: from,
        gas: 250_000,
    });

    console.log("KILL: " + receipt.receipt.gasUsed);

    await expectEvent(receipt, "Transfer", {
        from: owner,
        to: constants.ZERO_ADDRESS,
        tokenId: tokenId.toString(),
    });

    await expectRevert(contract.ownerOf(tokenId), "ERC721-6");

    // DUBI must go back to owner
    const ownerDubiAfterKill = await deployment.Dubi.balanceOf(owner);
    expectBigNumber(ownerDubiAfterKill, ownerDubiBeforeKill.add(empoweredDUBI));
}

const expectApprovalForAll = async (contract: HeroesInstance | PetsInstance, owner: string, operator: string): Promise<void> => {
    // WORKAROUND: https://github.com/ethereum/web3.js/issues/2104
    const receipt = await contract.setApprovalForAll(operator, true, {
        from: owner,
        gas: 150_000,
    });

    await expectEvent(receipt, "ApprovalForAll", {
        owner,
        operator,
        approved: true,
    });
}

const expectMergeCollectible = async (contract: HeroesInstance | PetsInstance, tokenIdSource: number, tokenIdTarget: number, from: string): Promise<void> => {
    const empoweredDUBISourceBefore = await getEmpoweredDUBI(contract, tokenIdSource);
    const empoweredDUBITargetBefore = await getEmpoweredDUBI(contract, tokenIdTarget);

    const dubiOwnerBefore = await deployment.Dubi.balanceOf(from);

    // WORKAROUND: https://github.com/ethereum/web3.js/issues/2104
    const receipt = await contract.merge(tokenIdSource, tokenIdTarget, {
        from,
        gas: 250_000,
    });

    await expectEvent(receipt, "Merged", {
        targetId: tokenIdTarget.toString(),
        sourceId: tokenIdSource.toString(),
        owner: from,
    });

    await expectEvent(receipt, "Transfer", {
        from: from,
        to: constants.ZERO_ADDRESS,
        tokenId: tokenIdSource.toString(),
    });

    const empoweredDUBISourceAfter = await getEmpoweredDUBI(contract, tokenIdSource);
    const empoweredDUBITargetAfter = await getEmpoweredDUBI(contract, tokenIdTarget);

    const dubiOwnerAfter = await deployment.Dubi.balanceOf(from);

    // Dubi balance of owner stays the same, since the DUBI just moves from source to target token.
    expectBigNumber(dubiOwnerBefore, dubiOwnerAfter);

    // Source DUBI keeps the DUBI for efficiency reasons
    expectBigNumber(empoweredDUBISourceAfter, empoweredDUBISourceBefore);

    // Target DUBI is now before + source DUBI
    expectBigNumber(empoweredDUBITargetAfter, empoweredDUBITargetBefore.add(empoweredDUBISourceBefore));

    await expectRevert(contract.ownerOf(tokenIdSource), "ERC721-6");
    expect(await contract.ownerOf(tokenIdTarget)).to.equal(from);
}

const expectPendingTransferCollectible = async ({ functionName, contract, opId, tokenId, from, to }: { functionName: "transferFrom" | "safeTransferFrom", contract: HeroesInstance | PetsInstance; opId: number; tokenId: number; from: string; to: string }): Promise<void> => {
    await expectOwnerOf(contract, tokenId, from);

    // Transfer
    let receipt = await contract[functionName](from, to, tokenId, { from, gas: 350_000 });

    // console.log(`PENDING TRANSFER(${functionName}): ` + receipt.gasUsed);

    await expectEvent(receipt, "PendingOp", {
        from,
        opId: `${opId}`,
        opType: "5"
    });

    // Owner is now the contract
    await expectOwnerOf(contract, tokenId, contract.address);

    // Collectible does not have a dependent op. In the case of transfers,
    // ownership is transferred to the contract.
    await expectNoDependentOp(contract, tokenId);

    // Revert happens due to alice not being the owner anymore
    await expectRevert(contract[functionName](from, to, tokenId, {
        from,
        gas: 350_000,
    }), "ERC721-8");
}


const expectFinalizeTransferCollectible = async ({ contract, opId, tokenId, from, to }: { contract: HeroesInstance | PetsInstance; opId: number; tokenId: number; from: string; to: string }): Promise<void> => {
    // While pending owner is the contract
    await expectOwnerOf(contract, tokenId, contract.address);
    // Collectible does not have a dependent op
    await expectNoDependentOp(contract, tokenId);

    // Finalize
    let receipt = await contract.finalizePendingOp(from, { opId, opType: "5" }, {
        from: deployment.booster,
        gas: 250_000,
    });

    console.log("FINALIZED TRANSFER: " + receipt.receipt.gasUsed);

    await expectEvent(receipt, "FinalizedOp", {
        from,
        opId: `${opId}`,
        opType: "5"
    });

    await expectEvent(receipt, "Transfer", {
        from,
        to,
        tokenId: `${tokenId}`,
    });

    // Owner is now the intended recipient
    await expectOwnerOf(contract, tokenId, to);

    // Collectible does not have a dependent op
    await expectNoDependentOp(contract, tokenId);

    // Afterwards op is gone
    await expectRevert(contract.finalizePendingOp(from, { opId, opType: "5" }, {
        from: deployment.booster,
        gas: 250_000,
    }), "PB-1");
}

const expectRevertTransferCollectible = async ({ contract, opId, tokenId, from, to, signer }: { contract: HeroesInstance | PetsInstance; opId: number; tokenId: number; from: string; to: string; signer: { address: string; privateKey: string } }): Promise<void> => {
    // While pending owner is the contract
    await expectOwnerOf(contract, tokenId, contract.address);
    // Collectible does not have a dependent op
    await expectNoDependentOp(contract, tokenId);

    const { messageBytes, signature } = await createSignedBoostedEmpowerMessage(deployment.web3, {
        funder: from,
        tokenId: `${tokenId}`,
        amount: ether("1"),
        nonce: new BN(1),
        signer,
        verifyingContract: contract.address,
        booster: deployment.booster,
    });

    // Revert
    let receipt = await contract.revertPendingOp(from, { opId, opType: "5" }, messageBytes, signature, {
        from: deployment.booster,
        gas: 250_000,
    });

    // console.log("REVERTED TRANSFER: " + receipt.gasUsed);

    await expectEvent(receipt, "RevertedOp", {
        from,
        opId: `${opId}`,
        opType: "5"
    });

    // Afterwards op is gone
    await expectRevert(contract.revertPendingOp(from, { opId, opType: "5" }, messageBytes, signature, {
        from: deployment.booster,
        gas: 250_000,
    }), "PB-1");

    // Owner is again the original sender
    await expectOwnerOf(contract, tokenId, from);
    // Collectible does not have a dependent op
    await expectNoDependentOp(contract, tokenId);
}

const expectPendingMergeCollectibles = async ({ contract, opId, tokenIdSource, tokenIdTarget, from }: { contract: HeroesInstance | PetsInstance; opId: number; tokenIdSource: number; tokenIdTarget: number; from: string; }): Promise<void> => {
    const funderDubiBalanceBefore: any = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceBefore: any = await deployment.Dubi.balanceOf(contract.address);

    const empoweredDUBIOnTokenSourceBefore = await getEmpoweredDUBI(contract, tokenIdSource);
    const empoweredDUBIOnTokenTargetBefore = await getEmpoweredDUBI(contract, tokenIdTarget);

    // Merge
    let receipt = await contract.merge(tokenIdSource, tokenIdTarget, {
        from,
        gas: 450_000,
    });

    console.log("PENDING MERGE: " + receipt.receipt.gasUsed);

    await expectEvent(receipt, "PendingOp", {
        from,
        opId: `${opId}`,
        opType: "6"
    });

    // Collectible now has a dependent op
    await expectDependentOp(contract, tokenIdSource);
    await expectDependentOp(contract, tokenIdTarget);
    await expectRevert(contract.merge(tokenIdSource, tokenIdTarget, {
        from,
        gas: 350_000,
    }), "15");

    const empoweredDUBIOnTokenSourceAfter = await getEmpoweredDUBI(contract, tokenIdSource);
    const empoweredDUBIOnTokenTargetAfter = await getEmpoweredDUBI(contract, tokenIdTarget);
    const funderDubiBalanceAfter = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceAfter = await deployment.Dubi.balanceOf(contract.address);

    // Funder DUBI balance didn't change
    expectBigNumber(funderDubiBalanceAfter, funderDubiBalanceBefore);
    // Contract DUBI balance didn't change
    expectBigNumber(contractDubiBalanceAfter, contractDubiBalanceBefore);
    // Empowered DUBI on either token didn't change
    expectBigNumber(empoweredDUBIOnTokenSourceAfter, empoweredDUBIOnTokenSourceBefore);
    expectBigNumber(empoweredDUBIOnTokenTargetAfter, empoweredDUBIOnTokenTargetBefore);
}

const expectFinalizeMergeCollectibles = async ({ contract, opId, tokenIdSource, tokenIdTarget, from }: { contract: HeroesInstance | PetsInstance; opId: number; tokenIdSource: number; tokenIdTarget: number; from: string; }): Promise<void> => {
    const funderDubiBalanceBefore: any = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceBefore: any = await deployment.Dubi.balanceOf(contract.address);
    const empoweredDUBIOnTokenSourceBefore = await getEmpoweredDUBI(contract, tokenIdSource);
    const empoweredDUBIOnTokenTargetBefore = await getEmpoweredDUBI(contract, tokenIdTarget);

    // Collectible must have a dependent op since it's pending
    await expectDependentOp(contract, tokenIdSource);
    await expectDependentOp(contract, tokenIdTarget);

    // Finalize
    let receipt = await contract.finalizePendingOp(from, { opId, opType: "6" }, {
        from: deployment.booster,
        gas: 250_000,
    });

    // console.log("FINALIZED MERGE: " + receipt.gasUsed);

    await expectEvent(receipt, "FinalizedOp", {
        from,
        opId: `${opId}`,
        opType: "6"
    });

    // Afterwards op is gone
    await expectRevert(contract.finalizePendingOp(from, { opId, opType: "6" }, {
        from: deployment.booster,
        gas: 250_000,
    }), "PB-1");

    await expectEvent(receipt, "Merged");

    const funderDubiBalanceAfter = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceAfter = await deployment.Dubi.balanceOf(contract.address);
    const empoweredDUBIOnTokenSourceAfter = await getEmpoweredDUBI(contract, tokenIdSource);
    const empoweredDUBIOnTokenTargetAfter = await getEmpoweredDUBI(contract, tokenIdTarget);

    // Funder DUBI balance didn't change
    expectBigNumber(funderDubiBalanceAfter, funderDubiBalanceBefore);
    // Contract DUBI balance didn't change
    expectBigNumber(contractDubiBalanceAfter, contractDubiBalanceBefore);
    // EmpoweredDUBI got added to token target
    expectBigNumber(empoweredDUBIOnTokenTargetAfter, empoweredDUBIOnTokenTargetBefore.add(empoweredDUBIOnTokenSourceBefore));
    // For efficiency reasons the empoweredDUBI stays on the token source
    expectBigNumber(empoweredDUBIOnTokenSourceAfter, empoweredDUBIOnTokenSourceBefore);

    // Collectible no longer has a dependent op
    await expectNoDependentOp(contract, tokenIdTarget);

    // Source no longer has a dependent op
    await expectNoDependentOp(contract, tokenIdSource);
    await expectNoLongerExists(contract, tokenIdSource);
}

const expectRevertMergeCollectibles = async ({ contract, opId, tokenIdSource, tokenIdTarget, from, signer }: { contract: HeroesInstance | PetsInstance; opId: number; tokenIdSource: number; tokenIdTarget: number; from: string; signer: { address: string; privateKey: string } }): Promise<void> => {
    const funderDubiBalanceBefore: any = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceBefore: any = await deployment.Dubi.balanceOf(contract.address);
    const empoweredDUBIOnTokenSourceBefore = await getEmpoweredDUBI(contract, tokenIdSource);
    const empoweredDUBIOnTokenTargetBefore = await getEmpoweredDUBI(contract, tokenIdTarget);

    // Collectibles must have a dependent ops since they are pending
    await expectDependentOp(contract, tokenIdSource);
    await expectDependentOp(contract, tokenIdTarget);

    const { messageBytes, signature } = await createSignedBoostedEmpowerMessage(deployment.web3, {
        funder: from,
        tokenId: `${tokenIdSource}`,
        amount: ether("1"),
        nonce: new BN(1),
        signer,
        verifyingContract: contract.address,
        booster: deployment.booster,
    });

    // Revert
    let receipt = await contract.revertPendingOp(from, { opId, opType: "6" }, messageBytes, signature, {
        from: deployment.booster,
        gas: 250_000,
    });

    console.log("REVERTED MERGE: " + receipt.receipt.gasUsed);

    await expectEvent(receipt, "RevertedOp", {
        from,
        opId: `${opId}`,
        opType: "6"
    });

    await expectEvent.notEmitted(receipt, "Merged");

    // Afterwards op is gone
    await expectRevert(contract.revertPendingOp(from, { opId, opType: "6" }, messageBytes, signature, {
        from: deployment.booster,
        gas: 250_000,
    }), "PB-1");

    const funderDubiBalanceAfter = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceAfter = await deployment.Dubi.balanceOf(contract.address);
    const empoweredDUBIOnTokenSourceAfter = await getEmpoweredDUBI(contract, tokenIdSource);
    const empoweredDUBIOnTokenTargetAfter = await getEmpoweredDUBI(contract, tokenIdTarget);

    // DUBI balance of funder unchanged
    expectBigNumber(funderDubiBalanceAfter, funderDubiBalanceBefore);
    // DUBI balance of contract unchanged
    expectBigNumber(contractDubiBalanceAfter, contractDubiBalanceBefore);
    // Empowered DUBI on tokens remained unchanged
    expectBigNumber(empoweredDUBIOnTokenSourceAfter, empoweredDUBIOnTokenSourceBefore);
    expectBigNumber(empoweredDUBIOnTokenTargetAfter, empoweredDUBIOnTokenTargetBefore);

    // Dependent op flags got removed
    await expectNoDependentOp(contract, tokenIdSource);
    await expectNoDependentOp(contract, tokenIdTarget);
}

const expectPendingEmpowerCollectible = async ({ contract, opId, amount, tokenId, from }: { contract: HeroesInstance | PetsInstance; opId: number; amount: number; tokenId: number; from: string; }): Promise<void> => {

    const funderDubiBalanceBefore: any = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceBefore: any = await deployment.Dubi.balanceOf(contract.address);

    const empoweredDUBIOnTokenBefore = await getEmpoweredDUBI(contract, tokenId);

    // Empower
    let receipt = await contract.empower(tokenId, amount, {
        from,
        gas: 350_000,
    });

    console.log("PENDING EMPOWER: " + receipt.receipt.gasUsed);

    await expectEvent(receipt, "PendingOp", {
        from,
        opId: `${opId}`,
        opType: "7"
    });

    const empoweredDUBIOnTokenAfter = await getEmpoweredDUBI(contract, tokenId);

    // Collectible now has a dependent op
    await expectDependentOp(contract, tokenId);
    await expectRevert(contract.empower(tokenId, amount, {
        from,
        gas: 350_000,
    }), "9");

    const funderDubiBalanceAfter = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceAfter = await deployment.Dubi.balanceOf(contract.address);

    // DUBI got removed from funder
    expectBigNumber(funderDubiBalanceAfter, funderDubiBalanceBefore.sub(new BN(amount)));
    // DUBI got added to contract
    expectBigNumber(contractDubiBalanceAfter, contractDubiBalanceBefore.add(new BN(amount)));
    // Empowered DUBI on token stayed the same
    expectBigNumber(empoweredDUBIOnTokenAfter, empoweredDUBIOnTokenBefore);
}

const expectFinalizeEmpowerCollectible = async ({ contract, opId, tokenId, from, amount }: { contract: HeroesInstance | PetsInstance; opId: number; tokenId: number; from: string; amount: number; }): Promise<void> => {
    const funderDubiBalanceBefore: any = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceBefore: any = await deployment.Dubi.balanceOf(contract.address);
    const empoweredDUBIOnTokenBefore = await getEmpoweredDUBI(contract, tokenId);

    // Collectible must have a dependent op since it's pending
    await expectDependentOp(contract, tokenId);

    // Finalize
    let receipt = await contract.finalizePendingOp(from, { opId, opType: "7" }, {
        from: deployment.booster,
        gas: 150_000,
    });

    const empoweredDUBIOnTokenAfter = await getEmpoweredDUBI(contract, tokenId);

    console.log("FINALIZED EMPOWER: " + receipt.receipt.gasUsed);

    await expectEvent(receipt, "FinalizedOp", {
        from,
        opId: `${opId}`,
        opType: "7"
    });

    await expectEvent(receipt, "Empowered");

    // Afterwards op is gone
    await expectRevert(contract.finalizePendingOp(from, { opId, opType: "7" }, {
        from: deployment.booster,
        gas: 150_000,
    }), "PB-1");

    const funderDubiBalanceAfter = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceAfter = await deployment.Dubi.balanceOf(contract.address);

    // Funder DUBI balance didn't change
    expectBigNumber(funderDubiBalanceAfter, funderDubiBalanceBefore);
    // Contract DUBI balance didn't change
    expectBigNumber(contractDubiBalanceAfter, contractDubiBalanceBefore);
    // EmpoweredDUBI got added to collectible
    expectBigNumber(empoweredDUBIOnTokenAfter, empoweredDUBIOnTokenBefore.add(new BN(amount)));

    // Collectible no longer has a dependent op
    await expectNoDependentOp(contract, tokenId);
}


const expectRevertEmpowerCollectible = async ({ contract, opId, tokenId, from, amount, signer }: { contract: HeroesInstance | PetsInstance; opId: number; tokenId: number; from: string; amount: number; signer: { address: string; privateKey: string } }): Promise<void> => {
    const funderDubiBalanceBefore: any = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceBefore: any = await deployment.Dubi.balanceOf(contract.address);
    const empoweredDUBIOnTokenBefore = await getEmpoweredDUBI(contract, tokenId);

    // Collectible must have a dependent op since it's pending
    await expectDependentOp(contract, tokenId);

    const { messageBytes, signature } = await createSignedBoostedEmpowerMessage(deployment.web3, {
        funder: from,
        tokenId: `${tokenId}`,
        amount: ether("1"),
        nonce: new BN(1),
        signer,
        verifyingContract: contract.address,
        booster: deployment.booster,
    });

    // Revert
    let receipt = await contract.revertPendingOp(from, { opId, opType: "7" }, messageBytes, signature, {
        from: deployment.booster, gas: 450_000,
    });

    const empoweredDUBIOnTokenAfter = await getEmpoweredDUBI(contract, tokenId);

    console.log("REVERTED EMPOWER: " + receipt.receipt.gasUsed);

    await expectEvent(receipt, "RevertedOp", {
        from,
        opId: `${opId}`,
        opType: "7"
    });

    await expectEvent.notEmitted(receipt, "Empowered");

    // Afterwards op is gone
    await expectRevert(contract.revertPendingOp(from, { opId, opType: "7" }, messageBytes, signature, {
        from: deployment.booster, gas: 450_000,
    }), "PB-1");

    const funderDubiBalanceAfter = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceAfter = await deployment.Dubi.balanceOf(contract.address);

    // DUBI balance of funder reverted
    expectBigNumber(funderDubiBalanceAfter, funderDubiBalanceBefore.add(new BN(amount)));
    // DUBI balance of contract reverted
    expectBigNumber(contractDubiBalanceAfter, contractDubiBalanceBefore.sub(new BN(amount)));
    // Empowered DUBI on token remained unchanged
    expectBigNumber(empoweredDUBIOnTokenAfter, empoweredDUBIOnTokenBefore);

    // Dependent op flag got removed
    await expectNoDependentOp(contract, tokenId);
}

const expectPendingKillCollectible = async ({ contract, opId, tokenId, from }: { contract: HeroesInstance | PetsInstance; opId: number; tokenId: number; from: string; }): Promise<void> => {
    const funderDubiBalanceBefore: any = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceBefore: any = await deployment.Dubi.balanceOf(contract.address);

    const empoweredDUBIOnTokenBefore = await getEmpoweredDUBI(contract, tokenId);

    // Kill
    let receipt = await contract.kill(tokenId, { from, gas: 450_000 });

    console.log("PENDING KILL: " + receipt.receipt.gasUsed);

    await expectEvent(receipt, "PendingOp", {
        from,
        opId: `${opId}`,
        opType: "8"
    });

    // Collectible now has a dependent op
    await expectDependentOp(contract, tokenId);
    await expectRevert(contract.kill(tokenId, { from, gas: 450_000 }), "9");

    const empoweredDUBIOnTokenAfter = await getEmpoweredDUBI(contract, tokenId);
    const funderDubiBalanceAfter = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceAfter = await deployment.Dubi.balanceOf(contract.address);

    // Funder DUBI balance didn't change
    expectBigNumber(funderDubiBalanceAfter, funderDubiBalanceBefore);
    // Contract DUBI balance didn't change
    expectBigNumber(contractDubiBalanceAfter, contractDubiBalanceBefore);
    // Empowered DUBI on token didn't change
    expectBigNumber(empoweredDUBIOnTokenAfter, empoweredDUBIOnTokenBefore);
}

const expectFinalizeKillCollectible = async ({ contract, opId, tokenId, from, hasRefund }: { contract: HeroesInstance | PetsInstance; opId: number; tokenId: number; from: string; hasRefund: boolean }): Promise<void> => {
    const funderDubiBalanceBefore: any = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceBefore: any = await deployment.Dubi.balanceOf(contract.address);
    const empoweredDUBIOnTokenBefore = await getEmpoweredDUBI(contract, tokenId);

    // Collectible must have a dependent op since it's pending
    await expectDependentOp(contract, tokenId);

    // Finalize
    let receipt = await contract.finalizePendingOp(from, { opId, opType: "8" }, { from: deployment.booster, gas: 250_000 });

    const empoweredDUBIOnTokenAfter = await getEmpoweredDUBI(contract, tokenId);

    console.log("FINALIZED KILL: " + receipt.receipt.gasUsed);

    await expectEvent(receipt, "FinalizedOp", {
        from,
        opId: `${opId}`,
        opType: "8"
    });

    await expectEvent(receipt, "Transfer", {
        from,
        to: constants.ZERO_ADDRESS,
        tokenId: tokenId.toString(),
    });

    // Afterwards op is gone
    await expectRevert(contract.finalizePendingOp(from, { opId, opType: "8" }, { from: deployment.booster, gas: 250_000 }), "PB-1");

    const funderDubiBalanceAfter = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceAfter = await deployment.Dubi.balanceOf(contract.address);

    // DUBI got added to funder
    expectBigNumber(funderDubiBalanceAfter, funderDubiBalanceBefore.add(new BN(empoweredDUBIOnTokenBefore)));
    // DUBI got removed from contract
    expectBigNumber(contractDubiBalanceAfter, contractDubiBalanceBefore.sub(new BN(empoweredDUBIOnTokenBefore)));
    // Empowered DUBI is still on the token for efficiency reasons
    expectBigNumber(empoweredDUBIOnTokenAfter, empoweredDUBIOnTokenBefore);

    // For efficiency reasons The dependent op flag is not removed (i.e. tokenData still exists)
    await expectDependentOp(contract, tokenId);
    // But the tokenId reverts when querying the owner
    await expectNoLongerExists(contract, tokenId);
}

const expectRevertKillCollectible = async ({ contract, opId, tokenId, from, signer }: { contract: HeroesInstance | PetsInstance; opId: number; tokenId: number; from: string; signer: { address: string; privateKey: string } }): Promise<void> => {
    const funderDubiBalanceBefore: any = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceBefore: any = await deployment.Dubi.balanceOf(contract.address);
    const empoweredDUBIOnTokenBefore = await getEmpoweredDUBI(contract, tokenId);

    // Collectible must have a dependent op since it's pending
    await expectDependentOp(contract, tokenId);

    const { messageBytes, signature } = await createSignedBoostedEmpowerMessage(deployment.web3, {
        funder: from,
        tokenId: `${tokenId}`,
        amount: ether("1"),
        nonce: new BN(1),
        signer,
        verifyingContract: contract.address,
        booster: deployment.booster,
    });

    // Revert
    let receipt = await contract.revertPendingOp(from, { opId, opType: "8" }, messageBytes, signature, { from: deployment.booster, gas: 200_000 });

    const empoweredDUBIOnTokenAfter = await getEmpoweredDUBI(contract, tokenId);

    console.log("REVERTED KILL: " + receipt.receipt.gasUsed);

    await expectEvent(receipt, "RevertedOp", {
        from,
        opId: `${opId}`,
        opType: "8"
    });

    await expectEvent.notEmitted(receipt, "Transfer");

    // Afterwards op is gone
    await expectRevert(contract.revertPendingOp(from, { opId, opType: "8" }, messageBytes, signature, { from: deployment.booster, gas: 200_000 }), "PB-1");

    const funderDubiBalanceAfter = await deployment.Dubi.balanceOf(from);
    const contractDubiBalanceAfter = await deployment.Dubi.balanceOf(contract.address);

    // DUBI balance of funder unchanged
    expectBigNumber(funderDubiBalanceAfter, funderDubiBalanceBefore);
    // DUBI balance of contract unchanged
    expectBigNumber(contractDubiBalanceAfter, contractDubiBalanceBefore);
    // Empowered DUBI is still on the token
    expectBigNumber(empoweredDUBIOnTokenAfter, empoweredDUBIOnTokenBefore);

    // Dependent op flag got removed
    await expectNoDependentOp(contract, tokenId);
}

const getEmpoweredDUBI = async (contract: any, id: number): Promise<BN> => {
    const onChainData = await getCollectibleData(contract, id);
    return new BN(onChainData.empoweredDUBI);
}

const timestampWithOffset = async (offset) => (await deployment.web3.eth.getBlock("latest")).timestamp as number + offset;

const expectDependentOp = async (contract: HeroesInstance | PetsInstance, tokenId: number) => {
    const data = await getCollectibleData(contract, tokenId);
    expect(data.hasDependentOp).to.be.true;
}

const expectNoDependentOp = async (contract: HeroesInstance | PetsInstance, tokenId: number) => {
    const data = await getCollectibleData(contract, tokenId);
    expect(data.hasDependentOp).to.be.false;
}

const expectNoLongerExists = async (contract: HeroesInstance | PetsInstance, tokenId: number) => {
    await expectRevert(contract.ownerOf(tokenId), "ERC721-6");
}

const expectOwnerOf = async (contract: HeroesInstance | PetsInstance, tokenId: number, owner: string) => {
    expect(await contract.ownerOf(tokenId)).to.eq(owner);
}

const getCollectibleData = async (contract: HeroesInstance | PetsInstance, tokenId): Promise<Record<string, any>> => {
    // Returned data is an array
    const data = await contract.getCollectibleData(tokenId);
    const dataObj = {};

    for (const [key, value] of Object.entries(data)) {
        if (isNaN(+key)) { // exclude index-properties
            dataObj[key] = value;
        }
    }

    if (contract.address === deployment.Heroes.address) {
        delete dataObj["shinyHue"];
    } else {
        delete dataObj["skinDivision"];
        delete dataObj["class"];
        delete dataObj["skinSlot"];
    }

    return dataObj;
}

const expectCollectibleData = async (contract: HeroesInstance | PetsInstance, tokenId: any, attributes: Record<string, any>) => {
    const onChainData = await getCollectibleData(contract, tokenId);

    // Fix attributes if they don't contain some zero-by-default attributes like the flags
    attributes.empoweredDUBI = attributes.empoweredDUBI ?? 0;
    attributes.isFraud = attributes.isFraud ?? false;
    attributes.hasDependentOp = attributes.hasDependentOp ?? false;

    expect(Object.keys(onChainData)).to.have.length(Object.keys(attributes).length);

    for (const [key, value] of Object.entries(attributes)) {
        expect(onChainData[key].toString()).to.eq(value.toString());
    }
}
