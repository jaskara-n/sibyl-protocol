// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";
import {ERC20} from "./ERC20.sol";

/// @title ERC4626
/// @notice Minimal, self-contained tokenized-vault base mirroring OpenZeppelin
///         semantics, INCLUDING the virtual shares/assets offset that resists
///         inflation ("donation") attacks. No external dependency.
/// @dev Conversions add a virtual `10**decimalsOffset()` shares and a virtual `1`
///      asset to the supply/assets so a first depositor cannot be front-run into
///      losing value to a direct asset donation. With `decimalsOffset() == 0` the
///      offset is +1 share / +1 asset, matching OZ's default behaviour.
abstract contract ERC4626 is ERC20 {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error ERC4626ZeroShares();
    error ERC4626ZeroAssets();

    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The underlying asset token managed by the vault.
    IERC20 internal immutable _asset;

    constructor(IERC20 asset_, string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _asset = asset_;
    }

    /// @notice The address of the underlying asset token.
    function asset() public view returns (address) {
        return address(_asset);
    }

    /// @notice The virtual-offset exponent applied in conversions (OZ default 0).
    /// @dev `10**decimalsOffset()` virtual shares and 1 virtual asset are injected
    ///      into every conversion to neutralise inflation attacks.
    function decimalsOffset() public view virtual returns (uint8) {
        return 0;
    }

    /*//////////////////////////////////////////////////////////////
                              ACCOUNTING
    //////////////////////////////////////////////////////////////*/

    /// @notice Total amount of the underlying asset managed by the vault (NAV).
    /// @dev MUST be overridden by the concrete vault to include venue positions.
    function totalAssets() public view virtual returns (uint256);

    /// @notice Convert an asset amount to shares (floor rounding).
    function convertToShares(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, false);
    }

    /// @notice Convert a share amount to assets (floor rounding).
    function convertToAssets(uint256 shares) public view returns (uint256) {
        return _convertToAssets(shares, false);
    }

    /// @notice Shares minted for `assets` on deposit (floor).
    function previewDeposit(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, false);
    }

    /// @notice Assets required to mint `shares` (ceil).
    function previewMint(uint256 shares) public view returns (uint256) {
        return _convertToAssets(shares, true);
    }

    /// @notice Shares burned to withdraw `assets` (ceil).
    function previewWithdraw(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, true);
    }

    /// @notice Assets returned for redeeming `shares` (floor).
    function previewRedeem(uint256 shares) public view returns (uint256) {
        return _convertToAssets(shares, false);
    }

    /// @dev shares = assets * (totalSupply + 10**offset) / (totalAssets + 1).
    function _convertToShares(uint256 assets, bool roundUp) internal view returns (uint256) {
        uint256 supplyWithVirtual = totalSupply + 10 ** decimalsOffset();
        uint256 assetsWithVirtual = totalAssets() + 1;
        return _mulDiv(assets, supplyWithVirtual, assetsWithVirtual, roundUp);
    }

    /// @dev assets = shares * (totalAssets + 1) / (totalSupply + 10**offset).
    function _convertToAssets(uint256 shares, bool roundUp) internal view returns (uint256) {
        uint256 supplyWithVirtual = totalSupply + 10 ** decimalsOffset();
        uint256 assetsWithVirtual = totalAssets() + 1;
        return _mulDiv(shares, assetsWithVirtual, supplyWithVirtual, roundUp);
    }

    /// @dev Full-precision `x * y / d` with optional ceil rounding (no 512-bit; bounded inputs).
    function _mulDiv(uint256 x, uint256 y, uint256 d, bool roundUp) internal pure returns (uint256 r) {
        r = (x * y) / d;
        if (roundUp && (x * y) % d != 0) {
            r += 1;
        }
    }

    /*//////////////////////////////////////////////////////////////
                          DEPOSIT / WITHDRAW
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposit `assets` of the underlying, minting shares to `receiver`.
    function deposit(uint256 assets, address receiver) external virtual returns (uint256 shares) {
        shares = previewDeposit(assets);
        if (shares == 0) revert ERC4626ZeroShares();
        _deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Mint exactly `shares` to `receiver`, pulling the required assets.
    function mint(uint256 shares, address receiver) external virtual returns (uint256 assets) {
        assets = previewMint(shares);
        if (assets == 0) revert ERC4626ZeroAssets();
        _deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Withdraw exactly `assets` to `receiver`, burning shares from `owner`.
    function withdraw(uint256 assets, address receiver, address owner_)
        external
        virtual
        returns (uint256 shares)
    {
        shares = previewWithdraw(assets);
        _withdraw(msg.sender, receiver, owner_, assets, shares);
    }

    /// @notice Redeem exactly `shares` from `owner`, returning assets to `receiver`.
    function redeem(uint256 shares, address receiver, address owner_)
        external
        virtual
        returns (uint256 assets)
    {
        assets = previewRedeem(shares);
        if (assets == 0) revert ERC4626ZeroAssets();
        _withdraw(msg.sender, receiver, owner_, assets, shares);
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @dev Pull assets from `caller`, mint shares to `receiver`. Hookable.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal virtual {
        require(_asset.transferFrom(caller, address(this), assets), "ASSET_IN");
        _mint(receiver, shares);
        emit Deposit(caller, receiver, assets, shares);
    }

    /// @dev Burn shares from `owner` (respecting allowance), push assets to `receiver`. Hookable.
    function _withdraw(
        address caller,
        address receiver,
        address owner_,
        uint256 assets,
        uint256 shares
    ) internal virtual {
        if (caller != owner_) {
            _spendAllowance(owner_, caller, shares);
        }
        _burn(owner_, shares);
        require(_asset.transfer(receiver, assets), "ASSET_OUT");
        emit Withdraw(caller, receiver, owner_, assets, shares);
    }
}
