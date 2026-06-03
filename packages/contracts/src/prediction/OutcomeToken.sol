// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "../tokens/ERC20.sol";

/// @title OutcomeToken
/// @notice ERC20 share representing one outcome (YES or NO) of a single binary
///         prediction market in {SibylPredictionMarket}.
/// @dev Minting and burning are restricted to the owning market contract set at
///      construction. The market mints a complete set (1 YES + 1 NO) per unit of
///      collateral and burns shares on redemption. This token carries no logic of
///      its own beyond gated supply changes; all market accounting lives in the
///      owning market contract.
contract OutcomeToken is ERC20 {
    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The market contract authorized to mint and burn this token.
    address public immutable market;

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Caller is not the owning market contract.
    error OnlyMarket();

    /*//////////////////////////////////////////////////////////////
                                CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param name_ Token name (e.g. "Sibyl YES: <questionHash>").
    /// @param symbol_ Token symbol (e.g. "sYES").
    /// @dev The deploying contract becomes the sole minter/burner.
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        market = msg.sender;
    }

    /*//////////////////////////////////////////////////////////////
                                 MODIFIER
    //////////////////////////////////////////////////////////////*/

    modifier onlyMarket() {
        if (msg.sender != market) revert OnlyMarket();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              MINT / BURN
    //////////////////////////////////////////////////////////////*/

    /// @notice Mint `amount` shares to `to`. Market-only.
    /// @param to The recipient.
    /// @param amount The amount to mint (18 decimals).
    function mint(address to, uint256 amount) external onlyMarket {
        _mint(to, amount);
    }

    /// @notice Burn `amount` shares from `from`. Market-only.
    /// @param from The account to burn from.
    /// @param amount The amount to burn (18 decimals).
    function burn(address from, uint256 amount) external onlyMarket {
        _burn(from, amount);
    }
}
