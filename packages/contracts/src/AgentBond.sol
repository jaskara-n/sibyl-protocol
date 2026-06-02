// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAgentBond} from "./interfaces/IAgentBond.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {Ownable2Step} from "./access/Ownable2Step.sol";
import {Pausable} from "./access/Pausable.sol";
import {AgentScore} from "./types/SibylTypes.sol";

/// @title AgentBond
/// @notice ERC20-denominated, refundable bonding contract for Sibyl agents.
/// @dev Agents post a bond that is fully refundable on voluntary exit. The bond
///      can be slashed ONLY when a previously committed score hash is proven to
///      mismatch a revealed tuple (fraud). There is NO Brier-threshold or
///      being-wrong slash path by construction. Slashing is gated to the owner or
///      a designated operator.
contract AgentBond is IAgentBond, Ownable2Step, Pausable {
    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The ERC20 token used as bond collateral.
    IERC20 public immutable bondToken;

    /// @notice Operator authorized (alongside the owner) to slash bonds.
    address public immutable operator;

    /// @notice Destination for slashed collateral.
    address public immutable slashSink;

    /// @notice Currently staked bond per agent.
    mapping(bytes32 agentId => uint256) public stakeOf;

    /// @notice Whether an agent currently has an active (refundable) bond.
    mapping(bytes32 agentId => bool) public bonded;

    /*//////////////////////////////////////////////////////////////
                            REENTRANCY GUARD
    //////////////////////////////////////////////////////////////*/

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    /// @notice Reentrant call detected.
    error Reentrancy();

    modifier nonReentrant() {
        if (_status == _ENTERED) revert Reentrancy();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    /// @notice Caller is neither the owner nor the operator.
    error NotAuthorized();

    modifier onlyOwnerOrOperator() {
        if (msg.sender != owner && msg.sender != operator) revert NotAuthorized();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(IERC20 bondToken_, address operator_, address slashSink_) {
        bondToken = bondToken_;
        operator = operator_;
        slashSink = slashSink_;
        _status = _NOT_ENTERED;
    }

    /*//////////////////////////////////////////////////////////////
                                 STAKING
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAgentBond
    function stake(bytes32 agentId, uint256 amount) external nonReentrant whenNotPaused {
        // Pull collateral first; effects after the external interaction so that the
        // accounting can never out-run actually-received tokens.
        bondToken.transferFrom(msg.sender, address(this), amount);

        uint256 newStake = stakeOf[agentId] + amount;
        stakeOf[agentId] = newStake;
        bonded[agentId] = true;

        emit Staked(agentId, msg.sender, amount, newStake);
    }

    /// @inheritdoc IAgentBond
    function withdraw(bytes32 agentId, uint256 amount) external nonReentrant whenNotPaused {
        uint256 current = stakeOf[agentId];
        if (amount == 0 || amount > current) revert NothingToWithdraw();

        // Effects before interaction (checks-effects-interactions) in addition to the
        // reentrancy guard, so a malicious token cannot re-enter into a stale balance.
        uint256 newStake = current - amount;
        stakeOf[agentId] = newStake;
        if (newStake == 0) bonded[agentId] = false;

        bondToken.transfer(msg.sender, amount);

        emit Withdrawn(agentId, msg.sender, amount, newStake);
    }

    /*//////////////////////////////////////////////////////////////
                                SLASHING
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IAgentBond
    /// @dev Slash is justified only by a provable commit/reveal mismatch: the
    ///      keccak256 of the revealed tuple must differ from `committedHash`. If
    ///      they match, the reveal is consistent with the commitment and there is
    ///      no fraud to punish.
    function slash(
        bytes32 agentId,
        bytes32 datasetHash,
        uint32 scoringVersion,
        bytes32 committedHash,
        AgentScore calldata revealed
    ) external nonReentrant onlyOwnerOrOperator {
        if (!bonded[agentId]) revert NotBonded();

        bytes32 revealedHash =
            keccak256(abi.encode(datasetHash, scoringVersion, revealed));
        if (revealedHash == committedHash) revert NoFraud();

        uint256 amount = stakeOf[agentId];
        stakeOf[agentId] = 0;
        bonded[agentId] = false;

        bondToken.transfer(slashSink, amount);

        emit Slashed(agentId, datasetHash, scoringVersion, committedHash, amount);
    }

    /*//////////////////////////////////////////////////////////////
                              PAUSE CONTROLS
    //////////////////////////////////////////////////////////////*/

    /// @notice Pause staking/withdrawals.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume staking/withdrawals.
    function unpause() external onlyOwner {
        _unpause();
    }
}
