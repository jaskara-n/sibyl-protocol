// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";

/// @title ERC20
/// @notice Minimal, self-contained ERC20 implementation mirroring OpenZeppelin
///         semantics. No external dependency is pulled in.
/// @dev Implements the {IERC20} subset used across the protocol plus the metadata
///      reads and standard {Transfer}/{Approval} events. Infinite allowance
///      (`type(uint256).max`) is treated as non-decreasing, matching OZ.
abstract contract ERC20 is IERC20 {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error ERC20InsufficientBalance(address from, uint256 balance, uint256 needed);
    error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);
    error ERC20InvalidSender(address sender);
    error ERC20InvalidReceiver(address receiver);

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Token name.
    string public name;
    /// @notice Token symbol.
    string public symbol;

    /// @notice Total token supply.
    uint256 public totalSupply;

    /// @notice Account balances.
    mapping(address account => uint256) public balanceOf;
    /// @notice Spender allowances: owner => spender => amount.
    mapping(address owner => mapping(address spender => uint256)) public allowance;

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    /// @notice ERC20 token decimals. Overridable; defaults to 18.
    function decimals() public view virtual returns (uint8) {
        return 18;
    }

    /*//////////////////////////////////////////////////////////////
                                EXTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IERC20
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @inheritdoc IERC20
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @inheritdoc IERC20
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount);
        return true;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _transfer(address from, address to, uint256 amount) internal {
        if (from == address(0)) revert ERC20InvalidSender(address(0));
        if (to == address(0)) revert ERC20InvalidReceiver(address(0));
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert ERC20InsufficientBalance(from, fromBalance, amount);
        unchecked {
            balanceOf[from] = fromBalance - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _spendAllowance(address owner_, address spender, uint256 amount) internal {
        uint256 current = allowance[owner_][spender];
        if (current != type(uint256).max) {
            if (current < amount) revert ERC20InsufficientAllowance(spender, current, amount);
            unchecked {
                allowance[owner_][spender] = current - amount;
            }
        }
    }

    function _mint(address to, uint256 amount) internal {
        if (to == address(0)) revert ERC20InvalidReceiver(address(0));
        totalSupply += amount;
        unchecked {
            balanceOf[to] += amount;
        }
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        if (from == address(0)) revert ERC20InvalidSender(address(0));
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert ERC20InsufficientBalance(from, fromBalance, amount);
        unchecked {
            balanceOf[from] = fromBalance - amount;
            totalSupply -= amount;
        }
        emit Transfer(from, address(0), amount);
    }
}
