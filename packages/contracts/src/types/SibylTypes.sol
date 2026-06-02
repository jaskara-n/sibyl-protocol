// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title SibylTypes
/// @notice File-level shared types for the Sibyl protocol. Imported by the
///         interface, the consensus library, and the core contract so that every
///         unit shares identical ABI types with no duplicated definitions.

/// @notice Consensus direction. `FLAT` is index 0 so it is the safe zero-value default.
enum Direction {
    FLAT,
    LONG,
    SHORT
}

/// @notice A single agent's calibration record.
/// @param agentId      Opaque agent identity reference (e.g. keccak of the agent name or an ERC-8004 id).
/// @param brierPpm     Brier score in parts-per-million (`1_000_000 == 1.0`). Lower is better.
/// @param updatedEpoch The commit epoch in which this score was last written.
/// @param active       Whether the agent currently contributes to consensus.
/// @param exists       Whether the agent is registered at all.
/// @param marketId     The market this calibration record is scoped to.
struct AgentScore {
    bytes32 agentId;
    uint32 brierPpm;
    uint64 updatedEpoch;
    bool active;
    bool exists;
    bytes32 marketId;
}

/// @notice A live signal emitted by an agent for the current decision.
/// @param agentId        Agent identity reference.
/// @param marketId       The market this signal is scoped to.
/// @param isLong         Whether the stated probability is for the LONG side.
/// @param probabilityPpm Stated probability in ppm (`1_000_000 == 1.0`).
struct Signal {
    bytes32 agentId;
    bytes32 marketId;
    bool isLong;
    uint32 probabilityPpm;
}

/// @notice The reputation-weighted consensus outcome.
/// @param direction        LONG / SHORT / FLAT.
/// @param sizeBps          Position size in basis points (capped at `MAX_SIZE_BPS`).
/// @param confidencePpm    Weighted long-confidence in ppm, in [0, 1_000_000].
/// @param contributorCount Number of recognized + active agents that contributed.
/// @dev Pure math output of the market-agnostic {SibylConsensusLib.compute} kernel. The routing
///      market is conveyed separately by the market-scoped contract entrypoints (the `marketId`
///      argument they take and the `ConsensusReached` event they emit), so this struct — and the
///      kernel that builds it — stay byte-for-byte frozen for on-chain/off-chain parity.
struct ConsensusResult {
    Direction direction;
    uint16 sizeBps;
    uint32 confidencePpm;
    uint32 contributorCount;
}
