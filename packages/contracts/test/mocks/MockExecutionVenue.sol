// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IExecutionVenue} from "../../src/interfaces/IExecutionVenue.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";

/// @title MockExecutionVenue
/// @notice Test double for {IExecutionVenue}. SPOT only, deterministic 1:1 fills.
/// @dev Mirrors the real venue: it BUYS and HOLDS the asset (market) token itself on
///      open and sells from its own held inventory on close — the vault never holds
///      or approves the asset token. Direction mirrors the protocol enum
///      Direction { FLAT=0, LONG=1, SHORT=2 }: LONG buys the asset (cash -> asset),
///      SHORT/FLAT route through {closePosition}. Every fill is 1:1 so
///      `received == amountIn`, hence per-market notional equals the held balance and
///      is returned verbatim by {positionValue} / {heldBalance}.
contract MockExecutionVenue is IExecutionVenue {
    /// @notice Protocol direction enum value for LONG.
    uint8 internal constant LONG = 1;

    /// @notice Cash (input) token used to open positions.
    IERC20 public immutable cash;
    /// @notice Asset (output) token bought and held when a position is opened.
    IERC20 public immutable asset;

    /// @notice Held asset-token balance per market (== notional at the 1:1 fill rate).
    mapping(bytes32 => uint256) public heldBalance;

    error PastDeadline();
    error SlippageExceeded();
    error NotSpotLong();
    error InsufficientHeld();

    constructor(IERC20 cash_, IERC20 asset_) {
        cash = cash_;
        asset = asset_;
    }

    /// @inheritdoc IExecutionVenue
    function openPosition(
        bytes32 marketId,
        uint8 direction,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external returns (uint256 received) {
        if (block.timestamp > deadline) revert PastDeadline();
        // SPOT only: only LONG opens exposure; SHORT/FLAT must close instead.
        if (direction != LONG) revert NotSpotLong();

        // 1:1 deterministic fill.
        received = amountIn;
        if (received < minOut) revert SlippageExceeded();

        // Pull cash in; the venue holds the bought asset itself (no payout to caller).
        require(cash.transferFrom(msg.sender, address(this), amountIn), "CASH_IN");
        heldBalance[marketId] += received;
    }

    /// @inheritdoc IExecutionVenue
    /// @dev `amountIn` is a MARKET-TOKEN amount drawn from the venue's own held
    ///      inventory; no asset transfer from the caller is required.
    function closePosition(
        bytes32 marketId,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external returns (uint256 received) {
        if (block.timestamp > deadline) revert PastDeadline();

        uint256 held = heldBalance[marketId];
        if (amountIn > held) revert InsufficientHeld();

        // 1:1 deterministic fill: closing returns cash.
        received = amountIn;
        if (received < minOut) revert SlippageExceeded();

        // Sell from held inventory and pay cash out to the caller.
        heldBalance[marketId] = held - amountIn;
        require(cash.transfer(msg.sender, received), "CASH_OUT");
    }

    /// @inheritdoc IExecutionVenue
    function positionValue(bytes32 marketId) external view returns (uint256) {
        return heldBalance[marketId];
    }

    /// @inheritdoc IExecutionVenue
    function positionToken() external view returns (address) {
        return address(asset);
    }
}
