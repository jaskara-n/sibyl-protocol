// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAgniSwapRouter} from "../../src/interfaces/IAgniSwapRouter.sol";
import {IAgniV3Factory, IAgniV3Pool} from "../../src/interfaces/IAgniV3.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";

/// @title StubAgniRouter
/// @notice TEST-ONLY stub of the Agni SwapRouter. Pulls `tokenIn` from the
///         caller and pays out `tokenOut` at a configurable per-call rate so
///         open/close/positionValue logic, minOut/deadline pass-through, and the
///         transferFrom pull can be exercised without the live DEX.
/// @dev Rate is expressed in 1e18 fixed point: amountOut = amountIn * rate / 1e18.
///      The stub must be pre-funded with `tokenOut` inventory. It records the
///      last params it observed so tests can assert pass-through.
contract StubAgniRouter is IAgniSwapRouter {
    /// @notice Output-per-input rate, 1e18 fixed point. Default 1:1.
    uint256 public rate = 1e18;

    /// @notice Last observed params (for pass-through assertions).
    ExactInputSingleParams public lastParams;

    /// @notice If set, an attacker target invoked re-entrantly during a swap.
    address public reentrancyTarget;
    bytes public reentrancyCalldata;

    error PastDeadline();
    error SlippageExceeded();

    /// @notice Set the conversion rate (1e18 fixed point).
    function setRate(uint256 newRate) external {
        rate = newRate;
    }

    /// @notice Arm a re-entrant callback fired during the next swap.
    function armReentrancy(address target, bytes calldata data) external {
        reentrancyTarget = target;
        reentrancyCalldata = data;
    }

    /// @inheritdoc IAgniSwapRouter
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        lastParams = params;

        // Mimic the router's own deadline guard.
        if (block.timestamp > params.deadline) revert PastDeadline();

        // Optional re-entrancy probe. Bubbles the callee's revert so tests can
        // assert the venue's nonReentrant guard fired.
        if (reentrancyTarget != address(0)) {
            address t = reentrancyTarget;
            bytes memory d = reentrancyCalldata;
            reentrancyTarget = address(0);
            (bool ok, bytes memory ret) = t.call(d);
            if (!ok) {
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }

        amountOut = (params.amountIn * rate) / 1e18;
        if (amountOut < params.amountOutMinimum) revert SlippageExceeded();

        // Pull tokenIn from the caller (the venue) and pay tokenOut to recipient.
        require(
            IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn),
            "TIN"
        );
        require(IERC20(params.tokenOut).transfer(params.recipient, amountOut), "TOUT");
    }
}

/// @title StubAgniV3Pool
/// @notice TEST-ONLY stub of an Agni V3 pool. Exposes a settable `slot0().sqrtPriceX96`
///         and can be armed to revert so the venue's fallback path can be exercised.
contract StubAgniV3Pool is IAgniV3Pool {
    uint160 public sqrtPriceX96;
    bool public shouldRevert;

    constructor(uint160 sqrtPriceX96_) {
        sqrtPriceX96 = sqrtPriceX96_;
    }

    function setSqrtPriceX96(uint160 v) external {
        sqrtPriceX96 = v;
    }

    function setShouldRevert(bool v) external {
        shouldRevert = v;
    }

    /// @inheritdoc IAgniV3Pool
    function slot0()
        external
        view
        returns (uint160, int24, uint16, uint16, uint16, uint8, bool)
    {
        if (shouldRevert) revert("SLOT0");
        return (sqrtPriceX96, int24(0), uint16(0), uint16(0), uint16(0), uint8(0), true);
    }
}

/// @title StubAgniV3Factory
/// @notice TEST-ONLY stub of the Agni V3 factory. Returns a configured pool address
///         for any (tokenA, tokenB, fee) triple; defaults to address(0) so the
///         venue's "no pool" fallback can be tested.
contract StubAgniV3Factory is IAgniV3Factory {
    address public pool;

    function setPool(address pool_) external {
        pool = pool_;
    }

    /// @inheritdoc IAgniV3Factory
    function getPool(address, address, uint24) external view returns (address) {
        return pool;
    }
}
