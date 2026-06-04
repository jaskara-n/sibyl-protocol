// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "./ERC20.sol";
import {Ownable2Step} from "../access/Ownable2Step.sol";

/// @title TestUSD
/// @notice A real, mintable ERC20 used as the base/cash asset on the Sibyl
///         testnet. Not a mock: it is a genuine 18-decimal token deployed for
///         testnet liquidity and venue settlement.
/// @dev Extends the protocol's self-contained {ERC20} base and gates minting to
///      the owner via {Ownable2Step}. Name "Sibyl Test USD", symbol "sUSD".
contract TestUSD is ERC20, Ownable2Step {
    constructor() ERC20("Sibyl Test USD", "sUSD") {}

    /// @notice 18 decimals, matching the testnet base-asset convention.
    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /// @notice Mint `amount` tokens to `to`. Owner-only.
    /// @param to The recipient.
    /// @param amount The amount to mint (18 decimals).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
