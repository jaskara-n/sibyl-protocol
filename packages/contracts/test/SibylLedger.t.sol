// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {SibylLedger} from "../src/SibylLedger.sol";
import {ISibylLedger} from "../src/interfaces/ISibylLedger.sol";
import {Ownable2Step} from "../src/access/Ownable2Step.sol";
import {Pausable} from "../src/access/Pausable.sol";
import {SibylConsensusLib} from "../src/libraries/SibylConsensusLib.sol";
import {AgentScore, Signal, ConsensusResult, Direction} from "../src/types/SibylTypes.sol";

contract SibylLedgerTest is Test {
    SibylLedger internal ledger;

    bytes32 internal constant NEWS = keccak256("news_v1");
    bytes32 internal constant MOMENTUM = keccak256("momentum_v1");
    bytes32 internal constant MKT = keccak256("market_default");
    address internal constant STRANGER = address(0xBEEF);

    function setUp() public {
        ledger = new SibylLedger(0); // default cap 900_000
        ledger.registerMarket(MKT);
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

    function _signal(bytes32 id, bool isLong, uint32 prob) internal pure returns (Signal memory) {
        return Signal({agentId: id, marketId: MKT, isLong: isLong, probabilityPpm: prob});
    }

    function _commitTwo() internal {
        AgentScore[] memory scores = new AgentScore[](2);
        scores[0] = _score(NEWS, 200_000);
        scores[1] = _score(MOMENTUM, 150_000);
        ledger.commitReplay(keccak256("dataset_v1"), 1, MKT, scores);
    }

    /*//////////////////////////////////////////////////////////////
                              OWNERSHIP
    //////////////////////////////////////////////////////////////*/

    function test_Owner_InitialOwnerIsDeployer() public view {
        assertEq(ledger.owner(), address(this));
        assertEq(ledger.maxAgentWeightPpm(), 900_000);
    }

    function test_Ownership_TwoStepTransfer() public {
        ledger.transferOwnership(STRANGER);
        assertEq(ledger.pendingOwner(), STRANGER);
        assertEq(ledger.owner(), address(this));
        vm.prank(STRANGER);
        ledger.acceptOwnership();
        assertEq(ledger.owner(), STRANGER);
        assertEq(ledger.pendingOwner(), address(0));
    }

    function test_RevertWhen_TransferToZero() public {
        vm.expectRevert(Ownable2Step.ZeroAddressOwner.selector);
        ledger.transferOwnership(address(0));
    }

    function test_RevertWhen_AcceptByNonPending() public {
        ledger.transferOwnership(STRANGER);
        vm.expectRevert(Ownable2Step.NotPendingOwner.selector);
        ledger.acceptOwnership();
    }

    function test_RevertWhen_StrangerCallsAdmin() public {
        vm.prank(STRANGER);
        vm.expectRevert(Ownable2Step.NotOwner.selector);
        ledger.registerAgent(NEWS);
    }

    /*//////////////////////////////////////////////////////////////
                                PAUSE
    //////////////////////////////////////////////////////////////*/

    function test_Pause_BlocksWritesButAllowsViews() public {
        _commitTwo();
        ledger.pause();
        assertTrue(ledger.paused());

        AgentScore[] memory scores = new AgentScore[](1);
        scores[0] = _score(NEWS, 100_000);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        ledger.commitReplay(keccak256("dataset_v2"), 1, MKT, scores);

        // view still works
        Signal[] memory signals = new Signal[](1);
        signals[0] = _signal(NEWS, true, 650_000);
        ledger.computeConsensus(MKT, signals);
    }

    function test_Unpause_RestoresWrites() public {
        ledger.pause();
        ledger.unpause();
        assertFalse(ledger.paused());
        _commitTwo();
        assertEq(ledger.agentCount(), 2);
    }

    function test_RevertWhen_PauseNotOwner() public {
        vm.prank(STRANGER);
        vm.expectRevert(Ownable2Step.NotOwner.selector);
        ledger.pause();
    }

    /*//////////////////////////////////////////////////////////////
                            REGISTRATION
    //////////////////////////////////////////////////////////////*/

    function test_Register_DedupAndEvent() public {
        vm.expectEmit(true, true, false, false);
        emit ISibylLedger.AgentRegistered(NEWS, 0);
        ledger.registerAgent(NEWS);
        ledger.registerAgent(NEWS); // no-op
        assertEq(ledger.agentCount(), 1);
    }

    function test_RevertWhen_RegisterZeroId() public {
        vm.expectRevert(ISibylLedger.InvalidAgentId.selector);
        ledger.registerAgent(bytes32(0));
    }

    /*//////////////////////////////////////////////////////////////
                            COMMIT REPLAY
    //////////////////////////////////////////////////////////////*/

    function test_Commit_StoresAndAutoRegisters() public {
        vm.expectEmit(true, true, true, true);
        emit ISibylLedger.AgentRegistered(NEWS, 1);
        vm.expectEmit(true, true, true, true);
        emit ISibylLedger.AgentRegistered(MOMENTUM, 1);
        vm.expectEmit(true, true, true, true);
        emit ISibylLedger.ReplayCommitted(keccak256("dataset_v1"), 1, 1, MKT, 2);
        _commitTwo();

        assertEq(ledger.latestDatasetHash(), keccak256("dataset_v1"));
        assertEq(ledger.latestScoringVersion(), 1);
        assertEq(ledger.epoch(), 1);
        AgentScore memory s = ledger.getAgentScore(NEWS, MKT);
        assertEq(s.brierPpm, 200_000);
        assertEq(s.updatedEpoch, 1);
        assertEq(s.marketId, MKT);
        assertTrue(s.active);
    }

    function test_RevertWhen_CommitZeroHash() public {
        AgentScore[] memory scores = new AgentScore[](1);
        scores[0] = _score(NEWS, 100_000);
        vm.expectRevert(ISibylLedger.InvalidDatasetHash.selector);
        ledger.commitReplay(bytes32(0), 1, MKT, scores);
    }

    function test_RevertWhen_CommitEmptyScores() public {
        AgentScore[] memory scores = new AgentScore[](0);
        vm.expectRevert(ISibylLedger.EmptyScores.selector);
        ledger.commitReplay(keccak256("d"), 1, MKT, scores);
    }

    function test_RevertWhen_CommitUnknownMarket() public {
        AgentScore[] memory scores = new AgentScore[](1);
        scores[0] = _score(NEWS, 100_000);
        bytes32 ghost = keccak256("ghost_market");
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.UnknownMarket.selector, ghost));
        ledger.commitReplay(keccak256("d"), 1, ghost, scores);
    }

    function test_RevertWhen_DuplicateReplay() public {
        _commitTwo();
        AgentScore[] memory scores = new AgentScore[](1);
        scores[0] = _score(NEWS, 100_000);
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.DuplicateReplay.selector, keccak256("dataset_v1"), uint32(1)));
        ledger.commitReplay(keccak256("dataset_v1"), 1, MKT, scores);
    }

    function test_Commit_AllowedAfterVersionBump() public {
        _commitTwo();
        AgentScore[] memory scores = new AgentScore[](1);
        scores[0] = _score(NEWS, 100_000);
        ledger.commitReplay(keccak256("dataset_v1"), 2, MKT, scores); // same hash, new version OK
        assertEq(ledger.epoch(), 2);
        assertEq(ledger.getAgentScore(NEWS, MKT).brierPpm, 100_000);
    }

    function test_RevertWhen_BrierOutOfRange() public {
        AgentScore[] memory scores = new AgentScore[](1);
        scores[0] = _score(NEWS, 1_000_001);
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.BrierOutOfRange.selector, NEWS, uint32(1_000_001)));
        ledger.commitReplay(keccak256("d"), 1, MKT, scores);
    }

    /*//////////////////////////////////////////////////////////////
                            DEACTIVATION
    //////////////////////////////////////////////////////////////*/

    function test_Deactivate_ExcludesFromConsensus() public {
        _commitTwo();
        vm.expectEmit(true, true, false, false);
        emit ISibylLedger.AgentDeactivated(MOMENTUM, 1);
        ledger.deactivateAgent(MOMENTUM, MKT);
        assertFalse(ledger.getAgentScore(MOMENTUM, MKT).active);

        Signal[] memory signals = new Signal[](2);
        signals[0] = _signal(NEWS, true, 650_000);
        signals[1] = _signal(MOMENTUM, true, 990_000);
        ConsensusResult memory r = ledger.computeConsensus(MKT, signals);
        // only NEWS contributes: confidence == 650_000, size 600
        assertEq(r.contributorCount, 1);
        assertEq(r.confidencePpm, 650_000);
        assertEq(r.sizeBps, 600);
    }

    function test_Deactivate_PreservedAcrossCommit() public {
        _commitTwo();
        ledger.deactivateAgent(NEWS, MKT);
        AgentScore[] memory scores = new AgentScore[](1);
        scores[0] = _score(NEWS, 120_000);
        ledger.commitReplay(keccak256("dataset_v2"), 1, MKT, scores);
        assertFalse(ledger.getAgentScore(NEWS, MKT).active); // commit must not silently reactivate
    }

    function test_Reactivate() public {
        _commitTwo();
        ledger.deactivateAgent(NEWS, MKT);
        ledger.reactivateAgent(NEWS, MKT);
        assertTrue(ledger.getAgentScore(NEWS, MKT).active);
    }

    function test_RevertWhen_DeactivateUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.UnknownAgent.selector, NEWS));
        ledger.deactivateAgent(NEWS, MKT);
    }

    /*//////////////////////////////////////////////////////////////
                            WEIGHT CAP
    //////////////////////////////////////////////////////////////*/

    function test_SetWeightCap_EmitsAndUpdates() public {
        vm.expectEmit(false, false, false, true);
        emit ISibylLedger.AgentWeightCapUpdated(900_000, 300_000);
        ledger.setMaxAgentWeightPpm(300_000);
        assertEq(ledger.maxAgentWeightPpm(), 300_000);
    }

    function test_RevertWhen_WeightCapOutOfRange() public {
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.WeightCapOutOfRange.selector, uint32(0)));
        ledger.setMaxAgentWeightPpm(0);
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.WeightCapOutOfRange.selector, uint32(1_000_002)));
        ledger.setMaxAgentWeightPpm(1_000_002);
    }

    /*//////////////////////////////////////////////////////////////
                              CONSENSUS
    //////////////////////////////////////////////////////////////*/

    function test_Consensus_WeightedDecision() public {
        _commitTwo();
        Signal[] memory signals = new Signal[](2);
        signals[0] = _signal(NEWS, true, 650_000);
        signals[1] = _signal(MOMENTUM, true, 700_000);
        // default cap 900_000 is non-binding here (weights 800_001 / 850_001) -> reputation-weighted
        ConsensusResult memory r = ledger.computeConsensus(MKT, signals);
        assertEq(uint8(r.direction), uint8(Direction.LONG));
        assertEq(r.confidencePpm, 675_757);
        assertEq(r.sizeBps, 703);
        assertEq(r.contributorCount, 2);
    }

    function test_Consensus_EmptyReturnsFlat() public view {
        Signal[] memory signals = new Signal[](0);
        ConsensusResult memory r = ledger.computeConsensus(MKT, signals);
        assertEq(uint8(r.direction), uint8(Direction.FLAT));
        assertEq(r.confidencePpm, 500_000);
        assertEq(r.contributorCount, 0);
    }

    function test_Consensus_UnknownAgentReturnsFlat() public view {
        Signal[] memory signals = new Signal[](1);
        signals[0] = _signal(keccak256("ghost"), true, 900_000);
        ConsensusResult memory r = ledger.computeConsensus(MKT, signals);
        assertEq(uint8(r.direction), uint8(Direction.FLAT));
        assertEq(r.contributorCount, 0);
    }

    function test_RevertWhen_ProbabilityOutOfRange() public {
        _commitTwo();
        Signal[] memory signals = new Signal[](1);
        signals[0] = _signal(NEWS, true, 1_000_001);
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.ProbabilityOutOfRange.selector, NEWS, uint32(1_000_001)));
        ledger.computeConsensus(MKT, signals);
    }

    function test_EmitConsensus_EmitsEvent() public {
        _commitTwo();
        Signal[] memory signals = new Signal[](2);
        signals[0] = _signal(NEWS, true, 650_000);
        signals[1] = _signal(MOMENTUM, true, 700_000);
        vm.expectEmit(true, false, false, true);
        emit ISibylLedger.ConsensusReached(MKT, Direction.LONG, 703, 675_757, 2);
        ledger.emitConsensus(MKT, signals);
    }

    function test_RevertWhen_EmitConsensusNotOwner() public {
        _commitTwo();
        Signal[] memory signals = new Signal[](1);
        signals[0] = _signal(NEWS, true, 650_000);
        vm.prank(STRANGER);
        vm.expectRevert(Ownable2Step.NotOwner.selector);
        ledger.emitConsensus(MKT, signals);
    }

    /*//////////////////////////////////////////////////////////////
                              VALIDATION
    //////////////////////////////////////////////////////////////*/

    function test_RequestValidation_Emits() public {
        vm.expectEmit(true, true, true, false);
        emit ISibylLedger.ValidationRequested(NEWS, keccak256("dataset_v1"), address(this));
        ledger.requestValidation(NEWS, keccak256("dataset_v1"));
    }

    function test_RevertWhen_RequestValidationZeroId() public {
        vm.expectRevert(ISibylLedger.InvalidAgentId.selector);
        ledger.requestValidation(bytes32(0), keccak256("d"));
    }

    /*//////////////////////////////////////////////////////////////
                                READS
    //////////////////////////////////////////////////////////////*/

    function test_Getters_AgentsAndCount() public {
        _commitTwo();
        assertEq(ledger.agentCount(), 2);
        assertEq(ledger.agentAt(0), NEWS);
        bytes32[] memory all = ledger.getAgents();
        assertEq(all.length, 2);
    }

    function test_RevertWhen_AgentAtOutOfBounds() public {
        _commitTwo();
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.IndexOutOfBounds.selector, uint256(2), uint256(2)));
        ledger.agentAt(2);
    }

    function test_Pagination_ClampsOverRead() public {
        _commitTwo();
        (bytes32[] memory page, uint256 total) = ledger.getAgentsPaginated(1, 100);
        assertEq(total, 2);
        assertEq(page.length, 1);
        assertEq(page[0], MOMENTUM);

        (bytes32[] memory empty, uint256 total2) = ledger.getAgentsPaginated(5, 10);
        assertEq(total2, 2);
        assertEq(empty.length, 0);
    }

    function test_History_TracksAndReadsByEpoch() public {
        _commitTwo(); // epoch 1: NEWS brier 200_000
        AgentScore[] memory scores = new AgentScore[](1);
        scores[0] = _score(NEWS, 120_000);
        ledger.commitReplay(keccak256("dataset_v2"), 1, MKT, scores); // epoch 2: NEWS brier 120_000

        (AgentScore[] memory hist, uint256 total) = ledger.getAgentScoreHistory(NEWS, MKT, 0, 10);
        assertEq(total, 2);
        assertEq(hist[0].brierPpm, 200_000);
        assertEq(hist[1].brierPpm, 120_000);

        assertEq(ledger.getAgentScoreAt(NEWS, MKT, 1).brierPpm, 200_000);
        assertEq(ledger.getAgentScoreAt(NEWS, MKT, 2).brierPpm, 120_000);
        assertEq(ledger.getAgentScoreAt(NEWS, MKT, 0).exists, false); // before any score
    }

    /*//////////////////////////////////////////////////////////////
                            INTERFACE
    //////////////////////////////////////////////////////////////*/

    function test_Interface_Conformance() public view {
        ISibylLedger iface = ISibylLedger(address(ledger));
        assertEq(iface.agentCount(), 0);
    }

    /*//////////////////////////////////////////////////////////////
                          EVENT ASSERTIONS
    //////////////////////////////////////////////////////////////*/

    function test_Deploy_EmitsOwnershipTransferred() public {
        vm.expectEmit(true, true, false, false);
        emit Ownable2Step.OwnershipTransferred(address(0), address(this));
        new SibylLedger(0);
    }

    function test_TransferOwnership_EmitsStarted() public {
        vm.expectEmit(true, true, false, false);
        emit Ownable2Step.OwnershipTransferStarted(address(this), STRANGER);
        ledger.transferOwnership(STRANGER);
    }

    function test_AcceptOwnership_EmitsTransferred() public {
        ledger.transferOwnership(STRANGER);
        vm.expectEmit(true, true, false, false);
        emit Ownable2Step.OwnershipTransferred(address(this), STRANGER);
        vm.prank(STRANGER);
        ledger.acceptOwnership();
    }

    function test_Pause_EmitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit Pausable.Paused(address(this));
        ledger.pause();
    }

    function test_Unpause_EmitsEvent() public {
        ledger.pause();
        vm.expectEmit(false, false, false, true);
        emit Pausable.Unpaused(address(this));
        ledger.unpause();
    }

    function test_Reactivate_EmitsEvent() public {
        _commitTwo();
        ledger.deactivateAgent(NEWS, MKT);
        vm.expectEmit(true, true, false, false);
        emit ISibylLedger.AgentReactivated(NEWS, 1);
        ledger.reactivateAgent(NEWS, MKT);
    }

    /*//////////////////////////////////////////////////////////////
                       PAUSE REVERT COVERAGE
    //////////////////////////////////////////////////////////////*/

    function test_RevertWhen_RegisterAgentPaused() public {
        ledger.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        ledger.registerAgent(NEWS);
    }

    function test_RevertWhen_DeactivatePaused() public {
        _commitTwo();
        ledger.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        ledger.deactivateAgent(NEWS, MKT);
    }

    function test_RevertWhen_ReactivatePaused() public {
        _commitTwo();
        ledger.deactivateAgent(NEWS, MKT);
        ledger.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        ledger.reactivateAgent(NEWS, MKT);
    }

    function test_RevertWhen_SetCapPaused() public {
        ledger.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        ledger.setMaxAgentWeightPpm(300_000);
    }

    function test_RevertWhen_RequestValidationPaused() public {
        ledger.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        ledger.requestValidation(NEWS, keccak256("d"));
    }

    function test_RevertWhen_EmitConsensusPaused() public {
        _commitTwo();
        ledger.pause();
        Signal[] memory signals = new Signal[](1);
        signals[0] = _signal(NEWS, true, 650_000);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        ledger.emitConsensus(MKT, signals);
    }

    /*//////////////////////////////////////////////////////////////
                            BATCH CAPS
    //////////////////////////////////////////////////////////////*/

    function _scoresN(uint256 n) internal pure returns (AgentScore[] memory arr) {
        arr = new AgentScore[](n);
        for (uint256 i = 0; i < n; i++) {
            arr[i] = AgentScore({
                agentId: keccak256(abi.encode("agent", i)),
                brierPpm: 100_000,
                updatedEpoch: 0,
                active: true,
                exists: true,
                marketId: bytes32(0)
            });
        }
    }

    function _signalsN(uint256 n) internal pure returns (Signal[] memory arr) {
        arr = new Signal[](n);
        for (uint256 i = 0; i < n; i++) {
            arr[i] = Signal({
                agentId: keccak256(abi.encode("agent", i)),
                marketId: MKT,
                isLong: true,
                probabilityPpm: 600_000
            });
        }
    }

    function test_RevertWhen_TooManyScores() public {
        AgentScore[] memory scores = _scoresN(257);
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.TooManyItems.selector, uint256(257)));
        ledger.commitReplay(keccak256("big"), 1, MKT, scores);
    }

    function test_RevertWhen_TooManySignals() public {
        Signal[] memory signals = _signalsN(257);
        vm.expectRevert(abi.encodeWithSelector(ISibylLedger.TooManyItems.selector, uint256(257)));
        ledger.computeConsensus(MKT, signals);
    }

    function test_Batch_MaxAllowed() public {
        AgentScore[] memory scores = _scoresN(256);
        ledger.commitReplay(keccak256("max"), 1, MKT, scores);
        assertEq(ledger.agentCount(), 256);
    }

    /*//////////////////////////////////////////////////////////////
                         PAGINATION EDGES
    //////////////////////////////////////////////////////////////*/

    function test_Pagination_ClampsLimitToMaxPage() public {
        ledger.commitReplay(keccak256("many"), 1, MKT, _scoresN(205));
        (bytes32[] memory page, uint256 total) = ledger.getAgentsPaginated(0, 300);
        assertEq(total, 205);
        assertEq(page.length, 200);
    }

    function test_Pagination_OffsetEqualsTotal() public {
        _commitTwo();
        (bytes32[] memory page, uint256 total) = ledger.getAgentsPaginated(2, 100);
        assertEq(total, 2);
        assertEq(page.length, 0);
    }

    function test_PaginationScores_ClampsLimitToMaxPage() public {
        ledger.commitReplay(keccak256("many"), 1, MKT, _scoresN(205));
        (AgentScore[] memory page, uint256 total) = ledger.getAgentScoresByMarketPaginated(MKT, 0, 300);
        assertEq(total, 205);
        assertEq(page.length, 200);
    }

    function test_PaginationHistory_Reads() public {
        AgentScore[] memory s = new AgentScore[](1);
        s[0] = _score(NEWS, 100_000);
        ledger.commitReplay(keccak256("h1"), 1, MKT, s);
        ledger.commitReplay(keccak256("h2"), 1, MKT, s);
        ledger.commitReplay(keccak256("h3"), 1, MKT, s);
        (AgentScore[] memory page, uint256 total) = ledger.getAgentScoreHistory(NEWS, MKT, 0, 300);
        assertEq(total, 3);
        assertEq(page.length, 3);
    }

    /*//////////////////////////////////////////////////////////////
                        CONSENSUS DYNAMICS
    //////////////////////////////////////////////////////////////*/

    function test_Consensus_MixedLongShort() public {
        _commitTwo();
        Signal[] memory s = new Signal[](2);
        s[0] = _signal(NEWS, true, 700_000);
        s[1] = _signal(MOMENTUM, false, 900_000); // longProb 100_000
        ConsensusResult memory r = ledger.computeConsensus(MKT, s);
        // reputation-weighted: NEWS(brier .2 -> w 800001) LONG .7 vs MOMENTUM(brier .15 -> w 850001) SHORT
        assertEq(uint8(r.direction), uint8(Direction.SHORT));
        assertEq(r.confidencePpm, 390_909);
        assertEq(r.sizeBps, 436);
        assertEq(r.contributorCount, 2);
    }

    function test_Consensus_CapRaisedLetsStrongerAgentLead() public {
        AgentScore[] memory sc = new AgentScore[](2);
        sc[0] = _score(NEWS, 0); // strong
        sc[1] = _score(MOMENTUM, 800_000); // weak
        ledger.commitReplay(keccak256("d"), 1, MKT, sc);
        ledger.setMaxAgentWeightPpm(1_000_001); // remove the binding cap

        Signal[] memory s = new Signal[](2);
        s[0] = _signal(NEWS, true, 1_000_000); // strong LONG
        s[1] = _signal(MOMENTUM, false, 1_000_000); // weak SHORT (longProb 0)
        ConsensusResult memory r = ledger.computeConsensus(MKT, s);
        assertEq(uint8(r.direction), uint8(Direction.LONG));
        assertGt(r.confidencePpm, 800_000);
    }

    function test_Deactivation_PreservedMultipleAgents() public {
        _commitTwo();
        ledger.deactivateAgent(NEWS, MKT);
        AgentScore[] memory s = new AgentScore[](3);
        s[0] = _score(NEWS, 120_000);
        s[1] = _score(MOMENTUM, 130_000);
        s[2] = _score(keccak256("funding_v1"), 140_000);
        ledger.commitReplay(keccak256("super"), 1, MKT, s);
        assertFalse(ledger.getAgentScore(NEWS, MKT).active);
        assertTrue(ledger.getAgentScore(MOMENTUM, MKT).active);
        assertTrue(ledger.getAgentScore(keccak256("funding_v1"), MKT).active);
    }

    function test_EmitConsensus_FlatWhenNoActiveAgents() public {
        _commitTwo();
        ledger.deactivateAgent(NEWS, MKT);
        ledger.deactivateAgent(MOMENTUM, MKT);
        Signal[] memory s = new Signal[](2);
        s[0] = _signal(NEWS, true, 900_000);
        s[1] = _signal(MOMENTUM, true, 900_000);
        vm.expectEmit(true, false, false, true);
        emit ISibylLedger.ConsensusReached(MKT, Direction.FLAT, 0, 500_000, 0);
        ConsensusResult memory r = ledger.emitConsensus(MKT, s);
        assertEq(uint8(r.direction), uint8(Direction.FLAT));
    }

    /*//////////////////////////////////////////////////////////////
                       HISTORY EPOCH BOUNDARIES
    //////////////////////////////////////////////////////////////*/

    function test_HistoryAtEpoch_FutureReturnsLatest() public {
        _commitTwo();
        AgentScore[] memory s = new AgentScore[](1);
        s[0] = _score(NEWS, 120_000);
        ledger.commitReplay(keccak256("d2"), 1, MKT, s);
        assertEq(ledger.getAgentScoreAt(NEWS, MKT, 100).brierPpm, 120_000);
    }

    function test_HistoryAtEpoch_ExactMatch() public {
        _commitTwo();
        AgentScore memory atE = ledger.getAgentScoreAt(NEWS, MKT, 1);
        assertEq(atE.brierPpm, 200_000);
        assertEq(atE.updatedEpoch, 1);
    }
}
