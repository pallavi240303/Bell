// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiptFixture} from "../helpers/ReceiptFixture.sol";
import {ProtectedPoolBoundTest} from "../unit/ProtectedPool.t.sol";
import {QuoteHash} from "../../src/lib/QuoteHash.sol";

contract MaximumNavGasTest is ProtectedPoolBoundTest {
    function _prepareCold(uint256 operation) internal {
        uint256 snapshot = vm.snapshotState();
        vm.record();
        if (operation == 0) pool.totalAssets();
        if (operation == 1) pool.deposit(76_801);
        if (operation == 2) pool.redeem(1e12, address(this));
        if (operation == 3) manager.repayAndClose(16, address(this));
        address[4] memory targets = [address(pool), address(vault), address(manager), address(cash)];
        bytes32[][] memory reads = new bytes32[][](targets.length);
        bytes32[][] memory writes = new bytes32[][](targets.length);
        for (uint256 i; i < targets.length; ++i) {
            (reads[i], writes[i]) = vm.accesses(targets[i]);
        }
        if (operation < 3) assertGe(reads[1].length, 32);
        assertTrue(vm.revertToState(snapshot));
        for (uint256 i; i < targets.length; ++i) {
            for (uint256 j; j < reads[i].length; ++j) {
                vm.coolSlot(targets[i], reads[i][j]);
            }
            for (uint256 j; j < writes[i].length; ++j) {
                vm.coolSlot(targets[i], writes[i][j]);
            }
            vm.cool(targets[i]);
        }
    }

    function testColdThirtyTwoNav() public {
        _prepareCold(0);
        uint256 start = gasleft();
        uint256 nav = pool.totalAssets();
        uint256 used = start - gasleft();
        emit log_named_uint("recorded cold 32-loan NAV", used);
        assertEq(nav, 76_800);
        assertLt(used, 1_000_000);
    }

    function testColdThirtyTwoDeposit() public {
        _prepareCold(1);
        uint256 start = gasleft();
        uint256 shares = pool.deposit(76_801);
        uint256 used = start - gasleft();
        emit log_named_uint("recorded cold 32-loan deposit", used);
        assertEq(shares, 64_001e12);
        assertLt(used, 1_000_000);
    }

    function testColdThirtyTwoRedeem() public {
        _prepareCold(2);
        uint256 start = gasleft();
        uint256 assets = pool.redeem(1e12, address(this));
        uint256 used = start - gasleft();
        emit log_named_uint("recorded cold 32-loan redeem", used);
        assertGt(assets, 0);
        assertLt(used, 1_000_000);
    }

    function testColdThirtyTwoClosure() public {
        _prepareCold(3);
        uint256 start = gasleft();
        manager.repayAndClose(16, address(this));
        uint256 used = start - gasleft();
        emit log_named_uint("recorded cold 32-loan closure", used);
        assertEq(pool.activeReceiptIds().length, 31);
        assertLt(used, 1_000_000);
    }
}

contract BoundedOperationsTest is ReceiptFixture {
    uint256 internal constant LIMIT = 5_000_000;

    function setUp() public override {
        vm.record();
        super.setUp();
    }

    function _eight() internal {
        _clearOffers();
        for (uint256 i; i < 8; ++i) {
            address buyer = makeAddr(string.concat("gas buyer ", vm.toString(i)));
            _fund(buyer);
            ids.push(_post(buyer, 1e18, (67 - i) * 1e6));
        }
        _quote();
    }

    function _cool() internal {
        address[9] memory targets = [
            address(manager),
            address(book),
            address(pool),
            address(vault),
            address(cash),
            address(stock),
            address(oracle),
            address(registry),
            address(eligibility)
        ];
        for (uint256 i; i < targets.length; ++i) {
            (bytes32[] memory reads, bytes32[] memory writes) = vm.accesses(targets[i]);
            for (uint256 j; j < reads.length; ++j) {
                vm.coolSlot(targets[i], reads[j]);
            }
            for (uint256 j; j < writes.length; ++j) {
                vm.coolSlot(targets[i], writes[j]);
            }
            vm.cool(targets[i]);
        }
    }

    function _eightBorrow() internal returns (uint256 id) {
        _eight();
        _openOrdinary();
        bytes32 digest = QuoteHash.hash(address(manager), quote, ids, hashes);
        _cool();
        vm.prank(BORROWER);
        uint256 start = gasleft();
        id = manager.buyCover(quote.loanId, quote, ids, hashes, digest);
        uint256 used = start - gasleft();
        emit log_named_uint("cold eight-fill borrowing gas", used);
        assertLt(used, LIMIT);
    }

    function testColdEightFillBorrowGas() public {
        _eightBorrow();
    }

    function testEightFillBuyersAreDistinct() public {
        _eight();
        for (uint256 i; i < ids.length; ++i) {
            address buyer = book.getOffer(ids[i]).buyer;
            assertTrue(eligibility.isEligible(ASSET, buyer, POLICY));
            assertGt(cash.balanceOf(buyer), 0);
            assertGt(cash.allowance(buyer, address(book)), 0);
            for (uint256 j; j < i; ++j) {
                assertTrue(book.getOffer(ids[i]).buyer != book.getOffer(ids[j]).buyer);
            }
        }
    }

    function testColdEightFillNormalSettlementGas() public {
        uint256 id = _eightBorrow();
        _benchmark(1, 1, 1);
        _cool();
        vm.prank(KEEPER);
        uint256 start = gasleft();
        manager.settle(id);
        uint256 used = start - gasleft();
        emit log_named_uint("cold eight-fill normal settlement gas", used);
        assertLt(used, LIMIT);
        assertGt(book.getOffer(ids[7]).cumulativeCashCharged, 0);
    }

    function testColdEightFillTerminalSettlementGas() public {
        uint256 id = _eightBorrow();
        vm.warp(2000);
        _cool();
        vm.prank(KEEPER);
        uint256 start = gasleft();
        manager.terminalSettle(id);
        uint256 used = start - gasleft();
        emit log_named_uint("cold eight-fill terminal settlement gas", used);
        assertLt(used, LIMIT);
        assertGt(book.getOffer(ids[7]).cumulativeCashCharged, 0);
    }

    function testColdManagerClosureAtThirtyTwoActiveReceipts() public {
        cash.mint(LENDER, 20_000e6);
        vm.prank(LENDER);
        pool.deposit(20_000e6);
        _clearOffers();
        uint256 first;
        for (uint256 i; i < 32; ++i) {
            delete ids;
            if (i == 0) {
                for (uint256 j; j < 8; ++j) {
                    address buyer = makeAddr(string.concat("gas buyer ", vm.toString(j)));
                    _fund(buyer);
                    ids.push(_post(buyer, 1e18, (67 - j) * 1e6));
                }
            } else {
                ids.push(_post(BUYER, 5e18, 100e6));
                ids.push(_post(OTHER_BUYER, 5e18, 90e6));
            }
            _quote();
            quote.borrowerNonce = manager.borrowerNonce(BORROWER);
            uint256 id = _borrow();
            if (i == 0) first = id;
        }
        assertEq(pool.activeReceiptIds().length, 32);
        uint256 debt = vault.debtOf(first);
        _cool();
        vm.prank(PAYER);
        uint256 start = gasleft();
        life.repay(first, debt);
        uint256 used = start - gasleft();
        emit log_named_uint("cold 32-receipt eight-fill manager repayment and closure gas", used);
        assertLt(used, LIMIT);
        assertEq(pool.activeReceiptIds().length, 31);
        assertEq(vault.debtOf(first), 0);
    }
}
