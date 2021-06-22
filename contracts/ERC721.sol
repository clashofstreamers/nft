// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/introspection/ERC165.sol";
import "./Boostable.sol";
import "./CosBoostableLib.sol";

/**
 * @dev Fork of @openzeppelin/contracts/token/ERC721/ERC721.sol (3.1.0)
 */
abstract contract ERC721 is ERC165, IERC721, Boostable {
    event Transfer(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId
    );
    event Approval(
        address indexed owner,
        address indexed approved,
        uint256 indexed tokenId
    );
    event ApprovalForAll(
        address indexed owner,
        address indexed operator,
        bool approved
    );

    address internal immutable _prpsAddress;
    address internal immutable _dubiAddress;
    address internal immutable _hodlAddress;
    address internal immutable _externalAddress;

    // Mapping of tokenId to owner
    mapping(uint256 => address) internal _tokenOwners;

    // The total number of tokens minted
    uint256 internal _totalSupply;

    // Mapping from token ID to approved address
    mapping(uint256 => address) private _tokenApprovals;

    // Mapping from owner to operator approvals
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // Token name
    string private _name;

    // Token symbol
    string private _symbol;

    /*
     *     bytes4(keccak256('balanceOf(address)')) == 0x70a08231
     *     bytes4(keccak256('ownerOf(uint256)')) == 0x6352211e
     *     bytes4(keccak256('approve(address,uint256)')) == 0x095ea7b3
     *     bytes4(keccak256('getApproved(uint256)')) == 0x081812fc
     *     bytes4(keccak256('setApprovalForAll(address,bool)')) == 0xa22cb465
     *     bytes4(keccak256('isApprovedForAll(address,address)')) == 0xe985e9c5
     *     bytes4(keccak256('transferFrom(address,address,uint256)')) == 0x23b872dd
     *     bytes4(keccak256('safeTransferFrom(address,address,uint256)')) == 0x42842e0e
     *     bytes4(keccak256('safeTransferFrom(address,address,uint256,bytes)')) == 0xb88d4fde
     *
     *     => 0x70a08231 ^ 0x6352211e ^ 0x095ea7b3 ^ 0x081812fc ^
     *        0xa22cb465 ^ 0xe985e9c ^ 0x23b872dd ^ 0x42842e0e ^ 0xb88d4fde == 0x80ac58cd
     */
    bytes4 private constant _INTERFACE_ID_ERC721 = 0x80ac58cd;

    //---------------------------------------------------------------
    // State for pending ops
    //---------------------------------------------------------------
    uint8 internal constant OP_TYPE_TRANSFER = 5; // BOOST_TAG_TRANSFER - cannot refer to library constant during compile-time

    struct PendingTransfer {
        uint256 tokenId;
        address from;
        address to;
        bytes data;
    }

    // A mapping of hash(user, opId) to pending transfers.
    mapping(bytes32 => PendingTransfer) private _pendingTransfers;

    //---------------------------------------------------------------
    constructor(
        string memory name,
        string memory symbol,
        address optIn,
        address prps,
        address dubi,
        address hodl,
        address externalAddress
    ) public Boostable(optIn) ERC165() {
        _name = name;
        _symbol = symbol;

        _prpsAddress = prps;
        _dubiAddress = dubi;
        _hodlAddress = hodl;
        _externalAddress = externalAddress;

        // register the supported interfaces to conform to ERC721 via ERC165
        _registerInterface(_INTERFACE_ID_ERC721);
    }

    /**
     * @dev Gets the balance of the specified address.
     * @param owner address to query the balance of
     * @return uint256 representing the amount owned by the passed address
     */
    function balanceOf(address owner) external override view returns (uint256) {
        // NOTE: We do not maintain a balance to safe 5-20k gas per transfer
        // i.e. at most recent gas prices that's almost ~1.25 USD and ~5 USD respectively.
        return 0;
    }

    /**
     * @dev Gets the owner of the specified token ID.
     * @param tokenId uint256 ID of the token to query the owner of
     * @return address currently marked as the owner of the given token ID
     */
    function ownerOf(uint256 tokenId) public override view returns (address) {
        return _ownerOf(tokenId);
    }

    /**
     * @dev Gets the token name.
     * @return string representing the token name
     */
    function name() external view returns (string memory) {
        return _name;
    }

    /**
     * @dev Gets the token symbol.
     * @return string representing the token symbol
     */
    function symbol() external view returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Gets the total amount of tokens stored by the contract.
     * @return uint256 representing the total amount of tokens
     */
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev Approves another address to transfer the given token ID
     * The zero address indicates there is no approved address.
     * There can only be one approved address per token at a given time.
     * Can only be called by the token owner or an approved operator.
     * @param to address to be approved for the given token ID
     * @param tokenId uint256 ID of the token to be approved
     */
    function approve(address to, uint256 tokenId) public virtual override {
        address owner = _ownerOf(tokenId);
        require(to != owner, "ERC721-1");

        require(
            msg.sender == owner || isApprovedForAll(owner, msg.sender),
            "ERC721-2"
        );

        _approve(owner, to, tokenId);
    }

    /**
     * @dev Gets the approved address for a token ID, or zero if no address set
     * Reverts if the token ID does not exist.
     * @param tokenId uint256 ID of the token to query the approval of
     * @return address currently approved for the given token ID
     */
    function getApproved(uint256 tokenId)
        public
        override
        view
        returns (address)
    {
        require(_exists(tokenId), "ERC721-3");

        return _tokenApprovals[tokenId];
    }

    /**
     * @dev Sets or unsets the approval of a given operator
     * An operator is allowed to transfer all tokens of the sender on their behalf.
     * @param operator operator address to set the approval
     * @param approved representing the status of the approval to be set
     */
    function setApprovalForAll(address operator, bool approved)
        public
        virtual
        override
    {
        require(operator != msg.sender, "ERC721-4");

        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /**
     * @dev Tells whether an operator is approved by a given owner.
     * @param owner owner address which you want to query the approval of
     * @param operator operator address which you want to query the approval of
     * @return bool whether the given operator is approved by the given owner
     */
    function isApprovedForAll(address owner, address operator)
        public
        override
        view
        returns (bool)
    {
        return _operatorApprovals[owner][operator];
    }

    /**
     * @dev Transfers the ownership of a given token ID to another address.
     * Usage of this method is discouraged, use {safeTransferFrom} whenever possible.
     * Requires the msg.sender to be the owner, approved, or operator.
     * @param from current owner of the token
     * @param to address to receive the ownership of the given token ID
     * @param tokenId uint256 ID of the token to be transferred
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override {
        IOptIn.OptInStatus memory optInStatus = getOptInStatus(from);
        if (optInStatus.isOptedIn && optInStatus.permaBoostActive) {
            // Reverts if msg.sender is not from and/or not the owner of `tokenId`
            // Pending transfers ignore given approval to anyone besides the owner.
            _createPendingTransfer(from, to, tokenId, "", optInStatus);
            return;
        }

        // `from` must be the owner of the token
        address owner = _ownerOf(tokenId);
        require(from == owner, "ERC721-8");

        _transferFrom(from, to, tokenId);
    }

    /**
     * @dev Alias for `transferFrom`.
     * @param from current owner of the token
     * @param to address to receive the ownership of the given token ID
     * @param tokenId uint256 ID of the token to be transferred
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override {
        safeTransferFrom(from, to, tokenId, "");
    }

    /**
     * @dev Alias for `transferFrom`.
     *
     * @param from current owner of the token
     * @param to address to receive the ownership of the given token ID
     * @param tokenId uint256 ID of the token to be transferred
     * @param _data bytes data to send along with a safe transfer check
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) public virtual override {
        address owner = _ownerOf(tokenId);
        require(from == owner, "ERC721-8");

        // If msg.sender is a deploy-time known contract then transfer the token
        // immediately
        if (_isDeployTimeKnownContractAndCanTransfer(owner, tokenId, _data)) {
            // Transfer immediately
            _transfer({from: from, to: to, tokenId: tokenId});
            return;
        }

        // Otherwise, if `from` is opted-in and the permaBoost is active, create a pending
        // transfer instead. This might cause 'externalAddress' to not be able to deposit a token, which
        // is fine since it has safeguards that will revert in that case.
        IOptIn.OptInStatus memory optInStatus = getOptInStatus(from);
        if (optInStatus.permaBoostActive && optInStatus.isOptedIn) {
            // Reverts if msg.sender is not the owner
            _createPendingTransfer(from, to, tokenId, "", optInStatus);
            return;
        }

        // Lastly, try to transfer the normal way
        _transferFrom(from, to, tokenId);
    }

    /*
     * @dev Transfer token from `from` to `to`. The caller ensures that `from`
     * is the owner of `tokenId`.
     */
    function _transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) private {
        require(
            msg.sender == from || _isApproved(from, msg.sender, tokenId),
            "ERC721-2"
        );

        _transfer(from, to, tokenId);
    }

    function _isDeployTimeKnownContractAndCanTransfer(
        address owner,
        uint256 tokenId,
        bytes memory data
    ) private returns (bool) {
        // If the caller is not a deploy-time known contract
        if (!_callerIsDeployTimeKnownContract()) {
            return false;
        }

        // 'externalAddress' is a bit special. If the deploy-time known contract is NOT 'externalAddress', then it is fine
        // to transfer immediately. However, if it is 'externalAddress', then it is only fine if it's a boosted transaction (see below)
        // or if 'externalAddress' is the owner itself (e.g. transferring deposited token back to taker or maker)
        if (msg.sender != _externalAddress) {
            return true;
        }

        // 'externalAddress' passes a flag and (optional) fuel via `data` that indicates whether it is a boosted transaction
        // or not.
        uint8 isBoostedBits;
        uint96 intrinsicFuel;
        assembly {
            // Load flag using a 1-byte offset, because `mload` always reads
            // 32-bytes at once and the first 32 bytes of `data` contain it's length.
            isBoostedBits := mload(add(data, 0x01))
            // Load intrinsicFuel using an offset of 13 bytes (1 for the first read and 12 bytes, because uint96)
            intrinsicFuel := mload(add(data, 0x0D))
        }

        // Reading into a 'bool' directly doesn't work for some reason
        if (isBoostedBits & 1 == 1) {
            if (intrinsicFuel > 0) {
                _burnIntrinsicFuel(uint96(tokenId), intrinsicFuel);
            }

            return true;
        }

        IOptIn.OptInStatus memory optInStatus = getOptInStatus(owner);

        // If the latter, then 'externalAddress' can only transfer the token if either:
        // - 'externalAddress' is not the owner of the transferred token
        // - the permaboost is not active
        // - `from` is not opted-in to begin with
        //
        // If `from` is opted-in and the permaboost is active, 'externalAddress' cannot move the token
        // , except when boosted. Here the booster trusts 'externalAddress', since it already
        // verifies that `sender` provided a valid signature.
        //
        // This is special to 'externalAddress', other deploy-time known contracts do not make use of `data`.
        if (
            owner != _externalAddress &&
            optInStatus.permaBoostActive &&
            optInStatus.isOptedIn
        ) {
            return false;
        }

        return true;
    }

    /**
     * @dev Burn the intrinisc fuel (if any) from the given tokenId.
     */
    function _burnIntrinsicFuel(uint96 tokenId, uint96 intrinsicFuel)
        internal
        virtual;

    /**
     * @dev Perform multiple `boostedSend` calls in a single transaction.
     *
     * NOTE: Booster extension
     *
     */
    function boostedSendBatch(
        BoostedSend[] memory sends,
        Signature[] calldata signatures
    ) public {
        require(
            sends.length > 0 && sends.length == signatures.length,
            "ERC721-5"
        );

        for (uint256 i = 0; i < sends.length; i++) {
            boostedSend(sends[i], signatures[i]);
        }
    }

    /**
     * @dev Send `tokenId` from `from` to `to`.
     *
     * NOTE: Booster extension
     * `msg.sender` must be a trusted booster for `from`.
     *
     */
    function boostedSend(BoostedSend memory send, Signature calldata signature)
        public
    {
        require(_ownerOf(send.tokenId) == send.from, "ERC721-8");

        verifyBoost(
            send.from,
            CosBoostableLib.hashBoostedSend(
                _DOMAIN_SEPARATOR,
                send,
                msg.sender
            ),
            send.boosterPayload,
            signature
        );

        // Burn fuel and revert if fuel cannot be burned
        _burnTransferFuel(send.tokenId, send.from, send.fuel);

        _transfer(send.from, send.to, send.tokenId);
    }

    /**
     * @dev Burn `fuel` of the token transfer from `from`. The behavior is implemented in the deriving contract.
     */
    function _burnTransferFuel(
        uint96 tokenId,
        address from,
        BoosterFuel memory fuel
    ) internal virtual;

    /**
     * @dev Returns whether the specified token exists
     * @param tokenId uint256 ID of the token to query the existence of
     * @return bool whether the token exists

     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _tokenOwners[tokenId] != address(0);
    }

    function _ownerOf(uint256 tokenId) internal view returns (address) {
        address owner = _tokenOwners[tokenId];
        require(owner != address(0), "ERC721-6");
        return owner;
    }

    /**
     * @dev Returns whether the given spender can transfer a given token ID.
     * @param spender address of the spender to query
     * @param tokenId uint256 ID of the token to be transferred
     * @return bool whether the msg.sender is approved for the given token ID,
     * is an operator of the owner
     */
    function _isApproved(
        address owner,
        address spender,
        uint256 tokenId
    ) internal view returns (bool) {
        return (_operatorApprovals[owner][spender] ||
            _tokenApprovals[tokenId] == spender);
    }

    /**
     * @dev Internal function to burn a specific token.
     *
     * @param tokenOwner address of the token being burned
     * @param tokenId uint256 ID of the token being burned
     */
    function _burn(address tokenOwner, uint256 tokenId) internal {
        // NOTE: the caller ensures that `tokenOwner` is actually the owner of
        // `tokenId`.
        delete _tokenOwners[tokenId];

        emit Transfer(tokenOwner, address(0), tokenId);
    }

    /**
     * @dev Internal function to transfer ownership of a given token ID to another address.
     * As opposed to {transferFrom}, this imposes no restrictions on msg.sender.
     * @param from current owner of the token
     * @param to address to receive the ownership of the given token ID
     * @param tokenId uint256 ID of the token to be transferred
     */
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual {
        require(to != address(0), "ERC721-7");

        // Clear approvals from the previous owner
        if (_tokenApprovals[tokenId] != address(0)) {
            delete _tokenApprovals[tokenId];
        }

        _tokenOwners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function _approve(
        address owner,
        address to,
        uint256 tokenId
    ) private {
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    /**
     * @dev Checks whether msg.sender is a deploy-time known contract or not.
     */
    function _callerIsDeployTimeKnownContract()
        internal
        virtual
        view
        returns (bool)
    {
        if (msg.sender == _prpsAddress) {
            return true;
        }

        if (msg.sender == _dubiAddress) {
            return true;
        }

        if (msg.sender == _hodlAddress) {
            return true;
        }

        if (msg.sender == _externalAddress) {
            return true;
        }

        return false;
    }

    //---------------------------------------------------------------
    // Pending ops
    //---------------------------------------------------------------

    /**
     * @dev Create a pending transfer
     */
    function _createPendingTransfer(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data,
        IOptIn.OptInStatus memory optInStatus
    ) private {
        address user = msg.sender;

        // Only the token owner can use `transferFrom` while opted-in
        require(_ownerOf(tokenId) == user && user == from, "ERC721-8");

        OpHandle memory opHandle = _createNewOpHandle(
            optInStatus,
            user,
            OP_TYPE_TRANSFER
        );

        // Move token to this contract
        _transfer(from, address(this), tokenId);

        PendingTransfer memory pendingTransfer = PendingTransfer({
            from: from,
            to: to,
            tokenId: tokenId,
            data: data
        });

        _pendingTransfers[_getOpKey(user, opHandle.opId)] = pendingTransfer;

        // Emit PendingOp event
        emit PendingOp(user, opHandle.opId, opHandle.opType);
    }

    /**
     * @dev Finalize a pending transfer
     */
    function _finalizePendingTransfer(address user, uint64 opId) internal {
        bytes32 opKey = _getOpKey(user, opId);

        PendingTransfer storage pendingTransfer = _pendingTransfers[opKey];

        // NOTE: code is copied from regular _transfer() and keeps the
        // original sender while emitting the transfer event.
        address from = pendingTransfer.from;
        address to = pendingTransfer.to;
        uint256 tokenId = pendingTransfer.tokenId;

        _tokenOwners[tokenId] = to;

        emit Transfer(from, to, tokenId);

        delete _pendingTransfers[opKey];
    }

    /**
     * @dev Revert a pending transfer
     */
    function _revertPendingTransfer(bytes32 opKey) internal {
        PendingTransfer storage pendingTransfer = _pendingTransfers[opKey];

        // Move token back to original owner
        _transfer(address(this), pendingTransfer.from, pendingTransfer.tokenId);

        delete _pendingTransfers[opKey];
    }
}
