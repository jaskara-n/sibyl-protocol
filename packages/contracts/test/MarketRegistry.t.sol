// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {SibylLedger} from "../src/SibylLedger.sol";
import {ISibylLedger} from "../src/interfaces/ISibylLedger.sol";
import {Ownable2Step} from "../src/access/Ownable2Step.sol";
import {Pausable} from "../src/access/Pausable.sol";
import {SibylConsensusLib} from "../src/libraries/SibylConsensusLib.sol";
import {AgentScore, Signal, ConsensusResult, Direction} from "../src/types/SibylTypes.sol";

/// @notice Market-registry + per-market reputation/consensus behaviour for {SibylLedger}.
contract MarketRegistryTest is Test {
    SibylLedger internal ledger;

    bytes32 internal constant NEWS = keccak256("news_v1");
    bytes32 internal constant MOMENTUM = keccak256("momentum_v1");
    bytes32 internal constant MKT_A = keccak256("market_A");
    bytes32 internal constant MKT_B = keccak256("market_B");
    address internal constant STRANGER = address(0xBEEF);

    function setUp() public {
        ledger = new SibylLedger(0); // default cap 900_000
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _score(bytes32 id, uint32 brier) internal pure returns (AgentScore memory) {
        return AgentScore({
            agentId: id,
            brierPpm: brier,
            updatedEpoch: 0,
            active: true,
            exists: true,
            marketId: bytes32(0)
        });
    }

    function _signal(bytes32 id, bytes32 marketId, bool isLong, uint32 prob) internal pure returns (Signal memory) {
        return Signal({agentId: id, marketId: marketId, isLong: isLong, probabilityPpm: prob});
    }

    function _commit(bytes32 marketId, bytes32 dataset, bytes32 id, uint32 brier) internal {
        AgentScore[] memory scores = new AgentScore[](1);
        scores[0] = _score(id, brier);
        ledger.commitReplay(dataset, 1, marketId, scores);
    }

    /*//////////////////////////////////////////////////////////////
                          REGISTER / DEDUP
    //////////////////////////////////////////////////////////////*/

    function test_Register_EmitsAndStores() public {
        vm.expectEmit(true, true, false, false);
        emit ISibylLedger.MarketRegistered(MKT_A, 0);
        ledger.registerMarket(MKT_A);

        assertEq(ledger.marketCount(), 1);
        assertTrue(ledger.isMarketActive(MKT_A));
        bytes32[] memory all = ledger.getMarkets();
        assertEq(all.length, 1);
        assertEq(all[0], MKT_A);
    }

    function test_Register_IdempotentNoSecondEvent() public {
        ledger.registerMarket(MKT_A);
        // Second registration is a no-op: count stays 1.
        ledger.registerMarket(MKT_A);
        assertEq(ledger.marketCount(), 1);
        assertTrue(ledger.isMarketActive(MKT_A));
    }

    function test_RevertWhen_RegisterZeroMarket() public {
        vm.expectRevert(ISibylLedger.InvalidMarketId.selector);
        ledger.registerMarket(bytes32(0));
    }

    function test_RevertWhen_RegisterNotOwner() public {
        vm.prank(STRANGER);
        vm.expectRevert(Ownable2Step.NotOwner.selector);
        ledger.registerMarket(MKT_A);
    }

    function test_RevertWhen_RegisterPaused() public {
        ledger.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        ledger.registerMarket(MKT_A);
    }

    /*//////////////////////////////////////////////////////////////
                              TOGGLE
    //////////////////////////////////////////////////////////////*/

    function test_SetMarketActive_TogglesAndEmits() public {
        ledger.registerMarket(MKT_A);

        vm.expectEmit(true, false, false, true);
        emit ISibylLedger.MarketActiveSet(MKT_A, false);
        ledger.setMarketActive(MKT_A, false);
        assertFalse(ledger.isMarketActive(MKT_A));

        vm.expectEmit(true, false, false, true);
        emit ISibylLedger.MarketActiveSet(MKT_A, true);
        ledger.setMarketActive(MKT_A, true);
        assertTrue(ledger.isMarketActive(MKT_A));
    }

    function test_RevertWhen_SetActiveUnknownMarket() public {
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.UnknownMarket.selector, MKT_A));
        ledger.setMarketActive(MKT_A, true);
    }

    function test_RevertWhen_SetActiveNotOwner() public {
        ledger.registerMarket(MKT_A);
        vm.prank(STRANGER);
        vm.expectRevert(Ownable2Step.NotOwner.selector);
        ledger.setMarketActive(MKT_A, false);
    }

    function test_RevertWhen_SetActivePaused() public {
        ledger.registerMarket(MKT_A);
        ledger.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        ledger.setMarketActive(MKT_A, false);
    }

    /*//////////////////////////////////////////////////////////////
                            PAGINATION
    //////////////////////////////////////////////////////////////*/

    function test_MarketsPagination_ClampsOverRead() public {
        ledger.registerMarket(MKT_A);
        ledger.registerMarket(MKT_B);

        (bytes32[] memory page, uint256 total) = ledger.getMarketsPaginated(1, 100);
        assertEq(total, 2);
        assertEq(page.length, 1);
        assertEq(page[0], MKT_B);

        (bytes32[] memory empty, uint256 total2) = ledger.getMarketsPaginated(5, 10);
        assertEq(total2, 2);
        assertEq(empty.length, 0);
    }

    function test_MarketsPagination_ClampsLimitToMaxPage() public {
        for (uint256 i = 0; i < 205; i++) {
            ledger.registerMarket(keccak256(abi.encode("m", i)));
        }
        (bytes32[] memory page, uint256 total) = ledger.getMarketsPaginated(0, 300);
        assertEq(total, 205);
        assertEq(page.length, 200);
    }

    /*//////////////////////////////////////////////////////////////
                      PER-MARKET INDEPENDENT SCORES
    //////////////////////////////////////////////////////////////*/

    function test_PerMarket_IndependentScores() public {
        ledger.registerMarket(MKT_A);
        ledger.registerMarket(MKT_B);
        _commit(MKT_A, keccak256("dA"), NEWS, 200_000);
        _commit(MKT_B, keccak256("dB"), NEWS, 400_000);

        assertEq(ledger.getAgentScore(NEWS, MKT_A).brierPpm, 200_000);
        assertEq(ledger.getAgentScore(NEWS, MKT_B).brierPpm, 400_000);
        assertEq(ledger.getAgentScore(NEWS, MKT_A).marketId, MKT_A);
        assertEq(ledger.getAgentScore(NEWS, MKT_B).marketId, MKT_B);

        // Global agent list deduped to one entry; per-market lists each have one.
        assertEq(ledger.agentCount(), 1);
        (, uint256 totA) = ledger.getAgentScoresByMarketPaginated(MKT_A, 0, 10);
        (, uint256 totB) = ledger.getAgentScoresByMarketPaginated(MKT_B, 0, 10);
        assertEq(totA, 1);
        assertEq(totB, 1);
    }

    function test_PerMarket_DeactivationIsScoped() public {
        ledger.registerMarket(MKT_A);
        ledger.registerMarket(MKT_B);
        _commit(MKT_A, keccak256("dA"), NEWS, 200_000);
        _commit(MKT_B, keccak256("dB"), NEWS, 200_000);

        ledger.deactivateAgent(NEWS, MKT_A);
        assertFalse(ledger.getAgentScore(NEWS, MKT_A).active);
        assertTrue(ledger.getAgentScore(NEWS, MKT_B).active); // independent
    }

    /*//////////////////////////////////////////////////////////////
                      PER-MARKET REPLAY IDEMPOTENCY
    //////////////////////////////////////////////////////////////*/

    function test_PerMarket_ReplayIdempotencyIndependent() public {
        ledger.registerMarket(MKT_A);
        ledger.registerMarket(MKT_B);

        bytes32 dataset = keccak256("shared_dataset");
        // Same (dataset, version) is allowed once per market.
        _commit(MKT_A, dataset, NEWS, 200_000);
        _commit(MKT_B, dataset, NEWS, 200_000);

        // Re-committing the same (dataset, version, market) reverts.
        AgentScore[] memory scores = new AgentScore[](1);
        scores[0] = _score(NEWS, 100_000);
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.DuplicateReplay.selector, dataset, uint32(1)));
        ledger.commitReplay(dataset, 1, MKT_A, scores);
    }

    /*//////////////////////////////////////////////////////////////
                      MARKET-SCOPED CONSENSUS
    //////////////////////////////////////////////////////////////*/

    function test_Consensus_MarketAIgnoresMarketB() public {
        ledger.registerMarket(MKT_A);
        ledger.registerMarket(MKT_B);
        _commit(MKT_A, keccak256("dA"), NEWS, 200_000);
        _commit(MKT_B, keccak256("dB"), MOMENTUM, 150_000);

        // Signals for both markets, but compute scoped to A only counts the A-scoped, A-tagged signal.
        Signal[] memory signals = new Signal[](2);
        signals[0] = _signal(NEWS, MKT_A, true, 650_000);
        signals[1] = _signal(MOMENTUM, MKT_B, true, 990_000); // wrong market tag for A
        ConsensusResult memory r = ledger.computeConsensus(MKT_A, signals);
        assertEq(r.contributorCount, 1);
        assertEq(r.confidencePpm, 650_000);    }

    function test_Consensus_SignalTaggedForOtherMarketIgnored() public {
        ledger.registerMarket(MKT_A);
        _commit(MKT_A, keccak256("dA"), NEWS, 200_000);

        // Agent has a score in A but the signal is tagged for B -> filtered out.
        Signal[] memory signals = new Signal[](1);
        signals[0] = _signal(NEWS, MKT_B, true, 900_000);
        ConsensusResult memory r = ledger.computeConsensus(MKT_A, signals);
        assertEq(r.contributorCount, 0);
        assertEq(uint8(r.direction), uint8(Direction.FLAT));
    }

    function test_Consensus_FlatWhenMarketInactive() public {
        ledger.registerMarket(MKT_A);
        _commit(MKT_A, keccak256("dA"), NEWS, 200_000);
        ledger.setMarketActive(MKT_A, false);

        Signal[] memory signals = new Signal[](1);
        signals[0] = _signal(NEWS, MKT_A, true, 900_000);
        ConsensusResult memory r = ledger.computeConsensus(MKT_A, signals);
        assertEq(r.contributorCount, 0);
        assertEq(uint8(r.direction), uint8(Direction.FLAT));
        assertEq(r.confidencePpm, 500_000);    }

    function test_Consensus_FlatWhenMarketUnregistered() public view {
        // No market registered at all -> always FLAT, never reverts.
        Signal[] memory signals = new Signal[](1);
        signals[0] = _signal(NEWS, MKT_A, true, 900_000);
        ConsensusResult memory r = ledger.computeConsensus(MKT_A, signals);
        assertEq(r.contributorCount, 0);
        assertEq(uint8(r.direction), uint8(Direction.FLAT));
    }

    function test_EmitConsensus_EventCarriesMarketId() public {
        ledger.registerMarket(MKT_A);
        _commit(MKT_A, keccak256("dA"), NEWS, 200_000);

        Signal[] memory signals = new Signal[](1);
        signals[0] = _signal(NEWS, MKT_A, true, 650_000);
        vm.expectEmit(true, false, false, true);
        emit ISibylLedger.ConsensusReached(MKT_A, Direction.LONG, 600, 650_000, 1);
        ConsensusResult memory r = ledger.emitConsensus(MKT_A, signals);    }

    /*//////////////////////////////////////////////////////////////
                          CONVICTION INDEX
    //////////////////////////////////////////////////////////////*/

    function test_ConvictionIndex_SumsCappedActiveWeightsOnly() public {
        ledger.registerMarket(MKT_A);
        AgentScore[] memory scores = new AgentScore[](2);
        scores[0] = _score(NEWS, 0); // weight 1_000_001 -> capped to 900_000
        scores[1] = _score(MOMENTUM, 200_000); // weight 800_001 -> uncapped
        ledger.commitReplay(keccak256("dA"), 1, MKT_A, scores);

        (uint256 totalWeight, uint32 activeCount) = ledger.convictionIndex(MKT_A);
        // 900_000 (capped) + 800_001 = 1_700_001
        assertEq(totalWeight, 1_700_001);
        assertEq(activeCount, 2);

        // Deactivating MOMENTUM drops it from the sum and the count.
        ledger.deactivateAgent(MOMENTUM, MKT_A);
        (uint256 tw2, uint32 ac2) = ledger.convictionIndex(MKT_A);
        assertEq(tw2, 900_000);
        assertEq(ac2, 1);
    }

    function test_ConvictionIndex_EmptyMarketIsZero() public {
        ledger.registerMarket(MKT_A);
        (uint256 totalWeight, uint32 activeCount) = ledger.convictionIndex(MKT_A);
        assertEq(totalWeight, 0);
        assertEq(activeCount, 0);
    }

    function test_ConvictionForSignals_MatchesFilterAndWeights() public {
        ledger.registerMarket(MKT_A);
        AgentScore[] memory scores = new AgentScore[](2);
        scores[0] = _score(NEWS, 200_000); // weight 800_001
        scores[1] = _score(MOMENTUM, 150_000); // weight 850_001
        ledger.commitReplay(keccak256("dA"), 1, MKT_A, scores);

        Signal[] memory signals = new Signal[](2);
        signals[0] = _signal(NEWS, MKT_A, true, 650_000);
        signals[1] = _signal(MOMENTUM, MKT_A, true, 700_000);

        (uint256 totalWeight, uint32 confidencePpm) = ledger.convictionForSignals(MKT_A, signals);
        // Both uncapped under the 900_000 default.
        assertEq(totalWeight, 800_001 + 850_001);
        // Confidence matches the consensus path.
        ConsensusResult memory r = ledger.computeConsensus(MKT_A, signals);
        assertEq(confidencePpm, r.confidencePpm);
    }
}
