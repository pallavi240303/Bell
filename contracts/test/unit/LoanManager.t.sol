// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {SessionOracle} from "../../src/SessionOracle.sol";
import {ProtectedPool} from "../../src/ProtectedPool.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {LoanManager} from "../../src/LoanManager.sol";
import {Types} from "../../src/lib/Types.sol";
import {MockStockToken} from "../../src/demo/MockStockToken.sol";
import {MockCashToken} from "../helpers/MockCashToken.sol";

interface LoanAPI {
    struct BorrowRequest {
        bytes32 assetId;
        uint64 configVersion;
        bytes32 configHash;
        uint256 principal;
        uint256 collateralShares;
        address recipient;
        bytes32 referenceReportHash;
        uint64 expiry;
    }

    struct CoverSnapshot {
        address borrower;
        address recipient;
        bytes32 assetId;
        uint256 originalPrincipal;
        uint64 startTime;
        uint32 rateNumerator;
        uint64 rateDenominator;
        uint256 debtNow;
        uint256 debtAtDeadline;
        uint256 remainingCollateralShares;
        uint128 loanSnapshotMultiplierNumerator;
        uint128 loanSnapshotMultiplierDenominator;
        uint256 activeCoverId;
    }
    function borrow(BorrowRequest calldata) external returns (uint256);
    function bindCoverManager(address) external;
    function debtOf(uint256) external view returns (uint256);
    function nextLoanId() external view returns (uint256);
    function repay(uint256, uint256) external;
    function addCollateral(uint256, uint256) external;
    function withdrawCollateral(uint256, uint256) external;
    function topUpBacking(uint256, uint256) external;
    function finalizeHandoff(uint256) external;
    function liquidate(uint256, uint256) external;
    function coverSnapshot(uint256, uint64) external view returns (CoverSnapshot memory);
    function beginCover(uint256, uint256, bytes32, uint64) external returns (CoverSnapshot memory);
    function completeCoverActivation(uint256, uint256) external;
    function beginCoverSettlement(uint256, uint256) external;
    function applyCoverFill(uint256, uint256, uint256, address, uint256, uint128, uint128) external returns (uint256);
    function finishCoverSettlement(uint256, uint256, uint128, uint128, bool) external;
}

contract TestCoverCoordinator {
    address public immutable loanManager;
    uint64 public immutable coverOpensBeforeClose = 600;
    uint64 public immutable coverCutoffBeforeClose = 60;
    mapping(uint256 => uint256) public reservedShares;

    function setReserved(uint256 receipt, uint256 shares) external {
        reservedShares[receipt] = shares;
    }
    uint256 public released;

    constructor(address manager) {
        loanManager = manager;
    }

    function activate(uint256 id, uint256 receipt, bytes32 session, uint64 deadline) external {
        LoanAPI(loanManager).beginCover(id, receipt, session, deadline);
        LoanAPI(loanManager).completeCoverActivation(id, receipt);
    }

    function begin(uint256 id, uint256 receipt, bytes32 session, uint64 deadline) external {
        LoanAPI(loanManager).beginCover(id, receipt, session, deadline);
    }

    function complete(uint256 id, uint256 receipt) external {
        LoanAPI(loanManager).completeCoverActivation(id, receipt);
    }

    function startSettle(uint256 id, uint256 receipt) external {
        LoanAPI(loanManager).beginCoverSettlement(id, receipt);
    }

    function fill(uint256 id, uint256 receipt, uint256 debt, address buyer, uint256 shares, uint128 n, uint128 d)
        external
        returns (uint256)
    {
        return LoanAPI(loanManager).applyCoverFill(id, receipt, debt, buyer, shares, n, d);
    }

    function finish(uint256 id, uint256 receipt, uint128 n, uint128 d, bool terminal) external {
        LoanAPI(loanManager).finishCoverSettlement(id, receipt, n, d, terminal);
    }

    function paidSettlement(uint256 id, uint256 receipt, uint256 amount, uint256 shares, uint128 n, uint128 d)
        external
    {
        LoanAPI(loanManager).beginCoverSettlement(id, receipt);
        ProtectedPool pool = LoanManager(loanManager).pool();
        pool.cashToken().transferFrom(msg.sender, address(pool), amount);
        LoanAPI(loanManager).applyCoverFill(id, receipt, amount, msg.sender, shares, n, d);
        LoanAPI(loanManager).finishCoverSettlement(id, receipt, n, d, false);
    }

    function releaseForLoanClosure(uint256 receipt) external {
        require(msg.sender == loanManager);
        released = receipt;
    }

    function releaseForLiquidation(uint256 receipt) external {
        require(msg.sender == loanManager);
        released = receipt;
    }
}

abstract contract LoanFixture is Test {
    bytes32 constant ASSET = keccak256("STOCK");
    bytes32 constant SESSION = keccak256("S1");
    address constant BORROWER = address(0xA11CE);
    address constant OTHER = address(0xB0B);
    AssetRegistry registry;
    SessionOracle oracle;
    ProtectedPool pool;
    LoanVault vault;
    MockCashToken cash;
    MockStockToken stock;
    LoanAPI manager;
    TestCoverCoordinator cover;
    bytes32 configHash;
    uint64 open = 1100;
    uint64 close = 3000;
    bytes32 session = SESSION;

    function setUp() public virtual {
        vm.warp(1000);
        registry = new AssetRegistry(address(this));
        oracle = new SessionOracle(address(this));
        cash = new MockCashToken();
        stock = new MockStockToken(address(this));
        pool = new ProtectedPool(address(cash), address(this));
        vault = new LoanVault(address(this));
        manager = LoanAPI(
            address(new LoanManager(address(registry), address(oracle), address(pool), address(vault), address(this)))
        );
        pool.initialize(address(manager));
        vault.initialize(address(manager));
        cover = new TestCoverCoordinator(address(manager));
        manager.bindCoverManager(address(cover));
        registry.scheduleAssetConfig(
            ASSET, Types.AssetConfig(address(stock), 18, 6, 6000, 6500, 7500, 800, 315360000000, 8, 32, 6), 1001
        );
        configHash = registry.configHash(ASSET, 1);
        oracle.bindReceiver(address(this));
        _accept(Types.MarketEventKind.SESSION_SCHEDULED, 0, 1, 1);
        vm.warp(1200);
        _price(100e6);
        cash.mint(address(this), 10000e6);
        cash.approve(address(pool), type(uint256).max);
        pool.deposit(10000e6);
        _fund(BORROWER);
        _fund(OTHER);
    }

    function _fund(address who) internal {
        stock.mint(who, 1000e18);
        cash.mint(who, 10000e6);
        vm.startPrank(who);
        stock.approve(address(vault), type(uint256).max);
        cash.approve(address(manager), type(uint256).max);
        vm.stopPrank();
    }

    function _accept(Types.MarketEventKind kind, uint256 price, uint128 n, uint128 d) internal {
        Types.AssetState memory st = oracle.assetState(ASSET);
        Types.MarketEventReport memory r;
        r.schemaVersion = 1;
        r.kind = kind;
        r.chainId = block.chainid;
        r.oracle = address(oracle);
        r.assetId = ASSET;
        r.sessionId = session;
        r.configHash = configHash;
        r.nonce = st.nextNonce;
        r.previousStateHash = st.stateHash;
        r.observedAt = uint64(block.timestamp);
        r.validUntil = uint64(block.timestamp + 1800);
        r.scheduledOpen = open;
        r.scheduledClose = close;
        r.primarySourceHash = keccak256("P");
        if (kind == Types.MarketEventKind.MARKET_PRICE || kind == Types.MarketEventKind.REOPEN_BENCHMARK) {
            r.benchmarkPrice = price;
            r.multiplierNumerator = n;
            r.multiplierDenominator = d;
            r.secondarySourceHash = keccak256("Q");
        }
        if (kind == Types.MarketEventKind.MARKET_PRICE) r.sessionId = 0;
        oracle.acceptReport(r);
    }

    function _price(uint256 price) internal {
        _accept(Types.MarketEventKind.MARKET_PRICE, price, 1, 1);
    }

    function _req() internal view returns (LoanAPI.BorrowRequest memory) {
        return LoanAPI.BorrowRequest(
            ASSET,
            1,
            configHash,
            500e6,
            10e18,
            BORROWER,
            oracle.latestReference(ASSET).reportHash,
            uint64(block.timestamp + 100)
        );
    }

    function _borrow() internal returns (uint256 id) {
        LoanAPI.BorrowRequest memory r = _req();
        vm.prank(BORROWER);
        id = manager.borrow(r);
    }

    function _borrowReverts() internal {
        LoanAPI.BorrowRequest memory r = _req();
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.borrow(r);
    }

    function _window() internal {
        vm.warp(2500);
        _price(100e6);
    }
}

contract LoanManagerTest is LoanFixture {
    function testOrdinaryBorrowNeedsNoOffersAndDisbursesExactlyOnce() public {
        uint256 cashBefore = cash.balanceOf(BORROWER);
        uint256 id = _borrow();
        assertEq(id, 1);
        assertEq(manager.nextLoanId(), 2);
        assertEq(cash.balanceOf(BORROWER) - cashBefore, 500e6);
        assertEq(vault.getDebt(id).terms.settlementDeadline, 0);
        assertEq(stock.balanceOf(address(vault)), 10e18);
        assertEq(pool.activeReceiptIds().length, 1);
        assertEq(pool.totalAssets(), 10000e6);
    }

    function testBorrowRejectsWrongReferenceConfigExpiryRecipientLtvAndLiquidityAtomically() public {
        LoanAPI.BorrowRequest memory r = _req();
        r.referenceReportHash = bytes32(uint256(1));
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.borrow(r);
        r = _req();
        r.configHash = 0;
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.borrow(r);
        r = _req();
        r.expiry = 1199;
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.borrow(r);
        r = _req();
        r.recipient = address(0);
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.borrow(r);
        r = _req();
        r.principal = 601e6;
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.borrow(r);
        r = _req();
        r.principal = 10001e6;
        r.collateralShares = 1000e18;
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.borrow(r);
        assertEq(manager.nextLoanId(), 1);
        assertEq(pool.activeReceiptIds().length, 0);
        assertEq(stock.balanceOf(address(vault)), 0);
    }

    function testBorrowFailureOfCashTransferRollsBackCollateralAndRegistration() public {
        cash.setShortTransfer(true);
        _borrowReverts();
        assertEq(manager.nextLoanId(), 1);
        assertEq(stock.balanceOf(BORROWER), 1000e18);
        assertEq(pool.activeReceiptIds().length, 0);
    }

    function testPartialAndFullRepaymentPreserveBasisAndNeverRevive() public {
        uint256 id = _borrow();
        vm.warp(1300);
        uint256 debt = manager.debtOf(id);
        vm.prank(OTHER);
        manager.repay(id, 100e6);
        assertEq(manager.debtOf(id), debt - 100e6);
        assertEq(vault.getDebt(id).terms.originalPrincipal, 500e6);
        vm.warp(1400);
        debt = manager.debtOf(id);
        vm.prank(OTHER);
        manager.repay(id, debt);
        assertEq(pool.activeReceiptIds().length, 0);
        assertEq(vault.getClaim(1).owner, BORROWER);
        vm.warp(100000);
        assertEq(manager.debtOf(id), 0);
        vm.prank(BORROWER);
        vault.withdrawClaim(1, BORROWER);
        vm.prank(BORROWER);
        manager.finalizeHandoff(id);
    }

    function testWithdrawalRequiresOwnerFreshPriceAndClaimBacking() public {
        uint256 id = _borrow();
        vm.prank(OTHER);
        vm.expectRevert();
        manager.withdrawCollateral(id, 1e18);
        vm.prank(BORROWER);
        manager.withdrawCollateral(id, 1e18);
        assertEq(vault.remainingSnapshotShares(id), 9e18);
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.withdrawCollateral(id, 1e18);
        vm.warp(3000);
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.withdrawCollateral(id, 1);
        vm.prank(OTHER);
        manager.addCollateral(id, 1e18);
        vm.prank(OTHER);
        manager.repay(id, 1);
    }

    function testCoverAttachesSameLoanPreservesInterestAndDetachesWithoutDisbursement() public {
        uint256 id = _borrow();
        _window();
        uint256 beforeCash = cash.balanceOf(BORROWER);
        uint256 beforeDebt = manager.debtOf(id);
        cover.activate(id, 71, session, 4000);
        LoanAPI.CoverSnapshot memory s = manager.coverSnapshot(id, 4000);
        assertEq(s.originalPrincipal, 500e6);
        assertEq(s.startTime, 1200);
        assertEq(s.debtNow, beforeDebt);
        assertEq(s.activeCoverId, 71);
        assertEq(cash.balanceOf(BORROWER), beforeCash);
        assertEq(pool.activeReceiptIds()[0], id);
        cover.startSettle(id, 71);
        cover.finish(id, 71, 1, 1, false);
        assertEq(manager.debtOf(id), beforeDebt);
        assertEq(pool.activeReceiptIds().length, 1);
        vm.warp(5000);
        assertGt(manager.debtOf(id), s.debtAtDeadline);
    }

    function testActivationAndSettlementGuardAllOrdinaryMutationsAndPoolNavAcrossCalls() public {
        uint256 id = _borrow();
        _window();
        cover.begin(id, 71, session, 4000);
        _assertGuard(id);
        vm.expectRevert();
        cover.complete(id, 72);
        cover.complete(id, 71);
        cover.startSettle(id, 71);
        _assertGuard(id);
        vm.expectRevert();
        cover.fill(id, 72, 1, OTHER, 1, 1, 1);
        cover.finish(id, 71, 1, 1, false);
        assertGt(pool.totalAssets(), 10000e6);
    }

    function _assertGuard(uint256 id) internal {
        vm.expectRevert();
        pool.totalAssets();
        vm.expectRevert();
        manager.debtOf(id);
        vm.expectRevert();
        manager.repay(id, 1);
        vm.expectRevert();
        manager.addCollateral(id, 1);
        vm.expectRevert();
        manager.withdrawCollateral(id, 1);
        vm.expectRevert();
        manager.topUpBacking(id, 1);
        vm.expectRevert();
        manager.finalizeHandoff(id);
        vm.expectRevert();
        manager.liquidate(id, 1);
        LoanAPI.BorrowRequest memory r = _req();
        vm.expectRevert();
        manager.borrow(r);
    }

    function testPartialSettlementPreservesClaimsAndCumulativeRepayments() public {
        uint256 id = _borrow();
        _window();
        cover.activate(id, 71, session, 4000);
        vm.prank(OTHER);
        manager.repay(id, 20e6);
        uint256 beforeDebt = manager.debtOf(id);
        cover.startSettle(id, 71);
        cash.mint(address(pool), 100e6);
        cover.fill(id, 71, 100e6, OTHER, 1e18, 1, 1);
        cover.finish(id, 71, 1, 1, false);
        assertEq(manager.debtOf(id), beforeDebt - 100e6);
        assertEq(vault.outstandingClaimUnits(id), 1e18);
        assertEq(vault.getClaim(1).receiptId, id);
        assertEq(vault.remainingSnapshotShares(id), 9e18);
        assertEq(vault.cumulativeDebtReductionOf(id), 120e6);
        vm.expectRevert();
        cover.activate(id, 72, session, 4000);
    }

    function testFullRepaymentReleasesCoverAndRemovesCapPermanently() public {
        uint256 id = _borrow();
        _window();
        cover.activate(id, 71, session, 4000);
        uint256 debt = manager.debtOf(id);
        vm.prank(OTHER);
        manager.repay(id, debt);
        assertEq(cover.released(), 71);
        vm.warp(5000);
        assertEq(manager.debtOf(id), 0);
        assertEq(pool.activeReceiptIds().length, 0);
    }

    function testTerminalRequiresZeroDebtAndNormalCannotDetachAtDeadline() public {
        uint256 id = _borrow();
        _window();
        cover.activate(id, 71, session, 4000);
        vm.warp(4000);
        cover.startSettle(id, 71);
        vm.expectRevert();
        cover.finish(id, 71, 1, 1, false);
        vm.expectRevert();
        cover.finish(id, 71, 1, 1, true);
        uint256 debt = vault.debtOf(id);
        cash.mint(address(pool), debt);
        cover.fill(id, 71, debt, OTHER, 5e18, 1, 1);
        cover.finish(id, 71, 1, 1, true);
        assertEq(pool.activeReceiptIds().length, 0);
        vm.warp(5000);
        assertEq(manager.debtOf(id), 0);
    }

    function testLiquidationPartialUsesExactRoundingAndMaxRepayReverts() public {
        uint256 id = _borrow();
        vm.warp(1300);
        _price(60e6);
        uint256 debt = manager.debtOf(id);
        uint256 required = ((debt - 390e6) * 1e8 + (1e8 - 6500 * 10550) - 1) / (1e8 - 6500 * 10550);
        vm.prank(OTHER);
        vm.expectRevert();
        manager.liquidate(id, required - 1);
        uint256 nav = pool.totalAssets();
        vm.prank(OTHER);
        manager.liquidate(id, required);
        assertEq(manager.debtOf(id), debt - required);
        assertEq(pool.totalAssets(), nav);
        assertEq(vault.getClaim(1).snapshotShares, required * 10550 * 1e18 / (10000 * 60e6));
        assertEq(vault.getClaim(1).owner, OTHER);
    }

    function testUnderwaterLiquidationWritesOffExactLossWithoutAnotherLoanBacking() public {
        uint256 id = _borrow();
        uint256 otherId = _borrow();
        vm.warp(1300);
        _price(10e6);
        uint256 nav = pool.totalAssets();
        uint256 debt = manager.debtOf(id);
        uint256 repay = uint256(100e6) * 10000 / 10550;
        vm.prank(OTHER);
        manager.liquidate(id, repay);
        assertEq(pool.totalAssets(), nav - debt + repay);
        assertEq(pool.activeReceiptIds().length, 1);
        assertEq(vault.remainingSnapshotShares(otherId), 10e18);
        assertEq(vault.getClaim(1).snapshotShares, 10e18);
        assertEq(manager.debtOf(id), 0);
    }

    function testCoveredLiquidationOnlyWindowAndReleasesReceipt() public {
        uint256 id = _borrow();
        _window();
        cover.activate(id, 71, session, 4000);
        vm.warp(2501);
        _price(60e6);
        vm.prank(OTHER);
        manager.liquidate(id, type(uint256).max);
        assertEq(cover.released(), 71);
        vm.warp(2502);
        _price(100e6);
        uint256 second = _borrow();
        cover.activate(second, 72, session, 4000);
        vm.warp(2940);
        _price(10e6);
        vm.prank(OTHER);
        vm.expectRevert();
        manager.liquidate(second, type(uint256).max);
    }

    function testUncoveredPostCutoffUses5000Trigger4500Target() public {
        uint256 id = _borrow();
        vm.warp(2940);
        _price(90e6);
        uint256 debt = manager.debtOf(id);
        uint256 repay = ((debt - 405e6) * 1e8 + (1e8 - 4500 * 10550) - 1) / (1e8 - 4500 * 10550);
        vm.prank(OTHER);
        manager.liquidate(id, repay);
        assertEq(manager.debtOf(id), debt - repay);
    }

    function testCallbacksCannotObserveInflatedNavDuringRepaymentOrBorrow() public {
        uint256 id = _borrow();
        cash.setTransferFromHook(address(pool), abi.encodeWithSelector(pool.totalAssets.selector));
        uint256 beforeDebt = manager.debtOf(id);
        vm.prank(OTHER);
        vm.expectRevert();
        manager.repay(id, 100);
        assertEq(manager.debtOf(id), beforeDebt);
        cash.setTransferFromHook(address(0), "");
        cash.setTransferHook(address(pool), abi.encodeWithSelector(pool.totalAssets.selector));
        _borrowReverts();
        assertEq(manager.nextLoanId(), 2);
    }

    function testThirtyTwoActiveLoansBoundAndRuntimeSize() public {
        for (uint256 i; i < 20; ++i) {
            _borrow();
        }
        cash.mint(address(this), 10000e6);
        pool.deposit(10000e6);
        for (uint256 i; i < 12; ++i) {
            _borrow();
        }
        _borrowReverts();
        assertEq(pool.activeReceiptIds().length, 32);
        assertEq(manager.nextLoanId(), 33);
        assertLe(address(manager).code.length, 24576);
    }

    function testCoverAdmissionRejectsAlreadyUnsafeButAcceptsHealthyAboveOrigination() public {
        uint256 id = _borrow();
        _window();
        vm.warp(2501);
        _price(60e6);
        vm.expectRevert();
        cover.activate(id, 71, session, 4000);
        vm.warp(2502);
        _price(77e6);
        cover.activate(id, 71, session, 4000);
        assertEq(manager.coverSnapshot(id, 4000).activeCoverId, 71);
    }

    function testCoveredWithdrawalRespectsWindowReservationsAndFreshHealth() public {
        uint256 id = _borrow();
        _window();
        cover.activate(id, 71, session, 4000);
        cover.setReserved(71, 8e18);
        vm.prank(BORROWER);
        manager.withdrawCollateral(id, 1e18);
        assertEq(vault.remainingSnapshotShares(id), 9e18);
        cover.setReserved(71, 9e18);
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.withdrawCollateral(id, 1);
        vm.warp(2940);
        _price(100e6);
        cover.setReserved(71, 0);
        vm.prank(BORROWER);
        vm.expectRevert();
        manager.withdrawCollateral(id, 1);
    }

    function testSecondSessionDifferentPolicyPreservesSameLoanAndOriginalTerms() public {
        uint256 id = _borrow();
        _window();
        cover.activate(id, 71, session, 4000);
        cover.startSettle(id, 71);
        cover.finish(id, 71, 1, 1, false);
        vm.warp(3000);
        _accept(Types.MarketEventKind.CLOSE_CONFIRMED, 0, 1, 1);
        vm.warp(3001);
        _accept(Types.MarketEventKind.REOPEN_BENCHMARK, 100e6, 1, 1);
        registry.scheduleAssetConfig(
            ASSET, Types.AssetConfig(address(stock), 18, 6, 4000, 5000, 6000, 1000, 100000, 8, 32, 6), 3002
        );
        configHash = registry.configHash(ASSET, 2);
        session = keccak256("S2");
        open = 3100;
        close = 5000;
        _accept(Types.MarketEventKind.SESSION_SCHEDULED, 0, 1, 1);
        vm.warp(4500);
        _price(100e6);
        uint256 cashBefore = cash.balanceOf(BORROWER);
        uint256 debtBefore = manager.debtOf(id);
        cover.activate(id, 72, session, 6000);
        LoanAPI.CoverSnapshot memory snap = manager.coverSnapshot(id, 6000);
        assertEq(snap.originalPrincipal, 500e6);
        assertEq(snap.startTime, 1200);
        assertEq(snap.rateNumerator, 800);
        assertEq(snap.debtNow, debtBefore);
        assertEq(cash.balanceOf(BORROWER), cashBefore);
        assertEq(manager.nextLoanId(), 2);
        assertEq(LoanManager(address(manager)).getLoan(id).configVersion, 1);
    }

    function testHighPrincipalWideNavCoverRejectionAndOrdinaryWriteoff() public {
        vm.warp(1201);
        _price(2e18);
        uint256 principal = type(uint128).max;
        stock.mint(BORROWER, principal);
        cash.mint(address(this), principal);
        pool.deposit(principal);
        LoanAPI.BorrowRequest memory r = _req();
        r.principal = principal;
        r.collateralShares = principal;
        vm.prank(BORROWER);
        uint256 id = manager.borrow(r);
        vm.warp(1202);
        uint256 expected = principal + (principal * 800 + 315360000000 - 1) / 315360000000;
        assertEq(manager.debtOf(id), expected);
        assertGt(pool.totalAssets(), principal);
        vm.warp(2500);
        _price(2e18);
        vm.expectRevert();
        cover.activate(id, 71, session, 4000);
        assertEq(manager.coverSnapshot(id, 4000).activeCoverId, 0);
        vm.warp(2501);
        _price(1);
        uint256 debt = manager.debtOf(id);
        uint256 nav = pool.totalAssets();
        uint256 recovered = (principal / 1e18) * 10000 / 10550;
        cash.mint(OTHER, recovered);
        vm.prank(OTHER);
        manager.liquidate(id, recovered);
        assertEq(pool.totalAssets(), nav - debt + recovered);
        assertEq(manager.debtOf(id), 0);
        assertEq(vault.getClaim(1).deliveryUnits, principal);
    }

    function testZeroRecoverableCashCreatesOnlyDeliverableClaimAndCloses() public {
        vm.warp(1201);
        _price(2e18);
        LoanAPI.BorrowRequest memory r = _req();
        r.principal = 1;
        r.collateralShares = 1;
        vm.prank(BORROWER);
        uint256 id = manager.borrow(r);
        vm.warp(1202);
        _price(1);
        uint256 nav = pool.totalAssets();
        uint256 debt = manager.debtOf(id);
        vm.prank(OTHER);
        manager.liquidate(id, 0);
        assertEq(pool.totalAssets(), nav - debt);
        assertEq(vault.getClaim(1).deliveryUnits, 1);
        assertEq(manager.debtOf(id), 0);
        assertEq(pool.activeReceiptIds().length, 0);
    }

    function _split(uint128 n, uint128 d) internal {
        Types.AssetState memory st = oracle.assetState(ASSET);
        Types.MarketEventReport memory r;
        r.schemaVersion = 1;
        r.kind = Types.MarketEventKind.CORPORATE_ACTION;
        r.chainId = block.chainid;
        r.oracle = address(oracle);
        r.assetId = ASSET;
        r.configHash = configHash;
        r.nonce = st.nextNonce;
        r.previousStateHash = st.stateHash;
        r.observedAt = uint64(block.timestamp);
        r.validUntil = uint64(block.timestamp + 1800);
        r.primarySourceHash = keccak256("P");
        r.corporateAction = n < d ? Types.CorporateAction.REVERSE_SPLIT : Types.CorporateAction.SPLIT;
        r.actionId = keccak256(abi.encode(n, d));
        r.multiplierNumerator = n;
        r.multiplierDenominator = d;
        oracle.acceptReport(r);
    }

    function testPartialLiquidationWithZeroDeliveryRollsBackWithoutCharging() public {
        vm.warp(1201);
        _price(1e18);
        LoanAPI.BorrowRequest memory request = _req();
        request.principal = 5;
        request.collateralShares = 10;
        vm.prank(BORROWER);
        uint256 id = manager.borrow(request);
        vm.warp(1202);
        _split(1, 10);
        _accept(Types.MarketEventKind.MARKET_PRICE, 75e17, 1, 10);
        assertEq(vault.deliveryUnitsFor(id, 10, 1, 10), 1);
        bytes32 debtBefore = keccak256(abi.encode(vault.getDebt(id)));
        uint256 cashBefore = cash.balanceOf(OTHER);
        uint256 poolBefore = cash.balanceOf(address(pool));
        uint256 allowanceBefore = cash.allowance(OTHER, address(manager));
        vm.prank(OTHER);
        vm.expectRevert(LoanVault.ZeroDelivery.selector);
        manager.liquidate(id, type(uint256).max);
        assertEq(keccak256(abi.encode(vault.getDebt(id))), debtBefore);
        assertEq(cash.balanceOf(OTHER), cashBefore);
        assertEq(cash.balanceOf(address(pool)), poolBefore);
        assertEq(cash.allowance(OTHER, address(manager)), allowanceBefore);
        assertEq(vault.remainingSnapshotShares(id), 10);
        assertEq(vault.backingOf(id), 10);
        assertEq(vault.nextClaimId(), 1);
        assertEq(pool.activeReceiptIds().length, 1);
    }

    function testZeroDeliveryRoundingDustWritesOffWithoutFabricatingClaim() public {
        vm.warp(1201);
        _price(2e18);
        LoanAPI.BorrowRequest memory r = _req();
        r.principal = 1;
        r.collateralShares = 1;
        vm.prank(BORROWER);
        uint256 id = manager.borrow(r);
        vm.warp(1202);
        _split(1, 10);
        _accept(Types.MarketEventKind.MARKET_PRICE, 1, 1, 10);
        uint256 beforeCash = cash.balanceOf(OTHER);
        vm.prank(OTHER);
        manager.liquidate(id, 0);
        assertEq(cash.balanceOf(OTHER), beforeCash);
        assertEq(vault.nextClaimId(), 1);
        assertEq(vault.remainingSnapshotShares(id), 0);
        assertEq(vault.outstandingClaimUnits(id), 0);
        assertEq(manager.debtOf(id), 0);
        vm.prank(BORROWER);
        manager.finalizeHandoff(id);
        assertEq(vault.backingOf(id), 0);
    }

    function testOrdinaryLiquidationPreservesEarlierBuyerClaimAndRequiresItsBacking() public {
        uint256 id = _borrow();
        _window();
        cover.activate(id, 71, session, 4000);
        cover.startSettle(id, 71);
        cash.mint(address(pool), 50e6);
        cover.fill(id, 71, 50e6, OTHER, 1e18, 1, 1);
        cover.finish(id, 71, 1, 1, false);
        bytes memory claimBefore = abi.encode(vault.getClaim(1));
        vm.warp(2501);
        _split(2, 1);
        _accept(Types.MarketEventKind.MARKET_PRICE, 10e6, 2, 1);
        vm.prank(OTHER);
        vm.expectRevert();
        manager.liquidate(id, type(uint256).max);
        vm.prank(BORROWER);
        manager.topUpBacking(id, 9e18);
        vm.prank(OTHER);
        manager.liquidate(id, type(uint256).max);
        assertEq(abi.encode(vault.getClaim(1)), claimBefore);
        assertEq(vault.getClaim(2).deliveryUnits, 18e18);
        assertEq(vault.outstandingClaimUnits(id), 19e18);
        assertEq(vault.backingOf(id), 19e18);
    }

    function testLossIsSharedProRataBetweenPoolDepositors() public {
        cash.mint(OTHER, 10000e6);
        vm.startPrank(OTHER);
        cash.approve(address(pool), type(uint256).max);
        pool.deposit(10000e6);
        vm.stopPrank();
        assertEq(pool.balanceOf(OTHER), pool.balanceOf(address(this)));
        uint256 id = _borrow();
        vm.warp(1300);
        _price(10e6);
        uint256 nav = pool.totalAssets();
        uint256 debt = manager.debtOf(id);
        uint256 recovery = uint256(100e6) * 10000 / 10550;
        vm.prank(OTHER);
        manager.liquidate(id, recovery);
        assertEq(pool.totalAssets(), nav - debt + recovery);
        uint256 lpShares = pool.balanceOf(OTHER);
        uint256 expected = lpShares * (pool.totalAssets() + 1) / (pool.totalSupply() + 1e12);
        vm.prank(OTHER);
        uint256 actual = pool.redeem(lpShares, OTHER);
        assertEq(actual, expected);
        uint256 otherAmount = pool.redeem(pool.balanceOf(address(this)), address(this));
        assertApproxEqAbs(actual, otherAmount, 1);
    }

    function testBindingIsOwnerOnlyReciprocalAndOneTime() public {
        LoanManager fresh =
            new LoanManager(address(registry), address(oracle), address(pool), address(vault), address(this));
        TestCoverCoordinator good = new TestCoverCoordinator(address(fresh));
        TestCoverCoordinator bad = new TestCoverCoordinator(address(123));
        vm.prank(OTHER);
        vm.expectRevert();
        fresh.bindCoverManager(address(good));
        vm.expectRevert();
        fresh.bindCoverManager(address(0));
        vm.expectRevert();
        fresh.bindCoverManager(OTHER);
        vm.expectRevert();
        fresh.bindCoverManager(address(bad));
        fresh.bindCoverManager(address(good));
        vm.expectRevert();
        fresh.bindCoverManager(address(good));
        vm.expectRevert();
        manager.beginCover(1, 71, session, 4000);
    }

    function testPaidCoverFillZeroDeliveryRollsBackCashDebtClaimsAndBinding() public {
        uint256 id = _borrow();
        _window();
        cover.activate(id, 71, session, 4000);
        vm.prank(OTHER);
        cash.approve(address(cover), type(uint256).max);
        uint256 poolBefore = cash.balanceOf(address(pool));
        uint256 payerBefore = cash.balanceOf(OTHER);
        uint256 debt = manager.debtOf(id);
        vm.prank(OTHER);
        vm.expectRevert();
        cover.paidSettlement(id, 71, 1, 1, 1, type(uint128).max);
        assertEq(cash.balanceOf(address(pool)), poolBefore);
        assertEq(cash.balanceOf(OTHER), payerBefore);
        assertEq(manager.debtOf(id), debt);
        assertEq(vault.nextClaimId(), 1);
        assertEq(vault.remainingSnapshotShares(id), 10e18);
        assertEq(manager.coverSnapshot(id, 4000).activeCoverId, 71);
    }
    bool callbackChecked;

    function probeTransition() external {
        (bool ok,) = address(pool).staticcall(abi.encodeWithSelector(pool.totalAssets.selector));
        assertFalse(ok);
        (ok,) = address(manager).call(abi.encodeWithSelector(manager.repay.selector, 1, 1));
        assertFalse(ok);
        (ok,) = address(manager).call(abi.encodeWithSelector(manager.topUpBacking.selector, 1, 1));
        assertFalse(ok);
        callbackChecked = true;
    }

    function testBookCashCallbackCannotObserveNavOrMutateWhileBridgeGuardIsOpen() public {
        uint256 id = _borrow();
        _window();
        cover.activate(id, 71, session, 4000);
        vm.prank(OTHER);
        cash.approve(address(cover), type(uint256).max);
        cash.setTransferFromHook(address(this), abi.encodeWithSelector(this.probeTransition.selector));
        uint256 nav = pool.totalAssets();
        vm.prank(OTHER);
        cover.paidSettlement(id, 71, 100e6, 1e18, 1, 1);
        assertTrue(callbackChecked);
        assertEq(pool.totalAssets(), nav);
        assertEq(manager.coverSnapshot(id, 4000).activeCoverId, 0);
    }
}
