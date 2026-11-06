// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ReceiptFixture} from "../helpers/ReceiptFixture.sol";
import {BELLMarketEventReceiver} from "../../src/BELLMarketEventReceiver.sol";
import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {SessionOracle} from "../../src/SessionOracle.sol";
import {CommitmentBook} from "../../src/CommitmentBook.sol";
import {ProtectedPool} from "../../src/ProtectedPool.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {LoanManager} from "../../src/LoanManager.sol";
import {CoverManager} from "../../src/CoverManager.sol";
import {Types} from "../../src/lib/Types.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {MockStockToken} from "../../src/demo/MockStockToken.sol";
import {MockCashToken} from "../helpers/MockCashToken.sol";
import {MockEligibilityPolicy} from "../helpers/MockEligibilityPolicy.sol";
import {Test} from "forge-std/Test.sol";

contract AuthenticatedConversionBoundsTest is ReceiptFixture {
    uint128 constant B = type(uint64).max;
    BELLMarketEventReceiver receiver;
    bytes32 constant WORKFLOW = keccak256("BOUNDS_WORKFLOW");

    function setUp() public override {
        vm.warp(800);
        cash = new MockCashToken();
        stock = new MockStockToken(address(this));
        registry = new AssetRegistry(address(this));
        oracle = new SessionOracle(address(this));
        eligibility = new MockEligibilityPolicy();
        book = new CommitmentBook(address(cash), address(eligibility), address(this));
        pool = new ProtectedPool(address(cash), address(this));
        vault = new LoanVault(address(this));
        loans = new LoanManager(address(registry), address(oracle), address(pool), address(vault), address(this));
        manager = new CoverManager(
            address(registry),
            address(oracle),
            address(book),
            address(pool),
            address(vault),
            address(loans),
            CoverManager.Profile.LIVE
        );
        loans.bindCoverManager(address(manager));
        book.initialize(address(manager), address(pool));
        pool.initialize(address(loans));
        vault.initialize(address(loans));
        Types.AssetConfig memory c = _config(800);
        c.rateDenominator = 315360000000;
        registry.scheduleAssetConfig(ASSET, c, 1000);
        configHash = registry.configHash(ASSET, 1);
        receiver = new BELLMarketEventReceiver(oracle, address(this), WORKFLOW, address(this));
        oracle.bindReceiver(address(receiver));
        _send(_report(Types.MarketEventKind.SESSION_SCHEDULED));
        cash.mint(LENDER, POOL_CASH);
        vm.startPrank(LENDER);
        cash.approve(address(pool), type(uint256).max);
        pool.deposit(POOL_CASH);
        vm.stopPrank();
        vm.warp(6400);
        _fund(BORROWER);
        _fund(PAYER);
        _fund(BUYER);
    }

    function _report(Types.MarketEventKind kind) internal view override returns (Types.MarketEventReport memory r) {
        r = super._report(kind);
        if (r.sessionId != bytes32(0)) {
            r.scheduledOpen = 1000;
            r.scheduledClose = 10000;
        }
    }

    function _send(Types.MarketEventReport memory r) internal {
        receiver.onReport(abi.encodePacked(WORKFLOW, bytes10("bounds"), address(this), bytes2(0)), abi.encode(r));
    }

    function _action(uint128 n, uint128 d) internal view returns (Types.MarketEventReport memory r) {
        r = _report(Types.MarketEventKind.CORPORATE_ACTION);
        r.corporateAction = Types.CorporateAction.SPLIT;
        r.actionId = keccak256(abi.encode(n, d, r.nonce));
        r.multiplierNumerator = n;
        r.multiplierDenominator = d;
    }

    function _funded(uint128 limit) internal {
        _send(_action(1, limit));
        vm.warp(6401);
        Types.MarketEventReport memory r = _report(Types.MarketEventKind.MARKET_PRICE);
        r.scheduledOpen = 1000;
        r.scheduledClose = 10000;
        r.benchmarkPrice = 100e6;
        r.multiplierNumerator = 1;
        r.multiplierDenominator = limit;
        r.secondarySourceHash = keccak256("SECONDARY");
        _send(r);
        POLICY = manager.policyHash(ASSET, SESSION, configHash, 1, limit);
        eligibility.setEligible(ASSET, BUYER, POLICY, true);
        vm.prank(BUYER);
        ids.push(book.postOffer(Types.OfferTerms(ASSET, POLICY, 5e18, 100e6, 100, 6000, 100e6, 10000, 13601, ++nonce)));
        _quote();
        quote.expiry = 8000;
        quote.principal = 100e6;
        quote.snapshotMultiplierDenominator = limit;
        quote.corporateActionHash = oracle.latestCorporateAction(ASSET).reportHash;
        quote.minSettlementDeadline = 13601;
        quote.maxSettlementDeadline = 13601;
        _openOrdinary();
        _buy();
        vm.warp(6402);
        _send(_action(limit, 1));
    }

    function _financialHash() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                vault.getDebt(1),
                vault.remainingSnapshotShares(1),
                vault.outstandingClaimUnits(1),
                vault.nextClaimId(),
                manager.getReceipt(1),
                book.getOffer(ids[0]),
                cash.balanceOf(address(pool)),
                cash.balanceOf(address(book)),
                cash.balanceOf(PAYER),
                cash.allowance(PAYER, address(loans))
            )
        );
    }

    function _assertClosed() internal view {
        assertEq(loans.debtOf(1), 0);
        assertTrue(vault.getDebt(1).closed);
        assertEq(uint8(manager.getReceipt(1).status), 2);
        assertEq(book.totalLockedCash(), 0);
        assertEq(vault.remainingSnapshotShares(1), 0);
        assertGt(vault.outstandingClaimUnits(1), vault.backingOf(1));
        assertEq(vault.outstandingClaimUnits(1), uint256(10e18) * B * B);
        assertEq(pool.activeReceiptIds().length, 0);
        for (uint256 i = 1; i < vault.nextClaimId(); i++) {
            assertGt(vault.getClaim(i).deliveryUnits, 0);
        }
    }

    function testBoundedTerminalClosesFinanciallyWhileDeliveryPaused() public {
        _funded(B);
        stock.setPaused(true);
        vm.warp(13601);
        manager.terminalSettle(1);
        _assertClosed();
        LoanVault.Claim memory c = vault.getClaim(1);
        vm.prank(c.owner);
        vm.expectRevert(LoanVault.InsufficientBacking.selector);
        vault.withdrawClaim(1, c.owner);
        assertFalse(vault.getClaim(1).withdrawn);
    }

    function testBoundedFullRepayClosesFinanciallyWhileDeliveryPaused() public {
        _funded(B);
        stock.setPaused(true);
        vm.warp(13601);
        uint256 due = loans.debtOf(1);
        vm.prank(PAYER);
        loans.repay(1, due);
        _assertClosed();
    }

    function testUnsafeActionAfterFundedCoverRejectsAndSafeCloseContinues() public {
        _funded(B);
        bytes32 before_ = _financialHash();
        Types.MarketEventReport memory r = _action(type(uint128).max, 1);
        bytes32 oracleBefore = keccak256(abi.encode(oracle.assetState(ASSET), oracle.latestCorporateAction(ASSET)));
        vm.expectRevert(Errors.InvalidMultiplier.selector);
        _send(r);
        assertEq(_financialHash(), before_);
        assertEq(keccak256(abi.encode(oracle.assetState(ASSET), oracle.latestCorporateAction(ASSET))), oracleBefore);
        stock.setPaused(true);
        vm.warp(13601);
        manager.terminalSettle(1);
        _assertClosed();
    }

    function testOracleComponentZeroAndAcceptedBoundaries() public {
        for (uint256 kind; kind < 2; kind++) {
            uint256 base = vm.snapshotState();
            if (kind == 1) {
                vm.warp(10000);
                _send(_report(Types.MarketEventKind.CLOSE_CONFIRMED));
            }
            for (uint256 field; field < 2; field++) {
                for (uint256 j; j < 3; j++) {
                    uint256 branch = vm.snapshotState();
                    uint128 component = j == 0 ? 0 : j == 1 ? 1 : B;
                    Types.MarketEventReport memory r =
                        kind == 0 ? _action(1, 1) : _report(Types.MarketEventKind.REOPEN_BENCHMARK);
                    r.multiplierNumerator = field == 0 ? component : 1;
                    r.multiplierDenominator = field == 1 ? component : 1;
                    if (kind == 1) {
                        r.benchmarkPrice = 100e6;
                        r.secondarySourceHash = keccak256("SECONDARY");
                    }
                    if (component == 0) vm.expectRevert(Errors.InvalidMultiplier.selector);
                    _send(r);
                    if (component != 0) {
                        if (kind == 0) {
                            assertEq(oracle.latestCorporateAction(ASSET).multiplierNumerator, r.multiplierNumerator);
                        } else {
                            assertTrue(oracle.benchmarkOf(SESSION).finalized);
                        }
                    }
                    assertTrue(vm.revertToState(branch));
                }
            }
            assertTrue(vm.revertToState(base));
        }
    }

    function testReferenceMatchesSupportedCurrentMultiplier() public {
        _send(_action(B, 1));
        vm.warp(6401);
        Types.MarketEventReport memory r = _report(Types.MarketEventKind.MARKET_PRICE);
        r.scheduledOpen = 1000;
        r.scheduledClose = 10000;
        r.benchmarkPrice = 100e6;
        r.multiplierNumerator = B + 1;
        r.multiplierDenominator = 1;
        r.secondarySourceHash = keccak256("SECONDARY");
        bytes32 before_ = keccak256(abi.encode(oracle.assetState(ASSET), oracle.latestReference(ASSET)));
        vm.expectRevert(Errors.InvalidMultiplier.selector);
        _send(r);
        assertEq(keccak256(abi.encode(oracle.assetState(ASSET), oracle.latestReference(ASSET))), before_);
        r.multiplierNumerator = B;
        _send(r);
        assertEq(oracle.latestReference(ASSET).multiplierNumerator, B);
    }

    function testCorporateRejectsAboveBoundAtomically() public {
        for (uint256 field; field < 2; field++) {
            Types.MarketEventReport memory r = _action(field == 0 ? B + 1 : 1, field == 1 ? B + 1 : 1);
            bytes32 before_ = keccak256(abi.encode(oracle.assetState(ASSET), oracle.latestCorporateAction(ASSET)));
            vm.expectRevert(Errors.InvalidMultiplier.selector);
            _send(r);
            assertEq(keccak256(abi.encode(oracle.assetState(ASSET), oracle.latestCorporateAction(ASSET))), before_);
        }
    }

    function testBenchmarkRejectsAboveBoundAtomically() public {
        vm.warp(10000);
        _send(_report(Types.MarketEventKind.CLOSE_CONFIRMED));
        for (uint256 field; field < 2; field++) {
            Types.MarketEventReport memory r = _report(Types.MarketEventKind.REOPEN_BENCHMARK);
            r.benchmarkPrice = 100e6;
            r.multiplierNumerator = field == 0 ? B + 1 : 1;
            r.multiplierDenominator = field == 1 ? B + 1 : 1;
            r.secondarySourceHash = keccak256("SECONDARY");
            bytes32 before_ = keccak256(
                abi.encode(oracle.assetState(ASSET), oracle.sessionFact(SESSION), oracle.benchmarkOf(SESSION))
            );
            vm.expectRevert(Errors.InvalidMultiplier.selector);
            _send(r);
            assertEq(
                keccak256(
                    abi.encode(oracle.assetState(ASSET), oracle.sessionFact(SESSION), oracle.benchmarkOf(SESSION))
                ),
                before_
            );
        }
    }
}

contract VaultConversionBoundsTest is Test {
    uint128 constant B = type(uint64).max;
    uint256 constant M = type(uint128).max;
    uint256 constant R = uint256(B) * B;
    LoanVault v;
    MockStockToken token;

    function setUp() public {
        vm.warp(1000);
        v = new LoanVault(address(this));
        v.initialize(address(this));
        token = new MockStockToken(address(this));
        token.mint(address(this), M + 1e24);
        token.approve(address(v), type(uint256).max);
    }

    function _terms(uint128 n, uint128 d) internal view returns (LoanVault.DebtTerms memory) {
        return
            LoanVault.DebtTerms(
                address(this), keccak256("A"), address(token), 100e6, 800, 315360000000, 1000, 0, M, n, d
            );
    }

    function _seed() internal returns (uint256 h) {
        v.createDebt(1, _terms(1, B));
        v.recordClaim(1, address(this), M - 1, B, 1, 1000);
        h = type(uint256).max / R - (M - 1);
    }

    function _state() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                v.getDebt(1),
                v.remainingSnapshotShares(1),
                v.outstandingClaimUnits(1),
                v.backingOf(1),
                v.accountedBacking(address(token)),
                v.nextClaimId(),
                v.getClaim(1),
                token.balanceOf(address(this)),
                token.balanceOf(address(v)),
                token.allowance(address(this), address(v))
            )
        );
    }

    function testRejectsFutureAggregateOverflowBeforeTransfer() public {
        uint256 h = _seed();
        bytes32 before_ = _state();
        vm.expectRevert(Errors.UnsupportedShareAmount.selector);
        v.addCollateral(1, address(this), h, 1, B);
        assertEq(_state(), before_);
    }

    function testRejectsUnsupportedSnapshotBeforeTransfer() public {
        vm.expectRevert(Errors.InvalidMultiplier.selector);
        v.createDebt(1, _terms(1, B + 1));
    }

    function testRejectsUnsupportedClaimBeforeMutation() public {
        v.createDebt(1, _terms(1, B));
        vm.expectRevert(Errors.InvalidMultiplier.selector);
        v.recordClaim(1, address(this), 1, B + 1, 1, 1000);
        assertEq(v.remainingSnapshotShares(1), M);
        assertEq(v.nextClaimId(), 1);
    }

    function testHeadroomEqualityClaimAndWithdrawalRestoreCapacity() public {
        uint256 h = _seed();
        uint256 oldUnits = v.getClaim(1).deliveryUnits;
        v.addCollateral(1, address(this), h - 1, 1, B);
        assertEq(v.remainingSnapshotShares(1), h);
        vm.expectRevert(Errors.UnsupportedShareAmount.selector);
        v.addCollateral(1, address(this), 1, 1, B);
        v.recordClaim(1, address(this), h, B, 1, 1000);
        assertEq(v.outstandingClaimUnits(1), type(uint256).max / R * R);
        assertEq(v.getClaim(1).deliveryUnits, oldUnits);
        assertEq(v.remainingSnapshotShares(1), 0);
        // Physical backing is independently admitted despite exhausted economic headroom.
        uint256 needed = oldUnits - v.backingOf(1);
        token.mint(address(this), needed);
        v.topUpBacking(1, address(this), needed);
        v.withdrawClaim(1, address(this));
        assertEq(v.outstandingClaimUnits(1), h * R);
        v.addCollateral(1, address(this), M - h, 1, B);
        assertEq(v.remainingSnapshotShares(1), M - h);
        assertLe(v.outstandingClaimUnits(1), type(uint256).max - v.remainingSnapshotShares(1) * R);
    }

    function testHeadroomErrorPrecedesPausedTokenAndEmptyAllowance() public {
        uint256 h = _seed();
        token.approve(address(v), 0);
        token.setPaused(true);
        bytes32 before_ = _state();
        vm.expectRevert(Errors.UnsupportedShareAmount.selector);
        v.addCollateral(1, address(this), h, 1, B);
        assertEq(_state(), before_);
    }

    function testIndividualMaximumConversionAndEconomicWithdrawalReserve() public {
        v.createDebt(1, _terms(1, B));
        assertEq(v.deliveryUnitsFor(1, M, B, 1), M * R);
        v.releaseCollateral(1, address(this), 1, 1, B);
        assertEq(v.remainingSnapshotShares(1), M - 1);
        v.addCollateral(1, address(this), 1, 1, B);
        assertEq(v.remainingSnapshotShares(1), M);
        for (uint256 field; field < 2; field++) {
            vm.expectRevert(Errors.InvalidMultiplier.selector);
            v.recordClaim(1, address(this), 1, field == 0 ? 0 : 1, field == 1 ? 0 : 1, 1000);
        }
        // Inspection keeps full uint128 inputs, while monetary recording rejects them.
        assertGt(v.deliveryUnitsFor(1, 1, B + 1, 1), 0);
        vm.expectRevert(Errors.UnsupportedShareAmount.selector);
        v.addCollateral(1, address(this), 0, 0, 0);
    }

    function testSnapshotAndAddComponentBoundariesBeforeTransfers() public {
        for (uint256 field; field < 2; field++) {
            for (uint256 j; j < 4; j++) {
                uint256 snap = vm.snapshotState();
                uint128 component = j == 0 ? 0 : j == 1 ? 1 : j == 2 ? B : B + 1;
                uint256 beforeBalance = token.balanceOf(address(this));
                uint256 beforeAllowance = token.allowance(address(this), address(v));
                if (j == 0 || j == 3) vm.expectRevert(Errors.InvalidMultiplier.selector);
                v.createDebt(1, _terms(field == 0 ? component : 1, field == 1 ? component : 1));
                if (j == 0 || j == 3) {
                    assertEq(token.balanceOf(address(this)), beforeBalance);
                    assertEq(token.allowance(address(this), address(v)), beforeAllowance);
                    assertEq(v.remainingSnapshotShares(1), 0);
                } else {
                    assertEq(v.remainingSnapshotShares(1), M);
                }
                assertTrue(vm.revertToState(snap));
            }
        }
        v.createDebt(1, _terms(1, 1));
        v.releaseCollateral(1, address(this), 1, 1, 1);
        for (uint256 field; field < 2; field++) {
            vm.expectRevert(Errors.InvalidMultiplier.selector);
            v.addCollateral(1, address(this), 1, field == 0 ? B + 1 : 1, field == 1 ? B + 1 : 1);
        }
        assertEq(v.remainingSnapshotShares(1), M - 1);
    }
}
