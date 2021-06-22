// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../ERC721.sol";

/**
 * @title DummyERC721
 * This mock just provides a public safeMint, mint, and burn functions for testing purposes
 */
contract DummyERC721 is ERC721 {
    constructor(
        string memory name,
        string memory symbol,
        address optIn
    )
        public
        ERC721(
            name,
            symbol,
            optIn,
            address(0),
            address(0),
            address(0),
            address(0)
        )
    {}

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    function mint(address to, uint256 tokenId) public {
        require(to != address(0), "ERC721: mint to the zero address");
        require(!_exists(tokenId), "ERC721: token already minted");

        _tokenOwners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function burn(uint256 tokenId) public {
        address owner = _ownerOf(tokenId);
        _burn(owner, tokenId);
    }

    function _getHasherContracts()
        internal
        override
        returns (address[] memory)
    {
        return new address[](0);
    }

    function _burnTransferFuel(
        uint96 tokenId,
        address from,
        BoosterFuel memory fuel
    ) internal override {}

    function _burnIntrinsicFuel(uint96 tokenId, uint96 intrinsicFuel)
        internal
        override
    {}
}
