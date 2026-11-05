// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FixedPointMath} from "../../src/lib/FixedPointMath.sol";
import {InterestMath} from "../../src/lib/InterestMath.sol";
import {SettlementMath} from "../../src/lib/SettlementMath.sol";
import {QuoteHash} from "../../src/lib/QuoteHash.sol";
import {Types} from "../../src/lib/Types.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {CoverManager} from "../../src/CoverManager.sol";
import {CommitmentBook} from "../../src/CommitmentBook.sol";
import {ReceiptFixture} from "../helpers/ReceiptFixture.sol";

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

    struct BorrowFacts {
        address caller;
        uint256 borrowerNonce;
        uint256 chainId;
        address manager;
        bytes32 expectedHash;
        bool bindingsMatch;
        uint64 effectiveAt;
        uint8 tokenDecimals;
        bytes32 configHash;
        bool halted;
        uint8 phase;
        uint64 scheduledClose;
        bytes32 sessionAssetId;
        bytes32 activeSessionId;
        bytes32 sessionConfigHash;
        bytes32 stateConfigHash;
        bytes32 scheduledReportHash;
        bytes32 actionHash;
        uint128 actionN;
        uint128 actionD;
        bool[] eligible;
    }

    function _borrowFacts(address caller, bytes32 expectedHash) internal view returns (BorrowFacts memory f) {
        Types.SessionFact memory session = oracle.sessionFact(SESSION);
        Types.AssetState memory state = oracle.assetState(ASSET);
        Types.CorporateActionFact memory action = oracle.latestCorporateAction(ASSET);
        f.caller = caller;
        f.borrowerNonce = manager.borrowerNonce(caller);
        f.chainId = block.chainid;
        f.manager = address(manager);
        f.expectedHash = expectedHash;
        f.bindingsMatch = true;
        (, f.effectiveAt, f.configHash) = registry.getConfig(ASSET, 1);
        f.tokenDecimals = 18;
        f.halted = state.halted;
        f.phase = uint8(session.phase);
        f.scheduledClose = session.scheduledClose;
        f.sessionAssetId = session.assetId;
        f.activeSessionId = state.activeSessionId;
        f.sessionConfigHash = session.configHash;
        f.stateConfigHash = state.configHash;
        f.scheduledReportHash = session.scheduledReportHash;
        f.actionHash = action.reportHash;
        f.actionN = action.multiplierNumerator;
        f.actionD = action.multiplierDenominator;
        f.eligible = new bool[](ids.length);
        for (uint256 j; j < ids.length; ++j) {
            f.eligible[j] = true;
        }
    }

    function testValidateBorrowAgainstRealManagerAndValidationPrecedence() public {
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
                11,
                abi.encode(
                    quote, _config(1), ids, hashes, offers, actualHashes, block.timestamp, _borrowFacts(caller, digest)
                )
            );
            vm.prank(caller);
            (bool ok, bytes memory returned) =
                address(manager).call(abi.encodeCall(manager.borrowWithCover, (quote, ids, hashes, digest)));
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
                uint256 wordIndex = i % 21;
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
        LoanVault conversion = new LoanVault(address(this));
        conversion.initialize(address(this));
        stock.approve(address(conversion), type(uint256).max);
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
            stock.mint(address(this), amount);
            conversion.createDebt(
                i + 1,
                LoanVault.DebtTerms(
                    address(this),
                    ASSET,
                    address(stock),
                    1,
                    0,
                    1,
                    uint64(block.timestamp),
                    uint64(block.timestamp + 1),
                    amount,
                    snapN,
                    snapD
                )
            );
            (bool ok, bytes memory returned) = address(conversion)
                .call(
                    abi.encodeCall(
                        conversion.recordClaim, (i + 1, BUYER, amount, reportN, reportD, uint64(block.timestamp))
                    )
                );
            if (ok) returned = abi.encode(conversion.getClaim(abi.decode(returned, (uint256))).deliveryUnits);
            expected[i] = Result(ok, returned);
            requests[i] = Request(6, abi.encode(amount, snapN, snapD, reportN, reportD));
        }
        Result[] memory results = _batch(requests);
        for (uint256 i; i < results.length; ++i) {
            assertEq(results[i].ok, expected[i].ok);
            assertEq(results[i].data, expected[i].data, vm.toString(i));
        }
    }

    struct Snapshot {
        CoverManager.Receipt receipt;
        LoanVault.DebtRecord debt;
        Types.Offer[] offers;
        LoanVault.Claim[] claims;
        uint256[] counters;
        address[3] components;
        address[] actors;
        uint256[8][] balances;
        uint256[] activeIds;
    }

    struct Step {
        uint256 kind;
        uint256 now_;
        address caller;
        uint256 amount;
        uint256 claimId;
        address to;
        Types.Benchmark benchmark;
        bool paused;
        bool cashCallback;
    }

    struct Observation {
        bool ok;
        bytes error;
        bytes32 stateHash;
    }

    function _snapshot(uint256 id) internal view returns (Snapshot memory s) {
        s.receipt = manager.getReceipt(id);
        s.debt = vault.getDebt(id);
        s.offers = new Types.Offer[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            s.offers[i] = book.getOffer(ids[i]);
        }
        s.claims = new LoanVault.Claim[](vault.nextClaimId() - 1);
        for (uint256 i; i < s.claims.length; ++i) {
            s.claims[i] = vault.getClaim(i + 1);
        }
        s.counters = new uint256[](14);
        s.counters[0] = id;
        s.counters[1] = vault.nextClaimId();
        s.counters[2] = vault.remainingSnapshotShares(id);
        s.counters[3] = vault.backingOf(id);
        s.counters[4] = vault.accountedBacking(address(stock));
        s.counters[5] = vault.outstandingClaimUnits(id);
        s.counters[6] = book.totalLockedCash();
        s.counters[7] = book.totalPremiumCredits();
        s.counters[8] = book.totalCashCredits();
        s.counters[9] = vault.debtOf(id);
        s.counters[10] = pool.totalSupply();
        s.counters[11] = pool.totalAssets();
        s.counters[12] = manager.nextReceiptId();
        s.counters[13] = manager.borrowerNonce(BORROWER);
        s.components = [address(pool), address(book), address(vault)];
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
        s.balances = new uint256[8][](s.actors.length);
        for (uint256 i; i < s.actors.length; ++i) {
            address who = s.actors[i];
            s.balances[i] = [
                cash.balanceOf(who),
                stock.balanceOf(who),
                book.premiumCredit(who),
                book.cashCredit(who),
                pool.balanceOf(who),
                cash.allowance(who, address(manager)),
                cash.allowance(who, address(book)),
                stock.allowance(who, address(vault))
            ];
        }
        s.activeIds = pool.activeReceiptIds();
    }

    function _step(uint256 id, Step memory step) internal returns (Observation memory result) {
        vm.warp(step.now_);
        stock.setPaused(step.paused);
        cash.setTransferFromHook(
            step.cashCallback ? address(pool) : address(0),
            step.cashCallback ? abi.encodeCall(pool.totalAssets, ()) : bytes("")
        );
        bytes memory callData;
        address target = address(manager);
        if (step.kind == 0) {
            callData = abi.encodeCall(manager.repay, (id, step.amount));
        } else if (step.kind == 1) {
            callData = abi.encodeCall(manager.addCollateral, (id, step.amount));
        } else if (step.kind == 2) {
            callData = abi.encodeCall(manager.withdrawCollateral, (id, step.amount));
        } else if (step.kind == 3) {
            callData = abi.encodeCall(manager.settle, (id));
        } else if (step.kind == 4) {
            callData = abi.encodeCall(manager.terminalSettle, (id));
        } else if (step.kind == 5) {
            callData = abi.encodeCall(manager.topUpBacking, (id, step.amount));
        } else if (step.kind == 6) {
            callData = abi.encodeCall(manager.finalizeHandoff, (id));
        } else if (step.kind == 7) {
            target = address(vault);
            callData = abi.encodeCall(vault.withdrawClaim, (step.claimId, step.to));
        } else if (step.kind == 8) {
            target = address(book);
            callData = abi.encodeCall(book.withdrawPremium, (step.amount, step.to));
        } else {
            target = address(book);
            callData = abi.encodeCall(book.withdrawCashCredit, (step.amount, step.to));
        }
        vm.prank(step.caller);
        (result.ok, result.error) = target.call(callData);
        if (result.ok) result.error = "";
        result.stateHash = keccak256(abi.encode(_snapshot(id)));
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
            cash.approve(address(manager), i == 6 || i == 10 ? 3 : type(uint256).max);
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
        uint256 random = 0xC1A110;
        uint256 checkpoint = vm.snapshotState();
        // 24 independent scenarios, each compared after all 20 operations, including reverts.
        for (uint256 batch; batch < 6; ++batch) {
            Request[] memory requests = new Request[](8);
            Observation[][] memory observations = new Observation[][](4);
            bytes[] memory receipts = new bytes[](4);
            for (uint256 row; row < 4; ++row) {
                assertTrue(vm.revertToState(checkpoint));
                random = uint256(keccak256(abi.encode(random)));
                uint256 scenario = batch * 4 + row;
                quote.principal = 100e6 + random % 450e6;
                quote.borrowerNonce = 0;
                Types.Offer[] memory freeOffers = new Types.Offer[](ids.length);
                for (uint256 j; j < ids.length; ++j) {
                    freeOffers[j] = book.getOffer(ids[j]);
                }
                bytes memory construction = abi.encode(
                    quote,
                    _config(1),
                    ids,
                    hashes,
                    freeOffers,
                    hashes,
                    QuoteHash.hash(address(manager), quote, ids, hashes),
                    block.timestamp,
                    uint256(1500)
                );
                uint256 id = _borrow();
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
                    observations[row][j] = _step(id, steps[j]);
                }
                requests[row * 2 + 1] = Request(10, abi.encode(before_, steps));
            }
            Result[] memory results = _batch(requests);
            for (uint256 row; row < 4; ++row) {
                assertTrue(results[row * 2].ok);
                assertEq(results[row * 2].data, receipts[row], "receipt construction");
                assertTrue(results[row * 2 + 1].ok);
                Observation[] memory actual = abi.decode(results[row * 2 + 1].data, (Observation[]));
                assertEq(actual.length, observations[row].length);
                for (uint256 j; j < actual.length; ++j) {
                    string memory label = string.concat(vm.toString(batch * 4 + row), "/", vm.toString(j));
                    assertEq(actual[j].ok, observations[row][j].ok, label);
                    assertEq(actual[j].error, observations[row][j].error, label);
                    assertEq(actual[j].stateHash, observations[row][j].stateHash, label);
                }
            }
        }
    }
}
