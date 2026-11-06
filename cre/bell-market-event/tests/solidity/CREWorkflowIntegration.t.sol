// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiptFixture, LifecycleAPI, LifecycleVaultAPI} from "../../../../contracts/test/helpers/ReceiptFixture.sol";
import {AssetRegistry} from "../../../../contracts/src/AssetRegistry.sol";
import {SessionOracle} from "../../../../contracts/src/SessionOracle.sol";
import {CommitmentBook} from "../../../../contracts/src/CommitmentBook.sol";
import {ProtectedPool} from "../../../../contracts/src/ProtectedPool.sol";
import {LoanVault} from "../../../../contracts/src/LoanVault.sol";
import {CoverManager} from "../../../../contracts/src/CoverManager.sol";
import {SimulationMarketEventReceiver} from "../../../../contracts/src/demo/SimulationMarketEventReceiver.sol";
import {MockStockToken} from "../../../../contracts/src/demo/MockStockToken.sol";
import {MockCashToken} from "../../../../contracts/test/helpers/MockCashToken.sol";
import {MockEligibilityPolicy} from "../../../../contracts/test/helpers/MockEligibilityPolicy.sol";
import {Types} from "../../../../contracts/src/lib/Types.sol";
import {Errors} from "../../../../contracts/src/lib/Errors.sol";

contract CREWorkflowIntegrationTest is ReceiptFixture {
    SimulationMarketEventReceiver internal receiver;

    function setUp() public override {
        vm.warp(1000);
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
        manager = new CoverManager(address(registry), address(oracle), address(book), address(pool), address(vault));
        life = LifecycleAPI(address(manager));
        liabilities = LifecycleVaultAPI(address(vault));
        book.initialize(address(manager), address(pool));
        pool.initialize(address(manager));
        vault.initialize(address(manager));
        registry.scheduleAssetConfig(ASSET, _config(1), 1001);
        configHash = registry.configHash(ASSET, 1);
        receiver.onReport("", abi.encode(_report(Types.MarketEventKind.SESSION_SCHEDULED)));
        vm.warp(1001);
        cash.mint(LENDER, POOL_CASH);
        vm.startPrank(LENDER);
        cash.approve(address(pool), type(uint256).max);
        pool.deposit(POOL_CASH);
        vm.stopPrank();
        _fund(BORROWER);
        _fund(BUYER);
        _fund(OTHER_BUYER);
        ids.push(_post(BUYER, 5e18, 100e6));
        ids.push(_post(OTHER_BUYER, 5e18, 90e6));
        _quote();
    }

    function testWorkflowReportUnlocksSettlementAndMatchesSolidityHash() public {
        uint256 id = _borrow();
        vm.warp(1500);
        receiver.onReport("", abi.encode(_report(Types.MarketEventKind.CLOSE_CONFIRMED)));
        vm.warp(1501);
        vm.expectRevert(bytes4(keccak256("BenchmarkUnavailable()")));
        life.settle(id);
        Types.AssetState memory state = oracle.assetState(ASSET);
        string[] memory command = new string[](16);
        command[0] = "node";
        command[1] = "--import";
        command[2] = "tsx";
        command[3] = "cre/bell-market-event/scripts/report-cli.ts";
        command[4] = vm.toString(block.chainid);
        command[5] = vm.toString(address(oracle));
        command[6] = vm.toString(address(receiver));
        command[7] = vm.toString(address(this));
        command[8] = vm.toString(address(registry));
        command[9] = vm.toString(ASSET);
        command[10] = vm.toString(SESSION);
        command[11] = vm.toString(configHash);
        command[12] = vm.toString(state.nextNonce);
        command[13] = vm.toString(state.stateHash);
        command[14] = vm.toString(block.timestamp);
        command[15] = "50000000";
        bytes memory payload = vm.ffi(command);
        assertEq(payload.length, 672);
        Types.MarketEventReport memory expected = _report(Types.MarketEventKind.REOPEN_BENCHMARK);
        expected.validUntil = 1601;
        expected.benchmarkPrice = 50e6;
        expected.multiplierNumerator = 1;
        expected.multiplierDenominator = 1;
        expected.primarySourceHash = keccak256("primary");
        expected.secondarySourceHash = keccak256("secondary");
        assertEq(payload, abi.encode(expected));
        assertEq(keccak256(payload), keccak256(abi.encode(expected)));
        receiver.onReport("", payload);
        assertEq(oracle.benchmarkOf(SESSION).reportHash, keccak256(payload));
        uint256 beforeDebt = vault.debtOf(id);
        _settle(id, false);
        assertLt(vault.debtOf(id), beforeDebt);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidNonce.selector, uint64(4), uint64(3)));
        receiver.onReport("", payload);
        emit log_named_bytes32("workflow report hash", keccak256(payload));
        emit log_named_uint("workflow payload bytes", payload.length);
    }
}
