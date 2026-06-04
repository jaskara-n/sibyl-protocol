// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IERC20
/// @notice Minimal ERC20 interface used by the bond contract. Only the subset of
///         methods actually consumed by {AgentBond} is declared.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}
