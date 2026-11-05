// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {SessionOracle} from "../../src/SessionOracle.sol";
import {CommitmentBook} from "../../src/CommitmentBook.sol";
import {ProtectedPool} from "../../src/ProtectedPool.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {CoverManager} from "../../src/CoverManager.sol";
import {QuoteHash} from "../../src/lib/QuoteHash.sol";
import {Types} from "../../src/lib/Types.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {MockStockToken} from "../../src/demo/MockStockToken.sol";
import {MockCashToken} from "../helpers/MockCashToken.sol";
import {MockEligibilityPolicy} from "../helpers/MockEligibilityPolicy.sol";

/// @dev Only the external token boundary is doubled; vault custody/accounting remain real.
contract BorrowCallbackStock is ERC20 {
    address public target;
    bytes public data;

    constructor() ERC20("Callback stock", "HOOK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setHook(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool transferred = super.transferFrom(from, to, amount);
        if (target != address(0)) {
            (bool ok, bytes memory result) = target.call(data);
            if (!ok) {
                assembly ("memory-safe") { revert(add(result, 32), mload(result)) }
            }
        }
        return transferred;
    }
}

contract BorrowWithCoverTest is Test {
    bytes32 internal constant ASSET = keccak256("STOCK");
    bytes32 internal constant SESSION = keccak256("SESSION");
    bytes32 internal constant POLICY = keccak256("POLICY");
    address internal constant BORROWER = address(0xA11CE);
    address internal constant BUYER = address(0xB0B);
    address internal constant OTHER_BUYER = address(0xB0B2);
    address internal constant RECIPIENT = address(0xCAFE);
    uint256 internal constant POOL_CASH = 1_000_000_000;
    uint256 internal constant BORROWER_CASH = 1_000_000;
    uint256 internal constant COLLATERAL = 10e18;

    AssetRegistry internal registry;
    SessionOracle internal oracle;
    CommitmentBook internal book;
    ProtectedPool internal pool;
    LoanVault internal vault;
    CoverManager internal manager;
    MockCashToken internal cash;
    MockStockToken internal stock;
    MockEligibilityPolicy internal eligibility;
    bytes32 internal configHash;
    bytes32[] internal ids;
    bytes32[] internal hashes;
    QuoteHash.Quote internal quote;
    uint256 internal offerNonce;

    function setUp() public {
        vm.warp(1000);
        cash = new MockCashToken();
        stock = new MockStockToken(address(this));
        registry = new AssetRegistry(address(this));
        oracle = new SessionOracle(address(this));
        eligibility = new MockEligibilityPolicy();
        book = new CommitmentBook(address(cash), address(eligibility), address(this));
        pool = new ProtectedPool(address(cash), address(this));
        vault = new LoanVault(address(this));
        manager = new CoverManager(address(registry), address(oracle), address(book), address(pool), address(vault));
        book.initialize(address(manager), address(pool));
        pool.initialize(address(manager));
        vault.initialize(address(manager));
        registry.scheduleAssetConfig(ASSET, _config(), 1001);
        configHash = registry.configHash(ASSET, 1);
        oracle.bindReceiver(address(this));
        oracle.acceptReport(_report(Types.MarketEventKind.SESSION_SCHEDULED));
        vm.warp(1001);
        cash.mint(address(this), POOL_CASH);
        cash.approve(address(pool), POOL_CASH);
        pool.deposit(POOL_CASH);
        _fundBorrower(BORROWER);
        _fundBorrower(address(9));
        _fundBuyer(BUYER);
        _fundBuyer(OTHER_BUYER);
        _bundle(2);
    }

    // Missing any one of custody, reservation, premiums, principal, or immutable snapshots breaks this.
    function testBorrowCreatesAtomicReceiptAndSnapshotsRiskAndReferenceFacts() public {
        uint256 id = _borrow();
        assertEq(id, 1);
        assertEq(manager.nextReceiptId(), 2);
        assertEq(manager.borrowerNonce(BORROWER), 1);
        CoverManager.Receipt memory r = manager.getReceipt(id);
        assertEq(uint8(r.status), uint8(CoverManager.ReceiptStatus.ACTIVE));
        assertEq(abi.encode(r.consent), abi.encode(quote));
        assertEq(abi.encode(r.config), abi.encode(_config()));
        assertEq(r.offerIds, ids);
        assertEq(r.offerTermsHashes, hashes);
        assertEq(r.quoteHash, _hash());
        assertEq(r.startTime, 1001);
        assertEq(r.settlementDeadline, 2000);
        // ceil(500,000,000 * 800 * 999 / 315,360,000,000) = 1,268.
        assertEq(r.debtCeiling, 500_001_268);
        assertEq(manager.debtOf(id), 500_000_000);
        assertEq(vault.getDebt(id).terms.assetToken, address(stock));
        assertEq(vault.getDebt(id).terms.snapshotCollateral, COLLATERAL);
        assertEq(stock.balanceOf(address(vault)), COLLATERAL);
        assertEq(stock.balanceOf(BORROWER), 1000e18 - COLLATERAL);
        assertEq(vault.backingOf(id), COLLATERAL);
        assertEq(cash.balanceOf(RECIPIENT), 500_000_000);
        assertEq(cash.balanceOf(address(pool)), POOL_CASH - 500_000_000);
        assertEq(pool.totalAssets(), POOL_CASH);
        assertEq(pool.activeReceiptIds()[0], id);
        assertEq(cash.balanceOf(BORROWER), BORROWER_CASH - 200);
        assertEq(book.totalPremiumCredits(), 200);
        assertEq(book.premiumCredit(BUYER), 200);
        for (uint256 i; i < ids.length; ++i) {
            assertEq(uint8(book.getOffer(ids[i]).status), uint8(Types.OfferStatus.RESERVED));
            assertEq(book.getOffer(ids[i]).receiptId, id);
        }
        vm.warp(2000);
        assertEq(manager.debtOf(id), 500_001_268);
        assertEq(pool.totalAssets(), POOL_CASH + 1268);
    }

    function testInclusionDelayKeepsHashAndReducesFundedCeiling() public {
        bytes32 accepted = _hash();
        vm.warp(1101);
        assertEq(_hash(), accepted);
        uint256 id = _borrow();
        CoverManager.Receipt memory r = manager.getReceipt(id);
        assertEq(r.startTime, 1101);
        assertEq(r.debtCeiling, 500_001_141);
        assertEq(r.quoteHash, accepted);
    }

    function testDirectBorrowerConsentCannotBeRelayedOrReplayed() public {
        bytes32 accepted = _hash();
        vm.prank(address(9));
        vm.expectRevert(CoverManager.InvalidBorrower.selector);
        manager.borrowWithCover(quote, ids, hashes, accepted);
        _assertEmpty();
        _borrow();
        vm.prank(BORROWER);
        vm.expectRevert(CoverManager.InvalidBorrowerNonce.selector);
        manager.borrowWithCover(quote, ids, hashes, accepted);
        assertEq(manager.borrowerNonce(BORROWER), 1);
        assertEq(manager.nextReceiptId(), 2);
        assertEq(cash.balanceOf(RECIPIENT), quote.principal);
    }

    function testSuccessfulSecondNonceCreatesMonotonicReceipt() public {
        _borrow();
        _bundle(1);
        quote.borrowerNonce = 1;
        assertEq(_borrow(), 2);
        assertEq(manager.borrowerNonce(BORROWER), 2);
        assertEq(pool.activeReceiptIds().length, 2);
        assertEq(manager.nextReceiptId(), 3);
    }

    function testChangedQuoteAndOfferSubstitutionCannotUseOldHash() public {
        bytes32 accepted = _hash();
        quote.recipient = address(9);
        _revertWithHash(accepted, CoverManager.QuoteHashMismatch.selector);
        quote.recipient = RECIPIENT;
        bytes32 original = ids[0];
        ids[0] = _post(BUYER, 5e18, 100_000_000, 2000, 6000, ASSET, POLICY);
        hashes[0] = book.termsHashOf(ids[0]);
        _revertWithHash(accepted, CoverManager.QuoteHashMismatch.selector);
        ids[0] = original;
        hashes[0] = book.termsHashOf(original);
        _borrow();
    }

    function testQuoteExpiryIsInclusive() public {
        quote.expiry = 1100;
        vm.warp(1101);
        _revert(CoverManager.QuoteExpired.selector);
        quote.expiry = 1101;
        _borrow();
    }

    function testDuplicateNonAdjacentOffersAndWrongTieOrderRevert() public {
        _bundle(3);
        ids[2] = ids[0];
        hashes[2] = hashes[0];
        _revert(CoverManager.InvalidOfferOrder.selector);
        _bundle(2);
        (ids[0], ids[1]) = (ids[1], ids[0]);
        (hashes[0], hashes[1]) = (hashes[1], hashes[0]);
        _revert(CoverManager.InvalidOfferOrder.selector);
        (ids[0], ids[1]) = (ids[1], ids[0]);
        (hashes[0], hashes[1]) = (hashes[1], hashes[0]);
        _borrow();
    }

    function testDescendingStrikeRequiredAndWeightedStrikeFloorsOnce() public {
        delete ids;
        delete hashes;
        ids.push(_post(BUYER, 3e18, 110_000_001, 2100, 6000, ASSET, POLICY));
        ids.push(_post(BUYER, 7e18, 100_000_000, 2000, 6000, ASSET, POLICY));
        _refreshQuote();
        assertEq(quote.weightedStrike, 103_000_000);
        (ids[0], ids[1]) = (ids[1], ids[0]);
        (hashes[0], hashes[1]) = (hashes[1], hashes[0]);
        _revert(CoverManager.InvalidOfferOrder.selector);
        (ids[0], ids[1]) = (ids[1], ids[0]);
        (hashes[0], hashes[1]) = (hashes[1], hashes[0]);
        uint256 id = _borrow();
        assertEq(manager.getReceipt(id).consent.weightedStrike, 103_000_000);
        assertEq(manager.getReceipt(id).settlementDeadline, 2000);
    }

    function testExactTotalsAndTermsHashesCannotDrift() public {
        quote.totalPremium += 1;
        _revert(CoverManager.QuoteTotalsMismatch.selector);
        quote.totalPremium -= 1;
        quote.totalOfferShares -= 1;
        _revert(CoverManager.QuoteTotalsMismatch.selector);
        quote.totalOfferShares += 1;
        quote.weightedStrike += 1;
        _revert(CoverManager.QuoteTotalsMismatch.selector);
        quote.weightedStrike -= 1;
        hashes[1] = bytes32(uint256(99));
        _revert(Errors.OfferTermsHashMismatch.selector);
        hashes[1] = book.termsHashOf(ids[1]);
        _borrow();
    }

    function testEmptyMismatchedAndNineOfferBundlesRevertButEightWorks() public {
        delete ids;
        delete hashes;
        _revert(CoverManager.InvalidOfferCount.selector);
        _bundle(9);
        _revert(CoverManager.InvalidOfferCount.selector);
        _bundle(8);
        hashes.pop();
        _revert(CoverManager.InvalidOfferCount.selector);
        hashes.push(book.termsHashOf(ids[7]));
        bytes32 digest = _hash();
        vm.cool(address(registry));
        vm.cool(address(oracle));
        vm.cool(address(book));
        vm.cool(address(pool));
        vm.cool(address(vault));
        vm.cool(address(cash));
        vm.cool(address(stock));
        vm.cool(address(eligibility));
        vm.cool(address(manager));
        vm.prank(BORROWER);
        uint256 beforeGas = gasleft();
        uint256 id = manager.borrowWithCover(quote, ids, hashes, digest);
        emit log_named_uint("cold eight-lot covered borrow gas", beforeGas - gasleft());
        assertEq(manager.getReceipt(id).offerIds.length, 8);
    }

    function testSharesMustNotExceedCollateral() public {
        quote.collateralShares = COLLATERAL - 1;
        _revert(CoverManager.InvalidCollateral.selector);
        quote.collateralShares = COLLATERAL;
        _borrow();
    }

    function testOriginationLtvUsesExactCrossProductsAtFractionalValue() public {
        // Collateral value is 1.8 raw cash units; 1 / 1.8 is below 60%.
        delete ids;
        ids.push(_post(BUYER, 18_000_000_000, 200_000_000, 2000, 6000, ASSET, POLICY));
        _refreshQuote();
        quote.collateralShares = 18_000_000_000;
        quote.principal = 2;
        _revert(Errors.BorrowerLtvTooHigh.selector);
        quote.principal = 1;
        _borrow();
        assertEq(manager.debtOf(1), 1);
    }

    function testOriginationLtvRejectsOneUnitOverExactBoundary() public {
        quote.principal = 600_000_001;
        _revert(Errors.BorrowerLtvTooHigh.selector);
        quote.principal = 600_000_000;
        _borrow();
    }

    function testEachBuyerReceivesUpwardRoundedLtv() public {
        delete ids;
        ids.push(_post(BUYER, 5e18, 110_000_000, 2000, 6000, ASSET, POLICY));
        ids.push(_post(OTHER_BUYER, 5e18, 100_000_000, 2000, 5000, ASSET, POLICY));
        _refreshQuote();
        quote.principal = 500_000_001;
        _revert(Errors.BorrowerLtvTooHigh.selector);
        assertEq(book.premiumCredit(BUYER), 0);
        assertEq(book.premiumCredit(OTHER_BUYER), 0);
        quote.principal = 500_000_000;
        _borrow();
        assertEq(book.premiumCredit(BUYER), 100);
        assertEq(book.premiumCredit(OTHER_BUYER), 100);
    }

    function testFundingMustCoverInterestThroughMinimumOfferDeadline() public {
        delete ids;
        ids.push(_post(BUYER, 5e18, 100_000_000, 2000, 6000, ASSET, POLICY));
        _refreshQuote();
        _revert(Errors.InsufficientFundedCapacity.selector);
        quote.principal = 499_000_000;
        _borrow();
    }

    function testFullFundingSumsPerLotCeilingCapacityIncludingDust() public {
        delete ids;
        ids.push(_post(BUYER, 1, 1, 2000, 6000, ASSET, POLICY));
        ids.push(_post(BUYER, 1, 1, 2000, 6000, ASSET, POLICY));
        if (ids[0] > ids[1]) (ids[0], ids[1]) = (ids[1], ids[0]);
        _refreshQuote();
        quote.principal = 1;
        assertEq(book.getOffer(ids[0]).cashCapacity, 1);
        assertEq(book.getOffer(ids[1]).cashCapacity, 1);
        uint256 id = _borrow();
        assertEq(manager.getReceipt(id).debtCeiling, 2);
        assertEq(manager.getReceipt(id).consent.totalOfferShares, 2);
        assertEq(manager.getReceipt(id).consent.weightedStrike, 1);
    }

    function testDeadlineBoundsInclusiveAndStrictlyAfterClose() public {
        quote.minSettlementDeadline = 2001;
        _revert(CoverManager.InvalidSettlementDeadline.selector);
        quote.minSettlementDeadline = 2000;
        quote.maxSettlementDeadline = 1999;
        _revert(CoverManager.InvalidSettlementDeadline.selector);
        quote.maxSettlementDeadline = 2000;
        _borrow();
    }

    function testOfferExpiryAtScheduledCloseCannotFundBorrow() public {
        delete ids;
        ids.push(_post(BUYER, COLLATERAL, 100_000_000, 1500, 6000, ASSET, POLICY));
        _refreshQuote();
        quote.minSettlementDeadline = 1001;
        _revert(CoverManager.InvalidSettlementDeadline.selector);
        _bundle(1);
        _borrow();
    }

    function testConfigScheduleAndAssetIdentityMustMatch() public {
        quote.configHash = bytes32(uint256(9));
        _revert(CoverManager.ReferenceFactsMismatch.selector);
        quote.configHash = configHash;
        quote.scheduledReportHash = bytes32(uint256(8));
        _revert(CoverManager.ReferenceFactsMismatch.selector);
        quote.scheduledReportHash = oracle.sessionFact(SESSION).scheduledReportHash;
        quote.sessionId = bytes32(uint256(7));
        _revert(CoverManager.InvalidSession.selector);
        quote.sessionId = SESSION;
        quote.policyHash = bytes32(uint256(6));
        _revert(CoverManager.OfferIdentityMismatch.selector);
        quote.policyHash = POLICY;
        _borrow();
    }

    function testConfigNotEffectiveAndNon18DecimalsRejectBorrow() public {
        vm.warp(1000);
        _revert(CoverManager.ConfigNotEffective.selector);
        vm.warp(1001);
        Types.AssetConfig memory config = _config();
        config.stockTokenDecimals = 6;
        registry.scheduleAssetConfig(ASSET, config, 1002);
        vm.warp(1002);
        quote.configVersion = 2;
        quote.configHash = registry.configHash(ASSET, 2);
        _revert(abi.encodeWithSelector(Errors.InvalidDecimals.selector, uint8(6), uint8(6)));
        quote.configVersion = 1;
        quote.configHash = configHash;
        _borrow();
    }

    function testHaltAndScheduledCloseBlockNewRisk() public {
        Types.MarketEventReport memory report = _report(Types.MarketEventKind.HALT);
        report.halted = true;
        oracle.acceptReport(report);
        _revert(CoverManager.AssetHalted.selector);
        report = _report(Types.MarketEventKind.HALT);
        oracle.acceptReport(report);
        vm.warp(1500);
        _revert(CoverManager.InvalidSession.selector);
        vm.warp(1499);
        _borrow();
    }

    function testDefaultMultiplierMustBeExactlyOneAndCorporateFactMustMatch() public {
        quote.snapshotMultiplierNumerator = 2;
        quote.snapshotMultiplierDenominator = 2;
        _revert(CoverManager.ReferenceFactsMismatch.selector);
        quote.snapshotMultiplierNumerator = 1;
        quote.snapshotMultiplierDenominator = 1;
        quote.corporateActionHash = bytes32(uint256(1));
        _revert(CoverManager.ReferenceFactsMismatch.selector);
        quote.corporateActionHash = 0;
        Types.MarketEventReport memory report = _report(Types.MarketEventKind.CORPORATE_ACTION);
        report.corporateAction = Types.CorporateAction.SPLIT;
        report.actionId = keccak256("SPLIT");
        report.multiplierNumerator = 2;
        report.multiplierDenominator = 1;
        oracle.acceptReport(report);
        _revert(CoverManager.ReferenceFactsMismatch.selector);
        quote.corporateActionHash = oracle.latestCorporateAction(ASSET).reportHash;
        quote.snapshotMultiplierNumerator = 2;
        uint256 id = _borrow();
        assertEq(vault.getDebt(id).terms.snapshotMultiplierNumerator, 2);
    }

    function testCancelledFrontRunAndLaterIneligibilityRestoreEverything() public {
        vm.prank(BUYER);
        book.cancelOffer(ids[1]);
        _revert(
            abi.encodeWithSelector(
                Errors.InvalidOfferState.selector, Types.OfferStatus.FREE, Types.OfferStatus.CANCELLED
            )
        );
        _bundle(2);
        eligibility.setEligible(ASSET, BUYER, POLICY, false);
        _revert(abi.encodeWithSelector(Errors.IneligibleBuyer.selector, BUYER));
        eligibility.setEligible(ASSET, BUYER, POLICY, true);
        _borrow();
    }

    function testAnotherBorrowerReservingFirstInvalidatesOldBundleWithoutPartialBorrow() public {
        QuoteHash.Quote memory competing = quote;
        competing.borrower = address(9);
        bytes32 digest = QuoteHash.hash(address(manager), competing, ids, hashes);
        vm.prank(address(9));
        manager.borrowWithCover(competing, ids, hashes, digest);
        bytes32 original = _hash();
        vm.prank(BORROWER);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidOfferState.selector, Types.OfferStatus.FREE, Types.OfferStatus.RESERVED
            )
        );
        manager.borrowWithCover(quote, ids, hashes, original);
        assertEq(manager.borrowerNonce(BORROWER), 0);
        assertEq(manager.nextReceiptId(), 2);
        assertEq(stock.balanceOf(BORROWER), 1000e18);
        assertEq(cash.balanceOf(BORROWER), BORROWER_CASH);
        assertEq(pool.activeReceiptIds().length, 1);
        assertEq(book.getOffer(ids[0]).receiptId, 1);
        assertEq(manager.debtOf(1), competing.principal);
        vm.expectRevert(Errors.InvalidReceiptId.selector);
        manager.getReceipt(2);
    }

    function testCollateralFailureAndPremiumFailureRollbackThenSameQuoteSucceeds() public {
        stock.setPaused(true);
        _revert(MockStockToken.TransfersPaused.selector);
        stock.setPaused(false);
        vm.prank(BORROWER);
        cash.approve(address(book), 100);
        _revert(bytes(""));
        vm.prank(BORROWER);
        cash.approve(address(book), BORROWER_CASH);
        cash.setShortTransferFrom(true);
        _revert(Errors.InvalidTokenBalanceDelta.selector);
        cash.setShortTransferFrom(false);
        _borrow();
    }

    function testFinalDisbursementFailureRollsBackAllStateBalancesAndAllowances() public {
        cash.setFailTransfer(true);
        _revert(bytes(""));
        cash.setFailTransfer(false);
        cash.setShortTransfer(true);
        _revert(Errors.InvalidTokenBalanceDelta.selector);
        cash.setShortTransfer(false);
        _borrow();
    }

    function testReentrancyAtFinalDisbursementHitsGuardAndRollsBack() public {
        cash.setTransferHook(
            address(manager), abi.encodeCall(CoverManager.borrowWithCover, (quote, ids, hashes, _hash()))
        );
        _revert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        cash.setTransferHook(address(0), "");
        _borrow();
    }

    function testInsufficientPoolLiquidityRollsBackEveryReservation() public {
        pool.redeem(pool.balanceOf(address(this)), address(this));
        _revert(ProtectedPool.InsufficientLiquidity.selector);
        cash.approve(address(pool), POOL_CASH);
        pool.deposit(POOL_CASH);
        _borrow();
    }

    function testConstructorRejectsEveryZeroDependencyAndCashMismatch() public {
        address[5] memory dependencies =
            [address(registry), address(oracle), address(book), address(pool), address(vault)];
        for (uint256 i; i < 5; ++i) {
            address saved = dependencies[i];
            dependencies[i] = address(0);
            vm.expectRevert(Errors.ZeroAddress.selector);
            new CoverManager(dependencies[0], dependencies[1], dependencies[2], dependencies[3], dependencies[4]);
            dependencies[i] = saved;
        }
        MockCashToken differentCash = new MockCashToken();
        ProtectedPool differentPool = new ProtectedPool(address(differentCash), address(this));
        vm.expectRevert(CoverManager.ComponentMismatch.selector);
        new CoverManager(address(registry), address(oracle), address(book), address(differentPool), address(vault));
        _borrow();
    }

    function testBindingsMustAllNameThisManagerAndCorrectPool() public {
        CoverManager other =
            new CoverManager(address(registry), address(oracle), address(book), address(pool), address(vault));
        bytes32 digest = QuoteHash.hash(address(other), quote, ids, hashes);
        vm.prank(BORROWER);
        vm.expectRevert(CoverManager.ComponentMismatch.selector);
        other.borrowWithCover(quote, ids, hashes, digest);
        _assertEmpty();
        _borrow();
    }

    function testEachIndividualComponentBindingAndBookDestinationIsEnforced() public {
        for (uint256 which; which < 4; ++which) {
            CommitmentBook freshBook = new CommitmentBook(address(cash), address(eligibility), address(this));
            ProtectedPool freshPool = new ProtectedPool(address(cash), address(this));
            LoanVault freshVault = new LoanVault(address(this));
            CoverManager fresh = new CoverManager(
                address(registry), address(oracle), address(freshBook), address(freshPool), address(freshVault)
            );
            freshBook.initialize(which == 0 ? address(9) : address(fresh), which == 3 ? address(9) : address(freshPool));
            freshPool.initialize(which == 1 ? address(9) : address(fresh));
            freshVault.initialize(which == 2 ? address(9) : address(fresh));
            bytes32 digest = QuoteHash.hash(address(fresh), quote, ids, hashes);
            vm.prank(BORROWER);
            vm.expectRevert(CoverManager.ComponentMismatch.selector);
            fresh.borrowWithCover(quote, ids, hashes, digest);
            assertEq(fresh.borrowerNonce(BORROWER), 0);
            assertEq(fresh.nextReceiptId(), 1);
        }
        _assertEmpty();
        _borrow();
    }

    function testInvalidAmountsRecipientAndSkippedNonceCannotCreateReceipt() public {
        quote.recipient = address(0);
        _revert(Errors.ZeroAddress.selector);
        quote.recipient = RECIPIENT;
        quote.borrowerNonce = 1;
        _revert(CoverManager.InvalidBorrowerNonce.selector);
        quote.borrowerNonce = 0;
        quote.principal = 0;
        _revert(Errors.UnsupportedCashAmount.selector);
        quote.principal = uint256(type(uint128).max) + 1;
        _revert(Errors.UnsupportedCashAmount.selector);
        quote.principal = 500_000_000;
        quote.collateralShares = 0;
        _revert(CoverManager.InvalidCollateral.selector);
        quote.collateralShares = uint256(type(uint128).max) + 1;
        _revert(CoverManager.InvalidCollateral.selector);
        quote.collateralShares = COLLATERAL;
        quote.referencePrice = 0;
        _revert(Errors.UnsupportedPrice.selector);
        quote.referencePrice = uint256(type(uint96).max) + 1;
        _revert(Errors.UnsupportedPrice.selector);
        quote.referencePrice = 100_000_000;
        _borrow();
    }

    function testConfigMustMatchSessionAndActualTokenDecimals() public {
        Types.AssetConfig memory changed = _config();
        changed.rateNumerator = 900;
        registry.scheduleAssetConfig(ASSET, changed, 1002);
        vm.warp(1002);
        quote.configVersion = 2;
        quote.configHash = registry.configHash(ASSET, 2);
        _revert(CoverManager.ReferenceFactsMismatch.selector);
        changed.assetToken = address(cash);
        registry.scheduleAssetConfig(ASSET, changed, 1003);
        vm.warp(1003);
        quote.configVersion = 3;
        quote.configHash = registry.configHash(ASSET, 3);
        _revert(abi.encodeWithSelector(Errors.InvalidDecimals.selector, uint8(6), uint8(6)));
        quote.configVersion = 1;
        quote.configHash = configHash;
        _borrow();
    }

    function testOfferAssetMismatchCannotSubstituteEvenWithMatchingPolicy() public {
        bytes32 otherAsset = keccak256("OTHER");
        eligibility.setEligible(otherAsset, BUYER, POLICY, true);
        delete ids;
        ids.push(_post(BUYER, COLLATERAL, 100_000_000, 2000, 6000, otherAsset, POLICY));
        _refreshQuote();
        _revert(CoverManager.OfferIdentityMismatch.selector);
        _bundle(1);
        _borrow();
    }

    function testReferenceDeviationIsCheckedAtReservationAfterPriorPremium() public {
        delete ids;
        ids.push(_post(BUYER, 5e18, 110_000_000, 2000, 6000, ASSET, POLICY));
        Types.OfferTerms memory strict =
            Types.OfferTerms(ASSET, POLICY, 5e18, 100_000_000, 100, 6000, 100_000_000, 0, 2000, ++offerNonce);
        vm.prank(OTHER_BUYER);
        ids.push(book.postOffer(strict));
        _refreshQuote();
        quote.referencePrice = 100_000_001;
        _revert(Errors.ReferenceDeviationTooHigh.selector);
        assertEq(book.premiumCredit(BUYER), 0);
        assertEq(book.premiumCredit(OTHER_BUYER), 0);
        quote.referencePrice = 100_000_000;
        _borrow();
    }

    function testEligibilityCanChangeBetweenPreflightAndSecondReservation() public {
        delete ids;
        ids.push(_post(BUYER, 5e18, 110_000_000, 2000, 6000, ASSET, POLICY));
        ids.push(_post(OTHER_BUYER, 5e18, 100_000_000, 2000, 6000, ASSET, POLICY));
        _refreshQuote();
        cash.setTransferFromHook(
            address(eligibility), abi.encodeCall(MockEligibilityPolicy.setEligible, (ASSET, OTHER_BUYER, POLICY, false))
        );
        _revert(abi.encodeWithSelector(Errors.IneligibleBuyer.selector, OTHER_BUYER));
        assertTrue(eligibility.isEligible(ASSET, OTHER_BUYER, POLICY));
        cash.setTransferFromHook(address(0), "");
        _borrow();
    }

    function testReentrancyDuringPremiumPullHitsGuardAndRollsBack() public {
        cash.setTransferFromHook(
            address(manager), abi.encodeCall(CoverManager.borrowWithCover, (quote, ids, hashes, _hash()))
        );
        _revert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        cash.setTransferFromHook(address(0), "");
        _borrow();
    }

    function testReceiptAndNonceAreStagedBeforePremiumCallbackWithoutInflatingNAV() public {
        cash.setTransferFromHook(address(this), abi.encodeCall(this.inspectStagedBorrow, ()));
        _borrow();
        assertEq(manager.borrowerNonce(BORROWER), 1);
        assertEq(pool.totalAssets(), POOL_CASH);
    }

    function inspectStagedBorrow() external view {
        assertEq(msg.sender, address(cash));
        assertEq(manager.borrowerNonce(BORROWER), 1);
        assertEq(manager.nextReceiptId(), 2);
        assertEq(manager.getReceipt(1).consent.borrower, BORROWER);
        assertEq(manager.debtOf(1), quote.principal);
        assertEq(pool.activeReceiptIds().length, 0);
        assertEq(pool.totalAssets(), POOL_CASH);
    }

    function testCollateralCallbackReentrancyRollsBackBeforeReservation() public {
        BorrowCallbackStock callbackStock = new BorrowCallbackStock();
        Types.AssetConfig memory config = _config();
        config.assetToken = address(callbackStock);
        AssetRegistry freshRegistry = new AssetRegistry(address(this));
        freshRegistry.scheduleAssetConfig(ASSET, config, 1002);
        SessionOracle freshOracle = new SessionOracle(address(this));
        freshOracle.bindReceiver(address(this));
        Types.MarketEventReport memory scheduled = _report(Types.MarketEventKind.SESSION_SCHEDULED);
        scheduled.oracle = address(freshOracle);
        scheduled.nonce = 1;
        scheduled.previousStateHash = 0;
        scheduled.configHash = freshRegistry.configHash(ASSET, 1);
        freshOracle.acceptReport(scheduled);
        CommitmentBook freshBook = new CommitmentBook(address(cash), address(eligibility), address(this));
        ProtectedPool freshPool = new ProtectedPool(address(cash), address(this));
        LoanVault freshVault = new LoanVault(address(this));
        CoverManager fresh = new CoverManager(
            address(freshRegistry), address(freshOracle), address(freshBook), address(freshPool), address(freshVault)
        );
        freshBook.initialize(address(fresh), address(freshPool));
        freshPool.initialize(address(fresh));
        freshVault.initialize(address(fresh));
        vm.warp(1002);
        cash.mint(address(this), POOL_CASH);
        cash.approve(address(freshPool), POOL_CASH);
        freshPool.deposit(POOL_CASH);
        callbackStock.mint(BORROWER, COLLATERAL);
        vm.startPrank(BORROWER);
        callbackStock.approve(address(freshVault), COLLATERAL);
        cash.approve(address(freshBook), 100);
        vm.stopPrank();
        vm.startPrank(BUYER);
        cash.approve(address(freshBook), POOL_CASH);
        Types.OfferTerms memory terms =
            Types.OfferTerms(ASSET, POLICY, COLLATERAL, 100_000_000, 100, 6000, 100_000_000, 0, 2000, 1);
        bytes32[] memory selected = new bytes32[](1);
        selected[0] = freshBook.postOffer(terms);
        vm.stopPrank();
        bytes32[] memory selectedHashes = new bytes32[](1);
        selectedHashes[0] = freshBook.termsHashOf(selected[0]);
        QuoteHash.Quote memory consent = quote;
        consent.configHash = scheduled.configHash;
        consent.scheduledReportHash = freshOracle.sessionFact(SESSION).scheduledReportHash;
        consent.totalPremium = 100;
        bytes32 digest = QuoteHash.hash(address(fresh), consent, selected, selectedHashes);
        callbackStock.setHook(
            address(fresh), abi.encodeCall(CoverManager.borrowWithCover, (consent, selected, selectedHashes, digest))
        );
        vm.prank(BORROWER);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        fresh.borrowWithCover(consent, selected, selectedHashes, digest);
        assertEq(fresh.borrowerNonce(BORROWER), 0);
        assertEq(fresh.nextReceiptId(), 1);
        assertEq(freshPool.activeReceiptIds().length, 0);
        assertEq(callbackStock.balanceOf(BORROWER), COLLATERAL);
        assertEq(callbackStock.allowance(BORROWER, address(freshVault)), COLLATERAL);
        assertEq(freshVault.backingOf(1), 0);
        assertEq(freshBook.totalPremiumCredits(), 0);
        assertEq(uint8(freshBook.getOffer(selected[0]).status), uint8(Types.OfferStatus.FREE));
        callbackStock.setHook(address(0), "");
        vm.prank(BORROWER);
        assertEq(fresh.borrowWithCover(consent, selected, selectedHashes, digest), 1);
        assertEq(callbackStock.balanceOf(address(freshVault)), COLLATERAL);
    }

    function testThirtyThirdBorrowRollsBackCustodyPremiumAndNonceAtPoolLimit() public {
        for (uint256 i; i < 32; ++i) {
            if (i != 0) _bundle(1);
            quote.principal = 1_000_000;
            quote.borrowerNonce = i;
            _borrow();
        }
        _bundle(8);
        quote.principal = 1_000_000;
        quote.borrowerNonce = 32;
        uint256 borrowerCash = cash.balanceOf(BORROWER);
        uint256 collateralBefore = stock.balanceOf(BORROWER);
        uint256 cashAllowance = cash.allowance(BORROWER, address(book));
        uint256 stockAllowance = stock.allowance(BORROWER, address(vault));
        uint256 premiumsBefore = book.totalPremiumCredits();
        bytes32 digest = _hash();
        vm.prank(BORROWER);
        vm.expectRevert(ProtectedPool.ActiveReceiptLimit.selector);
        manager.borrowWithCover(quote, ids, hashes, digest);
        assertEq(manager.borrowerNonce(BORROWER), 32);
        assertEq(manager.nextReceiptId(), 33);
        assertEq(cash.balanceOf(BORROWER), borrowerCash);
        assertEq(stock.balanceOf(BORROWER), collateralBefore);
        assertEq(cash.allowance(BORROWER, address(book)), cashAllowance);
        assertEq(stock.allowance(BORROWER, address(vault)), stockAllowance);
        assertEq(book.totalPremiumCredits(), premiumsBefore);
        assertEq(pool.activeReceiptIds().length, 32);
        assertEq(vault.backingOf(33), 0);
        assertEq(pool.totalAssets(), POOL_CASH);
        for (uint256 i; i < ids.length; ++i) {
            assertEq(uint8(book.getOffer(ids[i]).status), uint8(Types.OfferStatus.FREE));
        }
        vm.expectRevert(Errors.InvalidReceiptId.selector);
        manager.getReceipt(33);
        vm.expectRevert(Errors.InvalidReceiptId.selector);
        vault.getDebt(33);
    }

    function _borrow() internal returns (uint256) {
        bytes32 digest = _hash();
        vm.prank(BORROWER);
        return manager.borrowWithCover(quote, ids, hashes, digest);
    }

    function _hash() internal view returns (bytes32) {
        return QuoteHash.hash(address(manager), quote, ids, hashes);
    }

    function _revert(bytes4 selector) internal {
        _revert(abi.encodePacked(selector));
    }

    function _revert(bytes memory reason) internal {
        _revertWithHash(_hash(), reason);
    }

    function _revertWithHash(bytes32 digest, bytes4 selector) internal {
        _revertWithHash(digest, abi.encodePacked(selector));
    }

    function _revertWithHash(bytes32 digest, bytes memory reason) internal {
        uint256 cashAllowance = cash.allowance(BORROWER, address(book));
        uint256 stockAllowance = stock.allowance(BORROWER, address(vault));
        uint256 bookBalance = cash.balanceOf(address(book));
        uint256 poolBalance = cash.balanceOf(address(pool));
        uint256 locked = book.totalLockedCash();
        bytes32 offersBefore = _offerStateHash();
        vm.prank(BORROWER);
        if (reason.length == 0) vm.expectRevert();
        // Safe: this branch accepts exactly one four-byte selector.
        // forge-lint: disable-next-line(unsafe-typecast)
        else if (reason.length == 4) vm.expectPartialRevert(bytes4(reason));
        else vm.expectRevert(reason);
        manager.borrowWithCover(quote, ids, hashes, digest);
        _assertEmpty();
        assertEq(cash.allowance(BORROWER, address(book)), cashAllowance);
        assertEq(stock.allowance(BORROWER, address(vault)), stockAllowance);
        assertEq(cash.balanceOf(address(book)), bookBalance);
        assertEq(cash.balanceOf(address(pool)), poolBalance);
        assertEq(book.totalLockedCash(), locked);
        assertEq(_offerStateHash(), offersBefore);
    }

    function _assertEmpty() internal {
        assertEq(manager.borrowerNonce(BORROWER), 0);
        assertEq(manager.nextReceiptId(), 1);
        assertEq(pool.activeReceiptIds().length, 0);
        assertEq(vault.backingOf(1), 0);
        assertEq(vault.accountedBacking(address(stock)), 0);
        assertEq(vault.remainingSnapshotShares(1), 0);
        assertEq(stock.balanceOf(address(vault)), 0);
        assertEq(stock.balanceOf(BORROWER), 1000e18);
        assertEq(cash.balanceOf(BORROWER), BORROWER_CASH);
        assertEq(cash.balanceOf(RECIPIENT), 0);
        assertEq(book.totalPremiumCredits(), 0);
        vm.expectRevert(Errors.InvalidReceiptId.selector);
        manager.getReceipt(1);
        vm.expectRevert(Errors.InvalidReceiptId.selector);
        vault.getDebt(1);
    }

    function _offerStateHash() internal view returns (bytes32 result) {
        for (uint256 i; i < ids.length; ++i) {
            result = keccak256(abi.encode(result, book.getOffer(ids[i])));
        }
    }

    function _fundBorrower(address who) internal {
        cash.mint(who, BORROWER_CASH);
        stock.mint(who, 1000e18);
        vm.startPrank(who);
        cash.approve(address(book), BORROWER_CASH);
        stock.approve(address(vault), 1000e18);
        vm.stopPrank();
    }

    function _fundBuyer(address buyer) internal {
        eligibility.setEligible(ASSET, buyer, POLICY, true);
        cash.mint(buyer, 100_000_000_000);
        vm.prank(buyer);
        cash.approve(address(book), 100_000_000_000);
    }

    function _bundle(uint256 count) internal {
        delete ids;
        for (uint256 i; i < count; ++i) {
            ids.push(_post(BUYER, COLLATERAL / count, 100_000_000, 2000, 6000, ASSET, POLICY));
        }
        for (uint256 i; i < count; ++i) {
            for (uint256 j = i + 1; j < count; ++j) {
                if (ids[i] > ids[j]) (ids[i], ids[j]) = (ids[j], ids[i]);
            }
        }
        _refreshQuote();
    }

    function _refreshQuote() internal {
        delete hashes;
        delete quote;
        quote.borrower = BORROWER;
        quote.recipient = RECIPIENT;
        quote.expiry = 1600;
        quote.assetId = ASSET;
        quote.sessionId = SESSION;
        quote.configVersion = 1;
        quote.configHash = configHash;
        quote.policyHash = POLICY;
        quote.principal = 500_000_000;
        quote.collateralShares = COLLATERAL;
        quote.referencePrice = 100_000_000;
        quote.scheduledReportHash = oracle.sessionFact(SESSION).scheduledReportHash;
        quote.snapshotMultiplierNumerator = 1;
        quote.snapshotMultiplierDenominator = 1;
        quote.minSettlementDeadline = 1501;
        quote.maxSettlementDeadline = 2500;
        uint256 weighted;
        for (uint256 i; i < ids.length; ++i) {
            hashes.push(book.termsHashOf(ids[i]));
            Types.Offer memory offer = book.getOffer(ids[i]);
            quote.totalOfferShares += offer.terms.snapshotShares;
            quote.totalPremium += offer.terms.premium;
            weighted += offer.terms.snapshotShares * offer.terms.strike;
        }
        quote.weightedStrike = weighted / quote.totalOfferShares;
    }

    function _post(
        address buyer,
        uint256 shares,
        uint256 strike,
        uint64 expiry,
        uint16 ltv,
        bytes32 asset,
        bytes32 policy
    ) internal returns (bytes32) {
        Types.OfferTerms memory terms = Types.OfferTerms(
            asset, policy, shares, strike, 100, ltv, 100_000_000, 1000, expiry, ++offerNonce
        );
        vm.prank(buyer);
        return book.postOffer(terms);
    }

    function _config() internal view returns (Types.AssetConfig memory) {
        return Types.AssetConfig(
            address(stock), 18, 6, 6000, 6500, 7500, 800, 315_360_000_000, 8, 32, Types.SUPPORTED_CORPORATE_ACTIONS
        );
    }

    function _report(Types.MarketEventKind kind) internal view returns (Types.MarketEventReport memory report) {
        Types.AssetState memory state = oracle.assetState(ASSET);
        report.schemaVersion = 1;
        report.kind = kind;
        report.chainId = block.chainid;
        report.oracle = address(oracle);
        report.assetId = ASSET;
        report.configHash = configHash;
        report.nonce = state.nextNonce;
        report.previousStateHash = state.stateHash;
        report.observedAt = uint64(block.timestamp);
        report.validUntil = uint64(block.timestamp + 1000);
        report.primarySourceHash = keccak256("SOURCE");
        if (kind == Types.MarketEventKind.SESSION_SCHEDULED) {
            report.sessionId = SESSION;
            report.scheduledOpen = 1200;
            report.scheduledClose = 1500;
        }
    }
}
