// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SessionOracle} from "../../src/SessionOracle.sol";
import {Types} from "../../src/lib/Types.sol";
import {Errors} from "../../src/lib/Errors.sol";

// Independent ABI declaration permits regression tests to run before the new API exists.
interface IReferenceOracle {
    struct ReferencePriceFact {
        bytes32 assetId;
        bytes32 sessionId;
        bytes32 configHash;
        uint256 price;
        uint128 multiplierNumerator;
        uint128 multiplierDenominator;
        uint64 observedAt;
        uint64 validUntil;
        bytes32 corporateActionHash;
        bytes32 primarySourceHash;
        bytes32 secondarySourceHash;
        bytes32 reportHash;
    }
    function latestReference(bytes32 assetId) external view returns (ReferencePriceFact memory);
    function requireFreshReference(bytes32 assetId) external view returns (ReferencePriceFact memory);
}

contract MarketPriceTest is Test {
    bytes32 constant ASSET = keccak256("stock");
    bytes32 constant SESSION = keccak256("session");
    bytes32 constant CONFIG = keccak256("config");
    bytes32 constant PRIMARY = keccak256("primary");
    bytes32 constant SECONDARY = keccak256("secondary");
    address constant RECEIVER = address(0xCE1);
    SessionOracle oracle;
    IReferenceOracle referenceOracle;

    function setUp() public {
        vm.warp(100_000);
        oracle = new SessionOracle(address(this));
        oracle.bindReceiver(RECEIVER);
        referenceOracle = IReferenceOracle(address(oracle));
        _accept(_scheduled(SESSION, CONFIG, 100_010, 110_000));
        vm.warp(102_000);
    }

    // Catches missing dispatch/storage, corrupted report provenance, or nonce/hash omissions.
    function testStoresAuthenticatedPriceWithoutChangingSessionOrBenchmark() public {
        Types.AssetState memory beforeState = oracle.assetState(ASSET);
        Types.MarketEventReport memory r = _market();
        bytes memory payload = _marketPayload(r);
        assertEq(payload.length, 21 * 32);
        _price(r);
        IReferenceOracle.ReferencePriceFact memory fact = referenceOracle.requireFreshReference(ASSET);
        assertEq(fact.assetId, ASSET);
        assertEq(fact.sessionId, SESSION);
        assertEq(fact.configHash, CONFIG);
        assertEq(fact.price, 125_000_000);
        assertEq(fact.multiplierNumerator, 1);
        assertEq(fact.multiplierDenominator, 1);
        assertEq(fact.observedAt, 102_000);
        assertEq(fact.validUntil, 103_800);
        assertEq(fact.corporateActionHash, bytes32(0));
        assertEq(fact.primarySourceHash, PRIMARY);
        assertEq(fact.secondarySourceHash, SECONDARY);
        assertEq(fact.reportHash, keccak256(payload));
        assertEq(abi.encode(referenceOracle.latestReference(ASSET)), abi.encode(fact));
        Types.AssetState memory state = oracle.assetState(ASSET);
        assertEq(state.nextNonce, beforeState.nextNonce + 1);
        assertEq(state.stateHash, keccak256(abi.encode(beforeState.stateHash, keccak256(payload))));
        assertEq(uint8(oracle.sessionPhase(SESSION)), 1);
        assertFalse(oracle.benchmarkOf(SESSION).finalized);
    }

    function testMissingReferenceIsUnavailable() public {
        vm.expectRevert(abi.encodeWithSignature("ReferenceUnavailable(bytes32)", ASSET));
        referenceOracle.requireFreshReference(ASSET);
    }

    function testRejectsUnauthorizedMarketPrice() public {
        bytes memory callData = abi.encodePacked(oracle.acceptReport.selector, _marketPayload(_market()));
        (bool ok, bytes memory reason) = address(oracle).call(callData);
        assertFalse(ok);
        assertEq(reason, abi.encodeWithSelector(Errors.UnauthorizedReceiver.selector, address(this)));
        assertEq(oracle.assetState(ASSET).nextNonce, 2);
    }

    function testRejectsWrongConfigWithRollback() public {
        Types.MarketEventReport memory r = _market();
        r.configHash = keccak256("other");
        _reject(r, abi.encodeWithSelector(Errors.AssetConfigMismatch.selector, CONFIG, r.configHash));
    }

    function testRejectsSessionIdOnAssetLevelReport() public {
        Types.MarketEventReport memory r = _market();
        r.sessionId = SESSION;
        _reject(r, abi.encodeWithSelector(Errors.SessionIdentityMismatch.selector, SESSION));
    }

    function testRejectsChangedSchedule() public {
        Types.MarketEventReport memory r = _market();
        r.scheduledClose++;
        _reject(r, abi.encodeWithSelector(Errors.InvalidSessionTiming.selector));
    }

    function testRejectsObservationBeforeOpen() public {
        Types.MarketEventReport memory r = _market();
        vm.warp(100_011);
        r.observedAt = 100_009;
        r.validUntil = 101_000;
        _reject(r, abi.encodeWithSelector(Errors.InvalidSessionTiming.selector));
    }

    function testRejectsExecutionBeforeOpen() public {
        vm.warp(100_009);
        Types.MarketEventReport memory r = _market();
        _reject(r, abi.encodeWithSignature("ReferenceSessionNotOpen(bytes32)", SESSION));
    }

    function testRejectsExecutionAtCloseDespiteEarlierObservation() public {
        vm.warp(110_000);
        Types.MarketEventReport memory r = _market();
        r.observedAt = 109_999;
        _reject(r, abi.encodeWithSignature("ReferenceSessionNotOpen(bytes32)", SESSION));
    }

    function testRejectsHaltedAssetAndUnhaltDoesNotReviveOldPrice() public {
        _price(_market());
        Types.MarketEventReport memory r = _base(Types.MarketEventKind.HALT);
        r.halted = true;
        _accept(r);
        _reject(_market(), abi.encodeWithSignature("AssetHalted(bytes32)", ASSET));
        vm.expectRevert(abi.encodeWithSignature("AssetHalted(bytes32)", ASSET));
        referenceOracle.requireFreshReference(ASSET);
        r = _base(Types.MarketEventKind.HALT);
        _accept(r);
        vm.expectRevert(abi.encodeWithSignature("ReferenceUnavailable(bytes32)", ASSET));
        referenceOracle.requireFreshReference(ASSET);
        vm.warp(102_001);
        _price(_market());
        assertEq(referenceOracle.requireFreshReference(ASSET).observedAt, 102_001);
    }

    function testRejectsStaleObservation() public {
        Types.MarketEventReport memory r = _market();
        r.observedAt = 100_199;
        _reject(r, abi.encodeWithSignature("StaleReference(uint64,uint64)", uint64(100_199), uint64(102_000)));
    }

    function testRejectsFutureObservation() public {
        Types.MarketEventReport memory r = _market();
        r.observedAt++;
        _reject(r, abi.encodeWithSelector(Errors.FutureObservation.selector, uint64(102_001), uint64(102_000)));
    }

    function testRejectsExpiredReport() public {
        Types.MarketEventReport memory r = _market();
        r.validUntil = 101_999;
        _reject(r, abi.encodeWithSelector(Errors.ReportExpired.selector, uint64(101_999), uint64(102_000)));
    }

    function testRejectsValidityBeyondThirtyMinutes() public {
        Types.MarketEventReport memory r = _market();
        r.validUntil++;
        _reject(r, abi.encodeWithSignature("InvalidReferenceValidity()"));
    }

    function testAcceptsExactFreshnessBoundaryThenExpires() public {
        Types.MarketEventReport memory r = _market();
        r.observedAt = 100_200;
        r.validUntil = 102_000;
        _price(r);
        assertEq(referenceOracle.requireFreshReference(ASSET).observedAt, 100_200);
        vm.warp(102_001);
        vm.expectRevert(abi.encodeWithSelector(Errors.ReportExpired.selector, uint64(102_000), uint64(102_001)));
        referenceOracle.requireFreshReference(ASSET);
        assertEq(referenceOracle.latestReference(ASSET).price, 125_000_000);
    }

    function testRejectsDuplicateAndOlderObservationWithFreshNonce() public {
        _price(_market());
        Types.MarketEventReport memory r = _market();
        _reject(r, abi.encodeWithSignature("NonMonotonicReference(uint64,uint64)", uint64(102_000), uint64(102_000)));
        r.observedAt--;
        r.validUntil--;
        _reject(r, abi.encodeWithSignature("NonMonotonicReference(uint64,uint64)", uint64(102_000), uint64(101_999)));
        vm.warp(102_001);
        _price(_market());
        assertEq(referenceOracle.latestReference(ASSET).observedAt, 102_001);
    }

    function testRejectsMissingAndIdenticalSourceHashes() public {
        Types.MarketEventReport memory r = _market();
        r.primarySourceHash = 0;
        _reject(r, abi.encodeWithSelector(Errors.MissingSourceEvidence.selector));
        r = _market();
        r.secondarySourceHash = 0;
        _reject(r, abi.encodeWithSelector(Errors.MissingSourceEvidence.selector));
        r.secondarySourceHash = PRIMARY;
        _reject(r, abi.encodeWithSignature("DuplicateSourceEvidence()"));
    }

    function testRejectsZeroAndOversizedPrice() public {
        Types.MarketEventReport memory r = _market();
        r.benchmarkPrice = 0;
        _reject(r, abi.encodeWithSelector(Errors.UnsupportedPrice.selector));
        r.benchmarkPrice = uint256(type(uint96).max) + 1;
        _reject(r, abi.encodeWithSelector(Errors.UnsupportedPrice.selector));
        r.benchmarkPrice = type(uint96).max;
        _price(r);
    }

    function testRejectsZeroOrMismatchedMultiplier() public {
        Types.MarketEventReport memory r = _market();
        r.multiplierNumerator = 0;
        _reject(r, abi.encodeWithSelector(Errors.InvalidMultiplier.selector));
        r = _market();
        r.multiplierDenominator = 0;
        _reject(r, abi.encodeWithSelector(Errors.InvalidMultiplier.selector));
        r = _market();
        r.multiplierNumerator = 2;
        _reject(r, abi.encodeWithSelector(Errors.InvalidMultiplier.selector));
    }

    function testRejectsCorporateActionFieldsOnPriceReport() public {
        Types.MarketEventReport memory r = _market();
        r.corporateAction = Types.CorporateAction.SPLIT;
        _reject(r, abi.encodeWithSignature("InvalidReferenceAction()"));
        r = _market();
        r.actionId = keccak256("action");
        _reject(r, abi.encodeWithSignature("InvalidReferenceAction()"));
    }

    function testCorporateActionInvalidatesReferenceAndRequiresNewMatchingPrice() public {
        _price(_market());
        Types.MarketEventReport memory action = _base(Types.MarketEventKind.CORPORATE_ACTION);
        action.corporateAction = Types.CorporateAction.SPLIT;
        action.actionId = keccak256("split");
        action.multiplierNumerator = 2;
        action.multiplierDenominator = 1;
        _accept(action);
        vm.expectRevert(abi.encodeWithSignature("ReferenceUnavailable(bytes32)", ASSET));
        referenceOracle.requireFreshReference(ASSET);
        vm.warp(102_001);
        Types.MarketEventReport memory price = _market();
        _reject(price, abi.encodeWithSelector(Errors.InvalidMultiplier.selector));
        price.multiplierNumerator = 2;
        _price(price);
        IReferenceOracle.ReferencePriceFact memory fact = referenceOracle.requireFreshReference(ASSET);
        assertEq(fact.corporateActionHash, keccak256(abi.encode(action)));
        assertEq(fact.multiplierNumerator, 2);
    }

    // Catches attaching a pre-split price observation to the post-split multiplier/hash.
    function testRejectsPriceObservedBeforeCorporateActionAndAcceptsExactActionTime() public {
        vm.warp(100);
        oracle = new SessionOracle(address(this));
        oracle.bindReceiver(RECEIVER);
        referenceOracle = IReferenceOracle(address(oracle));
        _accept(_scheduled(SESSION, CONFIG, 1000, 5000));

        vm.warp(1100);
        Types.MarketEventReport memory price = _market();
        price.scheduledOpen = 1000;
        price.scheduledClose = 5000;
        _price(price);

        vm.warp(1300);
        Types.MarketEventReport memory action = _base(Types.MarketEventKind.CORPORATE_ACTION);
        action.corporateAction = Types.CorporateAction.SPLIT;
        action.actionId = keccak256("split-at-1300");
        action.multiplierNumerator = 2;
        action.multiplierDenominator = 1;
        _accept(action);

        vm.warp(1400);
        price = _market();
        price.scheduledOpen = 1000;
        price.scheduledClose = 5000;
        price.multiplierNumerator = 2;
        price.observedAt = 1200;
        price.validUntil = 3000;
        _reject(price, abi.encodeWithSelector(Errors.InvalidSessionTiming.selector));
        assertEq(referenceOracle.latestReference(ASSET).observedAt, 1100);

        price.observedAt = 1300;
        price.validUntil = 3100;
        _price(price);
        IReferenceOracle.ReferencePriceFact memory fact = referenceOracle.requireFreshReference(ASSET);
        assertEq(fact.observedAt, 1300);
        assertEq(fact.multiplierNumerator, 2);
        assertEq(fact.corporateActionHash, keccak256(abi.encode(action)));
    }

    function testFreshReadFailsAtClockCloseWithoutCloseReport() public {
        vm.warp(109_999);
        _price(_market());
        vm.warp(110_000);
        vm.expectRevert(abi.encodeWithSignature("ReferenceSessionNotOpen(bytes32)", SESSION));
        referenceOracle.requireFreshReference(ASSET);
    }

    function testFinalBenchmarkCannotBeOverwrittenOrReopenedByMarketPrice() public {
        _price(_market());
        vm.warp(110_000);
        Types.MarketEventReport memory close = _base(Types.MarketEventKind.CLOSE_CONFIRMED);
        close.sessionId = SESSION;
        close.scheduledOpen = 100_010;
        close.scheduledClose = 110_000;
        _accept(close);
        Types.MarketEventReport memory benchmark = _base(Types.MarketEventKind.REOPEN_BENCHMARK);
        benchmark.sessionId = SESSION;
        benchmark.scheduledOpen = 100_010;
        benchmark.scheduledClose = 110_000;
        benchmark.benchmarkPrice = 120_000_000;
        benchmark.multiplierNumerator = 1;
        benchmark.multiplierDenominator = 1;
        benchmark.secondarySourceHash = SECONDARY;
        _accept(benchmark);
        bytes memory oldBenchmark = abi.encode(oracle.benchmarkOf(SESSION));
        _reject(_market(), abi.encodeWithSignature("ReferenceSessionNotOpen(bytes32)", SESSION));
        assertEq(abi.encode(oracle.benchmarkOf(SESSION)), oldBenchmark);
        assertEq(uint8(oracle.sessionPhase(SESSION)), 3);
        _accept(_scheduled(keccak256("next"), keccak256("next-config"), 110_010, 120_000));
        vm.expectRevert(abi.encodeWithSignature("ReferenceUnavailable(bytes32)", ASSET));
        referenceOracle.requireFreshReference(ASSET);
        vm.warp(110_010);
        Types.MarketEventReport memory nextPrice = _market();
        nextPrice.scheduledOpen = 110_010;
        nextPrice.scheduledClose = 120_000;
        _price(nextPrice);
        assertEq(referenceOracle.requireFreshReference(ASSET).sessionId, keccak256("next"));
        assertEq(abi.encode(oracle.benchmarkOf(SESSION)), oldBenchmark);
    }

    function _base(Types.MarketEventKind kind) internal view returns (Types.MarketEventReport memory r) {
        Types.AssetState memory state = oracle.assetState(ASSET);
        r.schemaVersion = 1;
        r.kind = kind;
        r.chainId = block.chainid;
        r.oracle = address(oracle);
        r.assetId = ASSET;
        r.configHash = state.configHash == bytes32(0) ? CONFIG : state.configHash;
        r.nonce = state.nextNonce;
        r.previousStateHash = state.stateHash;
        r.observedAt = uint64(block.timestamp);
        r.validUntil = uint64(block.timestamp + 1800);
        r.primarySourceHash = PRIMARY;
    }

    function _scheduled(bytes32 id, bytes32 config, uint64 open, uint64 close)
        internal
        view
        returns (Types.MarketEventReport memory r)
    {
        r = _base(Types.MarketEventKind.SESSION_SCHEDULED);
        r.sessionId = id;
        r.configHash = config;
        r.scheduledOpen = open;
        r.scheduledClose = close;
    }

    function _market() internal view returns (Types.MarketEventReport memory r) {
        r = _base(Types.MarketEventKind.NONE);
        r.scheduledOpen = 100_010;
        r.scheduledClose = 110_000;
        r.benchmarkPrice = 125_000_000;
        r.multiplierNumerator = 1;
        r.multiplierDenominator = 1;
        r.secondarySourceHash = SECONDARY;
    }

    // Encode the stable wire ordinal directly, including before MARKET_PRICE exists in Types.
    function _marketPayload(Types.MarketEventReport memory r) internal pure returns (bytes memory payload) {
        payload = abi.encode(r);
        assembly { mstore(add(payload, 64), 6) }
    }

    function _price(Types.MarketEventReport memory r) internal {
        vm.prank(RECEIVER);
        (bool ok, bytes memory reason) =
            address(oracle).call(abi.encodePacked(oracle.acceptReport.selector, _marketPayload(r)));
        if (!ok) assembly { revert(add(reason, 32), mload(reason)) }
    }

    // Every invalid input must revert with its exact error and roll back the report chain and stored fact.
    function _reject(Types.MarketEventReport memory r, bytes memory expected) internal {
        bytes memory beforeState = abi.encode(oracle.assetState(ASSET));
        (bool hadReference, bytes memory beforeFact) =
            address(oracle).staticcall(abi.encodeWithSelector(referenceOracle.latestReference.selector, ASSET));
        vm.prank(RECEIVER);
        (bool ok, bytes memory reason) =
            address(oracle).call(abi.encodePacked(oracle.acceptReport.selector, _marketPayload(r)));
        assertFalse(ok, "invalid reference accepted");
        assertEq(reason, expected, "wrong rejection");
        assertEq(abi.encode(oracle.assetState(ASSET)), beforeState, "report-chain changed on rejection");
        if (hadReference) {
            assertEq(abi.encode(referenceOracle.latestReference(ASSET)), beforeFact, "reference changed on rejection");
        }
    }

    function _accept(Types.MarketEventReport memory r) internal {
        vm.prank(RECEIVER);
        oracle.acceptReport(r);
    }
}
