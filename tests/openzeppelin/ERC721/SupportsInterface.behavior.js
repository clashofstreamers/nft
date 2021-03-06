const { makeInterfaceId } = require("@openzeppelin/test-helpers");

const { expect } = require("chai");

const INTERFACES = {
    ERC165: ["supportsInterface(bytes4)"],
    ERC721: [
        "balanceOf(address)",
        "ownerOf(uint256)",
        "approve(address,uint256)",
        "getApproved(uint256)",
        "setApprovalForAll(address,bool)",
        "isApprovedForAll(address,address)",
        "transferFrom(address,address,uint256)",
        "safeTransferFrom(address,address,uint256)",
        "safeTransferFrom(address,address,uint256,bytes)",
    ],
};

const INTERFACE_IDS = {};
const FN_SIGNATURES = {};
for (const k of Object.getOwnPropertyNames(INTERFACES)) {
    INTERFACE_IDS[k] = makeInterfaceId.ERC165(INTERFACES[k]);
    for (const fnName of INTERFACES[k]) {
        // the interface id of a single function is equivalent to its function signature
        FN_SIGNATURES[fnName] = makeInterfaceId.ERC165([fnName]);
    }
}

function shouldSupportInterfaces(interfaces = []) {
    describe("Contract interface", function () {
        beforeEach(function () {
            this.contractUnderTest = this.mock || this.token;
        });

        for (const k of interfaces) {
            const interfaceId = INTERFACE_IDS[k];
            describe(k, function () {
                describe("ERC165's supportsInterface(bytes4)", function () {
                    it("should use less than 30k gas", async function () {
                        expect(
                            await this.contractUnderTest.supportsInterface.estimateGas(
                                interfaceId
                            )
                        ).to.be.lte(30000);
                    });

                    it("should claim support", async function () {
                        expect(
                            await this.contractUnderTest.supportsInterface(interfaceId)
                        ).to.equal(true);
                    });
                });

                for (const fnName of INTERFACES[k]) {
                    const fnSig = FN_SIGNATURES[fnName];
                    describe(fnName, function () {
                        it("should be implemented", function () {
                            expect(
                                this.contractUnderTest.abi.filter(
                                    (fn) => fn.signature === fnSig
                                ).length
                            ).to.equal(1);
                        });
                    });
                }
            });
        }
    });
}

module.exports = {
    shouldSupportInterfaces,
};
