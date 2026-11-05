// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiptFixture} from "../helpers/ReceiptFixture.sol";
import {ProtectedPoolBoundTest} from "../unit/ProtectedPool.t.sol";
import {QuoteHash} from "../../src/lib/QuoteHash.sol";

contract MaximumNavGasTest is ProtectedPoolBoundTest {}

contract BoundedOperationsTest is ReceiptFixture {
    uint256 internal constant LIMIT = 5_000_000;

    function setUp() public override {
        vm.record();
        super.setUp();
    }

    function _eight() internal {
        _clearOffers();
        for (uint256 i; i < 8; ++i) {
            ids.push(_post(i % 2 == 0 ? BUYER : OTHER_BUYER, 1e18, (67 - i) * 1e6));
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
        bytes32 digest = QuoteHash.hash(address(manager), quote, ids, hashes);
        _cool();
        vm.prank(BORROWER);
        uint256 start = gasleft();
        id = manager.borrowWithCover(quote, ids, hashes, digest);
        uint256 used = start - gasleft();
        emit log_named_uint("cold eight-fill borrowing gas", used);
        assertLt(used, LIMIT);
    }

    function testColdEightFillBorrowGas() public {
        _eightBorrow();
    }

    function testColdEightFillNormalSettlementGas() public {
        uint256 id = _eightBorrow();
        _benchmark(1, 1, 1);
        _cool();
        vm.prank(KEEPER);
        uint256 start = gasleft();
        life.settle(id);
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
        life.terminalSettle(id);
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
                    ids.push(_post(j % 2 == 0 ? BUYER : OTHER_BUYER, 1e18, (67 - j) * 1e6));
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
