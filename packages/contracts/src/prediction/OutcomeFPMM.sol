// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";
import {ERC20} from "../tokens/ERC20.sol";
import {ReentrancyGuard} from "../access/ReentrancyGuard.sol";
import {OutcomeToken} from "./OutcomeToken.sol";
import {SibylPredictionMarket} from "./SibylPredictionMarket.sol";

/// @title OutcomeFPMM
/// @notice Fixed-Product-Market-Maker for ONE binary market, following the
///         Gnosis `FixedProductMarketMaker` pattern. LP shares are this very
///         contract's ERC20 supply.
/// @dev The pool holds YES and NO {OutcomeToken} reserves. Implied probability of
///      YES is `reserveNO / (reserveYES + reserveNO)` (the cheaper/scarcer side is
///      the more likely one), and `price(YES) + price(NO) == 1` up to rounding.
///
///      All trades route through complete sets minted/redeemed against the parent
///      {SibylPredictionMarket}, so the pool is always fully collateralised:
///
///        buy(outcome, c):  mint a set of size `c` (c YES + c NO) into the pool,
///                          then pay out enough of `outcome` to restore the
///                          constant product. Net: user spends `c` collateral and
///                          receives > c of `outcome`.
///        sell(outcome, c): pull enough `outcome` so that, after adding it and
///                          removing `c` of every outcome, the product is
///                          restored; redeem `c` complete sets for `c` collateral
///                          to the seller.
///
///      This MM is fee-less for clarity (the standard Gnosis fee can be layered on
///      top without changing the invariant). It is intended for use while the
///      market is UNRESOLVED.
contract OutcomeFPMM is ERC20, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice Parent market controller.
    SibylPredictionMarket public immutable controller;
    /// @notice The market id this pool serves.
    bytes32 public immutable marketId;
    /// @notice Collateral token (18 decimals).
    IERC20 public immutable collateral;
    /// @notice YES outcome share.
    OutcomeToken public immutable yes;
    /// @notice NO outcome share.
    OutcomeToken public immutable no;

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    event FundingAdded(address indexed funder, uint256 collateralIn, uint256 sharesMinted);
    event FundingRemoved(address indexed funder, uint256 sharesBurned, uint256 collateralOut);
    event Buy(
        address indexed buyer,
        SibylPredictionMarket.Outcome outcome,
        uint256 collateralIn,
        uint256 outcomeOut
    );
    event Sell(
        address indexed seller,
        SibylPredictionMarket.Outcome outcome,
        uint256 collateralOut,
        uint256 outcomeIn
    );

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    error ZeroAmount();
    error NotBinaryOutcome();
    error PoolEmpty();
    error PoolNotEmpty();
    error SlippageBuy(uint256 out, uint256 minOut);
    error SlippageSell(uint256 inAmount, uint256 maxIn);
    error TransferFailed();
    error InsufficientShares();

    /*//////////////////////////////////////////////////////////////
                                CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param controller_ The parent {SibylPredictionMarket}.
    /// @param marketId_ The market id served by this pool.
    constructor(SibylPredictionMarket controller_, bytes32 marketId_)
        ERC20("Sibyl FPMM LP", "sFPMM-LP")
    {
        controller = controller_;
        marketId = marketId_;

        (IERC20 coll, OutcomeToken y, OutcomeToken n,,,,,,) = controller_.markets(marketId_);
        collateral = coll;
        yes = y;
        no = n;

        // Pre-approve the controller to pull collateral for set minting.
        coll.approve(address(controller_), type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                                RESERVES
    //////////////////////////////////////////////////////////////*/

    /// @notice Current YES reserve held by the pool.
    function reserveYES() public view returns (uint256) {
        return yes.balanceOf(address(this));
    }

    /// @notice Current NO reserve held by the pool.
    function reserveNO() public view returns (uint256) {
        return no.balanceOf(address(this));
    }

    /// @notice Implied probability of YES, scaled by 1e18.
    /// @dev price(YES) = reserveNO / (reserveYES + reserveNO).
    function priceYES() external view returns (uint256) {
        uint256 ry = reserveYES();
        uint256 rn = reserveNO();
        uint256 total = ry + rn;
        if (total == 0) revert PoolEmpty();
        return (rn * 1e18) / total;
    }

    /// @notice Implied probability of NO, scaled by 1e18.
    function priceNO() external view returns (uint256) {
        uint256 ry = reserveYES();
        uint256 rn = reserveNO();
        uint256 total = ry + rn;
        if (total == 0) revert PoolEmpty();
        return (ry * 1e18) / total;
    }

    /*//////////////////////////////////////////////////////////////
                                 FUNDING
    //////////////////////////////////////////////////////////////*/

    /// @notice Add `collateralIn` of liquidity. Mints a complete set into the pool
    ///         and mints LP shares. On a non-empty pool the funder receives the
    ///         excess of whichever outcome the pool already holds in surplus, so
    ///         that the pool ratio is preserved (Gnosis pattern).
    /// @param collateralIn Collateral to add.
    /// @return sharesMinted LP shares minted to the funder.
    function addFunding(uint256 collateralIn)
        external
        nonReentrant
        returns (uint256 sharesMinted)
    {
        if (collateralIn == 0) revert ZeroAmount();

        uint256 ry = reserveYES();
        uint256 rn = reserveNO();
        uint256 supply = totalSupply;

        // Pull collateral and mint a complete set into the pool.
        _pull(msg.sender, collateralIn);
        controller.mintSet(marketId, collateralIn);

        if (supply == 0) {
            // Seed: pool keeps the full balanced set; shares == collateralIn.
            sharesMinted = collateralIn;
        } else {
            // Gnosis pattern: weight by the largest reserve, refund the surplus of
            // each outcome so the pool ratio is preserved.
            uint256 poolWeight = ry >= rn ? ry : rn;
            sharesMinted = (collateralIn * supply) / poolWeight;

            // Each reserve gained `collateralIn` from the minted set; the amount it
            // should keep to preserve ratio is collateralIn * reserve / poolWeight.
            uint256 keepYes = (collateralIn * ry) / poolWeight;
            uint256 keepNo = (collateralIn * rn) / poolWeight;
            uint256 refundYes = collateralIn - keepYes;
            uint256 refundNo = collateralIn - keepNo;
            if (refundYes > 0) _sendOutcome(yes, msg.sender, refundYes);
            if (refundNo > 0) _sendOutcome(no, msg.sender, refundNo);
        }

        _mint(msg.sender, sharesMinted);
        emit FundingAdded(msg.sender, collateralIn, sharesMinted);
    }

    /// @notice Burn `lpShares` and withdraw the pro-rata share of reserves,
    ///         redeeming the balanced portion for collateral and sending any
    ///         imbalance out as outcome tokens (Gnosis pattern).
    /// @param lpShares LP shares to burn.
    /// @return collateralOut Collateral returned from the balanced portion.
    function removeFunding(uint256 lpShares)
        external
        nonReentrant
        returns (uint256 collateralOut)
    {
        if (lpShares == 0) revert ZeroAmount();
        uint256 supply = totalSupply;
        if (balanceOf[msg.sender] < lpShares) revert InsufficientShares();

        uint256 ry = reserveYES();
        uint256 rn = reserveNO();

        uint256 takeYes = (ry * lpShares) / supply;
        uint256 takeNo = (rn * lpShares) / supply;

        _burn(msg.sender, lpShares);

        // Redeem the balanced (complete-set) portion for collateral.
        uint256 setAmount = takeYes < takeNo ? takeYes : takeNo;
        if (setAmount > 0) {
            controller.redeemSet(marketId, setAmount);
            _push(msg.sender, setAmount);
            collateralOut = setAmount;
        }
        // Send the leftover imbalance as outcome tokens.
        if (takeYes > setAmount) _sendOutcome(yes, msg.sender, takeYes - setAmount);
        if (takeNo > setAmount) _sendOutcome(no, msg.sender, takeNo - setAmount);

        emit FundingRemoved(msg.sender, lpShares, collateralOut);
    }

    /*//////////////////////////////////////////////////////////////
                                  BUY
    //////////////////////////////////////////////////////////////*/

    /// @notice Amount of `outcome` tokens received for spending `collateralIn`.
    /// @dev Gnosis math: mint a set of `collateralIn` into both reserves, then pay
    ///      out `x` of `outcome` such that the constant product is preserved.
    ///      Let R_out, R_other be the reserves of the desired/other outcome.
    ///      After adding `c` to both: (R_out + c - x) * (R_other + c) = R_out * R_other.
    ///      => x = (R_out + c) - (R_out * R_other) / (R_other + c).
    function calcBuyAmount(SibylPredictionMarket.Outcome outcome, uint256 collateralIn)
        public
        view
        returns (uint256)
    {
        if (collateralIn == 0) revert ZeroAmount();
        (uint256 rOut, uint256 rOther) = _reservesFor(outcome);
        if (rOut == 0 || rOther == 0) revert PoolEmpty();

        uint256 newOther = rOther + collateralIn;
        // x = (rOut + c) - (rOut * rOther) / newOther
        uint256 keepOut = (rOut * rOther) / newOther;
        return (rOut + collateralIn) - keepOut;
    }

    /// @notice Buy `outcome` shares by spending `collateralIn`.
    /// @param outcome YES or NO.
    /// @param collateralIn Collateral to spend.
    /// @param minOutcomeOut Slippage floor on shares received.
    /// @return outcomeOut Shares of `outcome` sent to the caller.
    function buy(
        SibylPredictionMarket.Outcome outcome,
        uint256 collateralIn,
        uint256 minOutcomeOut
    ) external nonReentrant returns (uint256 outcomeOut) {
        outcomeOut = calcBuyAmount(outcome, collateralIn);
        if (outcomeOut < minOutcomeOut) revert SlippageBuy(outcomeOut, minOutcomeOut);

        _pull(msg.sender, collateralIn);
        controller.mintSet(marketId, collateralIn);

        OutcomeToken want = outcome == SibylPredictionMarket.Outcome.YES ? yes : no;
        _sendOutcome(want, msg.sender, outcomeOut);

        emit Buy(msg.sender, outcome, collateralIn, outcomeOut);
    }

    /*//////////////////////////////////////////////////////////////
                                  SELL
    //////////////////////////////////////////////////////////////*/

    /// @notice Amount of `outcome` tokens required to receive `collateralOut`.
    /// @dev Inverse of buy. The pool redeems `collateralOut` complete sets, so it
    ///      must remove `collateralOut` from each reserve and gain `x` of `outcome`:
    ///      (R_out + x - c) * (R_other - c) = R_out * R_other.
    ///      => x = c - R_out + (R_out * R_other) / (R_other - c).
    function calcSellAmount(SibylPredictionMarket.Outcome outcome, uint256 collateralOut)
        public
        view
        returns (uint256)
    {
        if (collateralOut == 0) revert ZeroAmount();
        (uint256 rOut, uint256 rOther) = _reservesFor(outcome);
        if (rOther <= collateralOut) revert PoolEmpty();

        uint256 newOther = rOther - collateralOut;
        uint256 restored = (rOut * rOther + newOther - 1) / newOther; // ceil
        return (collateralOut + restored) - rOut;
    }

    /// @notice Sell `outcome` shares to receive exactly `collateralOut` collateral.
    /// @param outcome YES or NO.
    /// @param collateralOut Collateral to receive.
    /// @param maxOutcomeIn Slippage cap on shares spent.
    /// @return outcomeIn Shares of `outcome` pulled from the caller.
    function sell(
        SibylPredictionMarket.Outcome outcome,
        uint256 collateralOut,
        uint256 maxOutcomeIn
    ) external nonReentrant returns (uint256 outcomeIn) {
        outcomeIn = calcSellAmount(outcome, collateralOut);
        if (outcomeIn > maxOutcomeIn) revert SlippageSell(outcomeIn, maxOutcomeIn);

        OutcomeToken give = outcome == SibylPredictionMarket.Outcome.YES ? yes : no;
        // Pull the sold outcome into the pool.
        _pullOutcome(give, msg.sender, outcomeIn);
        // Redeem a complete set of size collateralOut and pay the seller.
        controller.redeemSet(marketId, collateralOut);
        _push(msg.sender, collateralOut);

        emit Sell(msg.sender, outcome, collateralOut, outcomeIn);
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _reservesFor(SibylPredictionMarket.Outcome outcome)
        internal
        view
        returns (uint256 rOut, uint256 rOther)
    {
        if (outcome == SibylPredictionMarket.Outcome.YES) {
            return (reserveYES(), reserveNO());
        } else if (outcome == SibylPredictionMarket.Outcome.NO) {
            return (reserveNO(), reserveYES());
        } else {
            revert NotBinaryOutcome();
        }
    }

    function _pull(address from, uint256 amount) internal {
        _check(
            address(collateral),
            abi.encodeWithSelector(collateral.transferFrom.selector, from, address(this), amount)
        );
    }

    function _push(address to, uint256 amount) internal {
        _check(address(collateral), abi.encodeWithSelector(collateral.transfer.selector, to, amount));
    }

    function _sendOutcome(OutcomeToken token, address to, uint256 amount) internal {
        _check(address(token), abi.encodeWithSelector(token.transfer.selector, to, amount));
    }

    function _pullOutcome(OutcomeToken token, address from, uint256 amount) internal {
        _check(
            address(token),
            abi.encodeWithSelector(token.transferFrom.selector, from, address(this), amount)
        );
    }

    function _check(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
