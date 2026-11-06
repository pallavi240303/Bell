// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiptFixture, LifecycleAPI, LifecycleVaultAPI} from "../../../../contracts/test/helpers/ReceiptFixture.sol";
import {AssetRegistry} from "../../../../contracts/src/AssetRegistry.sol";
import {SessionOracle} from "../../../../contracts/src/SessionOracle.sol";
import {CommitmentBook} from "../../../../contracts/src/CommitmentBook.sol";
import {ProtectedPool} from "../../../../contracts/src/ProtectedPool.sol";
import {LoanVault} from "../../../../contracts/src/LoanVault.sol";
import {LoanManager} from "../../../../contracts/src/LoanManager.sol";
import {CoverManager} from "../../../../contracts/src/CoverManager.sol";
import {SimulationMarketEventReceiver} from "../../../../contracts/src/demo/SimulationMarketEventReceiver.sol";
import {MockStockToken} from "../../../../contracts/src/demo/MockStockToken.sol";
import {MockCashToken} from "../../../../contracts/test/helpers/MockCashToken.sol";
import {MockEligibilityPolicy} from "../../../../contracts/test/helpers/MockEligibilityPolicy.sol";
import {Types} from "../../../../contracts/src/lib/Types.sol";
import {Errors} from "../../../../contracts/src/lib/Errors.sol";

contract CREWorkflowIntegrationTest is ReceiptFixture {
    SimulationMarketEventReceiver internal receiver;

    function _config(uint32) internal view override returns (Types.AssetConfig memory) {
        return Types.AssetConfig(address(stock), 18, 6, 6000, 6500, 7500, 800, 315360000000, 8, 32, 6);
    }

    function setUp() public override {
        vm.warp(800);
        cash = new MockCashToken();
        stock = new MockStockToken(address(this));
        registry = new AssetRegistry(address(this));
        oracle = new SessionOracle(address(this));
        receiver = new SimulationMarketEventReceiver(oracle, address(this));
        oracle.bindReceiver(address(receiver));
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
            CoverManager.Profile.REPLAY
        );
        loans.bindCoverManager(address(manager));
        life = LifecycleAPI(address(loans));
        liabilities = LifecycleVaultAPI(address(vault));
        book.initialize(address(manager), address(pool));
        pool.initialize(address(loans));
        vault.initialize(address(loans));
        registry.scheduleAssetConfig(ASSET, _config(800), 1001);
        configHash = registry.configHash(ASSET, 1);
        receiver.onReport("", abi.encode(_report(Types.MarketEventKind.SESSION_SCHEDULED)));
        POLICY = manager.policyHash(ASSET, SESSION, configHash, 1, 1);
        cash.mint(LENDER, POOL_CASH);
        vm.startPrank(LENDER);
        cash.approve(address(pool), type(uint256).max);
        pool.deposit(POOL_CASH);
        vm.stopPrank();
        _fund(BORROWER);
        _fund(BUYER);
        _fund(OTHER_BUYER);
        vm.warp(1001);
    }

    function _workflow(Types.MarketEventKind kind, uint256 price) internal returns (bytes memory payload) {
        Types.AssetState memory state = oracle.assetState(ASSET);
        Types.SessionFact memory active = oracle.sessionFact(state.activeSessionId);
        string[] memory command = new string[](22);
        command[0] = "node";
        command[1] = "--import";
        command[2] = "tsx";
        command[3] = "cre/bell-market-event/scripts/report-cli.ts";
        command[4] = vm.toString(uint256(kind));
        command[5] = vm.toString(block.chainid);
        command[6] = vm.toString(address(oracle));
        command[7] = vm.toString(address(receiver));
        command[8] = vm.toString(address(this));
        command[9] = vm.toString(address(registry));
        command[10] = vm.toString(ASSET);
        command[11] = vm.toString(SESSION);
        command[12] = vm.toString(state.activeSessionId);
        command[13] = vm.toString(configHash);
        command[14] = vm.toString(state.nextNonce);
        command[15] = vm.toString(state.stateHash);
        command[16] = vm.toString(block.timestamp);
        command[17] = vm.toString(price);
        command[18] = vm.toString(active.scheduledOpen);
        command[19] = vm.toString(active.scheduledClose);
        command[20] = vm.toString(active.closeObservedAt);
        command[21] = vm.toString(oracle.latestReference(ASSET).observedAt);
        payload = vm.ffi(command);
        assertEq(payload.length, 672);
        Types.MarketEventReport memory expected = _report(kind);
        expected.validUntil = uint64(block.timestamp + 100);
        expected.scheduledOpen = active.scheduledOpen;
        expected.scheduledClose = active.scheduledClose;
        expected.benchmarkPrice = price;
        expected.multiplierNumerator = 1;
        expected.multiplierDenominator = 1;
        expected.primarySourceHash = keccak256("primary");
        expected.secondarySourceHash = keccak256("secondary");
        assertEq(payload, abi.encode(expected));
        assertEq(keccak256(payload), keccak256(abi.encode(expected)));
        receiver.onReport("", payload);
        assertEq(oracle.assetState(ASSET).stateHash, keccak256(abi.encode(state.stateHash, keccak256(payload))));
    }

    function testWorkflowPriceBorrowRefreshCoverAndIndependentBenchmark() public {
        bytes memory initial = _workflow(Types.MarketEventKind.MARKET_PRICE, 100e6);
        assertEq(oracle.requireFreshReference(ASSET).reportHash, keccak256(initial));
        assertEq(uint8(oracle.sessionPhase(SESSION)), 1);
        assertFalse(oracle.benchmarkOf(SESSION).finalized);
        assertEq(book.totalLockedCash(), 0);
        quote.configVersion = 1;
        quote.configHash = configHash;
        quote.principal = 500e6 - 1;
        quote.collateralShares = 10e18;
        quote.recipient = BORROWER;
        quote.expiry = 1499;
        uint256 beforeCash = cash.balanceOf(BORROWER);
        uint256 loanId = _openOrdinary();
        assertEq(cash.balanceOf(BORROWER) - beforeCash, quote.principal);
        assertEq(loans.getLoan(loanId).activeCoverId, 0);
        vm.warp(1100);
        vm.prank(BORROWER);
        loans.repay(loanId, 1e6);
        bytes32 original = keccak256(abi.encode(vault.getDebt(loanId)));
        uint256 backing = vault.backingOf(loanId);
        bytes memory refreshed = _workflow(Types.MarketEventKind.MARKET_PRICE, 100e6);
        assertTrue(keccak256(initial) != keccak256(refreshed));
        assertEq(oracle.latestReference(ASSET).reportHash, keccak256(refreshed));
        assertFalse(oracle.benchmarkOf(SESSION).finalized);
        ids.push(_post(BUYER, 5e18, 100e6));
        ids.push(_post(OTHER_BUYER, 5e18, 90e6));
        _quote();
        quote.loanId = loanId;
        beforeCash = cash.balanceOf(BORROWER);
        uint256 receiptId = _buy();
        assertEq(manager.getReceipt(receiptId).consent.referenceReportHash, keccak256(refreshed));
        assertEq(manager.getReceipt(receiptId).loanId, loanId);
        assertEq(keccak256(abi.encode(vault.getDebt(loanId))), original);
        assertEq(vault.backingOf(loanId), backing);
        assertEq(beforeCash - cash.balanceOf(BORROWER), quote.totalPremium);
        vm.warp(1500);
        receiver.onReport("", abi.encode(_report(Types.MarketEventKind.CLOSE_CONFIRMED)));
        vm.expectRevert(bytes4(keccak256("BenchmarkUnavailable()")));
        manager.settle(receiptId);
        vm.warp(1501);
        bytes memory benchmark = _workflow(Types.MarketEventKind.REOPEN_BENCHMARK, 50e6);
        assertEq(oracle.benchmarkOf(SESSION).reportHash, keccak256(benchmark));
        assertEq(oracle.latestReference(ASSET).reportHash, keccak256(refreshed));
        uint256 beforeDebt = loans.debtOf(loanId);
        manager.settle(receiptId);
        assertLt(loans.debtOf(loanId), beforeDebt);
        assertEq(uint8(manager.getReceipt(receiptId).status), 2);
        Types.MarketEventReport memory accepted = abi.decode(benchmark, (Types.MarketEventReport));
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidNonce.selector, accepted.nonce + 1, accepted.nonce));
        receiver.onReport("", benchmark);
    }
}
