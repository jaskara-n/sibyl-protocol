// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ReentrancyGuard
/// @notice Minimal, self-contained reentrancy guard (no external dependency).
/// @dev Mirrors the inline guard used elsewhere in the protocol, extracted into a
///      reusable base so fee-handling contracts can compose it with the access
///      and pause primitives.
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    /// @notice Reentrant call detected.
    error Reentrancy();

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        if (_status == _ENTERED) revert Reentrancy();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}
