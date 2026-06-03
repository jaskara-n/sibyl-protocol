// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IExecutionVenue} from "../interfaces/IExecutionVenue.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {Ownable2Step} from "../access/Ownable2Step.sol";
import {ReentrancyGuard} from "../access/ReentrancyGuard.sol";

/// @title MetaVenue
/// @notice {IExecutionVenue} ROUTER that lets a single vault (pointing at one
///         venue) trade across many heterogeneous sub-venues: e.g. Agni trading
///         markets via {AgniExecutionVenue} and binary prediction markets via
///         {PredictionVenue}.
/// @dev The vault only ever approves and calls THIS contract. Per market the owner
///      wires a sub-venue and the collateral token that market settles in
///      ({setMarketVenue}). On open, the MetaVenue pulls `amountIn` collateral
///      from the vault, approves the sub-venue, and forwards the call; the
///      sub-venue pulls the collateral from the MetaVenue. On close, the sub-venue
///      returns collateral to the MetaVenue, which forwards it to the vault.
///      `positionValue`/`heldBalance` are pass-through reads.
///
///      Unrouted markets revert with {UnroutedMarket}. No mocks: every call is a
///      genuine forward to a real sub-venue.
contract MetaVenue is IExecutionVenue, Ownable2Step, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Per-market routing entry.
    /// @param venue The sub-venue handling this market.
    /// @param collateral The token the vault funds and receives for this market.
    struct Route {
        IExecutionVenue venue;
        IERC20 collateral;
    }

    /// @notice Routing table by market id.
    mapping(bytes32 marketId => Route) public routes;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event MarketVenueSet(bytes32 indexed marketId, address indexed venue, address indexed collateral);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error ZeroAddress();
    error UnroutedMarket(bytes32 marketId);
    error TransferFailed();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param owner_ The initial owner (receives ownership immediately).
    constructor(address owner_) {
        if (owner_ != address(0) && owner_ != msg.sender) {
            owner = owner_;
            emit OwnershipTransferred(msg.sender, owner_);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Route `marketId` to `venue`, funded/settled in `collateral`.
    /// @param marketId The market identifier.
    /// @param venue The sub-venue to forward this market's calls to.
    /// @param collateral The collateral token for open/close on this market.
    function setMarketVenue(bytes32 marketId, IExecutionVenue venue, IERC20 collateral) external onlyOwner {
        if (address(venue) == address(0) || address(collateral) == address(0)) revert ZeroAddress();
        routes[marketId] = Route({venue: venue, collateral: collateral});
        emit MarketVenueSet(marketId, address(venue), address(collateral));
    }

    /*//////////////////////////////////////////////////////////////
                              EXECUTION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IExecutionVenue
    /// @dev Pulls `amountIn` collateral from the caller (vault), approves the
    ///      sub-venue, and forwards. The sub-venue pulls the collateral from this
    ///      contract via its own {IExecutionVenue.openPosition}.
    function openPosition(
        bytes32 marketId,
        uint8 direction,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 received) {
        Route memory r = _route(marketId);

        // Pull collateral from the vault into this router, then let the sub-venue pull it.
        _safeTransferFrom(address(r.collateral), msg.sender, address(this), amountIn);
        _safeApprove(address(r.collateral), address(r.venue), amountIn);

        received = r.venue.openPosition(marketId, direction, amountIn, minOut, deadline);

        // Clear residual allowance defensively.
        _safeApprove(address(r.collateral), address(r.venue), 0);
    }

    /// @inheritdoc IExecutionVenue
    /// @dev Forwards the close to the sub-venue; the sub-venue returns collateral
    ///      to this router, which forwards it to the caller (vault).
    function closePosition(
        bytes32 marketId,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 received) {
        Route memory r = _route(marketId);

        received = r.venue.closePosition(marketId, amountIn, minOut, deadline);

        // Forward the collateral the sub-venue returned to this router on to the vault.
        if (received > 0) {
            _safeTransfer(address(r.collateral), msg.sender, received);
        }
    }

    /// @inheritdoc IExecutionVenue
    function positionValue(bytes32 marketId) external view returns (uint256) {
        return _route(marketId).venue.positionValue(marketId);
    }

    /// @inheritdoc IExecutionVenue
    function heldBalance(bytes32 marketId) external view returns (uint256) {
        return _route(marketId).venue.heldBalance(marketId);
    }

    /// @inheritdoc IExecutionVenue
    /// @dev The router is multi-venue and multi-market; there is no single
    ///      canonical position token.
    function positionToken() external pure returns (address) {
        return address(0);
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _route(bytes32 marketId) internal view returns (Route memory r) {
        r = routes[marketId];
        if (address(r.venue) == address(0)) revert UnroutedMarket(marketId);
    }

    /*//////////////////////////////////////////////////////////////
                          SAFE ERC20 HELPERS
    //////////////////////////////////////////////////////////////*/

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _safeApprove(address token, address spender, uint256 amount) internal {
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(IERC20.approve.selector, spender, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
