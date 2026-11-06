// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FixedPointMath} from "../../src/lib/FixedPointMath.sol";
import {InterestMath} from "../../src/lib/InterestMath.sol";
import {SettlementMath} from "../../src/lib/SettlementMath.sol";
import {QuoteHash} from "../../src/lib/QuoteHash.sol";
import {Types} from "../../src/lib/Types.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {LoanManager} from "../../src/LoanManager.sol";
import {LiquidationMath} from "../../src/lib/LiquidationMath.sol";
import {CoverManager} from "../../src/CoverManager.sol";
import {CommitmentBook} from "../../src/CommitmentBook.sol";
import {ReceiptFixture} from "../helpers/ReceiptFixture.sol";

import {ConversionInspectionHarness} from "../helpers/ConversionInspectionHarness.sol";

contract EngineMathHarness {
    function evaluate(uint256 op, bytes memory data) external view returns (bytes memory) {
        if (op < 2) {
            (uint256 x, uint256 y, uint256 d) = abi.decode(data, (uint256, uint256, uint256));
            return abi.encode(op == 0 ? FixedPointMath.mulDivDown(x, y, d) : FixedPointMath.mulDivUp(x, y, d));
        }
        if (op == 2) {
            (uint256 p, uint32 r, uint64 s, uint64 end, uint64 now_, uint256 den, uint256 reduction) =
                abi.decode(data, (uint256, uint32, uint64, uint64, uint64, uint256, uint256));
            return abi.encode(InterestMath.debt(p, r, s, end, now_, den, reduction));
        }
        if (op == 3) {
            (uint256 old_, uint256 next, uint256 strike) = abi.decode(data, (uint256, uint256, uint256));
            return abi.encode(SettlementMath.cashDelta(old_, next, strike));
        }
        if (op == 4) {
            (uint256 old_, uint256 total, uint256 strike, uint256 target) =
                abi.decode(data, (uint256, uint256, uint256, uint256));
            (uint256 shares, uint256 cash) = SettlementMath.minimumSharesForCash(old_, total, strike, target);
            return abi.encode(shares, cash);
        }
        if (op == 5) {
            (uint256 d, uint256 c, uint256 p, uint16 trigger, uint16 target, SettlementMath.LotState[] memory lots) =
                abi.decode(data, (uint256, uint256, uint256, uint16, uint16, SettlementMath.LotState[]));
            return abi.encode(SettlementMath.planNormal(d, c, p, trigger, target, lots));
        }
        if (op == 7) {
            (address manager, QuoteHash.Quote memory q, bytes32[] memory ids, bytes32[] memory hashes) =
                abi.decode(data, (address, QuoteHash.Quote, bytes32[], bytes32[]));
            return abi.encode(QuoteHash.hash(manager, q, ids, hashes));
        }
        revert("unknown op");
    }
}

abstract contract EngineBatch is Test {
    struct Request {
        uint256 op;
        bytes input;
    }

    struct Result {
        bool ok;
        bytes data;
    }

    function _batch(Request[] memory requests) internal returns (Result[] memory results) {
        // A single argument is bounded below OS ARG_MAX by using fixed-size batches.
        string[] memory command = new string[](5);
        command[0] = "node";
        command[1] = "--import";
        command[2] = "tsx";
        command[3] = "engine/cli.ts";
        command[4] = string.concat("--ffi=", vm.toString(abi.encode(block.chainid, requests)));
        return abi.decode(vm.ffi(command), (Result[]));
    }
}

contract EngineDiffTest is EngineBatch {
    uint256 internal constant SEED = 0xB31110;
    EngineMathHarness internal harness = new EngineMathHarness();

    function testOrdinaryWideDebtExact() public {
        Request[] memory requests = new Request[](1);
        uint256 p = type(uint128).max;
        requests[0] = Request(13, abi.encode(p, uint32(10000), uint64(0), uint64(2), uint256(1), p));
        Result[] memory results = _batch(requests);
        assertTrue(results[0].ok);
        assertEq(results[0].data, abi.encode(InterestMath.debtWide(p, 10000, 0, 2, 1, p)));
    }

    function testSeededExactMathErrorsAndPlans1200Cases() public {
        uint256 random = SEED;
        for (uint256 batch; batch < 12; ++batch) {
            Request[] memory requests = new Request[](100);
            for (uint256 i; i < requests.length; ++i) {
                random = uint256(keccak256(abi.encode(random)));
                uint256 index = batch * 100 + i;
                uint256 op = index % 6;
                bytes memory data;
                if (op < 2) {
                    uint256 denominator = index % 11 == 0 ? 0 : (random >> 128) + 1;
                    data = abi.encode(random, index % 5 == 0 ? type(uint256).max : random >> 192, denominator);
                } else if (op == 2) {
                    data = abi.encode(
                        index % 13 == 0 ? uint256(type(uint128).max) + 1 : random % 1e12,
                        uint32(index % 17 == 0 ? 10001 : random % 10001),
                        uint64(100),
                        uint64(index % 19 == 0 ? 99 : 1000),
                        uint64(random % 2000),
                        index % 23 == 0 ? 0 : uint256(315_360_000_000),
                        random % 1e10
                    );
                } else if (op == 3) {
                    uint256 old_ = random % 1e18;
                    data = abi.encode(
                        old_,
                        index % 7 == 0 ? old_ - 1 : old_ + random % 1e18,
                        index % 13 == 0 ? uint256(type(uint96).max) + 1 : random % 1e12
                    );
                } else if (op == 4) {
                    data = abi.encode(
                        random % 1e18,
                        index % 7 == 0 ? 0 : uint256(2e18),
                        index % 11 == 0 ? 0 : random % 1e12 + 1,
                        random % 1e12
                    );
                } else {
                    SettlementMath.LotState[] memory lots = new SettlementMath.LotState[](index % 19 == 0 ? 9 : 2);
                    for (uint256 j; j < lots.length; ++j) {
                        lots[j] = SettlementMath.LotState(
                            index % 17 == 0 ? 0 : 100e6 - j * 1e6, 5e18, index % 23 == 0 ? 6e18 : random % 1e17
                        );
                    }
                    data = abi.encode(
                        random % 1_200e6,
                        uint256(10e18),
                        index % 4 == 1 ? 0 : random % 150e6,
                        uint16(7500),
                        uint16(index % 11 == 0 ? 0 : 6500),
                        lots
                    );
                }
                requests[i] = Request(op, data);
            }
            Result[] memory results = _batch(requests);
            assertEq(results.length, requests.length);
            for (uint256 i; i < requests.length; ++i) {
                (bool ok, bytes memory result) =
                    address(harness).staticcall(abi.encodeCall(harness.evaluate, (requests[i].op, requests[i].input)));
                if (ok) result = abi.decode(result, (bytes));
                assertEq(results[i].ok, ok, vm.toString(batch * 100 + i));
                assertEq(results[i].data, result, vm.toString(batch * 100 + i));
            }
        }
    }
}

contract EngineLifecycleDiffTest is ReceiptFixture, EngineBatch {
    struct BookSnapshot {
        uint256 chainId;
        address book_;
        address manager_;
        address pool_;
        bytes32[] ids_;
        address[] buyers;
        uint256[] nonces;
        Types.Offer[] offers;
        bytes32[] termsHashes;
        bool[] used;
        uint256[3] totals;
        address[] actors;
        uint256[4][] balances;
    }

    struct BookStep {
        uint256 kind;
        address caller;
        uint256 now_;
        bytes32 id;
        Types.OfferTerms terms;
        bool eligible;
        bytes32 termsHash;
        uint256 receiptId;
        address payer;
        uint64 deadline;
        uint256 referencePrice;
        uint16 ltv;
        uint256 cumulative;
        uint256 applied;
        address borrower;
    }

    function _bookSnapshot(CommitmentBook b, bytes32[] memory offerIds) internal view returns (BookSnapshot memory s) {
        s.chainId = block.chainid;
        s.book_ = address(b);
        s.manager_ = address(this);
        s.pool_ = address(pool);
        s.ids_ = offerIds;
        s.buyers = new address[](2);
        s.nonces = new uint256[](2);
        s.offers = new Types.Offer[](2);
        s.termsHashes = new bytes32[](2);
        s.used = new bool[](2);
        for (uint256 i; i < 2; ++i) {
            s.buyers[i] = BUYER;
            s.nonces[i] = 70 + i;
            s.offers[i] = b.getOffer(offerIds[i]);
            s.termsHashes[i] = b.termsHashOf(offerIds[i]);
            s.used[i] = b.nonceUsed(BUYER, 70 + i);
        }
        s.totals = [b.totalLockedCash(), b.totalPremiumCredits(), b.totalCashCredits()];
        s.actors = new address[](5);
        s.actors[0] = BUYER;
        s.actors[1] = BORROWER;
        s.actors[2] = PAYER;
        s.actors[3] = address(b);
        s.actors[4] = address(pool);
        s.balances = new uint256[4][](5);
        for (uint256 i; i < 5; ++i) {
            address who = s.actors[i];
            s.balances[i] =
                [cash.balanceOf(who), b.premiumCredit(who), b.cashCredit(who), cash.allowance(who, address(b))];
        }
    }

    function testActualOfferLifecycleObservableStateAndRollback() public {
        CommitmentBook b = new CommitmentBook(address(cash), address(eligibility), address(this));
        b.initialize(address(this), address(pool));
        vm.prank(BUYER);
        cash.approve(address(b), type(uint256).max);
        vm.prank(BORROWER);
        cash.approve(address(b), 1000);
        bytes32[] memory offerIds = new bytes32[](2);
        offerIds[0] = b.computeOfferId(BUYER, 70);
        offerIds[1] = b.computeOfferId(BUYER, 71);
        Request[] memory requests = new Request[](20);
        Observation[] memory expected = new Observation[](20);
        for (uint256 i; i < 20; ++i) {
            BookStep memory a;
            a.caller = address(this);
            a.now_ = block.timestamp;
            a.id = offerIds[i < 5 ? 0 : 1];
            a.eligible = true;
            a.terms = Types.OfferTerms(ASSET, POLICY, 5e18, 100e6, 100, 6000, 100e6, 0, 2000, i < 5 ? 70 : 71);
            a.termsHash = b.termsHashOf(a.id);
            a.receiptId = 1;
            a.payer = BORROWER;
            a.deadline = 2000;
            a.referencePrice = 100e6;
            a.ltv = 5000;
            a.borrower = BORROWER;
            if (i < 2 || i == 5 || i == 19) {
                a.kind = 0;
                a.caller = BUYER;
            } else if (i == 2 || i == 3 || i == 18) {
                a.kind = 1;
                a.caller = i == 2 ? PAYER : BUYER;
            } else if (i == 4 || (i >= 6 && i <= 12)) {
                a.kind = 2;
            } else if (i >= 13 && i <= 15) {
                a.kind = 3;
            } else {
                a.kind = 4;
            }
            if (i == 6) a.caller = BUYER;
            if (i == 7) a.termsHash = bytes32(uint256(1));
            if (i == 8) a.deadline = 2001;
            if (i == 9) a.ltv = 6001;
            if (i == 10) a.referencePrice = 200e6;
            if (i == 11) a.eligible = false;
            if (i == 14) {
                a.cumulative = 1e18;
                a.applied = 90e6;
            }
            if (i == 15) {
                a.cumulative = 2e18;
                a.applied = 100e6;
            }
            if (i == 19) {
                a.terms.expiry = uint64(block.timestamp);
                a.eligible = false;
            }
            eligibility.setEligible(ASSET, BUYER, POLICY, a.eligible);
            BookSnapshot memory before_ = _bookSnapshot(b, offerIds);
            requests[i] = Request(12, abi.encode(before_, a));
            bytes memory data;
            if (a.kind == 0) {
                data = abi.encodeCall(b.postOffer, (a.terms));
            } else if (a.kind == 1) {
                data = abi.encodeCall(b.cancelOffer, (a.id));
            } else if (a.kind == 2) {
                data = abi.encodeCall(
                    b.reserveOffer, (a.id, a.termsHash, a.receiptId, a.payer, a.deadline, a.referencePrice, a.ltv)
                );
            } else if (a.kind == 3) {
                data = abi.encodeCall(b.exerciseOffer, (a.id, a.cumulative, a.applied, a.borrower));
            } else {
                data = abi.encodeCall(b.releaseOffer, (a.id));
            }
            vm.prank(a.caller);
            (bool ok, bytes memory returned) = address(b).call(data);
            bytes32 afterHash = keccak256(abi.encode(_bookSnapshot(b, offerIds)));
            if (!ok) assertEq(afterHash, keccak256(abi.encode(before_)), "real book rollback");
            expected[i] = Observation(ok, ok ? bytes("") : returned, afterHash);
        }
        Result[] memory results = _batch(requests);
        for (uint256 i; i < 20; ++i) {
            assertTrue(results[i].ok);
            Observation memory actual = abi.decode(results[i].data, (Observation));
            assertEq(actual.ok, expected[i].ok, vm.toString(i));
            assertEq(actual.error, expected[i].error, vm.toString(i));
            assertEq(actual.stateHash, expected[i].stateHash, vm.toString(i));
        }
    }

    struct Position {
        LoanManager.Loan loan;
        LoanVault.DebtRecord debt;
        uint256 remainingShares;
        uint256 backing;
        uint256 outstandingUnits;
        uint64 activeCoverDeadline;
        uint64 opensAt;
        uint64 cutoffAt;
    }

    struct MarketFacts {
        bool configFound;
        bytes32 configAssetId;
        uint64 configVersion;
        Types.AssetConfig config;
        uint64 effectiveAt;
        bytes32 configHash;
        uint8 tokenDecimals;
        uint8 cashDecimals;
        bool bindingsMatch;
        bool halted;
        uint8 phase;
        uint64 scheduledOpen;
        uint64 scheduledClose;
        bytes32 sessionAssetId;
        bytes32 activeSessionId;
        bytes32 sessionConfigHash;
        bytes32 stateConfigHash;
        bytes32 scheduledReportHash;
        bytes32 actionHash;
        uint128 actionN;
        uint128 actionD;
        bool referenceInvalidated;
        Types.ReferencePriceFact referenceFact;
        bool[] eligible;
    }

    struct CoverFacts {
        address caller;
        uint256 borrowerNonce;
        uint256 chainId;
        address manager;
        bytes32 expectedHash;
        uint8 profile;
        uint64 opensOffset;
        uint64 cutoffOffset;
        uint256 loanId;
        uint256 receiptId;
        Position position;
        MarketFacts market;
    }

    function _position(uint256 id) internal view returns (Position memory p) {
        p.loan = loans.getLoan(id);
        p.debt = vault.getDebt(id);
        p.remainingShares = vault.remainingSnapshotShares(id);
        p.backing = vault.backingOf(id);
        p.outstandingUnits = vault.outstandingClaimUnits(id);
        p.activeCoverDeadline = vault.activeCoverDeadline(id);
        p.opensAt = loans.coverWindowOpensAt(id);
        p.cutoffAt = loans.coverWindowCutoffAt(id);
    }

    function _market() internal view returns (MarketFacts memory f) {
        Types.AssetState memory state = oracle.assetState(ASSET);
        Types.SessionFact memory session = oracle.sessionFact(state.activeSessionId);
        Types.CorporateActionFact memory action = oracle.latestCorporateAction(ASSET);
        (f.config, f.effectiveAt, f.configHash) = registry.getConfig(ASSET, quote.configVersion);
        f.configFound = true;
        f.configAssetId = ASSET;
        f.configVersion = quote.configVersion;
        f.tokenDecimals = 18;
        f.cashDecimals = 6;
        f.bindingsMatch = true;
        f.halted = state.halted;
        f.phase = uint8(session.phase);
        f.scheduledOpen = session.scheduledOpen;
        f.scheduledClose = session.scheduledClose;
        f.sessionAssetId = session.assetId;
        f.activeSessionId = state.activeSessionId;
        f.sessionConfigHash = session.configHash;
        f.stateConfigHash = state.configHash;
        f.scheduledReportHash = session.scheduledReportHash;
        f.actionHash = action.reportHash;
        f.actionN = action.multiplierNumerator;
        f.actionD = action.multiplierDenominator;
        f.referenceFact = oracle.latestReference(ASSET);
        (bool ok, bytes memory reason) =
            address(oracle).staticcall(abi.encodeCall(oracle.requireFreshReference, (ASSET)));
        f.referenceInvalidated =
            !ok && keccak256(reason) == keccak256(abi.encodeWithSelector(Errors.ReferenceUnavailable.selector, ASSET));
        f.eligible = new bool[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            f.eligible[i] =
                eligibility.isEligible(ASSET, book.getOffer(ids[i]).buyer, book.getOffer(ids[i]).terms.policyHash);
        }
    }

    function _borrowFacts(address caller, bytes32 expectedHash) internal view returns (CoverFacts memory f) {
        f.caller = caller;
        f.borrowerNonce = manager.borrowerNonce(caller);
        f.chainId = block.chainid;
        f.manager = address(manager);
        f.expectedHash = expectedHash;
        f.profile = uint8(manager.profile());
        f.opensOffset = manager.coverOpensBeforeClose();
        f.cutoffOffset = manager.coverCutoffBeforeClose();
        f.loanId = quote.loanId;
        f.receiptId = manager.nextReceiptId();
        f.position = _position(quote.loanId);
        f.market = _market();
    }

    function testValidateBorrowAgainstRealManagerAndValidationPrecedence() public {
        _openOrdinary();
        uint256 checkpoint = vm.snapshotState();
        Request[] memory requests = new Request[](16);
        Result[] memory expected = new Result[](16);
        for (uint256 i; i < 16; ++i) {
            assertTrue(vm.revertToState(checkpoint));
            address caller = BORROWER;
            if (i == 1) {
                caller = PAYER;
                quote.borrowerNonce = 9;
                quote.expiry = 0;
            }
            if (i == 2) {
                quote.borrowerNonce = 9;
                quote.expiry = 0;
            }
            if (i == 3) {
                quote.recipient = address(0);
                quote.expiry = 0;
            }
            if (i == 4) quote.expiry = 0;
            if (i == 6) vm.warp(1000);
            if (i == 7) {
                Types.MarketEventReport memory halt = _report(Types.MarketEventKind.HALT);
                halt.halted = true;
                oracle.acceptReport(halt);
            }
            if (i == 8) quote.principal = 0;
            if (i == 9) quote.collateralShares = 0;
            if (i == 10) quote.referencePrice = 0;
            if (i == 11) quote.principal = 700e6;
            if (i == 12) quote.maxSettlementDeadline = 1999;
            if (i == 13) hashes[0] = bytes32(uint256(1));
            if (i == 14) {
                (ids[0], ids[1]) = (ids[1], ids[0]);
                (hashes[0], hashes[1]) = (hashes[1], hashes[0]);
            }
            if (i == 15) quote.totalPremium += 1;
            bytes32 digest = i == 5 ? bytes32(0) : QuoteHash.hash(address(manager), quote, ids, hashes);
            Types.Offer[] memory offers = new Types.Offer[](ids.length);
            bytes32[] memory actualHashes = new bytes32[](ids.length);
            for (uint256 j; j < ids.length; ++j) {
                offers[j] = book.getOffer(ids[j]);
                actualHashes[j] = book.termsHashOf(ids[j]);
            }
            requests[i] = Request(
                11, abi.encode(quote, ids, hashes, offers, actualHashes, block.timestamp, _borrowFacts(caller, digest))
            );
            vm.prank(caller);
            (bool ok, bytes memory returned) =
                address(manager).call(abi.encodeCall(manager.buyCover, (quote.loanId, quote, ids, hashes, digest)));
            if (ok) returned = abi.encode(manager.getReceipt(abi.decode(returned, (uint256))));
            expected[i] = Result(ok, returned);
        }
        Result[] memory actual = _batch(requests);
        for (uint256 i; i < actual.length; ++i) {
            assertEq(actual[i].ok, expected[i].ok, vm.toString(i));
            assertEq(actual[i].data, expected[i].data, vm.toString(i));
        }
    }

    function testSeededCanonicalQuoteAndOfferHashes100Cases() public {
        EngineMathHarness mathHarness = new EngineMathHarness();
        for (uint256 domain; domain < 2; ++domain) {
            vm.chainId(31 + domain);
            Request[] memory requests = new Request[](52);
            bytes[] memory expected = new bytes[](52);
            for (uint256 i; i < 50; ++i) {
                bytes memory encoded = abi.encode(quote);
                uint256 wordIndex = i % 25;
                assembly ("memory-safe") {
                    let ptr := add(add(encoded, 32), mul(wordIndex, 32))
                    mstore(ptr, add(mload(ptr), 1))
                }
                QuoteHash.Quote memory changed = abi.decode(encoded, (QuoteHash.Quote));
                bytes32[] memory ordered = new bytes32[](i % 4);
                for (uint256 j; j < ordered.length; ++j) {
                    ordered[j] = keccak256(abi.encode(uint256(0xA81110), i, j));
                }
                bytes memory input = abi.encode(address(uint160(i + 1)), changed, ordered, hashes);
                requests[i] = Request(7, input);
                expected[i] = mathHarness.evaluate(7, input);
            }
            for (uint256 i; i < 2; ++i) {
                Types.Offer memory offer = book.getOffer(ids[i]);
                requests[50 + i] = Request(8, abi.encode(address(book), offer));
                bytes32 identity = book.computeOfferId(offer.buyer, offer.terms.nonce);
                expected[50 + i] =
                    abi.encode(identity, keccak256(abi.encode(identity, offer.buyer, offer.terms, offer.cashCapacity)));
            }
            Result[] memory results = _batch(requests);
            for (uint256 i; i < results.length; ++i) {
                assertTrue(results[i].ok);
                assertEq(results[i].data, expected[i], vm.toString(i));
            }
        }
    }

    function testSeededClaimConversion100CasesAgainstRealVault() public {
        ConversionInspectionHarness conversion = new ConversionInspectionHarness();
        Request[] memory requests = new Request[](100);
        Result[] memory expected = new Result[](100);
        uint256 random = 0xC01110;
        for (uint256 i; i < 100; ++i) {
            random = uint256(keccak256(abi.encode(random)));
            uint256 amount = i % 10 == 0 ? uint256(1) << 120 : random % 1e18 + 1;
            uint128 snapN = uint128(i % 10 == 0 ? uint256(1) << 120 : random % 97 + 1);
            uint128 snapD = uint128(i % 10 == 0 ? uint256(1) << 120 : random % 89 + 1);
            uint128 reportN = uint128(i % 10 == 0 ? uint256(1) << 120 : random % 83 + 1);
            uint128 reportD = uint128(i % 10 == 0 ? uint256(1) << 120 : random % 79 + 1);
            if (i % 17 == 0) reportN = 0;
            (bool ok, bytes memory returned) =
                address(conversion).call(abi.encodeCall(conversion.inspect, (amount, snapN, snapD, reportN, reportD)));
            expected[i] = Result(ok, returned);
            requests[i] = Request(6, abi.encode(amount, snapN, snapD, reportN, reportD));
        }
        Result[] memory results = _batch(requests);
        for (uint256 i; i < results.length; ++i) {
            assertEq(results[i].ok, expected[i].ok);
            assertEq(results[i].data, expected[i].data, vm.toString(i));
        }
    }

    struct LoanEntry {
        uint256 id;
        Position position;
        uint256 debtNow;
    }

    struct ReceiptEntry {
        uint256 id;
        CoverManager.Receipt receipt;
    }

    struct OfferEntry {
        bytes32 id;
        Types.Offer offer;
        bytes32 termsHash;
    }

    struct ClaimEntry {
        uint256 id;
        LoanVault.Claim claim;
    }

    struct StockEntry {
        address token;
        uint256 accounted;
        uint256[2][] balances;
    }

    struct Snapshot {
        LoanEntry[] loans;
        ReceiptEntry[] receipts;
        OfferEntry[] offers;
        ClaimEntry[] claims;
        uint256[12] counters;
        address[5] components;
        address[] actors;
        uint256[7][] balances;
        StockEntry[] stocks;
        uint256[] activeIds;
    }

    struct Step {
        uint256 kind;
        uint256 now_;
        address caller;
        uint256 loanId;
        uint256 receiptId;
        uint256 amount;
        uint256 claimId;
        address to;
        Types.Benchmark benchmark;
        MarketFacts market;
        LoanManager.BorrowRequest request;
        QuoteHash.Quote quote;
        bytes32[] offerIds;
        bytes32[] termsHashes;
        bytes32 expectedHash;
        bool paused;
        bool cashCallback;
    }

    struct Observation {
        bool ok;
        bytes error;
        bytes32 stateHash;
    }

    function _snapshot(uint256) internal view returns (Snapshot memory s) {
        s.loans = new LoanEntry[](loans.nextLoanId() - 1);
        for (uint256 i; i < s.loans.length; ++i) {
            s.loans[i] = LoanEntry(i + 1, _position(i + 1), vault.debtOf(i + 1));
        }
        s.receipts = new ReceiptEntry[](manager.nextReceiptId() - 1);
        uint256 offerCount = ids.length;
        for (uint256 i; i < s.receipts.length; ++i) {
            s.receipts[i] = ReceiptEntry(i + 1, manager.getReceipt(i + 1));
            offerCount += s.receipts[i].receipt.offerIds.length;
        }
        bytes32[] memory all = new bytes32[](offerCount);
        uint256 count;
        for (uint256 i; i < ids.length; ++i) {
            all[count++] = ids[i];
        }
        for (uint256 i; i < s.receipts.length; ++i) {
            for (uint256 j; j < s.receipts[i].receipt.offerIds.length; ++j) {
                bytes32 key = s.receipts[i].receipt.offerIds[j];
                bool found;
                for (uint256 k; k < count; ++k) {
                    if (all[k] == key) found = true;
                }
                if (!found) all[count++] = key;
            }
        }
        s.offers = new OfferEntry[](count);
        for (uint256 i; i < count; ++i) {
            s.offers[i] = OfferEntry(all[i], book.getOffer(all[i]), book.termsHashOf(all[i]));
        }
        s.claims = new ClaimEntry[](vault.nextClaimId() - 1);
        for (uint256 i; i < s.claims.length; ++i) {
            s.claims[i] = ClaimEntry(i + 1, vault.getClaim(i + 1));
        }
        s.counters = [
            block.chainid,
            uint256(manager.profile()),
            uint256(manager.coverOpensBeforeClose()),
            uint256(manager.coverCutoffBeforeClose()),
            loans.nextLoanId(),
            manager.nextReceiptId(),
            vault.nextClaimId(),
            book.totalLockedCash(),
            book.totalPremiumCredits(),
            book.totalCashCredits(),
            pool.totalSupply(),
            pool.totalAssets()
        ];
        s.components = [address(pool), address(book), address(vault), address(manager), address(loans)];
        s.actors = new address[](9);
        s.actors[0] = BORROWER;
        s.actors[1] = PAYER;
        s.actors[2] = BUYER;
        s.actors[3] = OTHER_BUYER;
        s.actors[4] = LENDER;
        s.actors[5] = address(pool);
        s.actors[6] = address(book);
        s.actors[7] = address(vault);
        s.actors[8] = address(cash);
        s.balances = new uint256[7][](s.actors.length);
        s.stocks = new StockEntry[](1);
        s.stocks[0].token = address(stock);
        s.stocks[0].accounted = vault.accountedBacking(address(stock));
        s.stocks[0].balances = new uint256[2][](s.actors.length);
        for (uint256 i; i < s.actors.length; ++i) {
            address who = s.actors[i];
            s.balances[i] = [
                cash.balanceOf(who),
                book.premiumCredit(who),
                book.cashCredit(who),
                pool.balanceOf(who),
                cash.allowance(who, address(loans)),
                cash.allowance(who, address(book)),
                manager.borrowerNonce(who)
            ];
            s.stocks[0].balances[i] = [stock.balanceOf(who), stock.allowance(who, address(vault))];
        }
        s.activeIds = pool.activeReceiptIds();
    }

    function _prepareStep(uint256 id, Step memory step) internal view {
        step.loanId = id;
        step.receiptId = id;
        step.market = _market();
    }

    function _step(uint256, Step memory step) internal returns (Observation memory result) {
        vm.warp(step.now_);
        stock.setPaused(step.paused);
        cash.setTransferFromHook(
            step.cashCallback ? address(pool) : address(0),
            step.cashCallback ? abi.encodeCall(pool.totalAssets, ()) : bytes("")
        );
        cash.setTransferHook(
            step.cashCallback ? address(pool) : address(0),
            step.cashCallback ? abi.encodeCall(pool.totalAssets, ()) : bytes("")
        );
        bytes memory callData;
        address target = address(loans);
        if (step.kind == 0) {
            callData = abi.encodeCall(loans.repay, (step.loanId, step.amount));
        } else if (step.kind == 1) {
            callData = abi.encodeCall(loans.addCollateral, (step.loanId, step.amount));
        } else if (step.kind == 2) {
            callData = abi.encodeCall(loans.withdrawCollateral, (step.loanId, step.amount));
        } else if (step.kind == 3) {
            target = address(manager);
            callData = abi.encodeCall(manager.settle, (step.receiptId));
        } else if (step.kind == 4) {
            target = address(manager);
            callData = abi.encodeCall(manager.terminalSettle, (step.receiptId));
        } else if (step.kind == 5) {
            callData = abi.encodeCall(loans.topUpBacking, (step.loanId, step.amount));
        } else if (step.kind == 6) {
            callData = abi.encodeCall(loans.finalizeHandoff, (step.loanId));
        } else if (step.kind == 7) {
            target = address(vault);
            callData = abi.encodeCall(vault.withdrawClaim, (step.claimId, step.to));
        } else if (step.kind == 8) {
            target = address(book);
            callData = abi.encodeCall(book.withdrawPremium, (step.amount, step.to));
        } else if (step.kind == 9) {
            target = address(book);
            callData = abi.encodeCall(book.withdrawCashCredit, (step.amount, step.to));
        } else if (step.kind == 10) {
            callData = abi.encodeCall(loans.borrow, (step.request));
        } else if (step.kind == 11) {
            target = address(manager);
            callData = abi.encodeCall(
                manager.buyCover, (step.loanId, step.quote, step.offerIds, step.termsHashes, step.expectedHash)
            );
        } else if (step.kind == 12) {
            callData = abi.encodeCall(loans.liquidate, (step.loanId, step.amount));
        } else {
            revert("unsupported trace action");
        }
        vm.prank(step.caller);
        (result.ok, result.error) = target.call(callData);
        if (result.ok) result.error = "";
        result.stateHash = keccak256(abi.encode(_snapshot(0)));
    }

    function testAllowanceAndTokenFailurePrecedenceFullStateRegressions() public {
        uint256 checkpoint = vm.snapshotState();
        Request[] memory requests = new Request[](12);
        Observation[][] memory expected = new Observation[][](12);
        for (uint256 i; i < 12; ++i) {
            assertTrue(vm.revertToState(checkpoint));
            uint256 id = _borrow();
            vm.startPrank(PAYER);
            stock.approve(address(vault), i % 3 == 0 ? 0 : i % 3 == 1 ? 6 : type(uint256).max);
            cash.approve(address(loans), i == 6 || i == 10 ? 3 : type(uint256).max);
            vm.stopPrank();
            Snapshot memory before_ = _snapshot(id);
            Step[] memory steps = new Step[](3);
            expected[i] = new Observation[](3);
            for (uint256 j; j < 3; ++j) {
                steps[j].kind = i < 3 ? 1 : i < 6 ? 5 : 0;
                steps[j].now_ = 1002;
                steps[j].caller = i == 8 ? address(pool) : PAYER;
                steps[j].amount = j == 0 ? 4 : j == 1 ? 3 : 2;
                steps[j].to = PAYER;
                steps[j].paused = i < 6 && j == 1;
                steps[j].cashCallback = i >= 8;
                _prepareStep(id, steps[j]);
                expected[i][j] = _step(id, steps[j]);
            }
            requests[i] = Request(10, abi.encode(before_, steps));
        }
        Result[] memory results = _batch(requests);
        for (uint256 i; i < 12; ++i) {
            assertTrue(results[i].ok);
            Observation[] memory actual = abi.decode(results[i].data, (Observation[]));
            for (uint256 j; j < 3; ++j) {
                string memory label = string.concat(vm.toString(i), "/", vm.toString(j));
                assertEq(actual[j].ok, expected[i][j].ok, label);
                assertEq(actual[j].error, expected[i][j].error, label);
                assertEq(actual[j].stateHash, expected[i][j].stateHash, label);
            }
        }
    }

    function testSeededLifecycleFullObservableStateAndReceiptConstruction() public {
        uint256 checkpoint = vm.snapshotState();
        for (uint256 i; i < 24; ++i) {
            assertTrue(vm.revertToState(checkpoint));
            this.runSeededLifecycleCase(i);
        }
    }

    function runSeededLifecycleCase(uint256 scenarioIndex) external {
        uint256 random = 0xC1A110 + scenarioIndex;
        uint256 checkpoint = vm.snapshotState();
        // 24 independent scenarios, each compared after all 20 operations, including reverts.
        {
            uint256 batch = scenarioIndex;
            Request[] memory requests = new Request[](2);
            Observation[][] memory observations = new Observation[][](1);
            bytes[] memory receipts = new bytes[](1);
            for (uint256 row; row < 1; ++row) {
                assertTrue(vm.revertToState(checkpoint));
                random = uint256(keccak256(abi.encode(random)));
                uint256 scenario = batch + row;
                quote.principal = 100e6 + random % 450e6;
                quote.borrowerNonce = 0;
                Types.Offer[] memory freeOffers = new Types.Offer[](ids.length);
                for (uint256 j; j < ids.length; ++j) {
                    freeOffers[j] = book.getOffer(ids[j]);
                }
                _openOrdinary();
                bytes memory construction = abi.encode(
                    quote,
                    _config(1),
                    ids,
                    hashes,
                    freeOffers,
                    hashes,
                    QuoteHash.hash(address(manager), quote, ids, hashes),
                    block.timestamp,
                    _borrowFacts(BORROWER, QuoteHash.hash(address(manager), quote, ids, hashes))
                );
                uint256 id = _buy();
                vm.warp(block.timestamp + 1);
                receipts[row] = abi.encode(manager.getReceipt(id));
                requests[row * 2] = Request(9, construction);
                Snapshot memory before_ = _snapshot(id);
                _benchmark(1 + random % 120e6, uint128(scenario % 3 == 0 ? 2 : 1), uint128(scenario % 5 == 0 ? 10 : 1));
                Types.Benchmark memory benchmark = oracle.benchmarkOf(SESSION);
                Step[] memory steps = new Step[](20);
                for (uint256 j; j < steps.length; ++j) {
                    steps[j].now_ = 1501;
                    steps[j].caller = PAYER;
                    steps[j].to = PAYER;
                    steps[j].benchmark = benchmark;
                }
                steps[0].kind = 0;
                steps[0].amount = 0;
                steps[1].kind = 4; // early terminal
                steps[2].kind = 2; // wrong borrower
                steps[2].amount = 1;
                steps[3].kind = 1;
                steps[3].amount = 1e18;
                steps[3].paused = true;
                steps[4].kind = 1;
                steps[4].amount = 1e18;
                steps[5].kind = 2;
                steps[5].caller = BORROWER;
                steps[5].amount = 1e18;
                steps[6].kind = 0;
                steps[6].amount = random % 50e6 + 1;
                steps[7].kind = 3; // settlement never transfers stock
                steps[7].paused = true;
                steps[8].kind = 3; // replay rejected
                steps[9].kind = 4;
                steps[9].now_ = 2000;
                for (uint256 j = 10; j < steps.length; ++j) {
                    steps[j].now_ = 2000;
                }
                steps[10].kind = 6; // claims still outstanding
                steps[11].kind = 5;
                steps[11].amount = 20e18;
                steps[12].kind = 7;
                steps[12].claimId = 1;
                steps[12].caller = BUYER;
                steps[12].to = BUYER;
                steps[12].paused = true;
                steps[13].kind = 7;
                steps[13].claimId = 1;
                steps[13].caller = BUYER;
                steps[13].to = BUYER;
                steps[14].kind = 7;
                steps[14].claimId = 2;
                steps[14].caller = OTHER_BUYER;
                steps[14].to = OTHER_BUYER;
                steps[15].kind = 7;
                steps[15].claimId = 3;
                steps[15].caller = BORROWER;
                steps[15].to = BORROWER;
                steps[16].kind = 6;
                steps[17].kind = 0;
                steps[17].amount = 1;
                steps[18].kind = 8;
                steps[18].caller = BUYER;
                steps[18].to = BUYER;
                steps[18].amount = 100;
                steps[19].kind = 9;
                steps[19].caller = OTHER_BUYER;
                steps[19].to = OTHER_BUYER;
                steps[19].amount = 1;
                observations[row] = new Observation[](steps.length);
                for (uint256 j; j < steps.length; ++j) {
                    if (j >= 13 && j <= 15 && j - 12 < vault.nextClaimId()) {
                        LoanVault.Claim memory c = vault.getClaim(j - 12);
                        steps[j].caller = c.owner;
                        steps[j].to = c.owner;
                    }
                    _prepareStep(id, steps[j]);
                    observations[row][j] = _step(id, steps[j]);
                }
                requests[row * 2 + 1] = Request(10, abi.encode(before_, steps));
            }
            Result[] memory results = _batch(requests);
            for (uint256 row; row < 1; ++row) {
                assertTrue(results[row * 2].ok);
                assertEq(results[row * 2].data, receipts[row], "receipt construction");
                assertTrue(results[row * 2 + 1].ok);
                Observation[] memory actual = abi.decode(results[row * 2 + 1].data, (Observation[]));
                assertEq(actual.length, observations[row].length);
                for (uint256 j; j < actual.length; ++j) {
                    string memory label = string.concat(vm.toString(batch + row), "/", vm.toString(j));
                    assertEq(actual[j].ok, observations[row][j].ok, label);
                    assertEq(actual[j].error, observations[row][j].error, label);
                    assertEq(actual[j].stateHash, observations[row][j].stateHash, label);
                }
            }
        }
    }

    // Every lifecycle differential here uses the production 8% original-principal rate.
    function _config(uint32) internal view override returns (Types.AssetConfig memory) {
        return Types.AssetConfig(address(stock), 18, 6, 6000, 6500, 7500, 800, 315_360_000_000, 8, 32, 6);
    }

    function _compare(Step memory step) internal returns (Observation memory expected) {
        vm.warp(step.now_);
        step.market = _market();
        if (step.kind == 3) step.benchmark = oracle.benchmarkOf(manager.getReceipt(step.receiptId).consent.sessionId);
        Snapshot memory before_ = _snapshot(0);
        Request[] memory req = new Request[](1);
        if (step.kind >= 10 && step.kind <= 12) {
            req[0] = Request(step.kind + 5, abi.encode(before_, step));
        } else {
            Step[] memory trace = new Step[](1);
            trace[0] = step;
            req[0] = Request(10, abi.encode(before_, trace));
        }
        expected = _step(0, step);
        Result[] memory raw = _batch(req);
        assertTrue(raw[0].ok, "FFI evaluation");
        Observation[] memory actual = abi.decode(raw[0].data, (Observation[]));
        assertEq(actual.length, 1);
        assertEq(actual[0].ok, expected.ok, "success parity");
        assertEq(actual[0].error, expected.error, "revert bytes parity");
        assertEq(actual[0].stateHash, expected.stateHash, "full state parity");
    }

    function _action(uint256 kind, uint256 now_, uint256 loanId, uint256 receiptId, address caller)
        internal
        pure
        returns (Step memory s)
    {
        s.kind = kind;
        s.now_ = now_;
        s.loanId = loanId;
        s.receiptId = receiptId;
        s.caller = caller;
        s.to = caller;
    }

    function _borrowStep(address who, uint256 now_, uint256 principal) internal view returns (Step memory s) {
        s = _action(10, now_, 0, 0, who);
        s.request = LoanManager.BorrowRequest(
            ASSET, 1, configHash, principal, 10e18, who, oracle.latestReference(ASSET).reportHash, 1400
        );
    }

    function _coverStep(uint256 loanId, uint256 now_) internal view returns (Step memory s) {
        s = _action(11, now_, loanId, 0, BORROWER);
        s.quote = quote;
        s.quote.loanId = loanId;
        s.offerIds = ids;
        s.termsHashes = hashes;
        s.expectedHash = QuoteHash.hash(address(manager), s.quote, ids, hashes);
    }

    function testDurableBorrowBeforeOffersPartialDetachSecondSessionAndDistinctLoans() public {
        _clearOffers();
        assertEq(ids.length, 0);
        assertTrue(_compare(_borrowStep(BORROWER, 1001, 500e6 - 1)).ok);
        assertEq(manager.nextReceiptId(), 1);
        assertEq(book.totalPremiumCredits(), 0);
        Step memory s = _action(0, 1050, 1, 0, PAYER);
        s.amount = 20e6;
        assertTrue(_compare(s).ok);
        assertTrue(_compare(_borrowStep(PAYER, 1050, 200e6)).ok);
        assertTrue(_compare(_borrowStep(PAYER, 1050, 100e6)).ok);
        LoanVault.DebtRecord memory original = vault.getDebt(1);
        ids.push(_post(BUYER, 5e18, 100e6));
        ids.push(_post(OTHER_BUYER, 5e18, 90e6));
        _quote();
        quote.loanId = 1;
        uint256 poolBefore = cash.balanceOf(address(pool));
        uint256 stockBefore = stock.balanceOf(address(vault));
        assertTrue(_compare(_coverStep(1, 1100)).ok);
        assertEq(cash.balanceOf(address(pool)), poolBefore);
        assertEq(stock.balanceOf(address(vault)), stockBefore);
        assertEq(keccak256(abi.encode(vault.getDebt(1))), keccak256(abi.encode(original)));
        _benchmark(60e6, 1, 1);
        s = _action(3, 1501, 1, 1, KEEPER);
        assertTrue(_compare(s).ok);
        assertEq(uint8(manager.getReceipt(1).status), 2);
        assertEq(loans.getLoan(1).activeCoverId, 0);
        assertEq(vault.activeCoverDeadline(1), 0);
        assertGt(vault.nextClaimId(), 1);
        bytes32 firstClaim = keccak256(abi.encode(vault.getClaim(1)));
        uint256 due = vault.debtOf(1);
        vm.warp(2100);
        assertGt(vault.debtOf(1), due);
        bytes32 second = keccak256("SESSION_TWO");
        Types.MarketEventReport memory report = _report(Types.MarketEventKind.SESSION_SCHEDULED);
        report.sessionId = second;
        report.scheduledOpen = 2200;
        report.scheduledClose = 2800;
        oracle.acceptReport(report);
        vm.warp(2300);
        report = _report(Types.MarketEventKind.MARKET_PRICE);
        report.scheduledOpen = 2200;
        report.scheduledClose = 2800;
        report.benchmarkPrice = 100e6;
        report.multiplierNumerator = 1;
        report.multiplierDenominator = 1;
        report.secondarySourceHash = keccak256("SECONDARY");
        oracle.acceptReport(report);
        POLICY = manager.policyHash(ASSET, second, configHash, 1, 1);
        eligibility.setEligible(ASSET, BUYER, POLICY, true);
        delete ids;
        uint256 shares = vault.remainingSnapshotShares(1);
        vm.prank(BUYER);
        ids.push(book.postOffer(Types.OfferTerms(ASSET, POLICY, shares, 100e6, 100, 7500, 100e6, 10000, 3300, ++nonce)));
        _quote();
        quote.loanId = 1;
        quote.sessionId = second;
        quote.scheduledReportHash = oracle.sessionFact(second).scheduledReportHash;
        quote.collateralShares = shares;
        quote.expiry = 2700;
        quote.minSettlementDeadline = 3300;
        quote.maxSettlementDeadline = 3300;
        assertTrue(_compare(_coverStep(1, 2300)).ok);
        assertEq(manager.getReceipt(2).loanId, 1);
        assertEq(loans.getLoan(1).activeCoverId, 2);
        assertEq(keccak256(abi.encode(vault.getClaim(1))), firstClaim);
        assertFalse(_compare(_action(4, 2300, 1, 1, KEEPER)).ok);
        assertEq(loans.getLoan(1).activeCoverId, 2);
        assertEq(
            pool.totalAssets(), cash.balanceOf(address(pool)) + vault.debtOf(1) + vault.debtOf(2) + vault.debtOf(3)
        );
        s = _action(7, 2300, 0, 0, vault.getClaim(1).owner);
        s.claimId = 1;
        s.paused = true;
        assertFalse(_compare(s).ok);
        s.paused = false;
        assertTrue(_compare(s).ok);
    }

    function testDurableHealthyFullAndTerminalBranchesExact() public {
        uint256 checkpoint = vm.snapshotState();
        for (uint256 branch; branch < 3; ++branch) {
            assertTrue(vm.revertToState(checkpoint));
            uint256 id = _borrow();
            Step memory s;
            if (branch == 0) {
                _benchmark(100e6, 1, 1);
                s = _action(3, 1501, id, id, KEEPER);
                assertTrue(_compare(s).ok);
                assertGt(vault.debtOf(id), 0);
            } else if (branch == 1) {
                _benchmark(1, 1, 10);
                s = _action(3, 1501, id, id, KEEPER);
                assertTrue(_compare(s).ok);
                assertEq(vault.debtOf(id), 0);
            } else {
                s = _action(4, 2000, id, id, KEEPER);
                s.paused = true;
                assertTrue(_compare(s).ok);
                assertEq(vault.debtOf(id), 0);
            }
            if (branch == 0) {
                s = _action(0, 2001, id, 0, PAYER);
                vm.warp(2001);
                s.amount = vault.debtOf(id);
                assertTrue(_compare(s).ok);
            }
            assertEq(uint8(loans.getLoan(id).status), 2);
            assertEq(uint8(manager.getReceipt(id).status), 2);
            for (uint256 c = 1; c < vault.nextClaimId(); ++c) {
                LoanVault.Claim memory claim = vault.getClaim(c);
                s = _action(7, 2001, 0, 0, claim.owner);
                s.claimId = c;
                s.paused = true;
                assertFalse(_compare(s).ok);
                s.paused = false;
                assertTrue(_compare(s).ok);
            }
            s = _action(6, 2001, id, 0, PAYER);
            assertFalse(_compare(s).ok);
            s.caller = BORROWER;
            assertTrue(_compare(s).ok);
        }
    }

    function testDurableBorrowAndCoverRejectionsExactFullState() public {
        uint256 checkpoint = vm.snapshotState();
        for (uint256 i; i < 14; ++i) {
            assertTrue(vm.revertToState(checkpoint));
            Step memory s = _borrowStep(BORROWER, 1001, 500e6);
            if (i == 1) s.request.referenceReportHash = bytes32(uint256(9));
            if (i == 2) s.request.principal = 700e6;
            if (i == 3) s.now_ = 1500;
            if (i == 4) s.now_ = 900;
            if (i == 5) s.request.expiry = 1000;
            if (i == 12) s.request.configVersion = 42;
            if (i == 13) {
                _shortReference();
                s.now_ = 1100;
            }
            if (i == 6) s.request.collateralShares = 0;
            if (i == 7) s.request.recipient = address(0);
            if (i == 8) s.request.configHash = bytes32(uint256(9));
            if (i == 9) {
                vm.prank(BORROWER);
                stock.approve(address(vault), 1);
                s.paused = true;
            }
            if (i == 10) s.cashCallback = true;
            if (i == 11) {
                vm.warp(1002);
                Types.MarketEventReport memory halt = _report(Types.MarketEventKind.HALT);
                halt.halted = true;
                oracle.acceptReport(halt);
                s.now_ = 1002;
            }
            Observation memory result = _compare(s);
            assertEq(result.ok, i == 0);
        }
        assertTrue(vm.revertToState(checkpoint));
        _openOrdinary();
        checkpoint = vm.snapshotState();
        for (uint256 i; i < 21; ++i) {
            assertTrue(vm.revertToState(checkpoint));
            Step memory s = _coverStep(1, 1100);
            if (i == 18) s.quote.configVersion = 42;
            if (i == 19) {
                s.offerIds = new bytes32[](1);
                s.offerIds[0] = ids[0];
                s.termsHashes = new bytes32[](1);
                s.termsHashes[0] = hashes[0];
                s.quote.totalOfferShares = 5e18;
                s.quote.totalPremium = 100;
                s.quote.weightedStrike = 100e6;
            }
            if (i == 20) {
                _shortReference();
                s.quote.referenceReportHash = oracle.latestReference(ASSET).reportHash;
            }
            if (i == 1) s.quote.loanId = 9;
            if (i == 2) s.quote.maxDebtAtAcceptance = 1;
            if (i == 3) s.quote.maxDebtAtDeadline = 1;
            if (i == 4) s.quote.referenceReportHash = bytes32(uint256(9));
            if (i == 5) s.quote.policyHash = bytes32(uint256(9));
            if (i == 6) s.quote.borrowerNonce = 1;
            if (i == 7) s.now_ = 1440;
            if (i == 8) s.now_ = 1500;
            if (i == 9) s.quote.collateralShares -= 1;
            if (i == 10) s.quote.principal += 1;
            if (i == 11) s.quote.recipient = PAYER;
            if (i == 12) {
                (s.offerIds[0], s.offerIds[1]) = (s.offerIds[1], s.offerIds[0]);
                (s.termsHashes[0], s.termsHashes[1]) = (s.termsHashes[1], s.termsHashes[0]);
            }
            if (i == 13) s.termsHashes[0] = bytes32(uint256(9));
            if (i == 14) eligibility.setEligible(ASSET, BUYER, POLICY, false);
            if (i == 15) {
                vm.prank(BORROWER);
                cash.approve(address(book), 0);
            }
            if (i == 16) s.cashCallback = true;
            s.expectedHash = QuoteHash.hash(address(manager), s.quote, s.offerIds, s.termsHashes);
            if (i == 17) s.expectedHash = bytes32(0);
            Observation memory result = _compare(s);
            assertEq(result.ok, i == 0);
        }
    }

    function testOrdinaryLiquidationExactFullStateAndMaxRepay() public {
        _openOrdinary();
        uint256 checkpoint = vm.snapshotState();
        for (uint256 i; i < 6; ++i) {
            assertTrue(vm.revertToState(checkpoint));
            vm.warp(1100);
            _reference(i == 0 ? 100e6 : i < 4 ? 60e6 : 1e6);
            Step memory s = _action(12, i == 3 ? 1440 : 1100, 1, 0, PAYER);
            s.amount = i == 2 ? 1 : type(uint256).max;
            if (i == 5) s.cashCallback = true;
            Observation memory result = _compare(s);
            assertEq(result.ok, i == 1 || i == 3 || i == 4);
        }
    }

    function _corporate(uint128 n, uint128 d) internal {
        Types.MarketEventReport memory r = _report(Types.MarketEventKind.CORPORATE_ACTION);
        r.corporateAction = n < d ? Types.CorporateAction.REVERSE_SPLIT : Types.CorporateAction.SPLIT;
        r.actionId = keccak256(abi.encode(n, d));
        r.multiplierNumerator = n;
        r.multiplierDenominator = d;
        oracle.acceptReport(r);
    }

    function testPaidZeroDeliveryAndOrdinaryDustRollbackExact() public {
        _clearOffers();
        vm.warp(1002);
        _reference(1e18);
        quote.principal = 5;
        quote.collateralShares = 10;
        _openOrdinary();
        vm.prank(BUYER);
        ids.push(book.postOffer(Types.OfferTerms(ASSET, POLICY, 10, 1e18, 0, 7500, 1e18, 10000, 2000, ++nonce)));
        _quote();
        quote.loanId = 1;
        quote.principal = 5;
        quote.collateralShares = 10;
        quote.referencePrice = 1e18;
        assertTrue(_compare(_coverStep(1, 1002)).ok);
        _benchmark(1, 1, 100);
        Observation memory failed = _compare(_action(3, 1501, 1, 1, KEEPER));
        assertFalse(failed.ok);
        assertEq(failed.error, abi.encodeWithSelector(LoanVault.ZeroDelivery.selector));
        assertEq(vault.nextClaimId(), 1);
        assertEq(uint8(manager.getReceipt(1).status), 1);
    }

    function testPartialZeroDeliveryAndUnpaidDustExact() public {
        _clearOffers();
        vm.warp(1002);
        _reference(1e18);
        quote.principal = 5;
        quote.collateralShares = 10;
        _openOrdinary();
        vm.warp(1003);
        _corporate(1, 10);
        _reference(75e17);
        Step memory s = _action(12, 1003, 1, 0, PAYER);
        s.amount = type(uint256).max;
        Observation memory result = _compare(s);
        assertFalse(result.ok);
        assertEq(result.error, abi.encodeWithSelector(LoanVault.ZeroDelivery.selector));
        vm.warp(1004);
        _corporate(1, 100);
        _reference(1);
        s.now_ = 1004;
        s.amount = 0;
        assertTrue(_compare(s).ok);
        assertEq(vault.nextClaimId(), 1);
        assertEq(vault.debtOf(1), 0);
        assertEq(vault.remainingSnapshotShares(1), 0);
        s = _action(6, 1004, 1, 0, BORROWER);
        assertTrue(_compare(s).ok);
    }

    function testEightFillCoverAndThirtyTwoLiveLoansBoundsExact() public {
        _clearOffers();
        quote.principal = 100e6;
        quote.collateralShares = 10e18;
        for (uint256 i; i < 31; ++i) {
            _openOrdinary();
        }
        Step memory s = _borrowStep(BORROWER, 1001, 100e6);
        assertTrue(_compare(s).ok);
        assertEq(pool.activeReceiptIds().length, 32);
        assertFalse(_compare(s).ok);
        assertEq(pool.activeReceiptIds().length, 32);
        for (uint256 i; i < 8; ++i) {
            ids.push(_post(BUYER, 1e18, 100e6 - i * 1e6));
        }
        _quote();
        quote.loanId = 1;
        quote.principal = 100e6;
        quote.collateralShares = 10e18;
        assertTrue(_compare(_coverStep(1, 1100)).ok);
        assertEq(manager.getReceipt(1).offerIds.length, 8);
        s = _action(0, 1101, 1, 0, PAYER);
        vm.warp(1101);
        s.amount = vault.debtOf(1);
        assertTrue(_compare(s).ok);
        assertEq(pool.activeReceiptIds().length, 31);
        assertEq(pool.activeReceiptIds()[0], 32);
    }

    function _shortReference() internal {
        vm.warp(1002);
        Types.MarketEventReport memory r = _report(Types.MarketEventKind.MARKET_PRICE);
        r.scheduledOpen = 900;
        r.scheduledClose = 1500;
        r.benchmarkPrice = 100e6;
        r.multiplierNumerator = 1;
        r.multiplierDenominator = 1;
        r.validUntil = 1003;
        r.secondarySourceHash = keccak256("SECONDARY");
        oracle.acceptReport(r);
    }

    function testPremiumWithdrawalWithLiveNavCallbackExact() public {
        _borrow();
        uint256 buyerBefore = cash.balanceOf(BUYER);
        uint256 bookBefore = cash.balanceOf(address(book));
        Step memory s = _action(8, 1100, 0, 0, BUYER);
        s.amount = 1;
        s.cashCallback = true;
        Observation memory result = _compare(s);
        assertTrue(result.ok);
        assertEq(result.error, bytes(""));
        assertEq(cash.balanceOf(BUYER), buyerBefore + 1);
        assertEq(cash.balanceOf(address(book)), bookBefore - 1);
        assertEq(cash.transferHookTarget(), address(pool));
    }

    function testCashCreditWithdrawalWithLiveNavCallbackExact() public {
        uint256 id = _borrow();
        _benchmark(100e6, 1, 1);
        manager.settle(id);
        assertGt(vault.debtOf(1), 0);
        uint256 buyerBefore = cash.balanceOf(BUYER);
        uint256 bookBefore = cash.balanceOf(address(book));
        Step memory s = _action(9, 1502, 0, 0, BUYER);
        s.amount = 1;
        s.cashCallback = true;
        Observation memory result = _compare(s);
        assertTrue(result.ok);
        assertEq(result.error, bytes(""));
        assertEq(cash.balanceOf(BUYER), buyerBefore + 1);
        assertEq(cash.balanceOf(address(book)), bookBefore - 1);
        assertEq(cash.transferHookTarget(), address(pool));
    }

    function testReferenceIdentityMismatchPrecedesConvertedPriceOverflowExact() public {
        _openOrdinary();
        vm.warp(1002);
        _corporate(type(uint64).max, 1);
        _reference(type(uint96).max);
        EngineMathHarness overflowHarness = new EngineMathHarness();
        vm.expectRevert(bytes4(keccak256("MathResultOverflow()")));
        overflowHarness.evaluate(
            0, abi.encode(uint256(type(uint96).max), uint256(type(uint64).max) * type(uint128).max, uint256(1))
        );
        quote.corporateActionHash = oracle.latestCorporateAction(ASSET).reportHash;
        quote.snapshotMultiplierNumerator = 1;
        quote.snapshotMultiplierDenominator = type(uint128).max;
        quote.referenceReportHash = bytes32(uint256(1));
        Step memory s = _coverStep(1, 1100);
        Observation memory result = _compare(s);
        assertFalse(result.ok);
        assertEq(result.error, abi.encodeWithSelector(CoverManager.ReferenceFactsMismatch.selector));
    }

    function testFutureClaimHeadroomAtActualManagerBoundaryExact() public {
        _clearOffers();
        uint128 b = type(uint64).max;
        uint256 m = type(uint128).max;
        uint256 r = uint256(b) * b;
        vm.warp(1002);
        _corporate(1, b);
        _reference(100e6);
        stock.mint(BORROWER, m);
        quote.collateralShares = m;
        _openOrdinary();
        // Authorized vault-boundary prehistory, not a fabricated oracle or storage overwrite.
        vm.prank(address(loans));
        vault.recordClaim(1, BUYER, m - 1, b, 1, 1002);
        uint256 h = type(uint256).max / r - (m - 1);
        stock.mint(BORROWER, h);
        vm.prank(BORROWER);
        stock.approve(address(vault), h - 1);
        Step memory step = _action(1, 1003, 1, 0, BORROWER);
        step.amount = h;
        Observation memory result = _compare(step);
        assertFalse(result.ok);
        assertEq(result.error, abi.encodeWithSelector(Errors.UnsupportedShareAmount.selector));
        step.amount = h - 1;
        result = _compare(step);
        assertTrue(result.ok);
        assertEq(vault.remainingSnapshotShares(1), h);
        step.amount = 1;
        result = _compare(step);
        assertFalse(result.ok);
        assertEq(result.error, abi.encodeWithSelector(Errors.UnsupportedShareAmount.selector));
    }
}
