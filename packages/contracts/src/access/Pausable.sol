// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Pausable
/// @notice Minimal, self-contained circuit breaker (no external dependency).
/// @dev Gates state-mutating entrypoints only. Read-only views (e.g. consensus
///      computation) remain callable while paused.
abstract contract Pausable {
    /// @notice Whether the contract is currently paused.
    bool public paused;

    error EnforcedPause();
    error ExpectedPause();

    event Paused(address account);
    event Unpaused(address account);

    modifier whenNotPaused() {
        if (paused) revert EnforcedPause();
        _;
    }

    modifier whenPaused() {
        if (!paused) revert ExpectedPause();
        _;
    }

    function _pause() internal {
        paused = true;
        emit Paused(msg.sender);
    }

    function _unpause() internal {
        paused = false;
        emit Unpaused(msg.sender);
    }
}
