// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Ownable2Step
/// @notice Minimal, self-contained two-step ownership (no external dependency).
/// @dev Ownership transfer requires the new owner to explicitly accept, which
///      prevents transferring control to an address that cannot use it. There is
///      deliberately no `renounceOwnership`: this is an owner-gated reputation
///      ledger and renouncing would permanently brick all writes.
abstract contract Ownable2Step {
    /// @notice The current owner.
    address public owner;

    /// @notice The address nominated to become owner, pending acceptance.
    address public pendingOwner;

    error NotOwner();
    error NotPendingOwner();
    error ZeroAddressOwner();

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /// @notice Nominate a new owner. The nominee must call {acceptOwnership}.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddressOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Accept a pending ownership transfer. Callable only by the nominee.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }
}
