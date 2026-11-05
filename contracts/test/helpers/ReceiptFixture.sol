// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
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
import {MockCashToken} from "./MockCashToken.sol";
import {MockEligibilityPolicy} from "./MockEligibilityPolicy.sol";

interface LifecycleAPI {
    function repay(uint256 id, uint256 amount) external;
    function addCollateral(uint256 id, uint256 shares) external;
    function withdrawCollateral(uint256 id, uint256 shares) external;
    function settle(uint256 id) external;
    function terminalSettle(uint256 id) external;
    function finalizeHandoff(uint256 id) external;
    function topUpBacking(uint256 id, uint256 units) external;
}

interface LifecycleVaultAPI {
    function outstandingClaimUnits(uint256 id) external view returns (uint256);
    function releaseSurplus(uint256 id) external returns (uint256);
}

abstract contract ReceiptFixture is Test {
    bytes32 internal constant ASSET = keccak256("STOCK");
    bytes32 internal constant SESSION = keccak256("SESSION");
    bytes32 internal constant POLICY = keccak256("POLICY");
    address internal constant BORROWER = address(0xA11CE);
    address internal constant PAYER = address(0xAAA);
    address internal constant BUYER = address(0xB0B);
    address internal constant OTHER_BUYER = address(0xB0B2);
    address internal constant LENDER = address(0x1EAD);
    address internal constant KEEPER = address(0xBEEF);
    address internal constant ADVERSARY = address(0xBAD);
    uint256 internal constant POOL_CASH = 10_000e6;
    AssetRegistry internal registry;
    SessionOracle internal oracle;
    CommitmentBook internal book;
    ProtectedPool internal pool;
    LoanVault internal vault;
    CoverManager internal manager;
    LifecycleAPI internal life;
    LifecycleVaultAPI internal liabilities;
    MockCashToken internal cash;
    MockStockToken internal stock;
    MockEligibilityPolicy internal eligibility;
    bytes32 internal configHash;
    bytes32[] internal ids;
    bytes32[] internal hashes;
    QuoteHash.Quote internal quote;
    uint256 internal nonce;

    function setUp() public virtual {
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
        life = LifecycleAPI(address(manager));
        liabilities = LifecycleVaultAPI(address(vault));
        book.initialize(address(manager), address(pool));
        pool.initialize(address(manager));
        vault.initialize(address(manager));
        registry.scheduleAssetConfig(ASSET, _config(1), 1001);
        configHash = registry.configHash(ASSET, 1);
        oracle.bindReceiver(address(this));
        oracle.acceptReport(_report(Types.MarketEventKind.SESSION_SCHEDULED));
        vm.warp(1001);
        cash.mint(LENDER, POOL_CASH);
        vm.startPrank(LENDER);
        cash.approve(address(pool), type(uint256).max);
        pool.deposit(POOL_CASH);
        vm.stopPrank();
        _fund(BORROWER);
        _fund(PAYER);
        _fund(BUYER);
        _fund(OTHER_BUYER);
        ids.push(_post(BUYER, 5e18, 100e6));
        ids.push(_post(OTHER_BUYER, 5e18, 90e6));
        _quote();
    }

    function _config(uint32 rate) internal view virtual returns (Types.AssetConfig memory) {
        return Types.AssetConfig(address(stock), 18, 6, 6000, 6500, 7500, rate, type(uint64).max, 8, 32, 6);
    }

    function _fund(address who) internal {
        cash.mint(who, 100_000e6);
        stock.mint(who, 1000e18);
        eligibility.setEligible(ASSET, who, POLICY, true);
        vm.startPrank(who);
        cash.approve(address(manager), type(uint256).max);
        cash.approve(address(book), type(uint256).max);
        stock.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    function _post(address buyer, uint256 shares, uint256 strike) internal returns (bytes32) {
        vm.prank(buyer);
        return book.postOffer(Types.OfferTerms(ASSET, POLICY, shares, strike, 100, 6000, 100e6, 10000, 2000, ++nonce));
    }

    function _quote() internal {
        delete hashes;
        delete quote;
        quote.borrower = BORROWER;
        quote.recipient = BORROWER;
        quote.expiry = 1499;
        quote.assetId = ASSET;
        quote.sessionId = SESSION;
        quote.configVersion = 1;
        quote.configHash = configHash;
        quote.policyHash = POLICY;
        // One raw cash unit of upward-rounded interest makes debt exactly 500e6.
        quote.principal = 500e6 - 1;
        quote.collateralShares = 10e18;
        quote.referencePrice = 100e6;
        quote.scheduledReportHash = oracle.sessionFact(SESSION).scheduledReportHash;
        quote.snapshotMultiplierNumerator = 1;
        quote.snapshotMultiplierDenominator = 1;
        quote.minSettlementDeadline = 2000;
        quote.maxSettlementDeadline = 2000;
        uint256 weighted;
        for (uint256 i; i < ids.length; ++i) {
            hashes.push(book.termsHashOf(ids[i]));
            Types.Offer memory o = book.getOffer(ids[i]);
            quote.totalOfferShares += o.terms.snapshotShares;
            quote.totalPremium += o.terms.premium;
            weighted += o.terms.snapshotShares * o.terms.strike;
        }
        quote.weightedStrike = weighted / quote.totalOfferShares;
    }

    function _clearOffers() internal {
        for (uint256 i; i < ids.length; ++i) {
            vm.prank(book.getOffer(ids[i]).buyer);
            book.cancelOffer(ids[i]);
        }
        delete ids;
    }

    function _borrow() internal returns (uint256 id) {
        bytes32 digest = QuoteHash.hash(address(manager), quote, ids, hashes);
        vm.prank(BORROWER);
        id = manager.borrowWithCover(quote, ids, hashes, digest);
        vm.warp(block.timestamp + 1);
    }

    function _report(Types.MarketEventKind kind) internal view returns (Types.MarketEventReport memory r) {
        Types.AssetState memory s = oracle.assetState(ASSET);
        r.schemaVersion = 1;
        r.kind = kind;
        r.chainId = block.chainid;
        r.oracle = address(oracle);
        r.assetId = ASSET;
        r.configHash = configHash;
        r.nonce = s.nextNonce;
        r.previousStateHash = s.stateHash;
        r.observedAt = uint64(block.timestamp);
        r.validUntil = uint64(block.timestamp + 1000);
        r.primarySourceHash = keccak256("PRIMARY");
        if (kind != Types.MarketEventKind.HALT && kind != Types.MarketEventKind.CORPORATE_ACTION) {
            r.sessionId = SESSION;
            r.scheduledOpen = 1200;
            r.scheduledClose = 1500;
        }
    }

    function _benchmark(uint256 price, uint128 n, uint128 d) internal {
        vm.warp(1500);
        oracle.acceptReport(_report(Types.MarketEventKind.CLOSE_CONFIRMED));
        vm.warp(1501);
        Types.MarketEventReport memory r = _report(Types.MarketEventKind.REOPEN_BENCHMARK);
        r.benchmarkPrice = price;
        r.multiplierNumerator = n;
        r.multiplierDenominator = d;
        r.secondarySourceHash = keccak256("SECONDARY");
        oracle.acceptReport(r);
    }

    function _repay(uint256 id, address payer, uint256 amount) internal {
        uint256 beforePool = cash.balanceOf(address(pool));
        uint256 beforePayer = cash.balanceOf(payer);
        uint256 beforeDebt = vault.debtOf(id);
        vm.prank(payer);
        life.repay(id, amount);
        assertEq(cash.balanceOf(address(pool)) - beforePool, amount);
        assertEq(beforePayer - cash.balanceOf(payer), amount);
        assertEq(beforeDebt - vault.debtOf(id), amount);
    }

    function _settle(uint256 id, bool terminal) internal {
        uint256 beforePool = cash.balanceOf(address(pool));
        uint256 beforeDebt = vault.debtOf(id);
        uint256 beforeBook = cash.balanceOf(address(book));
        vm.prank(KEEPER);
        uint256 gasBefore = gasleft();
        if (terminal) life.terminalSettle(id);
        else life.settle(id);
        uint256 used = gasBefore - gasleft();
        emit log_named_uint(terminal ? "terminal settlement call gas" : "normal settlement call gas", used);
        uint256 reduction = beforeDebt - vault.debtOf(id);
        assertEq(cash.balanceOf(address(pool)) - beforePool, reduction);
        assertEq(beforeBook - cash.balanceOf(address(book)), reduction);
        assertEq(book.totalLiabilities(), cash.balanceOf(address(book)));
    }

    function _reserved() internal view {
        for (uint256 i; i < ids.length; ++i) {
            assertEq(uint8(book.getOffer(ids[i]).status), uint8(Types.OfferStatus.RESERVED));
        }
    }

    function _closedFinancially(uint256 id) internal view {
        assertEq(vault.debtOf(id), 0);
        assertTrue(vault.getDebt(id).closed);
        assertEq(pool.activeReceiptIds().length, 0);
        assertEq(pool.totalAssets(), cash.balanceOf(address(pool)));
        assertEq(uint8(manager.getReceipt(id).status), 2); // HANDOFF_PENDING
        assertEq(vault.remainingSnapshotShares(id), 0);
        assertEq(book.totalLockedCash(), 0);
        for (uint256 i; i < ids.length; ++i) {
            assertEq(uint8(book.getOffer(ids[i]).status), uint8(Types.OfferStatus.RELEASED));
        }
    }

    function _withdrawAllClaims() internal {
        for (uint256 i = 1; i < vault.nextClaimId(); ++i) {
            LoanVault.Claim memory c = vault.getClaim(i);
            if (!c.withdrawn) {
                vm.prank(c.owner);
                vault.withdrawClaim(i, c.owner);
            }
        }
    }

    function _state(uint256 id) internal view returns (bytes32 result) {
        result = keccak256(
            abi.encode(
                manager.getReceipt(id),
                vault.getDebt(id),
                vault.remainingSnapshotShares(id),
                vault.backingOf(id),
                vault.nextClaimId(),
                cash.balanceOf(address(pool)),
                cash.balanceOf(address(book)),
                cash.balanceOf(PAYER),
                book.totalLockedCash(),
                book.totalCashCredits(),
                pool.totalSupply(),
                pool.activeReceiptIds()
            )
        );
        for (uint256 i; i < ids.length; ++i) {
            result = keccak256(abi.encode(result, book.getOffer(ids[i])));
        }
        result = keccak256(
            abi.encode(
                result,
                cash.allowance(PAYER, address(manager)),
                cash.balanceOf(BORROWER),
                book.cashCredit(BORROWER),
                book.cashCredit(BUYER),
                book.cashCredit(OTHER_BUYER),
                vault.accountedBacking(address(stock)),
                liabilities.outstandingClaimUnits(id)
            )
        );
        result = keccak256(
            abi.encode(
                result,
                stock.balanceOf(address(vault)),
                stock.balanceOf(BORROWER),
                stock.balanceOf(PAYER),
                stock.allowance(PAYER, address(vault)),
                pool.balanceOf(LENDER),
                pool.balanceOf(address(cash))
            )
        );
        for (uint256 i = 1; i < vault.nextClaimId(); ++i) {
            result = keccak256(abi.encode(result, vault.getClaim(i)));
        }
    }
}
