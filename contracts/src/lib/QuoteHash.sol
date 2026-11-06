// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library QuoteHash {
    bytes32 internal constant DOMAIN = keccak256("BELL_COVER_QUOTE_V2");

    /// @dev Static borrower consent only. Inclusion time and funded debt belong in the receipt.
    struct Quote {
        address borrower;
        address recipient;
        uint256 borrowerNonce;
        uint64 expiry;
        bytes32 assetId;
        bytes32 sessionId;
        uint64 configVersion;
        bytes32 configHash;
        bytes32 policyHash;
        uint256 principal;
        uint256 collateralShares;
        uint256 referencePrice;
        bytes32 scheduledReportHash;
        bytes32 corporateActionHash;
        uint128 snapshotMultiplierNumerator;
        uint128 snapshotMultiplierDenominator;
        uint256 totalPremium;
        uint256 totalOfferShares;
        uint256 weightedStrike;
        uint64 minSettlementDeadline;
        uint64 maxSettlementDeadline;
        uint256 loanId;
        uint256 maxDebtAtAcceptance;
        uint256 maxDebtAtDeadline;
        bytes32 referenceReportHash;
    }

    function hash(address manager, Quote memory quote, bytes32[] memory offerIds, bytes32[] memory termsHashes)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                DOMAIN,
                block.chainid,
                manager,
                quote,
                keccak256(abi.encode(offerIds)),
                keccak256(abi.encode(termsHashes))
            )
        );
    }
}
