// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";
import {ReentrancyGuard} from "../access/ReentrancyGuard.sol";
import {SibylPredictionMarket} from "./SibylPredictionMarket.sol";
import {OutcomeFPMM} from "./OutcomeFPMM.sol";

/// @title PredictionFactory
/// @notice One-transaction launcher for fully tradeable Sibyl prediction markets.
/// @dev Combines the two-step flow of registering a market on the parent
///      {SibylPredictionMarket} and deploying its dedicated {OutcomeFPMM} pool,
///      optionally seeding the pool with initial liquidity so the market is
///      immediately tradeable. The factory is fully permissionless — there is no
///      owner and any address (including agent wallets) may call it.
///
///      When `seedCollateral > 0`, the factory pulls collateral from the caller,
///      funds the freshly deployed pool, and forwards the resulting LP shares back
///      to the caller so the *creator* — not the factory — owns the initial
///      liquidity. The first funding of an empty pool mints balanced reserves and
///      yields LP shares equal to `seedCollateral`, with no outcome-token refund.
contract PredictionFactory is ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The parent market controller all markets are registered against.
    SibylPredictionMarket public immutable predictionMarket;

    /// @notice FPMM pool address for each launched marketId.
    mapping(bytes32 marketId => address fpmm) public fpmmOf;

    /// @notice Every marketId ever launched through this factory, in order.
    bytes32[] public allMarketIds;

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted once per successful launch.
    /// @param marketId The launched market id.
    /// @param fpmm The deployed FPMM pool address.
    /// @param collateral The collateral token backing the market.
    /// @param resolver The address authorized to resolve the market.
    /// @param resolveTime Unix timestamp after which resolution is permitted.
    /// @param seedCollateral Initial liquidity seeded into the pool (0 if none).
    /// @param creator The caller that launched the market.
    event MarketLaunched(
        bytes32 indexed marketId,
        address indexed fpmm,
        address collateral,
        address indexed resolver,
        uint64 resolveTime,
        uint256 seedCollateral,
        address creator
    );

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice A required address argument was the zero address.
    error ZeroAddress();
    /// @notice An ERC20 transfer or transferFrom failed.
    error TransferFailed();

    /*//////////////////////////////////////////////////////////////
                                CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param predictionMarket_ The parent {SibylPredictionMarket} controller.
    constructor(SibylPredictionMarket predictionMarket_) {
        if (address(predictionMarket_) == address(0)) revert ZeroAddress();
        predictionMarket = predictionMarket_;
    }

    /*//////////////////////////////////////////////////////////////
                                 LAUNCH
    //////////////////////////////////////////////////////////////*/

    /// @notice Create a market, deploy its FPMM pool, and optionally seed it with
    ///         initial liquidity — all in one transaction.
    /// @dev On a non-zero seed, the factory pulls `seedCollateral` from the caller,
    ///      funds the pool, and forwards the minted LP shares to the caller so the
    ///      creator owns the liquidity. Duplicate market ids revert via the parent
    ///      controller's {MarketExists}.
    /// @param marketId Caller-chosen unique identifier for the market.
    /// @param collateral The 18-decimal ERC20 used to back complete sets.
    /// @param questionHash Hash/commitment of the market question.
    /// @param resolveTime Unix timestamp after which resolution is permitted.
    /// @param resolver Address authorized to resolve the market.
    /// @param seedCollateral Initial liquidity to seed (0 for an unseeded pool).
    /// @return fpmm The deployed FPMM pool address.
    function createAndSeed(
        bytes32 marketId,
        address collateral,
        bytes32 questionHash,
        uint64 resolveTime,
        address resolver,
        uint256 seedCollateral
    ) public nonReentrant returns (address fpmm) {
        // Register the market on the parent controller (validates args, deploys
        // the YES/NO tokens, and reverts on a duplicate marketId).
        predictionMarket.createMarket(marketId, collateral, questionHash, resolveTime, resolver);

        // Deploy the dedicated FPMM pool for this market.
        OutcomeFPMM pool = new OutcomeFPMM(predictionMarket, marketId);
        fpmm = address(pool);

        if (seedCollateral > 0) {
            // Pull seed collateral from the creator and let the pool draw it.
            _pull(IERC20(collateral), msg.sender, seedCollateral);
            _approve(IERC20(collateral), fpmm, seedCollateral);
            pool.addFunding(seedCollateral);

            // First funding of an empty pool mints LP == seedCollateral with no
            // outcome-token refund. Forward those shares to the creator.
            uint256 lpShares = pool.balanceOf(address(this));
            if (lpShares > 0) _push(IERC20(fpmm), msg.sender, lpShares);
        }

        // Record the launch.
        fpmmOf[marketId] = fpmm;
        allMarketIds.push(marketId);

        emit MarketLaunched(
            marketId, fpmm, collateral, resolver, resolveTime, seedCollateral, msg.sender
        );
    }

    /// @notice Create a market and deploy an (unseeded) FPMM pool in one call.
    /// @dev Thin convenience wrapper over {createAndSeed} with a zero seed.
    /// @param marketId Caller-chosen unique identifier for the market.
    /// @param collateral The 18-decimal ERC20 used to back complete sets.
    /// @param questionHash Hash/commitment of the market question.
    /// @param resolveTime Unix timestamp after which resolution is permitted.
    /// @param resolver Address authorized to resolve the market.
    /// @return fpmm The deployed FPMM pool address.
    function createMarket(
        bytes32 marketId,
        address collateral,
        bytes32 questionHash,
        uint64 resolveTime,
        address resolver
    ) external returns (address fpmm) {
        return createAndSeed(marketId, collateral, questionHash, resolveTime, resolver, 0);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Number of markets launched through this factory.
    function allMarketIdsCount() external view returns (uint256) {
        return allMarketIds.length;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @dev SafeERC20-style transferFrom: tolerates non-standard (void) returns and
    ///      reverts on an explicit `false`.
    function _pull(IERC20 token, address from, uint256 amount) internal {
        _check(
            address(token),
            abi.encodeWithSelector(token.transferFrom.selector, from, address(this), amount)
        );
    }

    /// @dev SafeERC20-style transfer out of this contract.
    function _push(IERC20 token, address to, uint256 amount) internal {
        _check(address(token), abi.encodeWithSelector(token.transfer.selector, to, amount));
    }

    /// @dev SafeERC20-style approve.
    function _approve(IERC20 token, address spender, uint256 amount) internal {
        _check(address(token), abi.encodeWithSelector(token.approve.selector, spender, amount));
    }

    function _check(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
