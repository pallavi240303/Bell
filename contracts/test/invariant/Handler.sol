// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiptFixture} from "../helpers/ReceiptFixture.sol";
import {Types} from "../../src/lib/Types.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {CoverManager} from "../../src/CoverManager.sol";
import {QuoteHash} from "../../src/lib/QuoteHash.sol";

contract Handler is ReceiptFixture {
    uint256 public successfulBorrows;
    uint256 public successfulRepayments;
    uint256 public successfulReports;
    uint256 public successfulSettlements;
    uint256 public successfulTerminal;
    uint256 public successfulPosts;
    uint256 public successfulCancellations;
    uint256 public successfulClaims;
    uint256 public successfulCredits;
    uint256 public successfulRestrictions;
    uint256 public successfulSplits;
    uint256 public successfulTopups;
    uint256 public successfulCollateralAdds;
    uint256 public successfulCollateralWithdrawals;
    uint256 public invalidReports;
    uint256 public rejectedUnsafeWithdrawals;
    uint256 public rejectedUnauthenticatedClaims;
    uint256 public rejectedMissingBenchmarks;
    uint256 public rejectedInvalidPosts;
    uint256 public rejectedInvalidCancellations;
    uint256 public rejectedInvalidBorrows;
    uint256 public rejectedInvalidRepayments;
    uint256 public expectedReverts;
    uint256 public violations;
    uint256 public receipt;
    bool public reported;
    bool public normalSettled;
    bool public terminalSettled;

    function borrow() external {
        if (receipt != 0 || block.timestamp >= 1499) return;
        receipt = _borrow();
        assertEq(book.premiumCredit(BUYER), book.getOffer(ids[0]).terms.premium);
        assertEq(book.premiumCredit(OTHER_BUYER), book.getOffer(ids[1]).terms.premium);
        assertGe(book.getOffer(ids[0]).cashCapacity + book.getOffer(ids[1]).cashCapacity, vault.debtOf(receipt));
        successfulBorrows++;
    }

    function postCancel(uint256 seed) external {
        if (receipt != 0 || block.timestamp >= 1499) return;
        address buyer = seed % 2 == 0 ? BUYER : OTHER_BUYER;
        bytes32 offer = _post(buyer, bound(seed, 1e17, 1e18), 90e6);
        successfulPosts++;
        vm.prank(buyer);
        book.cancelOffer(offer);
        successfulCancellations++;
    }

    function repay(uint256 seed) external {
        if (receipt == 0 || reported || vault.debtOf(receipt) <= 10) return;
        uint256 amount = bound(seed, 1, vault.debtOf(receipt) / 10);
        _repay(receipt, PAYER, amount);
        successfulRepayments++;
    }

    function collateral(uint256 seed) external {
        if (receipt == 0 || reported || terminalSettled) return;
        uint256 shares = bound(seed, 1, 1e18);
        uint256 beforeShares = vault.remainingSnapshotShares(receipt);
        uint256 beforeBacking = vault.backingOf(receipt);
        vm.prank(PAYER);
        life.addCollateral(receipt, shares);
        assertEq(vault.remainingSnapshotShares(receipt), beforeShares + shares);
        assertEq(vault.backingOf(receipt), beforeBacking + shares);
        successfulCollateralAdds++;
        vm.prank(BORROWER);
        life.withdrawCollateral(receipt, shares);
        assertEq(vault.remainingSnapshotShares(receipt), beforeShares);
        assertEq(vault.backingOf(receipt), beforeBacking);
        successfulCollateralWithdrawals++;
    }

    function report(uint256 seed) external {
        if (receipt == 0 || reported || terminalSettled) return;
        uint128 numerator = seed % 2 == 0 ? 2 : 1;
        _benchmark(bound(seed, 50e6, 70e6) / numerator, numerator, 1);
        reported = true;
        successfulReports++;
    }

    function settle() external {
        if (!reported || normalSettled || terminalSettled) return;
        _settle(receipt, false);
        normalSettled = true;
        successfulSettlements++;
    }

    function terminal() external {
        if (receipt == 0 || terminalSettled || vault.debtOf(receipt) == 0) return;
        vm.warp(2000);
        uint256 cappedDebt = vault.debtOf(receipt);
        vm.warp(2001);
        assertEq(vault.debtOf(receipt), cappedDebt);
        _settle(receipt, true);
        terminalSettled = true;
        successfulTerminal++;
    }

    function restrictions() external {
        bytes32 beforeFinancial = receipt == 0 ? bytes32(0) : _state(receipt);
        stock.setPaused(true);
        stock.setRestricted(BUYER, true);
        if (receipt != 0) assertEq(_state(receipt), beforeFinancial);
        stock.setPaused(false);
        stock.setRestricted(BUYER, false);
        successfulRestrictions++;
    }

    function split() external {
        bytes32 beforeFinancial = receipt == 0 ? bytes32(0) : _state(receipt);
        stock.setMultiplier(2, 1);
        if (receipt != 0) assertEq(_state(receipt), beforeFinancial);
        successfulSplits++;
    }

    function withdrawClaims() external {
        for (uint256 i = 1; i < vault.nextClaimId(); ++i) {
            LoanVault.Claim memory claim = vault.getClaim(i);
            if (claim.withdrawn || claim.snapshotShares == 0) continue;
            if (claim.deliveryUnits > vault.backingOf(receipt)) continue;
            uint256 beforeBacking = vault.backingOf(receipt);
            uint256 beforeBalance = stock.balanceOf(claim.owner);
            vm.prank(claim.owner);
            try vault.withdrawClaim(i, claim.owner) returns (uint256 delivered) {
                assertEq(delivered, claim.deliveryUnits);
                assertEq(beforeBacking - vault.backingOf(receipt), delivered);
                assertEq(stock.balanceOf(claim.owner) - beforeBalance, delivered);
                successfulClaims++;
            } catch {
                violations++;
            }
        }
    }

    function topUp() external {
        if (receipt == 0) return;
        uint256 owed = vault.outstandingClaimUnits(receipt);
        uint256 backing = vault.backingOf(receipt);
        if (owed <= backing) return;
        vm.prank(PAYER);
        life.topUpBacking(receipt, owed - backing);
        successfulTopups++;
    }

    function invalidReport(uint256 seed) external {
        Types.MarketEventReport memory bad = _report(Types.MarketEventKind.CLOSE_CONFIRMED);
        bytes4 expected;
        if (seed % 3 == 0) {
            bad.chainId = block.chainid + 1;
            expected = Errors.WrongReportDomain.selector;
        } else if (seed % 3 == 1) {
            bad.validUntil = uint64(block.timestamp - 1);
            expected = Errors.ReportExpired.selector;
        } else {
            bad.nonce -= 1;
            expected = Errors.InvalidNonce.selector;
        }
        bytes32 beforeHash = oracle.assetState(ASSET).stateHash;
        try oracle.acceptReport(bad) {
            violations++;
        } catch (bytes memory reason) {
            bytes4 actual;
            if (reason.length >= 4) assembly ("memory-safe") { actual := mload(add(reason, 32)) }
            if (actual == expected) {
                expectedReverts++;
                invalidReports++;
            } else {
                violations++;
            }
        }
        assertEq(oracle.assetState(ASSET).stateHash, beforeHash);
    }

    function withdrawCredits() external {
        address[3] memory actors = [BUYER, OTHER_BUYER, BORROWER];
        for (uint256 i; i < actors.length; ++i) {
            uint256 amount = book.cashCredit(actors[i]);
            if (amount == 0) continue;
            vm.prank(actors[i]);
            try book.withdrawCashCredit(amount, actors[i]) {
                successfulCredits++;
            } catch {
                violations++;
            }
        }
    }

    function unauthorized() external {
        vm.prank(ADVERSARY);
        try pool.disburse(ADVERSARY, 1) {
            violations++;
        } catch (bytes memory reason) {
            if (keccak256(reason) == keccak256(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, ADVERSARY)))
            {
                expectedReverts++;
            } else {
                violations++;
            }
        }
    }

    function invalidPreBorrow() external {
        if (receipt != 0) return;
        uint256 locked = book.totalLockedCash();
        Types.OfferTerms memory terms = book.getOffer(ids[0]).terms;
        vm.prank(ADVERSARY);
        try book.postOffer(terms) returns (bytes32) {
            violations++;
        } catch (bytes memory reason) {
            if (_selector(reason) == Errors.IneligibleBuyer.selector) {
                expectedReverts++;
                rejectedInvalidPosts++;
            } else {
                violations++;
            }
        }
        vm.prank(ADVERSARY);
        try book.cancelOffer(ids[0]) {
            violations++;
        } catch (bytes memory reason) {
            if (_selector(reason) == Errors.NotOfferBuyer.selector) {
                expectedReverts++;
                rejectedInvalidCancellations++;
            } else {
                violations++;
            }
        }
        bytes32 digest = QuoteHash.hash(address(manager), quote, ids, hashes);
        vm.prank(ADVERSARY);
        try manager.borrowWithCover(quote, ids, hashes, digest) returns (uint256) {
            violations++;
        } catch (bytes memory reason) {
            if (_selector(reason) == CoverManager.InvalidBorrower.selector) {
                expectedReverts++;
                rejectedInvalidBorrows++;
            } else {
                violations++;
            }
        }
        assertEq(book.totalLockedCash(), locked);
        assertEq(uint8(book.getOffer(ids[0]).status), uint8(Types.OfferStatus.FREE));
    }

    function invalidActions() external {
        if (receipt == 0) return;
        bytes32 beforeState = _state(receipt);
        if (!reported && !terminalSettled) {
            vm.prank(PAYER);
            try life.repay(receipt, 0) {
                violations++;
            } catch (bytes memory reason) {
                if (_selector(reason) == Errors.InvalidDebtApplied.selector) {
                    expectedReverts++;
                    rejectedInvalidRepayments++;
                } else {
                    violations++;
                }
            }
            vm.prank(KEEPER);
            try life.settle(receipt) {
                violations++;
            } catch (bytes memory reason) {
                if (_selector(reason) == CoverManager.BenchmarkUnavailable.selector) {
                    expectedReverts++;
                    rejectedMissingBenchmarks++;
                } else {
                    violations++;
                }
            }
            vm.prank(BORROWER);
            try life.withdrawCollateral(receipt, 1) {
                violations++;
            } catch (bytes memory reason) {
                if (_selector(reason) == CoverManager.ReservedCollateral.selector) {
                    expectedReverts++;
                    rejectedUnsafeWithdrawals++;
                } else {
                    violations++;
                }
            }
        }
        if (vault.nextClaimId() > 1 && !vault.getClaim(1).withdrawn) {
            vm.prank(ADVERSARY);
            try vault.withdrawClaim(1, ADVERSARY) returns (uint256) {
                violations++;
            } catch (bytes memory reason) {
                if (_selector(reason) == LoanVault.InvalidClaim.selector) {
                    expectedReverts++;
                    rejectedUnauthenticatedClaims++;
                } else {
                    violations++;
                }
            }
        }
        assertEq(_state(receipt), beforeState);
    }

    function _selector(bytes memory reason) internal pure returns (bytes4 value) {
        if (reason.length >= 4) assembly ("memory-safe") { value := mload(add(reason, 32)) }
    }

    function checkAccounting() external view {
        assertEq(book.totalLiabilities(), cash.balanceOf(address(book)));
        if (receipt == 0) return;
        assertEq(vault.backingOf(receipt), vault.accountedBacking(address(stock)));
        assertEq(vault.backingOf(receipt), stock.balanceOf(address(vault)));
        assertEq(book.premiumCredit(BUYER), book.getOffer(ids[0]).terms.premium);
        assertEq(book.premiumCredit(OTHER_BUYER), book.getOffer(ids[1]).terms.premium);
        if (normalSettled) {
            assertEq(manager.getReceipt(receipt).benchmarkReportHash, oracle.benchmarkOf(SESSION).reportHash);
        }
        if (terminalSettled && !reported) assertEq(manager.getReceipt(receipt).benchmarkReportHash, bytes32(0));
        for (uint256 i; i < ids.length; ++i) {
            Types.Offer memory offer = book.getOffer(ids[i]);
            assertLe(offer.cumulativeCashCharged, offer.cashCapacity);
            assertEq(offer.receiptId, receipt);
            if (vault.debtOf(receipt) > 0) assertEq(uint8(offer.status), uint8(Types.OfferStatus.RESERVED));
        }
        if (vault.getDebt(receipt).closed) assertEq(vault.debtOf(receipt), 0);
    }
}
