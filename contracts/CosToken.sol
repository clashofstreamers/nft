// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@prps/solidity/contracts/IBoostableERC20.sol";
import "./ERC721.sol";

abstract contract CosToken is Ownable, ERC721 {
    // The secondary minter is assigned by the contract owner and
    // is allowed to call mint in addition to the owner.
    address private _secondaryMinter;

    modifier onlyOwnerOrSecondaryMinter() {
        require(_secondaryMinter == msg.sender || owner() == msg.sender, "00");
        _;
    }

    // Owner can assign a different minter by calling this function -
    // if account is the zero address, the owner assigns himself again.
    function setSecondaryMinter(address account) external onlyOwner {
        if (account == address(0)) {
            _secondaryMinter = msg.sender;
        } else {
            _secondaryMinter = account;
        }
    }

    function secondaryMinter() public view returns (address) {
        return _secondaryMinter;
    }

    event Merged(uint96 targetId, uint96 sourceId, address owner);

    event Empowered(
        uint96 id,
        address owner,
        address funder,
        uint96 empoweredAmount,
        uint96 totalAmount
    );

    // Mapping of tokenId to their respective packed token data.
    mapping(uint96 => PackedCollectible) internal _packedCollectibles;

    // The DUBI contract
    IERC20 internal immutable _dubi;
    IERC20 internal immutable _prps;

    constructor(
        string memory name,
        string memory symbol,
        address optIn,
        address prps,
        address dubi,
        address hodl,
        address externalAddress
    )
        public
        Ownable()
        ERC721(name, symbol, optIn, prps, dubi, hodl, externalAddress)
    {
        _prps = IERC20(prps);
        _dubi = IERC20(dubi);

        // By default the owner is also the secondary minter (saves gas when checking permissions)
        _secondaryMinter = msg.sender;
    }

    // The packed collectible makes heavy use of bit packing
    // to minimize storage costs.
    struct PackedCollectible {
        // Contains the fields of a packed `UnpackedCollectible`. See the struct definition
        // below for more information.
        uint256 packedData;
        // Reserved mapping for future-proofing the collectibles
        mapping(bytes32 => bytes32) extraAttributes;
    }

    // The unpacked collectible contains the unpacked data of a collectible from storage.
    // It minimizes storage reads, since only a single read from storage is necessary
    // in most cases to access all relevant data.
    //
    // NOTE: The bit-sizes of some fields are rounded up to the nearest Solidity type.
    struct UnpackedCollectible {
        // A 24 bit alias for the actual headId
        uint24 headIdAlias;
        uint96 empoweredDUBI;
        uint32 season;
        uint32 abilities;
        uint8 stars;
        uint8 level;
        // The faction only uses 4 bits
        uint8 faction;
        bool isFraud;
        bool hasDependentOp;
        // Exclusive to Heroes, always 0 for Pets
        uint24 skinDivision;
        uint16 skinSlot;
        // The class only uses 4 bits
        uint8 class;
        // Exclusive to Pets, always 0 for Heroes
        uint8 shinyHue;
    }

    /**
     * @dev Pack an unpacked collectible and return a uint256 for the packedData.
     */
    function _packCollectible(UnpackedCollectible memory _unpackedCollectible)
        internal
        pure
        returns (uint256)
    {
        // Build the packed data according to the spec above.
        uint256 packedData;
        uint256 offset;

        // 1) Set first 24 bits to headIdAlias
        packedData |= _unpackedCollectible.headIdAlias;
        offset += 24;

        // 2) Set next 96 bits to empoweredDUBI.
        packedData |= uint256(_unpackedCollectible.empoweredDUBI) << offset;
        offset += 96;

        // 3) Set next 32 bits to season
        packedData |= uint256(_unpackedCollectible.season) << offset;
        offset += 32;

        // 4) Set next 32 bits to abilities
        packedData |= uint256(_unpackedCollectible.abilities) << offset;
        offset += 32;

        // 5) Set next 8 bits to stars
        packedData |= uint256(_unpackedCollectible.stars) << offset;
        offset += 8;

        // 6) Set next 8 bits to level
        packedData |= uint256(_unpackedCollectible.level) << offset;
        offset += 8;

        // 7) Set next 4 bits to faction
        // Ensure that the faction only uses 4 bits by masking the faction with a bitmask where the first 4 bits are 1 (11110000)
        uint8 factionMask = (1 << 4) - 1;
        packedData |=
            uint256(_unpackedCollectible.faction & factionMask) <<
            offset;
        offset += 4;

        // 8) Set the 2 flags in the next 2 bits after faction
        if (_unpackedCollectible.isFraud) {
            // Collectible is a fraud
            packedData |= 1 << (offset + 0);
        }

        if (_unpackedCollectible.hasDependentOp) {
            // Collectible has a dependent op (e.g. pending merge or kill)
            packedData |= 1 << (offset + 1);
        }

        offset += 2;

        // Now apply collectible specific packing.
        // We pass the current offset so that packing can start from where we left off
        // The final offset is returned back, which should be less than or equal to 256
        (packedData, offset) = _packCollectibleSpecific(
            _unpackedCollectible,
            packedData,
            offset
        );

        // Assert that the offset did not overflow the maximum of 256 bits
        assert(offset <= 256);

        return packedData;
    }

    /**
     * @dev Unpack a packed collectible and return an UnpackedCollectible
     */
    function _unpackCollectible(uint256 packedData)
        internal
        pure
        returns (UnpackedCollectible memory)
    {
        UnpackedCollectible memory _unpacked;
        uint256 offset;

        // 1) Read headIdAlias from the first 24 bits
        _unpacked.headIdAlias = uint24(packedData);
        offset += 24;

        // 2) Read empoweredDUBI from the next 96 bits
        _unpacked.empoweredDUBI = uint96(packedData >> offset);
        offset += 96;

        // 3) Read season from the next 32 bits
        _unpacked.season = uint32(packedData >> offset);
        offset += 32;

        // 4) Read abilities from the next 32 bits
        _unpacked.abilities = uint32(packedData >> offset);
        offset += 32;

        // 5) Read stars from the next 8 bits
        _unpacked.stars = uint8(packedData >> offset);
        offset += 8;

        // 6) Read level from the next 8 bits
        _unpacked.level = uint8(packedData >> offset);
        offset += 8;

        // 7) Read faction from the next 4 bits
        // The faction only uses 4 bits so we only take the first 4 bits
        uint8 faction = uint8(packedData >> offset);
        uint8 factionMask = (1 << 4) - 1;
        _unpacked.faction = faction & factionMask;
        offset += 4;

        // 8) Read the 2 flags from the next 2 bits
        _unpacked.isFraud = (packedData >> (offset + 0)) & 1 == 1;
        _unpacked.hasDependentOp = (packedData >> (offset + 1)) & 1 == 1;

        offset += 2;

        // Now apply collectible specific unpacking.
        // We pass the current offset so that unpacking can start from where we left off
        // The final offset is returned back, which should be less than or equal to 256
        offset = _unpackCollectibleSpecific(_unpacked, packedData, offset);

        // Assert that the offset did not overflow the maximum of 256 bits
        assert(offset <= 256);

        return _unpacked;
    }

    /**
     * @dev Internal token specific implementation of packing.
     * @return Tuple of (packedData, offset). offset must be less than or equal to 256
     */
    function _packCollectibleSpecific(
        UnpackedCollectible memory unpacked,
        uint256 packedData,
        uint256 offset
    ) internal virtual pure returns (uint256, uint256);

    /**
     * @dev Internal token specific implementation of unpacking.
     * @return offset. offset must be less than or equal to 256
     */
    function _unpackCollectibleSpecific(
        UnpackedCollectible memory unpacked,
        uint256 packedData,
        uint256 offset
    ) internal virtual pure returns (uint256);

    //---------------------------------------------------------------
    // State for pending ops
    //---------------------------------------------------------------
    uint8 internal constant OP_TYPE_MERGE = 6; // CosBoostableLib.BOOST_TAG_MERGE;
    uint8 internal constant OP_TYPE_EMPOWER = 7; //CosBoostableLib.BOOST_TAG_EMPOWER;
    uint8 internal constant OP_TYPE_KILL = 8; // CosBoostableLib.BOOST_TAG_KILL;

    struct PendingMerge {
        uint96 tokenIdSource;
        uint96 tokenIdTarget;
    }

    struct PendingEmpower {
        uint96 tokenId;
        uint96 amount;
    }

    struct PendingKill {
        uint96 tokenId;
    }

    // A mapping of hash(user, opId) to pending ops.
    mapping(bytes32 => PendingMerge) private _pendingMerges;
    mapping(bytes32 => PendingEmpower) private _pendingEmpowers;
    mapping(bytes32 => PendingKill) private _pendingKills;

    //---------------------------------------------------------------

    /**
     * @dev Get the unpacked collectible data
     */
    function getCollectibleData(uint96 tokenId)
        public
        view
        returns (UnpackedCollectible memory)
    {
        return _getUnpackedCollectible(tokenId);
    }

    /**
     * @dev Get the extra attributes `key` associated with the given `tokenId`
     */
    function getCollectibleExtraAttribute(uint96 tokenId, bytes32 key)
        public
        view
        returns (bytes32)
    {
        return _packedCollectibles[tokenId].extraAttributes[key];
    }

    /**
     * @dev Set the 'fraudulent' flag on the given tokenId.
     *
     * Can only be called by the contract owner.
     */
    function setFraudulent(uint96 tokenId, bool active)
        external
        onlyOwnerOrSecondaryMinter
    {
        require(_exists(tokenId), "1");


            UnpackedCollectible memory unpackedCollectible
         = _getUnpackedCollectible(tokenId);

        unpackedCollectible.isFraud = active;
        _writeUnpackedCollectible(tokenId, unpackedCollectible);
    }

    /**
     * @dev Set an extra attribute on the given tokenId.
     *
     * Can only be called by the contract owner.
     */
    function setExtraAttribute(
        uint96 tokenId,
        bytes32 key,
        bytes32 value
    ) public onlyOwnerOrSecondaryMinter {
        require(_exists(tokenId), "1");
        _packedCollectibles[tokenId].extraAttributes[key] = value;
    }

    function batchMint(
        uint256[] calldata packedTokenIds,
        address[] calldata tokenOwners,
        uint256[] calldata packedDatas,
        bytes32[][] calldata extraKeysArr,
        bytes32[][] calldata extraValuesArr,
        // Unused - only part of the function signature to have it on-chain
        bytes[] calldata headIds
    ) external onlyOwnerOrSecondaryMinter {
        // NOTE: We assume the caller provides inputs of equal length and omit
        // the assertion to shave off some bytes.
        for (uint256 i = 0; i < packedTokenIds.length; i++) {
            _mint(
                packedTokenIds[i],
                tokenOwners[i],
                packedDatas[i],
                extraKeysArr[i],
                extraValuesArr[i],
                headIds[i]
            );
        }
    }

    /**
     * To make things more efficient, the total supply is optionally packed into the passed
     * `tokenId` where the first 96 bits are used for the actual `tokenId` and the following 96 bits
     * for the total supply.
     *
     * This way, the total supply is updated only when really necessary saving a lot of valuable gas.
     *
     * Only the current contract owner can mint new tokens.
     *
     * The packedData corresponds to a packed `UnpackedCollectible`.
     *
     * `extraKeys` and `extraValues` are optional and for future-proofing. They are simply treated as
     * key-value pairs in a mapping and thus very expensive.
     *
     */
    function mint(
        uint256 packedTokenId,
        address tokenOwner,
        uint256 packedData,
        bytes32[] calldata extraKeys,
        bytes32[] calldata extraValues,
        // Unused - only part of the function signature to have it on-chain
        bytes calldata headId
    ) external onlyOwnerOrSecondaryMinter {
        _mint(
            packedTokenId,
            tokenOwner,
            packedData,
            extraKeys,
            extraValues,
            headId
        );
    }

    function _mint(
        uint256 packedTokenId,
        address tokenOwner,
        uint256 packedData,
        bytes32[] calldata extraKeys,
        bytes32[] calldata extraValues,
        // Unused - only part of the function signature to have it on-chain
        bytes calldata headId
    ) internal {
        // Owner cannot be zero address
        require(tokenOwner != address(0), "2");
        // The actual tokenId (=lower 96 bits)
        uint96 tokenId = uint96(packedTokenId);
        // Token id must be greater 0
        require(tokenId > 0, "3");
        // Token id already exists or existed
        require(_neverExisted(tokenId), "4");
        // Invalid input length
        require(extraKeys.length == extraValues.length, "5");
        require(headId.length > 0, "01");

        // Create packed collectible struct
        PackedCollectible memory packedCollectible;
        packedCollectible.packedData = packedData;

        // Write to storage
        _packedCollectibles[tokenId] = packedCollectible;

        // Write optional attributes
        if (extraKeys.length > 0) {
            // Need to read from storage in order to write to the mapping
            PackedCollectible storage packed = _packedCollectibles[tokenId];
            for (uint256 i = 0; i < extraKeys.length; i++) {
                bytes32 key = extraKeys[i];
                bytes32 value = extraValues[i];
                packed.extraAttributes[key] = value;
            }
        }

        // The new total supply, which may be 0 in which case no update will be performed.
        uint96 updatedTotalSupply = uint96(packedTokenId >> 96);
        if (updatedTotalSupply > 0) {
            _totalSupply = updatedTotalSupply;
        }

        // Write owner for new token
        _tokenOwners[tokenId] = tokenOwner;

        emit Transfer(address(0), tokenOwner, tokenId);
    }

    /**
     * @dev Perform multiple `boostedKill` calls in a single transaction.
     *
     * NOTE: Booster extension
     */
    function boostedKillBatch(
        BoostedKill[] memory kills,
        Signature[] memory signatures
    ) external {
        require(kills.length > 0 && kills.length == signatures.length, "6");

        for (uint256 i = 0; i < kills.length; i++) {
            boostedKill(kills[i], signatures[i]);
        }
    }

    /**
     * @dev Perform multiple `boostedEmpower` calls in a single transaction.
     *
     * NOTE: Booster extension
     */
    function boostedEmpowerBatch(
        BoostedEmpower[] memory empowers,
        Signature[] memory signatures
    ) external {
        require(
            empowers.length > 0 && empowers.length == signatures.length,
            "6"
        );

        for (uint256 i = 0; i < empowers.length; i++) {
            boostedEmpower(empowers[i], signatures[i]);
        }
    }

    /**
     * @dev Perform multiple `boostedMerge` calls in a single transaction.
     *
     * NOTE: Booster extension
     */
    function boostedMergeBatch(
        BoostedMerge[] memory merges,
        Signature[] memory signatures
    ) external {
        require(merges.length > 0 && merges.length == signatures.length, "6");

        for (uint256 i = 0; i < merges.length; i++) {
            boostedMerge(merges[i], signatures[i]);
        }
    }

    /**
     * @dev Kill `tokenId` for the owner.
     *
     * Does not require a nonce.
     *
     * NOTE: Booster extension
     */
    function boostedKill(BoostedKill memory kill, Signature memory signature)
        public
    {
        address tokenOwner = _ownerOf(kill.tokenId);

        // We do not use a nonce, since once a collectible has been killed
        // it no longer exists and trying to kill a non-existent token
        // again (i.e. replay) it is bound to fail in the first place.
        _verifyBoostWithoutNonce(
            tokenOwner,
            CosBoostableLib.hashBoostedKill(
                _DOMAIN_SEPARATOR,
                kill,
                msg.sender
            ),
            kill.boosterPayload,
            signature
        );

        uint96 directFuel = _burnFuel(tokenOwner, kill.fuel);

        // Empty => no pending op
        IOptIn.OptInStatus memory optInStatus;

        _safeKill({
            tokenOwner: tokenOwner,
            tokenId: kill.tokenId,
            refund: true,
            optInStatus: optInStatus,
            directFuel: directFuel
        });
    }

    /**
     * @dev Empower `tokenId` with `amount` DUBI from `funder`.
     *
     * NOTE: Booster extension
     */
    function boostedEmpower(
        BoostedEmpower memory empower,
        Signature memory signature
    ) public {
        verifyBoost(
            empower.funder,
            CosBoostableLib.hashBoostedEmpower(
                _DOMAIN_SEPARATOR,
                empower,
                msg.sender
            ),
            empower.boosterPayload,
            signature
        );


            UnpackedCollectible memory unpackedCollectible
         = _getUnpackedCollectible(empower.tokenId);

        // we already call into the DUBI contract to take the funder's DUBI
        uint96 directFuel = _burnFuel(empower.funder, empower.fuel);

        // Empty => no pending op
        IOptIn.OptInStatus memory optInStatus;

        _safeEmpower({
            owner: _ownerOf(empower.tokenId),
            funder: empower.funder,
            tokenId: empower.tokenId,
            amount: empower.amount,
            unpackedCollectible: unpackedCollectible,
            optInStatus: optInStatus,
            directFuel: directFuel
        });

        _writeUnpackedCollectible(empower.tokenId, unpackedCollectible);
    }

    /**
     * @dev Merge `tokenIdSource` and `tokenIdTarget` for the owner.
     *
     * Does not require a nonce.
     *
     * NOTE: Booster extension
     */
    function boostedMerge(BoostedMerge memory merge, Signature memory signature)
        public
    {
        // We only check the owner of source being a trusted booster, because
        // `_merge` will assert that both, source and target, belong to the same owner.
        address _owner = _ownerOf(merge.tokenIdSource);

        // We do not use a nonce, since once a collectible has been killed
        // it no longer exists and trying to kill a non-existent token
        // again (i.e. replay) it is bound to fail in the first place.
        _verifyBoostWithoutNonce(
            _owner,
            CosBoostableLib.hashBoostedMerge(
                _DOMAIN_SEPARATOR,
                merge,
                msg.sender
            ),
            merge.boosterPayload,
            signature
        );

        UnpackedCollectible memory unpackedSource = _getUnpackedCollectible(
            merge.tokenIdSource
        );
        UnpackedCollectible memory unpackedTarget = _getUnpackedCollectible(
            merge.tokenIdTarget
        );

        uint96 directFuel = _burnFuel(_owner, merge.fuel);

        // Empty => no pending op
        IOptIn.OptInStatus memory optInStatus;

        _safeMerge({
            tokenOwner: _owner,
            tokenIdSource: merge.tokenIdSource,
            tokenIdTarget: merge.tokenIdTarget,
            unpackedSource: unpackedSource,
            unpackedTarget: unpackedTarget,
            optInStatus: optInStatus,
            directFuel: directFuel
        });
    }

    /**
     * @dev Empower the given `tokenId` with `amount` {DUBI}.
     * @param tokenId id of the token to empower
     * @param amount the amount of {DUBI} to empower
     */
    function empower(uint96 tokenId, uint96 amount) external {
        address owner = _ownerOf(tokenId);

        // If the permaboost is active and the owner of a token is opted-in,
        // then only he can empower it. Likewise, a funder that is not the owner,
        // can only empower tokens when he and the owner are opted-out.
        IOptIn.OptInStatus memory optInStatusOwner = getOptInStatus(owner);
        if (optInStatusOwner.permaBoostActive) {
            bool ownerIsFunder = msg.sender == owner;
            if (optInStatusOwner.isOptedIn) {
                // Since the owner is opted-in, he must be the funder
                require(ownerIsFunder, "7");
            } else if (!ownerIsFunder) {
                // Since the owner is not opted-in, it's fine to empower as long as
                // the funder is also not opted-in
                IOptIn.OptInStatus memory optInStatusFunder = getOptInStatus(
                    msg.sender
                );

                require(!optInStatusFunder.isOptedIn, "7");
            }
        }


            UnpackedCollectible memory unpackedCollectible
         = _getUnpackedCollectible(tokenId);

        _safeEmpower({
            owner: owner,
            funder: msg.sender,
            tokenId: tokenId,
            amount: amount,
            unpackedCollectible: unpackedCollectible,
            optInStatus: optInStatusOwner,
            directFuel: 0
        });

        _writeUnpackedCollectible(tokenId, unpackedCollectible);
    }

    /**
     * @dev Empower the given `tokenId` with `amount` {DUBI} from `sender`.
     *
     * Performs additional checks on the tokens. `_safeEmpower` is used over `_empower` in places
     * where the caller doesn't provide guarantees already or if a pending empower should
     * be created.
     *
     * For example when finalizing an empower, it is already guaranteed that the token exists and can be empowered
     * in which case `_empower` is called directly to save gas.
     */
    function _safeEmpower(
        address owner,
        address funder,
        uint96 tokenId,
        uint96 amount,
        UnpackedCollectible memory unpackedCollectible,
        IOptIn.OptInStatus memory optInStatus,
        uint96 directFuel
    ) private {
        // NOTE: the callers already provide the `owner`, which would have reverted if
        // the token didn't exist - meaning we do not have to check if `tokenId` exists here.
        require(amount > 0, "8");
        // Must not have a dependent op
        require(!unpackedCollectible.hasDependentOp, "9");
        if (optInStatus.permaBoostActive && optInStatus.isOptedIn) {
            // Sender is opted-in, so he must be the owner
            require(msg.sender == owner, "10");
            _createPendingEmpower(
                tokenId,
                amount,
                unpackedCollectible,
                optInStatus
            );
            return;
        }

        _takeDubiAndEmpower({
            owner: owner,
            funder: funder,
            tokenId: tokenId,
            amount: amount,
            unpackedCollectible: unpackedCollectible,
            directFuel: directFuel
        });
    }

    /**
     * @dev Empower the given `tokenId` with `amount` DUBI from `sender`.
     *
     * Before empowering it transfers  `amount` {DUBI} from `sender`.
     */
    function _takeDubiAndEmpower(
        address owner,
        address funder,
        uint96 tokenId,
        uint96 amount,
        UnpackedCollectible memory unpackedCollectible,
        uint96 directFuel
    ) private {
        // It is a questionable act to use the empoweredDUBI as fuel, but perfectly
        // possible as long as the funder is the own#er.
        if (directFuel > 0) {
            require(owner == funder, "11");
            _burnEmpoweredDUBIFuel(unpackedCollectible, directFuel);
        }

        // Move DUBI to this contract
        bool success = IBoostableERC20(address(_dubi)).boostedTransferFrom(
            funder,
            address(this),
            amount,
            ""
        );

        require(success, "22");

        _empower({
            owner: owner,
            funder: funder,
            tokenId: tokenId,
            amount: amount,
            unpackedCollectible: unpackedCollectible
        });
    }

    /**
     * @dev Empower the given `tokenId` with `amount` DUBI from `sender`.
     */
    function _empower(
        address owner,
        address funder,
        uint96 tokenId,
        uint96 amount,
        UnpackedCollectible memory unpackedCollectible
    ) private {
        // Update DUBI
        uint96 updatedEmpoweredDUBI = unpackedCollectible.empoweredDUBI +
            amount;
        require(updatedEmpoweredDUBI > unpackedCollectible.empoweredDUBI, "12");

        unpackedCollectible.empoweredDUBI = updatedEmpoweredDUBI;

        emit Empowered(tokenId, owner, funder, amount, updatedEmpoweredDUBI);
    }

    /**
     * @dev Merge two tokens
     * @param tokenIdSource id of the token to sacrifice
     * @param tokenIdTarget id of the token to keep
     */
    function merge(uint96 tokenIdSource, uint96 tokenIdTarget) external {
        UnpackedCollectible memory unpackedSource = _getUnpackedCollectible(
            tokenIdSource
        );

        UnpackedCollectible memory unpackedTarget = _getUnpackedCollectible(
            tokenIdTarget
        );

        IOptIn.OptInStatus memory optInStatus = getOptInStatus(msg.sender);
        _safeMerge({
            tokenOwner: msg.sender,
            tokenIdSource: tokenIdSource,
            tokenIdTarget: tokenIdTarget,
            unpackedSource: unpackedSource,
            unpackedTarget: unpackedTarget,
            optInStatus: optInStatus,
            directFuel: 0
        });
    }

    /**
     * @dev Merge two tokens
     *
     * Performs additional checks on the tokens. `_safeMerge` is used over `_merge` in places
     * where the caller doesn't provide guarantees already or if a pending merge should
     * be created.
     *
     * For example when finalizing a merge, it is already guaranteed that the tokens exist and can be merged
     * in which case `_merge` is called directly to save gas.
     *
     * @param tokenOwner the owner of the provided token ids
     * @param tokenIdSource id of the token to sacrifice
     * @param tokenIdTarget id of the token to keep
     */
    function _safeMerge(
        address tokenOwner,
        uint96 tokenIdSource,
        uint96 tokenIdTarget,
        UnpackedCollectible memory unpackedSource,
        UnpackedCollectible memory unpackedTarget,
        IOptIn.OptInStatus memory optInStatus,
        uint96 directFuel
    ) private {
        require(tokenIdSource != tokenIdTarget, "13");
        require(
            _ownerOf(tokenIdSource) == tokenOwner &&
                _ownerOf(tokenIdTarget) == tokenOwner,
            "14"
        );
        require(
            !unpackedSource.hasDependentOp && !unpackedTarget.hasDependentOp,
            "15"
        );
        require(
            unpackedSource.faction == unpackedTarget.faction &&
                unpackedSource.season >= unpackedTarget.season,
            "16"
        );

        // If this is a pending merge, create a pending op and return
        if (optInStatus.isOptedIn && optInStatus.permaBoostActive) {
            _createPendingMerge(
                tokenIdSource,
                tokenIdTarget,
                unpackedSource,
                unpackedTarget,
                optInStatus
            );
            return;
        }

        _merge(
            tokenOwner,
            tokenIdSource,
            tokenIdTarget,
            unpackedSource,
            unpackedTarget,
            directFuel
        );

        // NOTE: For efficiency reasons we do not update the source tokenData.
        // We can infer that a token got killed, which is the case if the
        // tokenId no longer exists, but the collectible's packedData is still != 0
        // _writeUnpackedCollectible(tokenIdTarget, unpackedSource);

        _writeUnpackedCollectible(tokenIdTarget, unpackedTarget);
    }

    /**
     * @dev Merge two tokens
     * @param tokenOwner the owner of the provided token ids
     * @param tokenIdSource id of the token to sacrifice
     * @param tokenIdTarget id of the token to keep,
     */
    function _merge(
        address tokenOwner,
        uint96 tokenIdSource,
        uint96 tokenIdTarget,
        UnpackedCollectible memory unpackedSource,
        UnpackedCollectible memory unpackedTarget,
        uint96 directFuel
    ) private {
        // Pick the higher stars
        uint8 stars = unpackedSource.stars;
        if (stars > unpackedTarget.stars) {
            unpackedTarget.stars = stars;
        }

        // Pick the higher level
        uint8 level = unpackedSource.level;
        if (level > unpackedTarget.level) {
            unpackedTarget.level = level;
        }

        // Pick source abilities for target
        unpackedTarget.abilities = unpackedSource.abilities;

        // The actual collectible may have additional merge specific logic
        _applyMerge(unpackedSource, unpackedTarget);

        // Kill the source token by burning it.
        // Here we don't issue a refund of the empoweredDUBI, since we just moved it from `source` to `target`.
        // We do not call `_safeKill`, because all required checks already happened in `_safeMerge`.
        _kill({
            tokenOwner: tokenOwner,
            tokenId: tokenIdSource,
            unpackedCollectible: unpackedSource,
            refund: false
        });

        // Add empoweredDUBI from source to target.
        unpackedTarget.empoweredDUBI += unpackedSource.empoweredDUBI;

        // Lastly, burn the fuel if any
        if (directFuel > 0) {
            _burnEmpoweredDUBIFuel(unpackedTarget, directFuel);
        }

        // Emit
        emit Merged(tokenIdTarget, tokenIdSource, tokenOwner);
    }

    /**
     * @dev Kill the given `tokenId`
     * @param tokenId id of the token to burn
     *
     * All DUBI on the token will be transferred to the owner.
     * Killing a token is the only way to recover the empoweredDUBI.
     */
    function kill(uint96 tokenId) external {
        address tokenOwner = _ownerOf(tokenId);
        require(tokenOwner == msg.sender, "20");

        IOptIn.OptInStatus memory optInStatus = getOptInStatus(tokenOwner);
        _safeKill({
            tokenOwner: tokenOwner,
            tokenId: tokenId,
            refund: true,
            optInStatus: optInStatus,
            directFuel: 0
        });
    }

    /**
     * @dev Kill the given `tokenId`
     *
     * Performs additional checks on the token. `_safeKill` is used over `_kill` in places
     * where the caller doesn't provide the guarantees already or if a pending kill should
     * be created.
     *
     * For example a merge already guarantees that the token exists and has no dependent op
     * in which case it calls `_kill` directly to save some gas.
     *
     * @param tokenOwner the address of the owner
     * @param tokenId id of the token to burn
     * @param refund whether to refund the DUBI on the killed token
     */
    function _safeKill(
        address tokenOwner,
        uint96 tokenId,
        bool refund,
        IOptIn.OptInStatus memory optInStatus,
        uint96 directFuel
    ) private {

            UnpackedCollectible memory unpackedCollectible
         = _getUnpackedCollectible(tokenId);

        require(!unpackedCollectible.hasDependentOp, "9");

        if (optInStatus.isOptedIn && optInStatus.permaBoostActive) {
            _createPendingKill(tokenId, unpackedCollectible, optInStatus);
            return;
        }

        // Burn direct fuel from empoweredDUBI
        if (directFuel > 0) {
            _burnEmpoweredDUBIFuel(unpackedCollectible, directFuel);
        }

        _kill({
            tokenOwner: tokenOwner,
            tokenId: tokenId,
            unpackedCollectible: unpackedCollectible,
            refund: refund
        });

        // NOTE: For efficiency reasons we do not update the tokenData.
        // We can infer that a token got killed, which is the case if the
        // tokenId no longer exists, but the collectible's packedData is still != 0
    }

    /**
     * @dev Kill the given `tokenId` and refund the DUBI if `refund` is true.
     */
    function _kill(
        address tokenOwner,
        uint96 tokenId,
        UnpackedCollectible memory unpackedCollectible,
        bool refund
    ) private {
        // Burn token
        _burn(tokenOwner, tokenId);

        if (refund && unpackedCollectible.empoweredDUBI > 0) {
            // Transfer the DUBI to the owner, taken from this contract's balance.
            _dubi.transfer(tokenOwner, unpackedCollectible.empoweredDUBI);
        }
    }

    /**
     * @dev Internal token specific implementation of merge.
     */
    function _applyMerge(
        UnpackedCollectible memory unpackedSource,
        UnpackedCollectible memory unpackedTarget
    ) internal virtual;

    /**
     * @dev Check if the given `tokenId` never existed. To do with as little reads as possible,
     *  we check if 'packedData == 0'. If this is the case, then the tokenId has never been
     * minted nor killed.
     */
    function _neverExisted(uint96 tokenId) private view returns (bool) {
        return _packedCollectibles[tokenId].packedData == 0;
    }

    function _getUnpackedCollectible(uint96 tokenId)
        internal
        view
        returns (UnpackedCollectible memory)
    {
        return _unpackCollectible(_packedCollectibles[tokenId].packedData);
    }

    function _writeUnpackedCollectible(
        uint96 tokenId,
        UnpackedCollectible memory unpacked
    ) internal {
        _packedCollectibles[tokenId].packedData = _packCollectible(unpacked);
    }

    //---------------------------------------------------------------
    // Fuel
    //---------------------------------------------------------------

    /**
     * @dev Burn `fuel` of the token transfer from `from`.
     */
    function _burnTransferFuel(
        uint96 tokenId,
        address from,
        BoosterFuel memory fuel
    ) internal override {
        uint96 intrinsicFuel = _burnFuel(from, fuel);
        if (intrinsicFuel > 0) {
            // If we have a intrinsicFuel, then it is burned from the token that is getting
            // transferred.
            _burnIntrinsicFuel(tokenId, intrinsicFuel);
        }
    }

    /**
     * @dev Burn `fuel` from `from`.
     */
    function _burnFuel(address from, BoosterFuel memory fuel)
        internal
        returns (uint96)
    {
        // Burn DUBI from balance
        if (fuel.dubi > 0) {
            IBoostableERC20(address(_dubi)).burnFuel(
                from,
                TokenFuel({
                    tokenAlias: 2, /* DUBI */
                    amount: fuel.dubi
                })
            );

            return 0;
        }

        // Burn unlocked PRPS
        if (fuel.unlockedPrps > 0) {
            IBoostableERC20(address(_prps)).burnFuel(
                from,
                TokenFuel({
                    tokenAlias: 0, /* UNLOCKED PRPS */
                    amount: fuel.unlockedPrps
                })
            );

            return 0;
        }

        // Burn locked PRPS
        if (fuel.lockedPrps > 0) {
            IBoostableERC20(address(_prps)).burnFuel(
                from,
                TokenFuel({
                    tokenAlias: 1, /* LOCKED PRPS */
                    amount: fuel.lockedPrps
                })
            );

            return 0;
        }

        if (fuel.intrinsicFuel > 0) {
            // Burn fuel from empowered DUBI on token
            return fuel.intrinsicFuel;
        }

        // No fuel
        return 0;
    }

    /**
     * @dev Burn the intrinisc fuel (if any) from the given tokenId.
     * Here the intrinsic fuel is the empoweredDUBI on tokenId. Reverts if `tokenId`
     * has not enough empoweredDUBI.
     */
    function _burnIntrinsicFuel(uint96 tokenId, uint96 intrinsicFuel)
        internal
        override
    {
        UnpackedCollectible memory unpacked = _getUnpackedCollectible(tokenId);
        require(
            intrinsicFuel <= MAX_BOOSTER_FUEL &&
                unpacked.empoweredDUBI >= intrinsicFuel,
            "21"
        );

        unpacked.empoweredDUBI -= intrinsicFuel;
        _writeUnpackedCollectible(tokenId, unpacked);
    }

    /**
     * @dev Burns empoweredDUBI from `unpacked` without writing to storage yet.
     */
    function _burnEmpoweredDUBIFuel(
        UnpackedCollectible memory unpacked,
        uint96 fuel
    ) private pure {
        require(
            fuel <= MAX_BOOSTER_FUEL && unpacked.empoweredDUBI >= fuel,
            "21"
        );
        unpacked.empoweredDUBI -= fuel;
    }

    //---------------------------------------------------------------
    // Pending ops
    //---------------------------------------------------------------

    /**
     * @dev Finalize a pending op for `user`
     */
    function finalizePendingOp(address user, OpHandle memory opHandle) public {
        uint8 opType = opHandle.opType;

        // Assert that the caller (msg.sender) is allowed to finalize the given op
        _assertCanFinalize(user, opHandle);

        // Delete op handle to prevent reentrancy abuse using the same opId
        _deleteOpHandle(user, opHandle);

        if (opType == OP_TYPE_TRANSFER) {
            // Implementation is in ERC721.sol
            _finalizePendingTransfer(user, opHandle.opId);
        } else if (opType == OP_TYPE_MERGE) {
            _finalizePendingMerge(user, opHandle.opId);
        } else if (opType == OP_TYPE_EMPOWER) {
            _finalizePendingEmpower(user, opHandle.opId);
        } else if (opType == OP_TYPE_KILL) {
            _finalizePendingKill(user, opHandle.opId);
        } else {
            assert(false);
        }

        // Emit event
        emit FinalizedOp(user, opHandle.opId, opType);
    }

    /**
     * @dev Revert a pending operation.
     *
     * Only the opted-in booster can revert a transaction if it provides a signed and still valid booster message
     * from the original sender.
     */
    function revertPendingOp(
        address user,
        OpHandle memory opHandle,
        bytes memory boosterMessage,
        Signature memory signature
    ) public {
        // Prepare revert, including permission check
        _prepareOpRevert({
            user: user,
            opHandle: opHandle,
            boosterMessage: boosterMessage,
            signature: signature
        });

        uint64 opId = opHandle.opId;
        uint8 opType = opHandle.opType;
        bytes32 opKey = _getOpKey(user, opId);

        if (opType == OP_TYPE_TRANSFER) {
            // Implementation is in ERC721.sol
            _revertPendingTransfer(opKey);
        } else if (opType == OP_TYPE_MERGE) {
            _revertPendingMerge(opKey);
        } else if (opType == OP_TYPE_EMPOWER) {
            _revertPendingEmpower(opKey, user);
        } else if (opType == OP_TYPE_KILL) {
            _revertPendingKill(opKey);
        } else {
            assert(false);
        }

        // Emit event
        emit RevertedOp(user, opId, opType);
    }

    /**
     * @dev Create a pending merge
     */
    function _createPendingMerge(
        uint96 tokenIdSource,
        uint96 tokenIdTarget,
        UnpackedCollectible memory unpackedSource,
        UnpackedCollectible memory unpackedTarget,
        IOptIn.OptInStatus memory optInStatus
    ) private {
        assert(!unpackedSource.hasDependentOp);
        assert(!unpackedTarget.hasDependentOp);

        // Set dependent op flags
        unpackedSource.hasDependentOp = true;
        unpackedTarget.hasDependentOp = true;

        address user = msg.sender;
        OpHandle memory opHandle = _createNewOpHandle(
            optInStatus,
            user,
            OP_TYPE_MERGE
        );

        PendingMerge memory pendingMerge = PendingMerge({
            tokenIdSource: tokenIdSource,
            tokenIdTarget: tokenIdTarget
        });

        _pendingMerges[_getOpKey(user, opHandle.opId)] = pendingMerge;

        // Write updated collectibles to storage
        _writeUnpackedCollectible(tokenIdSource, unpackedSource);
        _writeUnpackedCollectible(tokenIdTarget, unpackedTarget);

        // Emit PendingOp event
        emit PendingOp(user, opHandle.opId, opHandle.opType);
    }

    /**
     * @dev Create a pending empower
     */
    function _createPendingEmpower(
        uint96 tokenId,
        uint96 amount,
        UnpackedCollectible memory unpackedCollectible,
        IOptIn.OptInStatus memory optInStatus
    ) private {
        assert(!unpackedCollectible.hasDependentOp);

        address user = msg.sender;

        // Set dependent op flag
        unpackedCollectible.hasDependentOp = true;

        // Transfer `amount` DUBI from user to this contract.
        bool success = IBoostableERC20(address(_dubi)).boostedTransferFrom(
            user,
            address(this),
            amount,
            ""
        );

        require(success, "22");

        OpHandle memory opHandle = _createNewOpHandle(
            optInStatus,
            user,
            OP_TYPE_EMPOWER
        );

        PendingEmpower memory pendingEmpower = PendingEmpower({
            tokenId: tokenId,
            amount: amount
        });

        _pendingEmpowers[_getOpKey(user, opHandle.opId)] = pendingEmpower;

        // Emit PendingOp event
        emit PendingOp(user, opHandle.opId, opHandle.opType);
    }

    /**
     * @dev Create a pending kill
     */
    function _createPendingKill(
        uint96 tokenId,
        UnpackedCollectible memory unpackedCollectible,
        IOptIn.OptInStatus memory optInStatus
    ) private {
        assert(!unpackedCollectible.hasDependentOp);

        address user = msg.sender;

        // Set dependent op flag
        unpackedCollectible.hasDependentOp = true;

        OpHandle memory opHandle = _createNewOpHandle(
            optInStatus,
            user,
            OP_TYPE_KILL
        );

        PendingKill memory pendingKill = PendingKill({tokenId: tokenId});

        _pendingKills[_getOpKey(user, opHandle.opId)] = pendingKill;

        _writeUnpackedCollectible(tokenId, unpackedCollectible);

        // Emit PendingOp event
        emit PendingOp(user, opHandle.opId, opHandle.opType);
    }

    /**
     * @dev Finalize a pending merge
     */
    function _finalizePendingMerge(address user, uint64 opId) private {
        bytes32 opKey = _getOpKey(user, opId);

        PendingMerge storage pendingMerge = _pendingMerges[opKey];

        // Complete merge
        uint96 tokenIdSource = pendingMerge.tokenIdSource;
        uint96 tokenIdTarget = pendingMerge.tokenIdTarget;

        UnpackedCollectible memory unpackedSource = _getUnpackedCollectible(
            tokenIdSource
        );
        UnpackedCollectible memory unpackedTarget = _getUnpackedCollectible(
            tokenIdTarget
        );

        _merge(
            user,
            tokenIdSource,
            tokenIdTarget,
            unpackedSource,
            unpackedTarget,
            0
        );

        // Remove dependent op flags
        unpackedSource.hasDependentOp = false;
        unpackedTarget.hasDependentOp = false;

        // Write updated collectibles to storage
        _writeUnpackedCollectible(tokenIdSource, unpackedSource);
        _writeUnpackedCollectible(tokenIdTarget, unpackedTarget);

        delete _pendingMerges[opKey];
    }

    /**
     * @dev Finalize a pending empower
     */
    function _finalizePendingEmpower(address user, uint64 opId) private {
        bytes32 opKey = _getOpKey(user, opId);

        // Complete empower
        PendingEmpower storage pendingEmpower = _pendingEmpowers[opKey];

        uint96 tokenId = pendingEmpower.tokenId;
        uint96 amount = pendingEmpower.amount;


            UnpackedCollectible memory unpackedCollectible
         = _getUnpackedCollectible(tokenId);
        // Sanity check
        assert(unpackedCollectible.hasDependentOp);

        _empower(_ownerOf(tokenId), user, tokenId, amount, unpackedCollectible);

        // Remove dependent op flag
        unpackedCollectible.hasDependentOp = false;

        // Write updated collectible to storage
        _writeUnpackedCollectible(tokenId, unpackedCollectible);

        delete _pendingEmpowers[opKey];
    }

    /**
     * @dev Finalize a pending kill
     */
    function _finalizePendingKill(address user, uint64 opId) private {
        bytes32 opKey = _getOpKey(user, opId);

        PendingKill storage pendingKill = _pendingKills[opKey];
        uint96 tokenId = pendingKill.tokenId;


            UnpackedCollectible memory unpackedCollectible
         = _getUnpackedCollectible(tokenId);
        // Sanity check
        assert(unpackedCollectible.hasDependentOp);

        _kill({
            tokenOwner: user,
            tokenId: tokenId,
            unpackedCollectible: unpackedCollectible,
            refund: true
        });

        // NOTE: For efficiency reasons we do not update the tokenData.
        // We can infer that a token got killed, which is the case if the
        // tokenId no longer exists, but the collectible's packedData is still != 0

        delete _pendingKills[opKey];
    }

    /**
     * @dev Revert a pending merge
     */
    function _revertPendingMerge(bytes32 opKey) private {
        PendingMerge storage pendingMerge = _pendingMerges[opKey];

        uint96 tokenIdSource = pendingMerge.tokenIdSource;
        uint96 tokenIdTarget = pendingMerge.tokenIdTarget;

        UnpackedCollectible memory unpackedSource = _getUnpackedCollectible(
            tokenIdSource
        );

        UnpackedCollectible memory unpackedTarget = _getUnpackedCollectible(
            tokenIdTarget
        );

        // Sanity check
        assert(unpackedSource.hasDependentOp);
        assert(unpackedTarget.hasDependentOp);

        // Remove dependent op flags
        unpackedSource.hasDependentOp = false;
        unpackedTarget.hasDependentOp = false;

        _writeUnpackedCollectible(tokenIdSource, unpackedSource);
        _writeUnpackedCollectible(tokenIdTarget, unpackedTarget);

        // Delete pending merge
        delete _pendingMerges[opKey];
    }

    /**
     * @dev Revert a pending empower
     */
    function _revertPendingEmpower(bytes32 opKey, address user) private {
        PendingEmpower storage pendingEmpower = _pendingEmpowers[opKey];

        uint96 tokenId = pendingEmpower.tokenId;
        uint96 amount = pendingEmpower.amount;


            UnpackedCollectible memory unpackedCollectible
         = _getUnpackedCollectible(tokenId);
        // Sanity check
        assert(unpackedCollectible.hasDependentOp);

        // Remove dependent op flag
        unpackedCollectible.hasDependentOp = false;
        _writeUnpackedCollectible(tokenId, unpackedCollectible);

        // Delete pending empower
        delete _pendingEmpowers[opKey];

        // Send back DUBI
        _dubi.transfer(user, amount);
    }

    /**
     * @dev Revert a pending kill
     */
    function _revertPendingKill(bytes32 opKey) private {
        PendingKill storage pendingKill = _pendingKills[opKey];

        uint96 tokenId = pendingKill.tokenId;


            UnpackedCollectible memory unpackedCollectible
         = _getUnpackedCollectible(tokenId);
        // Sanity check
        assert(unpackedCollectible.hasDependentOp);

        // Remove dependent op flag
        unpackedCollectible.hasDependentOp = false;
        _writeUnpackedCollectible(tokenId, unpackedCollectible);

        // Delete pending kill
        delete _pendingKills[opKey];
    }
}
