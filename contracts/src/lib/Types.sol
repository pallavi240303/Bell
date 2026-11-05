// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library Types {
    uint16 internal constant BPS = 10_000;
    uint8 internal constant REQUIRED_MAX_FILLS = 8;
    uint8 internal constant REQUIRED_MAX_ACTIVE_RECEIPTS = 32;
    uint8 internal constant REPORT_SCHEMA_VERSION = 1;
    uint8 internal constant SPLIT_ACTION_MASK = 2;
    uint8 internal constant REVERSE_SPLIT_ACTION_MASK = 4;
    uint8 internal constant CASH_DIVIDEND_ACTION_MASK = 8;
    uint8 internal constant SUPPORTED_CORPORATE_ACTIONS = SPLIT_ACTION_MASK | REVERSE_SPLIT_ACTION_MASK;

    enum CorporateAction {
        NONE,
        SPLIT,
        REVERSE_SPLIT,
        CASH_DIVIDEND,
        MERGER,
        SPINOFF
    }

    enum MarketEventKind {
        NONE,
        SESSION_SCHEDULED,
        CLOSE_CONFIRMED,
        REOPEN_BENCHMARK,
        CORPORATE_ACTION,
        HALT
    }

    enum SessionPhase {
        NONE,
        SCHEDULED,
        CLOSE_CONFIRMED,
        REOPEN_BENCHMARK
    }

    enum OfferStatus {
        NONE,
        FREE,
        RESERVED,
        RELEASED,
        CANCELLED
    }

    struct OfferTerms {
        bytes32 assetId;
        bytes32 policyHash;
        uint256 snapshotShares;
        uint256 strike;
        uint256 premium;
        uint16 maxBorrowerLtvBps;
        uint256 referencePrice;
        uint16 maxReferenceDeviationBps;
        uint64 expiry;
        uint256 nonce;
    }

    struct Offer {
        address buyer;
        OfferTerms terms;
        uint256 cashCapacity;
        uint256 cumulativeExercisedShares;
        uint256 cumulativeCashCharged;
        uint256 receiptId;
        OfferStatus status;
    }

    struct AssetConfig {
        address assetToken;
        uint8 stockTokenDecimals;
        uint8 cashTokenDecimals;
        uint16 originationLtvBps;
        uint16 targetLtvBps;
        uint16 triggerLtvBps;
        uint32 rateNumerator;
        uint64 rateDenominator;
        uint8 maxFills;
        uint8 maxActiveReceipts;
        uint8 supportedCorporateActions;
    }

    struct AssetConfigRecord {
        AssetConfig config;
        uint64 effectiveAt;
        bytes32 configHash;
    }

    struct MarketEventReport {
        uint8 schemaVersion;
        MarketEventKind kind;
        uint256 chainId;
        address oracle;
        bytes32 assetId;
        bytes32 sessionId;
        bytes32 configHash;
        uint64 nonce;
        bytes32 previousStateHash;
        uint64 observedAt;
        uint64 validUntil;
        uint64 scheduledOpen;
        uint64 scheduledClose;
        uint256 benchmarkPrice;
        CorporateAction corporateAction;
        bytes32 actionId;
        uint128 multiplierNumerator;
        uint128 multiplierDenominator;
        bool halted;
        bytes32 primarySourceHash;
        bytes32 secondarySourceHash;
    }

    struct AssetState {
        uint64 nextNonce;
        bytes32 stateHash;
        bytes32 configHash;
        bytes32 activeSessionId;
        bool halted;
        bytes32 latestCorporateActionHash;
    }

    struct SessionFact {
        bytes32 assetId;
        bytes32 configHash;
        uint64 scheduledOpen;
        uint64 scheduledClose;
        uint64 closeObservedAt;
        uint64 reopenObservedAt;
        SessionPhase phase;
        bytes32 scheduledReportHash;
        bytes32 closeReportHash;
        bytes32 reopenReportHash;
    }

    struct Benchmark {
        bool finalized;
        bytes32 assetId;
        bytes32 sessionId;
        bytes32 configHash;
        uint256 price;
        uint128 multiplierNumerator;
        uint128 multiplierDenominator;
        uint64 observedAt;
        bytes32 primarySourceHash;
        bytes32 secondarySourceHash;
        bytes32 reportHash;
    }

    struct CorporateActionFact {
        CorporateAction action;
        bytes32 actionId;
        uint128 multiplierNumerator;
        uint128 multiplierDenominator;
        uint64 observedAt;
        bytes32 reportHash;
    }
}
