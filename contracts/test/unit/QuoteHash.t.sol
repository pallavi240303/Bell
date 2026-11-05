// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {QuoteHash} from "../../src/lib/QuoteHash.sol";

contract QuoteHashHarness {
    function hash(address manager, QuoteHash.Quote memory quote, bytes32[] memory ids, bytes32[] memory hashes)
        external
        view
        returns (bytes32)
    {
        return QuoteHash.hash(manager, quote, ids, hashes);
    }
}

contract QuoteHashTest is Test {
    QuoteHashHarness internal harness = new QuoteHashHarness();

    // Omitting a static consent word allows a different borrower decision to reuse its digest.
    function testEveryStaticConsentFieldChangesDigest() public view {
        QuoteHash.Quote memory quote = _quote();
        bytes32[] memory ids = _array(1, 2);
        bytes32[] memory hashes = _array(3, 4);
        bytes memory encoded = abi.encode(quote);
        bytes32 original = harness.hash(address(9), quote, ids, hashes);
        for (uint256 i; i < encoded.length / 32; ++i) {
            bytes memory changed = abi.encode(quote);
            // All fixture words can be incremented without violating their ABI widths.
            assembly ("memory-safe") {
                let word := add(add(changed, 32), mul(i, 32))
                mstore(word, add(mload(word), 1))
            }
            assertNotEq(harness.hash(address(9), abi.decode(changed, (QuoteHash.Quote)), ids, hashes), original);
        }
    }

    function testDomainBindsChainManagerAndVersionedEncoding() public {
        QuoteHash.Quote memory quote = _quote();
        bytes32[] memory ids = _array(1, 2);
        bytes32[] memory hashes = _array(3, 4);
        bytes32 original = harness.hash(address(9), quote, ids, hashes);
        assertEq(
            original,
            keccak256(
                abi.encode(
                    keccak256("BELL_COVER_QUOTE_V1"),
                    block.chainid,
                    address(9),
                    quote,
                    keccak256(abi.encode(ids)),
                    keccak256(abi.encode(hashes))
                )
            )
        );
        assertNotEq(harness.hash(address(10), quote, ids, hashes), original);
        vm.chainId(block.chainid + 1);
        assertNotEq(harness.hash(address(9), quote, ids, hashes), original);
    }

    // Sorting, substituting, or shifting array boundaries must never preserve consent.
    function testOrderedArraysAreBoundSeparatelyIncludingTheirLengths() public view {
        QuoteHash.Quote memory quote = _quote();
        bytes32 original = harness.hash(address(9), quote, _array(1, 2), _array(3, 4));
        assertNotEq(original, harness.hash(address(9), quote, _array(2, 1), _array(3, 4)));
        assertNotEq(original, harness.hash(address(9), quote, _array(1, 2), _array(4, 3)));
        assertNotEq(original, harness.hash(address(9), quote, _array(1, 5), _array(3, 4)));
        bytes32[] memory one = new bytes32[](1);
        one[0] = bytes32(uint256(1));
        bytes32[] memory three = new bytes32[](3);
        three[0] = bytes32(uint256(2));
        three[1] = bytes32(uint256(3));
        three[2] = bytes32(uint256(4));
        assertNotEq(original, harness.hash(address(9), quote, one, three));
    }

    function testOrdinaryTimePassageDoesNotChangeConsent() public {
        QuoteHash.Quote memory quote = _quote();
        bytes32 original = harness.hash(address(9), quote, _array(1, 2), _array(3, 4));
        vm.warp(block.timestamp + 100);
        assertEq(original, harness.hash(address(9), quote, _array(1, 2), _array(3, 4)));
    }

    function _array(uint256 a, uint256 b) internal pure returns (bytes32[] memory values) {
        values = new bytes32[](2);
        values[0] = bytes32(a);
        values[1] = bytes32(b);
    }

    function _quote() internal pure returns (QuoteHash.Quote memory q) {
        q.borrower = address(1);
        q.recipient = address(2);
        q.borrowerNonce = 3;
        q.expiry = 1000;
        q.assetId = bytes32(uint256(4));
        q.sessionId = bytes32(uint256(5));
        q.configVersion = 6;
        q.configHash = bytes32(uint256(7));
        q.policyHash = bytes32(uint256(8));
        q.principal = 900;
        q.collateralShares = 10e18;
        q.referencePrice = 110;
        q.scheduledReportHash = bytes32(uint256(12));
        q.corporateActionHash = bytes32(uint256(13));
        q.snapshotMultiplierNumerator = 2;
        q.snapshotMultiplierDenominator = 1;
        q.totalPremium = 14;
        q.totalOfferShares = 9e18;
        q.weightedStrike = 150;
        q.minSettlementDeadline = 900;
        q.maxSettlementDeadline = 1100;
    }
}
