// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IExecutionVenue} from "../../src/interfaces/IExecutionVenue.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";

/// @title MockExecutionVenue
/// @notice Test double for {IExecutionVenue}. SPOT only, deterministic 1:1 fills.
/// @dev Holds fake-ERC20 inventory of both the cash and asset tokens. Direction
///      mirrors the protocol enum Direction { FLAT=0, LONG=1, SHORT=2 }: LONG buys
///      the asset (cash -> asset), SHORT/FLAT route through {closePosition}. Every
///      fill is 1:1 so `received == amountIn`. Per-market notional is recorded and
///      returned verbatim by {positionValue}.
contract MockExecutionVenue is IExecutionVenue {
    /// @notice Protocol direction enum value for LONG.
    uint8 internal constant LONG = 1;

    /// @notice Cash (input) token used to open positions.
    IERC20 public immutable cash;
    /// @notice Asset (output) token received when a position is opened.
    IERC20 public immutable asset;

    /// @notice Recorded notional per market.
    mapping(bytes32 => uint256) public position;

    error PastDeadline();
    error SlippageExceeded();
    error NotSpotLong();

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

        // Pull cash in, pay asset out, record notional.
        require(cash.transferFrom(msg.sender, address(this), amountIn), "CASH_IN");
        require(asset.transfer(msg.sender, received), "ASSET_OUT");
        position[marketId] += received;
    }

    /// @inheritdoc IExecutionVenue
    function closePosition(
        bytes32 marketId,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external returns (uint256 received) {
        if (block.timestamp > deadline) revert PastDeadline();

        // 1:1 deterministic fill: closing returns cash.
        received = amountIn;
        if (received < minOut) revert SlippageExceeded();

        // Pull asset in, pay cash out, reduce recorded notional.
        require(asset.transferFrom(msg.sender, address(this), amountIn), "ASSET_IN");
        require(cash.transfer(msg.sender, received), "CASH_OUT");

        uint256 current = position[marketId];
        position[marketId] = amountIn >= current ? 0 : current - amountIn;
    }

    /// @inheritdoc IExecutionVenue
    function positionValue(bytes32 marketId) external view returns (uint256) {
        return position[marketId];
    }

    /// @inheritdoc IExecutionVenue
    function positionToken() external view returns (address) {
        return address(asset);
    }
}
