const { accounts, contract } = require("@openzeppelin/test-environment");

const {
    BN,
    constants,
    expectEvent,
    expectRevert,
    singletons,
} = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = constants;

const { expect } = require("chai");

const { shouldSupportInterfaces } = require("./SupportsInterface.behavior");

const ERC721Mock = contract.fromArtifact("DummyERC721");
const ERC721ReceiverMock = contract.fromArtifact("DummyERC721Receiver");
const ProtectedBoostableLib = contract.fromArtifact('ProtectedBoostableLib');
const CosBoostableLib = contract.fromArtifact('CosBoostableLib');

const OptInArtifact = require("@prps/solidity/build/contracts/OptIn.json");
const OptIn = contract.fromABI(OptInArtifact.abi, OptInArtifact.bytecode);

let optIn;

describe("ERC721", function () {
    const [
        owner,
        newOwner,
        approved,
        anotherApproved,
        operator,
        other,
        registryFunder,
    ] = accounts;

    const name = "Non Fungible Token";
    const symbol = "NFT";

    const firstTokenId = new BN("5042");
    const secondTokenId = new BN("79217");
    const nonExistentTokenId = new BN("13");

    const RECEIVER_MAGIC_VALUE = "0x150b7a02";

    beforeEach(async function () {
        // We need the registry
        this.erc1820 = await singletons.ERC1820Registry(registryFunder);

        // and OptIn
        optIn = await OptIn.new(owner);

        const protectedBoostableLib = await ProtectedBoostableLib.new();
        const cosBoostableLib = await CosBoostableLib.new();

        await ERC721Mock.detectNetwork();
        await ERC721Mock.link("ProtectedBoostableLib", protectedBoostableLib.address);
        await ERC721Mock.link("CosBoostableLib", cosBoostableLib.address);

        this.token = await ERC721Mock.new(name, symbol, optIn.address);
    });

    shouldSupportInterfaces([
        "ERC165",
        "ERC721",
    ]);

    describe("metadata", function () {
        it("has a name", async function () {
            expect(await this.token.name()).to.be.equal(name);
        });

        it("has a symbol", async function () {
            expect(await this.token.symbol()).to.be.equal(symbol);
        });
    });

    context("with minted tokens", function () {
        beforeEach(async function () {
            await this.token.mint(owner, firstTokenId);
            await this.token.mint(owner, secondTokenId);
            this.toWhom = other; // default to other for toWhom in context-dependent tests
        });

        describe("balanceOf", function () {
            context("when the given address owns some tokens", function () {
                it("returns the amount of tokens owned by the given address", async function () {
                    expect(await this.token.balanceOf(owner)).to.be.bignumber.equal("0");
                });
            });

            context("when the given address does not own any tokens", function () {
                it("returns 0", async function () {
                    expect(await this.token.balanceOf(other)).to.be.bignumber.equal("0");
                });
            });

            context("when querying the zero address", function () {
                it("returns 0", async function () {
                    expect(await this.token.balanceOf(ZERO_ADDRESS)).to.be.bignumber.equal("0");
                });
            });
        });

        describe("ownerOf", function () {
            context("when the given token ID was tracked by this token", function () {
                const tokenId = firstTokenId;

                it("returns the owner of the given token ID", async function () {
                    expect(await this.token.ownerOf(tokenId)).to.be.equal(owner);
                });
            });

            context(
                "when the given token ID was not tracked by this token",
                function () {
                    const tokenId = nonExistentTokenId;

                    it("reverts", async function () {
                        await expectRevert(
                            this.token.ownerOf(tokenId),
                            "ERC721-6"
                        );
                    });
                }
            );
        });

        describe("transfers", function () {
            const tokenId = firstTokenId;
            const data = "0x42";

            let logs = null;

            beforeEach(async function () {
                await this.token.approve(approved, tokenId, { from: owner });
                await this.token.setApprovalForAll(operator, true, { from: owner });
            });

            const transferWasSuccessful = function ({ owner, tokenId, approved }) {
                it("transfers the ownership of the given token ID to the given address", async function () {
                    expect(await this.token.ownerOf(tokenId)).to.be.equal(this.toWhom);
                });

                it("emits a Transfer event", async function () {
                    expectEvent.inLogs(logs, "Transfer", {
                        from: owner,
                        to: this.toWhom,
                        tokenId: tokenId,
                    });
                });

                it("clears the approval for the token ID", async function () {
                    expect(await this.token.getApproved(tokenId)).to.be.equal(
                        ZERO_ADDRESS
                    );
                });

                it("adjusts owners balances", async function () {
                    expect(await this.token.balanceOf(owner)).to.be.bignumber.equal("0");
                });
            };

            const shouldTransferTokensByUsers = function (transferFunction) {
                context("when called by the owner", function () {
                    beforeEach(async function () {
                        ({ logs } = await transferFunction.call(
                            this,
                            owner,
                            this.toWhom,
                            tokenId,
                            { from: owner }
                        ));
                    });
                    transferWasSuccessful({ owner, tokenId, approved });
                });

                context("when called by the approved individual", function () {
                    beforeEach(async function () {
                        ({ logs } = await transferFunction.call(
                            this,
                            owner,
                            this.toWhom,
                            tokenId,
                            { from: approved }
                        ));
                    });
                    transferWasSuccessful({ owner, tokenId, approved });
                });

                context("when called by the operator", function () {
                    beforeEach(async function () {
                        ({ logs } = await transferFunction.call(
                            this,
                            owner,
                            this.toWhom,
                            tokenId,
                            { from: operator }
                        ));
                    });
                    transferWasSuccessful({ owner, tokenId, approved });
                });

                context(
                    "when called by the owner without an approved user",
                    function () {
                        beforeEach(async function () {
                            await this.token.approve(ZERO_ADDRESS, tokenId, { from: owner });
                            ({ logs } = await transferFunction.call(
                                this,
                                owner,
                                this.toWhom,
                                tokenId,
                                { from: operator }
                            ));
                        });
                        transferWasSuccessful({ owner, tokenId, approved: null });
                    }
                );

                context("when sent to the owner", function () {
                    beforeEach(async function () {
                        ({ logs } = await transferFunction.call(this, owner, owner, tokenId, {
                            from: owner,
                        }));
                    });

                    it("keeps ownership of the token", async function () {
                        expect(await this.token.ownerOf(tokenId)).to.be.equal(owner);
                    });

                    it("clears the approval for the token ID", async function () {
                        expect(await this.token.getApproved(tokenId)).to.be.equal(
                            ZERO_ADDRESS
                        );
                    });

                    it("emits only a transfer event", async function () {
                        expectEvent.inLogs(logs, "Transfer", {
                            from: owner,
                            to: owner,
                            tokenId: tokenId,
                        });
                    });

                    it("keeps the owner balance", async function () {
                        expect(await this.token.balanceOf(owner)).to.be.bignumber.equal(
                            "0"
                        );
                    });
                });

                context(
                    "when the address of the previous owner is incorrect",
                    function () {
                        it("reverts", async function () {
                            await expectRevert(
                                transferFunction.call(this, other, other, tokenId, {
                                    from: owner,
                                }),
                                "ERC721-8"
                            );
                        });
                    }
                );

                context(
                    "when the sender is not authorized for the token id",
                    function () {
                        it("reverts", async function () {
                            await expectRevert(
                                transferFunction.call(this, owner, other, tokenId, {
                                    from: other,
                                }),
                                "ERC721-2"
                            );
                        });
                    }
                );

                context("when the given token ID does not exist", function () {
                    it("reverts", async function () {
                        await expectRevert(
                            transferFunction.call(this, owner, other, nonExistentTokenId, {
                                from: owner,
                            }),
                            "ERC721-6"
                        );
                    });
                });

                context(
                    "when the address to transfer the token to is the zero address",
                    function () {
                        it("reverts", async function () {
                            await expectRevert(
                                transferFunction.call(this, owner, ZERO_ADDRESS, tokenId, {
                                    from: owner,
                                }),
                                "ERC721-7"
                            );
                        });
                    }
                );
            };

            describe("via transferFrom", function () {
                shouldTransferTokensByUsers(function (from, to, tokenId, opts) {
                    return this.token.transferFrom(from, to, tokenId, opts);
                });
            });

            describe("via safeTransferFrom", function () {
                const safeTransferFromWithData = function (from, to, tokenId, opts) {
                    return this.token.methods[
                        "safeTransferFrom(address,address,uint256,bytes)"
                    ](from, to, tokenId, data, opts);
                };

                const safeTransferFromWithoutData = function (from, to, tokenId, opts) {
                    return this.token.methods[
                        "safeTransferFrom(address,address,uint256)"
                    ](from, to, tokenId, opts);
                };

                const shouldTransferSafely = function (transferFun, data) {
                    describe("to a user account", function () {
                        shouldTransferTokensByUsers(transferFun);
                    });

                    describe("to a valid receiver contract", function () {
                        beforeEach(async function () {
                            this.receiver = await ERC721ReceiverMock.new(
                                RECEIVER_MAGIC_VALUE,
                                false
                            );
                            this.toWhom = this.receiver.address;
                        });

                        shouldTransferTokensByUsers(transferFun);

                        describe("with an invalid token id", function () {
                            it("reverts", async function () {
                                await expectRevert(
                                    transferFun.call(
                                        this,
                                        owner,
                                        this.receiver.address,
                                        nonExistentTokenId,
                                        { from: owner }
                                    ),
                                    "ERC721-6"
                                );
                            });
                        });
                    });
                };

                describe("with data", function () {
                    shouldTransferSafely(safeTransferFromWithData, data);
                });

                describe("without data", function () {
                    shouldTransferSafely(safeTransferFromWithoutData, null);
                });
            });
        });

        describe("approve", function () {
            const tokenId = firstTokenId;

            let logs = null;

            const itClearsApproval = function () {
                it("clears approval for the token", async function () {
                    expect(await this.token.getApproved(tokenId)).to.be.equal(
                        ZERO_ADDRESS
                    );
                });
            };

            const itApproves = function (address) {
                it("sets the approval for the target address", async function () {
                    expect(await this.token.getApproved(tokenId)).to.be.equal(address);
                });
            };

            const itEmitsApprovalEvent = function (address) {
                it("emits an approval event", async function () {
                    expectEvent.inLogs(logs, "Approval", {
                        owner: owner,
                        approved: address,
                        tokenId: tokenId,
                    });
                });
            };

            context("when clearing approval", function () {
                context("when there was no prior approval", function () {
                    beforeEach(async function () {
                        ({ logs } = await this.token.approve(ZERO_ADDRESS, tokenId, {
                            from: owner,
                        }));
                    });

                    itClearsApproval();
                    itEmitsApprovalEvent(ZERO_ADDRESS);
                });

                context("when there was a prior approval", function () {
                    beforeEach(async function () {
                        await this.token.approve(approved, tokenId, { from: owner });
                        ({ logs } = await this.token.approve(ZERO_ADDRESS, tokenId, {
                            from: owner,
                        }));
                    });

                    itClearsApproval();
                    itEmitsApprovalEvent(ZERO_ADDRESS);
                });
            });

            context("when approving a non-zero address", function () {
                context("when there was no prior approval", function () {
                    beforeEach(async function () {
                        ({ logs } = await this.token.approve(approved, tokenId, {
                            from: owner,
                        }));
                    });

                    itApproves(approved);
                    itEmitsApprovalEvent(approved);
                });

                context(
                    "when there was a prior approval to the same address",
                    function () {
                        beforeEach(async function () {
                            await this.token.approve(approved, tokenId, { from: owner });
                            ({ logs } = await this.token.approve(approved, tokenId, {
                                from: owner,
                            }));
                        });

                        itApproves(approved);
                        itEmitsApprovalEvent(approved);
                    }
                );

                context(
                    "when there was a prior approval to a different address",
                    function () {
                        beforeEach(async function () {
                            await this.token.approve(anotherApproved, tokenId, { from: owner });
                            ({ logs } = await this.token.approve(anotherApproved, tokenId, {
                                from: owner,
                            }));
                        });

                        itApproves(anotherApproved);
                        itEmitsApprovalEvent(anotherApproved);
                    }
                );
            });

            context(
                "when the address that receives the approval is the owner",
                function () {
                    it("reverts", async function () {
                        await expectRevert(
                            this.token.approve(owner, tokenId, { from: owner }),
                            "ERC721-1"
                        );
                    });
                }
            );

            context("when the sender does not own the given token ID", function () {
                it("reverts", async function () {
                    await expectRevert(
                        this.token.approve(approved, tokenId, { from: other }),
                        "ERC721-2"
                    );
                });
            });

            context(
                "when the sender is approved for the given token ID",
                function () {
                    it("reverts", async function () {
                        await this.token.approve(approved, tokenId, { from: owner });
                        await expectRevert(
                            this.token.approve(anotherApproved, tokenId, { from: approved }),
                            "ERC721-2"
                        );
                    });
                }
            );

            context("when the sender is an operator", function () {
                beforeEach(async function () {
                    await this.token.setApprovalForAll(operator, true, { from: owner });
                    ({ logs } = await this.token.approve(approved, tokenId, {
                        from: operator,
                    }));
                });

                itApproves(approved);
                itEmitsApprovalEvent(approved);
            });

            context("when the given token ID does not exist", function () {
                it("reverts", async function () {
                    await expectRevert(
                        this.token.approve(approved, nonExistentTokenId, { from: operator }),
                        "ERC721-6"
                    );
                });
            });
        });

        describe("setApprovalForAll", function () {
            context(
                "when the operator willing to approve is not the owner",
                function () {
                    context(
                        "when there is no operator approval set by the sender",
                        function () {
                            it("approves the operator", async function () {
                                await this.token.setApprovalForAll(operator, true, {
                                    from: owner,
                                });

                                expect(
                                    await this.token.isApprovedForAll(owner, operator)
                                ).to.equal(true);
                            });

                            it("emits an approval event", async function () {
                                const { logs } = await this.token.setApprovalForAll(
                                    operator,
                                    true,
                                    { from: owner }
                                );

                                expectEvent.inLogs(logs, "ApprovalForAll", {
                                    owner: owner,
                                    operator: operator,
                                    approved: true,
                                });
                            });
                        }
                    );

                    context("when the operator was set as not approved", function () {
                        beforeEach(async function () {
                            await this.token.setApprovalForAll(operator, false, {
                                from: owner,
                            });
                        });

                        it("approves the operator", async function () {
                            await this.token.setApprovalForAll(operator, true, { from: owner });

                            expect(
                                await this.token.isApprovedForAll(owner, operator)
                            ).to.equal(true);
                        });

                        it("emits an approval event", async function () {
                            const { logs } = await this.token.setApprovalForAll(
                                operator,
                                true,
                                { from: owner }
                            );

                            expectEvent.inLogs(logs, "ApprovalForAll", {
                                owner: owner,
                                operator: operator,
                                approved: true,
                            });
                        });

                        it("can unset the operator approval", async function () {
                            await this.token.setApprovalForAll(operator, false, {
                                from: owner,
                            });

                            expect(
                                await this.token.isApprovedForAll(owner, operator)
                            ).to.equal(false);
                        });
                    });

                    context("when the operator was already approved", function () {
                        beforeEach(async function () {
                            await this.token.setApprovalForAll(operator, true, { from: owner });
                        });

                        it("keeps the approval to the given address", async function () {
                            await this.token.setApprovalForAll(operator, true, { from: owner });

                            expect(
                                await this.token.isApprovedForAll(owner, operator)
                            ).to.equal(true);
                        });

                        it("emits an approval event", async function () {
                            const { logs } = await this.token.setApprovalForAll(
                                operator,
                                true,
                                { from: owner }
                            );

                            expectEvent.inLogs(logs, "ApprovalForAll", {
                                owner: owner,
                                operator: operator,
                                approved: true,
                            });
                        });
                    });
                }
            );

            context("when the operator is the owner", function () {
                it("reverts", async function () {
                    await expectRevert(
                        this.token.setApprovalForAll(owner, true, { from: owner }),
                        "ERC721-4"
                    );
                });
            });
        });

        describe("getApproved", async function () {
            context("when token is not minted", async function () {
                it("reverts", async function () {
                    await expectRevert(
                        this.token.getApproved(nonExistentTokenId),
                        "ERC721-3"
                    );
                });
            });

            context("when token has been minted ", async function () {
                it("should return the zero address", async function () {
                    expect(await this.token.getApproved(firstTokenId)).to.be.equal(
                        ZERO_ADDRESS
                    );
                });

                context("when account has been approved", async function () {
                    beforeEach(async function () {
                        await this.token.approve(approved, firstTokenId, { from: owner });
                    });

                    it("should return approved account", async function () {
                        expect(await this.token.getApproved(firstTokenId)).to.be.equal(
                            approved
                        );
                    });
                });
            });
        });

        describe("totalSupply", function () {
            it("returns total token supply", async function () {
                expect(await this.token.totalSupply()).to.be.bignumber.equal("0");
            });
        });
    });

    describe("_mint(address, uint256)", function () {
        it("reverts with a null destination address", async function () {
            await expectRevert(
                this.token.mint(ZERO_ADDRESS, firstTokenId),
                "ERC721: mint to the zero address"
            );
        });

        context("with minted token", async function () {
            beforeEach(async function () {
                ({ logs: this.logs } = await this.token.mint(owner, firstTokenId));
            });

            it("emits a Transfer event", function () {
                expectEvent.inLogs(this.logs, "Transfer", {
                    from: ZERO_ADDRESS,
                    to: owner,
                    tokenId: firstTokenId,
                });
            });

            it("creates the token", async function () {
                expect(await this.token.balanceOf(owner)).to.be.bignumber.equal("0");
                expect(await this.token.ownerOf(firstTokenId)).to.equal(owner);
            });

            it("reverts when adding a token id that already exists", async function () {
                await expectRevert(
                    this.token.mint(owner, firstTokenId),
                    "ERC721: token already minted"
                );
            });
        });
    });

    describe("_burn", function () {
        it("reverts when burning a non-existent token id", async function () {
            await expectRevert(
                this.token.burn(firstTokenId),
                "ERC721-6"
            );
        });

        context("with minted tokens", function () {
            beforeEach(async function () {
                await this.token.mint(owner, firstTokenId);
                await this.token.mint(owner, secondTokenId);
            });

            context("with burnt token", function () {
                beforeEach(async function () {
                    ({ logs: this.logs } = await this.token.burn(firstTokenId));
                });

                it("emits a Transfer event", function () {
                    expectEvent.inLogs(this.logs, "Transfer", {
                        from: owner,
                        to: ZERO_ADDRESS,
                        tokenId: firstTokenId,
                    });
                });

                it("deletes the token", async function () {
                    expect(await this.token.balanceOf(owner)).to.be.bignumber.equal("0");
                    await expectRevert(
                        this.token.ownerOf(firstTokenId),
                        "ERC721-6"
                    );
                });

                it("burns all tokens", async function () {
                    await this.token.burn(secondTokenId, { from: owner });
                    expect(await this.token.totalSupply()).to.be.bignumber.equal("0");
                    await expectRevert(
                        this.token.ownerOf(secondTokenId),
                        "ERC721-6"
                    );
                });

                it("reverts when burning a token id that has been deleted", async function () {
                    await expectRevert(
                        this.token.burn(firstTokenId),
                        "ERC721-6"
                    );
                });
            });
        });
    });
});
