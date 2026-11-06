// Generated from Foundry artifacts. Run npm run abi:generate.
export const abis = {
  "manager": [
    {
      "type": "constructor",
      "inputs": [
        {
          "name": "registry_",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "oracle_",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "book_",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "pool_",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "vault_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "addCollateral",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "snapshotShares",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "book",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract CommitmentBook"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "borrowWithCover",
      "inputs": [
        {
          "name": "quote",
          "type": "tuple",
          "internalType": "struct QuoteHash.Quote",
          "components": [
            {
              "name": "borrower",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "recipient",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "borrowerNonce",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "expiry",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "assetId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "sessionId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "configVersion",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "configHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "policyHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "principal",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "collateralShares",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "referencePrice",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "scheduledReportHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "corporateActionHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "snapshotMultiplierNumerator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "snapshotMultiplierDenominator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "totalPremium",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalOfferShares",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "weightedStrike",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "minSettlementDeadline",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "maxSettlementDeadline",
              "type": "uint64",
              "internalType": "uint64"
            }
          ]
        },
        {
          "name": "offerIds",
          "type": "bytes32[]",
          "internalType": "bytes32[]"
        },
        {
          "name": "termsHashes",
          "type": "bytes32[]",
          "internalType": "bytes32[]"
        },
        {
          "name": "expectedQuoteHash",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "borrowerNonce",
      "inputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "debtOf",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "finalizeHandoff",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "getReceipt",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple",
          "internalType": "struct CoverManager.Receipt",
          "components": [
            {
              "name": "consent",
              "type": "tuple",
              "internalType": "struct QuoteHash.Quote",
              "components": [
                {
                  "name": "borrower",
                  "type": "address",
                  "internalType": "address"
                },
                {
                  "name": "recipient",
                  "type": "address",
                  "internalType": "address"
                },
                {
                  "name": "borrowerNonce",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "expiry",
                  "type": "uint64",
                  "internalType": "uint64"
                },
                {
                  "name": "assetId",
                  "type": "bytes32",
                  "internalType": "bytes32"
                },
                {
                  "name": "sessionId",
                  "type": "bytes32",
                  "internalType": "bytes32"
                },
                {
                  "name": "configVersion",
                  "type": "uint64",
                  "internalType": "uint64"
                },
                {
                  "name": "configHash",
                  "type": "bytes32",
                  "internalType": "bytes32"
                },
                {
                  "name": "policyHash",
                  "type": "bytes32",
                  "internalType": "bytes32"
                },
                {
                  "name": "principal",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "collateralShares",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "referencePrice",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "scheduledReportHash",
                  "type": "bytes32",
                  "internalType": "bytes32"
                },
                {
                  "name": "corporateActionHash",
                  "type": "bytes32",
                  "internalType": "bytes32"
                },
                {
                  "name": "snapshotMultiplierNumerator",
                  "type": "uint128",
                  "internalType": "uint128"
                },
                {
                  "name": "snapshotMultiplierDenominator",
                  "type": "uint128",
                  "internalType": "uint128"
                },
                {
                  "name": "totalPremium",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "totalOfferShares",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "weightedStrike",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "minSettlementDeadline",
                  "type": "uint64",
                  "internalType": "uint64"
                },
                {
                  "name": "maxSettlementDeadline",
                  "type": "uint64",
                  "internalType": "uint64"
                }
              ]
            },
            {
              "name": "config",
              "type": "tuple",
              "internalType": "struct Types.AssetConfig",
              "components": [
                {
                  "name": "assetToken",
                  "type": "address",
                  "internalType": "address"
                },
                {
                  "name": "stockTokenDecimals",
                  "type": "uint8",
                  "internalType": "uint8"
                },
                {
                  "name": "cashTokenDecimals",
                  "type": "uint8",
                  "internalType": "uint8"
                },
                {
                  "name": "originationLtvBps",
                  "type": "uint16",
                  "internalType": "uint16"
                },
                {
                  "name": "targetLtvBps",
                  "type": "uint16",
                  "internalType": "uint16"
                },
                {
                  "name": "triggerLtvBps",
                  "type": "uint16",
                  "internalType": "uint16"
                },
                {
                  "name": "rateNumerator",
                  "type": "uint32",
                  "internalType": "uint32"
                },
                {
                  "name": "rateDenominator",
                  "type": "uint64",
                  "internalType": "uint64"
                },
                {
                  "name": "maxFills",
                  "type": "uint8",
                  "internalType": "uint8"
                },
                {
                  "name": "maxActiveReceipts",
                  "type": "uint8",
                  "internalType": "uint8"
                },
                {
                  "name": "supportedCorporateActions",
                  "type": "uint8",
                  "internalType": "uint8"
                }
              ]
            },
            {
              "name": "quoteHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "offerIds",
              "type": "bytes32[]",
              "internalType": "bytes32[]"
            },
            {
              "name": "offerTermsHashes",
              "type": "bytes32[]",
              "internalType": "bytes32[]"
            },
            {
              "name": "startTime",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "settlementDeadline",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "debtCeiling",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "status",
              "type": "uint8",
              "internalType": "enum CoverManager.ReceiptStatus"
            },
            {
              "name": "benchmarkReportHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "benchmarkValuePerSnapshotShare",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "latestMultiplierNumerator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "latestMultiplierDenominator",
              "type": "uint128",
              "internalType": "uint128"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "nextReceiptId",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "oracle",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract SessionOracle"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "pool",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract ProtectedPool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "registry",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract AssetRegistry"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "repay",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "settle",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "terminalSettle",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "topUpBacking",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "tokenUnits",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "vault",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract LoanVault"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "withdrawCollateral",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "snapshotShares",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "event",
      "name": "BenchmarkProcessed",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "reportHash",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "valuePerSnapshotShare",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "multiplierNumerator",
          "type": "uint128",
          "indexed": false,
          "internalType": "uint128"
        },
        {
          "name": "multiplierDenominator",
          "type": "uint128",
          "indexed": false,
          "internalType": "uint128"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "CollateralAdded",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "payer",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "snapshotShares",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "CollateralWithdrawn",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "borrower",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "snapshotShares",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "CoveredBorrowCreated",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "borrower",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "sessionId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "quoteHash",
          "type": "bytes32",
          "indexed": false,
          "internalType": "bytes32"
        },
        {
          "name": "principal",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "startTime",
          "type": "uint64",
          "indexed": false,
          "internalType": "uint64"
        },
        {
          "name": "settlementDeadline",
          "type": "uint64",
          "indexed": false,
          "internalType": "uint64"
        },
        {
          "name": "debtCeiling",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "FinanciallyClosed",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "borrowerClaimId",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "HandoffPending",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "ReceiptClosed",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "ReceiptOfferExercised",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "offerId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "claimId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "additionalShares",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "debtApplied",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "Repaid",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "payer",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "debtAfter",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "AssetHalted",
      "inputs": []
    },
    {
      "type": "error",
      "name": "BenchmarkAlreadyProcessed",
      "inputs": []
    },
    {
      "type": "error",
      "name": "BenchmarkIdentityMismatch",
      "inputs": []
    },
    {
      "type": "error",
      "name": "BenchmarkUnavailable",
      "inputs": []
    },
    {
      "type": "error",
      "name": "BorrowerLtvTooHigh",
      "inputs": []
    },
    {
      "type": "error",
      "name": "CashDebtTransition",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ComponentMismatch",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ConfigNotEffective",
      "inputs": []
    },
    {
      "type": "error",
      "name": "CumulativeSharesDecrease",
      "inputs": []
    },
    {
      "type": "error",
      "name": "HandoffIncomplete",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InsufficientFundedCapacity",
      "inputs": [
        {
          "name": "availableCash",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "requiredCash",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidBorrower",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidBorrowerNonce",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidCollateral",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidDebtApplied",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidDecimals",
      "inputs": [
        {
          "name": "stockTokenDecimals",
          "type": "uint8",
          "internalType": "uint8"
        },
        {
          "name": "cashTokenDecimals",
          "type": "uint8",
          "internalType": "uint8"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidExerciseShares",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidLotShares",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidOfferCount",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidOfferOrder",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidOfferState",
      "inputs": [
        {
          "name": "expected",
          "type": "uint8",
          "internalType": "enum Types.OfferStatus"
        },
        {
          "name": "actual",
          "type": "uint8",
          "internalType": "enum Types.OfferStatus"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidReceiptId",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidSession",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidSettlementDeadline",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidSettlementLtv",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidTimeRange",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidTokenBalanceDelta",
      "inputs": [
        {
          "name": "expected",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "actual",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "MathResultOverflow",
      "inputs": []
    },
    {
      "type": "error",
      "name": "OfferIdentityMismatch",
      "inputs": []
    },
    {
      "type": "error",
      "name": "OfferTermsHashMismatch",
      "inputs": []
    },
    {
      "type": "error",
      "name": "QuoteExpired",
      "inputs": []
    },
    {
      "type": "error",
      "name": "QuoteHashMismatch",
      "inputs": []
    },
    {
      "type": "error",
      "name": "QuoteTotalsMismatch",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReceiptNotActive",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReceiptNotPending",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReentrancyGuardReentrantCall",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReferenceFactsMismatch",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReservedCollateral",
      "inputs": []
    },
    {
      "type": "error",
      "name": "SafeERC20FailedOperation",
      "inputs": [
        {
          "name": "token",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "SettlementDeadlineNotReached",
      "inputs": []
    },
    {
      "type": "error",
      "name": "SettlementDeadlineReached",
      "inputs": []
    },
    {
      "type": "error",
      "name": "TooManyFills",
      "inputs": [
        {
          "name": "count",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnsupportedCashAmount",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnsupportedPrice",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnsupportedRate",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnsupportedShareAmount",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroAddress",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroDenominator",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroStrike",
      "inputs": []
    }
  ],
  "book": [
    {
      "type": "constructor",
      "inputs": [
        {
          "name": "cashToken_",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "eligibilityPolicy_",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "owner_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "cancelOffer",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "cashCredit",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "cashToken",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract IERC20"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "computeOfferId",
      "inputs": [
        {
          "name": "buyer",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "nonce",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "coverManager",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "eligibilityPolicy",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract IEligibilityPolicy"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "exerciseOffer",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "newCumulativeSnapshotShares",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "debtApplied",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "borrower",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "cashCharged",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "borrowerExcess",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "getOffer",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple",
          "internalType": "struct Types.Offer",
          "components": [
            {
              "name": "buyer",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "terms",
              "type": "tuple",
              "internalType": "struct Types.OfferTerms",
              "components": [
                {
                  "name": "assetId",
                  "type": "bytes32",
                  "internalType": "bytes32"
                },
                {
                  "name": "policyHash",
                  "type": "bytes32",
                  "internalType": "bytes32"
                },
                {
                  "name": "snapshotShares",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "strike",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "premium",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "maxBorrowerLtvBps",
                  "type": "uint16",
                  "internalType": "uint16"
                },
                {
                  "name": "referencePrice",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "maxReferenceDeviationBps",
                  "type": "uint16",
                  "internalType": "uint16"
                },
                {
                  "name": "expiry",
                  "type": "uint64",
                  "internalType": "uint64"
                },
                {
                  "name": "nonce",
                  "type": "uint256",
                  "internalType": "uint256"
                }
              ]
            },
            {
              "name": "cashCapacity",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "cumulativeExercisedShares",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "cumulativeCashCharged",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "receiptId",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "status",
              "type": "uint8",
              "internalType": "enum Types.OfferStatus"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "initialize",
      "inputs": [
        {
          "name": "coverManager_",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "protectedPool_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "nonceUsed",
      "inputs": [
        {
          "name": "buyer",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "nonce",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "used",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "owner",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "postOffer",
      "inputs": [
        {
          "name": "terms",
          "type": "tuple",
          "internalType": "struct Types.OfferTerms",
          "components": [
            {
              "name": "assetId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "policyHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "snapshotShares",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "strike",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "premium",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "maxBorrowerLtvBps",
              "type": "uint16",
              "internalType": "uint16"
            },
            {
              "name": "referencePrice",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "maxReferenceDeviationBps",
              "type": "uint16",
              "internalType": "uint16"
            },
            {
              "name": "expiry",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "nonce",
              "type": "uint256",
              "internalType": "uint256"
            }
          ]
        }
      ],
      "outputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "premiumCredit",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "protectedPool",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "releaseOffer",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "reserveOffer",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "expectedTermsHash",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "premiumPayer",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "settlementDeadline",
          "type": "uint64",
          "internalType": "uint64"
        },
        {
          "name": "acceptedReferencePrice",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "borrowerLtvBps",
          "type": "uint16",
          "internalType": "uint16"
        }
      ],
      "outputs": [
        {
          "name": "premium",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "termsHashOf",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "totalCashCredits",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "totalLiabilities",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "totalLockedCash",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "totalPremiumCredits",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "withdrawCashCredit",
      "inputs": [
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "withdrawPremium",
      "inputs": [
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "event",
      "name": "CashCreditWithdrawn",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "to",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "Initialized",
      "inputs": [
        {
          "name": "coverManager",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "protectedPool",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "OfferCancelled",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "buyer",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "cashCredit",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "OfferExercised",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "cumulativeShares",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "cashCharged",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "debtApplied",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "borrowerExcess",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "OfferPosted",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "buyer",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "assetId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "cashCapacity",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "termsHash",
          "type": "bytes32",
          "indexed": false,
          "internalType": "bytes32"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "OfferReleased",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "buyer",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "cashCredit",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "OfferReserved",
      "inputs": [
        {
          "name": "offerId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "premiumPayer",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "premium",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "PremiumWithdrawn",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "to",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "AlreadyInitialized",
      "inputs": []
    },
    {
      "type": "error",
      "name": "BorrowerLtvTooHigh",
      "inputs": []
    },
    {
      "type": "error",
      "name": "CumulativeSharesDecrease",
      "inputs": []
    },
    {
      "type": "error",
      "name": "IneligibleBuyer",
      "inputs": [
        {
          "name": "buyer",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "InsufficientCredit",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidDebtApplied",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidExerciseShares",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidOfferState",
      "inputs": [
        {
          "name": "expected",
          "type": "uint8",
          "internalType": "enum Types.OfferStatus"
        },
        {
          "name": "actual",
          "type": "uint8",
          "internalType": "enum Types.OfferStatus"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidOfferTerms",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidReceiptId",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidTokenBalanceDelta",
      "inputs": [
        {
          "name": "expected",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "actual",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "LiabilityShortfall",
      "inputs": [
        {
          "name": "balance",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "liabilities",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "MathResultOverflow",
      "inputs": []
    },
    {
      "type": "error",
      "name": "NotInitialized",
      "inputs": []
    },
    {
      "type": "error",
      "name": "NotOfferBuyer",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "OfferExpiredBeforeSettlement",
      "inputs": []
    },
    {
      "type": "error",
      "name": "OfferNonceUsed",
      "inputs": [
        {
          "name": "buyer",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "nonce",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "OfferTermsHashMismatch",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReentrancyGuardReentrantCall",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReferenceDeviationTooHigh",
      "inputs": []
    },
    {
      "type": "error",
      "name": "SafeERC20FailedOperation",
      "inputs": [
        {
          "name": "token",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "Unauthorized",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnauthorizedManager",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnsupportedCashAmount",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnsupportedPrice",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnsupportedShareAmount",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroAddress",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroDenominator",
      "inputs": []
    }
  ],
  "pool": [
    {
      "type": "constructor",
      "inputs": [
        {
          "name": "cashToken_",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "owner_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "activeReceiptIds",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256[]",
          "internalType": "uint256[]"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "allowance",
      "inputs": [
        {
          "name": "owner",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "spender",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "approve",
      "inputs": [
        {
          "name": "spender",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "value",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "balanceOf",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "cashToken",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract IERC20Metadata"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "closeLoan",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "coverManager",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "decimals",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint8",
          "internalType": "uint8"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "deposit",
      "inputs": [
        {
          "name": "assets",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "shares",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "disburse",
      "inputs": [
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "assets",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "initialize",
      "inputs": [
        {
          "name": "manager",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "name",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "string",
          "internalType": "string"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "owner",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "redeem",
      "inputs": [
        {
          "name": "shares",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "assets",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "registerLoan",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "symbol",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "string",
          "internalType": "string"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "totalAssets",
      "inputs": [],
      "outputs": [
        {
          "name": "assets",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "totalSupply",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "transfer",
      "inputs": [
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "value",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "transferFrom",
      "inputs": [
        {
          "name": "from",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "value",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "event",
      "name": "Approval",
      "inputs": [
        {
          "name": "owner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "spender",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "value",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "Transfer",
      "inputs": [
        {
          "name": "from",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "to",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "value",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "ActiveReceiptLimit",
      "inputs": []
    },
    {
      "type": "error",
      "name": "AlreadyInitialized",
      "inputs": []
    },
    {
      "type": "error",
      "name": "DebtNotClosed",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ERC20InsufficientAllowance",
      "inputs": [
        {
          "name": "spender",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "allowance",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "needed",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "ERC20InsufficientBalance",
      "inputs": [
        {
          "name": "sender",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "balance",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "needed",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "ERC20InvalidApprover",
      "inputs": [
        {
          "name": "approver",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "ERC20InvalidReceiver",
      "inputs": [
        {
          "name": "receiver",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "ERC20InvalidSender",
      "inputs": [
        {
          "name": "sender",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "ERC20InvalidSpender",
      "inputs": [
        {
          "name": "spender",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "InsufficientLiquidity",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidDecimals",
      "inputs": [
        {
          "name": "stockTokenDecimals",
          "type": "uint8",
          "internalType": "uint8"
        },
        {
          "name": "cashTokenDecimals",
          "type": "uint8",
          "internalType": "uint8"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidReceiptId",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidTokenBalanceDelta",
      "inputs": [
        {
          "name": "expected",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "actual",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "MathResultOverflow",
      "inputs": []
    },
    {
      "type": "error",
      "name": "NotInitialized",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReentrancyGuardReentrantCall",
      "inputs": []
    },
    {
      "type": "error",
      "name": "SafeERC20FailedOperation",
      "inputs": [
        {
          "name": "token",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "Unauthorized",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnauthorizedManager",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "ZeroAddress",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroConversion",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroDenominator",
      "inputs": []
    }
  ],
  "vault": [
    {
      "type": "constructor",
      "inputs": [
        {
          "name": "owner_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "accountedBacking",
      "inputs": [
        {
          "name": "token",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "tokenUnits",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "addCollateral",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "from",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "shares",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "reportN",
          "type": "uint128",
          "internalType": "uint128"
        },
        {
          "name": "reportD",
          "type": "uint128",
          "internalType": "uint128"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "backingOf",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "tokenUnits",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "coverManager",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "createDebt",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "terms",
          "type": "tuple",
          "internalType": "struct LoanVault.DebtTerms",
          "components": [
            {
              "name": "borrower",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "assetId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "assetToken",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "originalPrincipal",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "rateNumerator",
              "type": "uint32",
              "internalType": "uint32"
            },
            {
              "name": "rateDenominator",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "startTime",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "settlementDeadline",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "snapshotCollateral",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "snapshotMultiplierNumerator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "snapshotMultiplierDenominator",
              "type": "uint128",
              "internalType": "uint128"
            }
          ]
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "creditBackingFromSurplus",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "cumulativeDebtReductionOf",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "debtOf",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getClaim",
      "inputs": [
        {
          "name": "claimId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple",
          "internalType": "struct LoanVault.Claim",
          "components": [
            {
              "name": "owner",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "receiptId",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "snapshotShares",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "reportMultiplierNumerator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "reportMultiplierDenominator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "maturesAt",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "withdrawn",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "deliveryUnits",
              "type": "uint256",
              "internalType": "uint256"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getDebt",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple",
          "internalType": "struct LoanVault.DebtRecord",
          "components": [
            {
              "name": "terms",
              "type": "tuple",
              "internalType": "struct LoanVault.DebtTerms",
              "components": [
                {
                  "name": "borrower",
                  "type": "address",
                  "internalType": "address"
                },
                {
                  "name": "assetId",
                  "type": "bytes32",
                  "internalType": "bytes32"
                },
                {
                  "name": "assetToken",
                  "type": "address",
                  "internalType": "address"
                },
                {
                  "name": "originalPrincipal",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "rateNumerator",
                  "type": "uint32",
                  "internalType": "uint32"
                },
                {
                  "name": "rateDenominator",
                  "type": "uint64",
                  "internalType": "uint64"
                },
                {
                  "name": "startTime",
                  "type": "uint64",
                  "internalType": "uint64"
                },
                {
                  "name": "settlementDeadline",
                  "type": "uint64",
                  "internalType": "uint64"
                },
                {
                  "name": "snapshotCollateral",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "snapshotMultiplierNumerator",
                  "type": "uint128",
                  "internalType": "uint128"
                },
                {
                  "name": "snapshotMultiplierDenominator",
                  "type": "uint128",
                  "internalType": "uint128"
                }
              ]
            },
            {
              "name": "cumulativeDebtReduction",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "closed",
              "type": "bool",
              "internalType": "bool"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "initialize",
      "inputs": [
        {
          "name": "manager",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "nextClaimId",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "outstandingClaimUnits",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "units",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "owner",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "recordClaim",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "buyer",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "shares",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "reportN",
          "type": "uint128",
          "internalType": "uint128"
        },
        {
          "name": "reportD",
          "type": "uint128",
          "internalType": "uint128"
        },
        {
          "name": "maturesAt",
          "type": "uint64",
          "internalType": "uint64"
        }
      ],
      "outputs": [
        {
          "name": "claimId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "reduceDebt",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "newCumulativeReduction",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "applied",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "releaseCollateral",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "shares",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "reportN",
          "type": "uint128",
          "internalType": "uint128"
        },
        {
          "name": "reportD",
          "type": "uint128",
          "internalType": "uint128"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "releaseSurplus",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "units",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "remainingSnapshotShares",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "shares",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "topUpBacking",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "from",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "withdrawClaim",
      "inputs": [
        {
          "name": "claimId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "units",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "event",
      "name": "BackingAdded",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "from",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "units",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "ClaimRecorded",
      "inputs": [
        {
          "name": "claimId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "owner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "snapshotShares",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "deliveryUnits",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "ClaimWithdrawn",
      "inputs": [
        {
          "name": "claimId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "to",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "deliveryUnits",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "SurplusReleased",
      "inputs": [
        {
          "name": "receiptId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "borrower",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "units",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "AlreadyInitialized",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ClaimNotMature",
      "inputs": []
    },
    {
      "type": "error",
      "name": "HandoffIncomplete",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InsufficientBacking",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidClaim",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidDebtApplied",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidExerciseShares",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidMultiplier",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidReceiptId",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidTimeRange",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidTokenBalanceDelta",
      "inputs": [
        {
          "name": "expected",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "actual",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "MathResultOverflow",
      "inputs": []
    },
    {
      "type": "error",
      "name": "NotInitialized",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReentrancyGuardReentrantCall",
      "inputs": []
    },
    {
      "type": "error",
      "name": "SafeERC20FailedOperation",
      "inputs": [
        {
          "name": "token",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "Unauthorized",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnauthorizedManager",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnsupportedCashAmount",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnsupportedRate",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnsupportedShareAmount",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroAddress",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroAssetId",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroDelivery",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroDenominator",
      "inputs": []
    }
  ],
  "cash": [
    {
      "type": "function",
      "name": "allowance",
      "inputs": [
        {
          "name": "owner",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "spender",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "approve",
      "inputs": [
        {
          "name": "spender",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "balanceOf",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "balance",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "decimals",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint8",
          "internalType": "uint8"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "failTransfer",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "mint",
      "inputs": [
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "name",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "string",
          "internalType": "string"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "senderFee",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "setFailTransfer",
      "inputs": [
        {
          "name": "enabled",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setSenderFee",
      "inputs": [
        {
          "name": "fee",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setShortTransfer",
      "inputs": [
        {
          "name": "enabled",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setShortTransferFrom",
      "inputs": [
        {
          "name": "enabled",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setTransferFromHook",
      "inputs": [
        {
          "name": "target",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "data",
          "type": "bytes",
          "internalType": "bytes"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setTransferHook",
      "inputs": [
        {
          "name": "target",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "data",
          "type": "bytes",
          "internalType": "bytes"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "shortTransfer",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "shortTransferFrom",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "symbol",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "string",
          "internalType": "string"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "transfer",
      "inputs": [
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "transferFrom",
      "inputs": [
        {
          "name": "from",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "transferFromHookData",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "bytes",
          "internalType": "bytes"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "transferFromHookTarget",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "transferHookData",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "bytes",
          "internalType": "bytes"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "transferHookTarget",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "event",
      "name": "Approval",
      "inputs": [
        {
          "name": "owner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "spender",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "Transfer",
      "inputs": [
        {
          "name": "from",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "to",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    }
  ],
  "stock": [
    {
      "type": "constructor",
      "inputs": [
        {
          "name": "owner_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "allowance",
      "inputs": [
        {
          "name": "owner",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "spender",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "approve",
      "inputs": [
        {
          "name": "spender",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "value",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "balanceOf",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "decimals",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint8",
          "internalType": "uint8"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "mint",
      "inputs": [
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "multiplierDenominator",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint128",
          "internalType": "uint128"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "multiplierNumerator",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint128",
          "internalType": "uint128"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "name",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "string",
          "internalType": "string"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "owner",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "paused",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "restricted",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "blocked",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "setMultiplier",
      "inputs": [
        {
          "name": "numerator",
          "type": "uint128",
          "internalType": "uint128"
        },
        {
          "name": "denominator",
          "type": "uint128",
          "internalType": "uint128"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setPaused",
      "inputs": [
        {
          "name": "paused_",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setRestricted",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "blocked",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "symbol",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "string",
          "internalType": "string"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "totalSupply",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "transfer",
      "inputs": [
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "value",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "transferFrom",
      "inputs": [
        {
          "name": "from",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "to",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "value",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "event",
      "name": "Approval",
      "inputs": [
        {
          "name": "owner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "spender",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "value",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "Transfer",
      "inputs": [
        {
          "name": "from",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "to",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "value",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "ERC20InsufficientAllowance",
      "inputs": [
        {
          "name": "spender",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "allowance",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "needed",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "ERC20InsufficientBalance",
      "inputs": [
        {
          "name": "sender",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "balance",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "needed",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "ERC20InvalidApprover",
      "inputs": [
        {
          "name": "approver",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "ERC20InvalidReceiver",
      "inputs": [
        {
          "name": "receiver",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "ERC20InvalidSender",
      "inputs": [
        {
          "name": "sender",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "ERC20InvalidSpender",
      "inputs": [
        {
          "name": "spender",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidMultiplier",
      "inputs": []
    },
    {
      "type": "error",
      "name": "RestrictedAddress",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "TransfersPaused",
      "inputs": []
    },
    {
      "type": "error",
      "name": "Unauthorized",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "ZeroAddress",
      "inputs": []
    }
  ],
  "oracle": [
    {
      "type": "constructor",
      "inputs": [
        {
          "name": "owner_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "acceptReport",
      "inputs": [
        {
          "name": "report",
          "type": "tuple",
          "internalType": "struct Types.MarketEventReport",
          "components": [
            {
              "name": "schemaVersion",
              "type": "uint8",
              "internalType": "uint8"
            },
            {
              "name": "kind",
              "type": "uint8",
              "internalType": "enum Types.MarketEventKind"
            },
            {
              "name": "chainId",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "oracle",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "assetId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "sessionId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "configHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "nonce",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "previousStateHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "observedAt",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "validUntil",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "scheduledOpen",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "scheduledClose",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "benchmarkPrice",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "corporateAction",
              "type": "uint8",
              "internalType": "enum Types.CorporateAction"
            },
            {
              "name": "actionId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "multiplierNumerator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "multiplierDenominator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "halted",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "primarySourceHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "secondarySourceHash",
              "type": "bytes32",
              "internalType": "bytes32"
            }
          ]
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "assetState",
      "inputs": [
        {
          "name": "assetId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "state",
          "type": "tuple",
          "internalType": "struct Types.AssetState",
          "components": [
            {
              "name": "nextNonce",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "stateHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "configHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "activeSessionId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "halted",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "latestCorporateActionHash",
              "type": "bytes32",
              "internalType": "bytes32"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "benchmarkOf",
      "inputs": [
        {
          "name": "sessionId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple",
          "internalType": "struct Types.Benchmark",
          "components": [
            {
              "name": "finalized",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "assetId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "sessionId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "configHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "price",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "multiplierNumerator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "multiplierDenominator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "observedAt",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "primarySourceHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "secondarySourceHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "reportHash",
              "type": "bytes32",
              "internalType": "bytes32"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "bindReceiver",
      "inputs": [
        {
          "name": "receiver_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "latestCorporateAction",
      "inputs": [
        {
          "name": "assetId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple",
          "internalType": "struct Types.CorporateActionFact",
          "components": [
            {
              "name": "action",
              "type": "uint8",
              "internalType": "enum Types.CorporateAction"
            },
            {
              "name": "actionId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "multiplierNumerator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "multiplierDenominator",
              "type": "uint128",
              "internalType": "uint128"
            },
            {
              "name": "observedAt",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "reportHash",
              "type": "bytes32",
              "internalType": "bytes32"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "owner",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "receiver",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "sessionFact",
      "inputs": [
        {
          "name": "sessionId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple",
          "internalType": "struct Types.SessionFact",
          "components": [
            {
              "name": "assetId",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "configHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "scheduledOpen",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "scheduledClose",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "closeObservedAt",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "reopenObservedAt",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "phase",
              "type": "uint8",
              "internalType": "enum Types.SessionPhase"
            },
            {
              "name": "scheduledReportHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "closeReportHash",
              "type": "bytes32",
              "internalType": "bytes32"
            },
            {
              "name": "reopenReportHash",
              "type": "bytes32",
              "internalType": "bytes32"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "sessionPhase",
      "inputs": [
        {
          "name": "sessionId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint8",
          "internalType": "enum Types.SessionPhase"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "event",
      "name": "MarketEventAccepted",
      "inputs": [
        {
          "name": "assetId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "sessionId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "kind",
          "type": "uint8",
          "indexed": true,
          "internalType": "enum Types.MarketEventKind"
        },
        {
          "name": "nonce",
          "type": "uint64",
          "indexed": false,
          "internalType": "uint64"
        },
        {
          "name": "reportHash",
          "type": "bytes32",
          "indexed": false,
          "internalType": "bytes32"
        },
        {
          "name": "newStateHash",
          "type": "bytes32",
          "indexed": false,
          "internalType": "bytes32"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "ReceiverBound",
      "inputs": [
        {
          "name": "receiver",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "ActiveSessionNotFinal",
      "inputs": [
        {
          "name": "sessionId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "phase",
          "type": "uint8",
          "internalType": "enum Types.SessionPhase"
        }
      ]
    },
    {
      "type": "error",
      "name": "AssetConfigMismatch",
      "inputs": [
        {
          "name": "expected",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "actual",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ]
    },
    {
      "type": "error",
      "name": "FinalBenchmarkAlreadyAccepted",
      "inputs": [
        {
          "name": "sessionId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ]
    },
    {
      "type": "error",
      "name": "FutureObservation",
      "inputs": [
        {
          "name": "observedAt",
          "type": "uint64",
          "internalType": "uint64"
        },
        {
          "name": "currentTime",
          "type": "uint64",
          "internalType": "uint64"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidMultiplier",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidNonce",
      "inputs": [
        {
          "name": "expected",
          "type": "uint64",
          "internalType": "uint64"
        },
        {
          "name": "actual",
          "type": "uint64",
          "internalType": "uint64"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidPreviousState",
      "inputs": [
        {
          "name": "expected",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "actual",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidReportKind",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidSchemaVersion",
      "inputs": [
        {
          "name": "version",
          "type": "uint8",
          "internalType": "uint8"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidSessionTiming",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidSessionTransition",
      "inputs": [
        {
          "name": "current",
          "type": "uint8",
          "internalType": "enum Types.SessionPhase"
        },
        {
          "name": "attempted",
          "type": "uint8",
          "internalType": "enum Types.MarketEventKind"
        }
      ]
    },
    {
      "type": "error",
      "name": "MissingSourceEvidence",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReceiverAlreadyBound",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReportExpired",
      "inputs": [
        {
          "name": "validUntil",
          "type": "uint64",
          "internalType": "uint64"
        },
        {
          "name": "currentTime",
          "type": "uint64",
          "internalType": "uint64"
        }
      ]
    },
    {
      "type": "error",
      "name": "SessionIdentityMismatch",
      "inputs": [
        {
          "name": "sessionId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ]
    },
    {
      "type": "error",
      "name": "Unauthorized",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnauthorizedReceiver",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnsupportedCorporateAction",
      "inputs": [
        {
          "name": "action",
          "type": "uint8",
          "internalType": "enum Types.CorporateAction"
        }
      ]
    },
    {
      "type": "error",
      "name": "WrongReportDomain",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroActionId",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroAddress",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroAssetId",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroBenchmarkPrice",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroConfigHash",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroSessionId",
      "inputs": []
    }
  ],
  "registry": [
    {
      "type": "constructor",
      "inputs": [
        {
          "name": "owner_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "configHash",
      "inputs": [
        {
          "name": "assetId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "version",
          "type": "uint64",
          "internalType": "uint64"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getConfig",
      "inputs": [
        {
          "name": "assetId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "version",
          "type": "uint64",
          "internalType": "uint64"
        }
      ],
      "outputs": [
        {
          "name": "config",
          "type": "tuple",
          "internalType": "struct Types.AssetConfig",
          "components": [
            {
              "name": "assetToken",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "stockTokenDecimals",
              "type": "uint8",
              "internalType": "uint8"
            },
            {
              "name": "cashTokenDecimals",
              "type": "uint8",
              "internalType": "uint8"
            },
            {
              "name": "originationLtvBps",
              "type": "uint16",
              "internalType": "uint16"
            },
            {
              "name": "targetLtvBps",
              "type": "uint16",
              "internalType": "uint16"
            },
            {
              "name": "triggerLtvBps",
              "type": "uint16",
              "internalType": "uint16"
            },
            {
              "name": "rateNumerator",
              "type": "uint32",
              "internalType": "uint32"
            },
            {
              "name": "rateDenominator",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "maxFills",
              "type": "uint8",
              "internalType": "uint8"
            },
            {
              "name": "maxActiveReceipts",
              "type": "uint8",
              "internalType": "uint8"
            },
            {
              "name": "supportedCorporateActions",
              "type": "uint8",
              "internalType": "uint8"
            }
          ]
        },
        {
          "name": "effectiveAt",
          "type": "uint64",
          "internalType": "uint64"
        },
        {
          "name": "identity",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "latestVersion",
      "inputs": [
        {
          "name": "assetId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "version",
          "type": "uint64",
          "internalType": "uint64"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "owner",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "scheduleAssetConfig",
      "inputs": [
        {
          "name": "assetId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "config",
          "type": "tuple",
          "internalType": "struct Types.AssetConfig",
          "components": [
            {
              "name": "assetToken",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "stockTokenDecimals",
              "type": "uint8",
              "internalType": "uint8"
            },
            {
              "name": "cashTokenDecimals",
              "type": "uint8",
              "internalType": "uint8"
            },
            {
              "name": "originationLtvBps",
              "type": "uint16",
              "internalType": "uint16"
            },
            {
              "name": "targetLtvBps",
              "type": "uint16",
              "internalType": "uint16"
            },
            {
              "name": "triggerLtvBps",
              "type": "uint16",
              "internalType": "uint16"
            },
            {
              "name": "rateNumerator",
              "type": "uint32",
              "internalType": "uint32"
            },
            {
              "name": "rateDenominator",
              "type": "uint64",
              "internalType": "uint64"
            },
            {
              "name": "maxFills",
              "type": "uint8",
              "internalType": "uint8"
            },
            {
              "name": "maxActiveReceipts",
              "type": "uint8",
              "internalType": "uint8"
            },
            {
              "name": "supportedCorporateActions",
              "type": "uint8",
              "internalType": "uint8"
            }
          ]
        },
        {
          "name": "effectiveAt",
          "type": "uint64",
          "internalType": "uint64"
        }
      ],
      "outputs": [
        {
          "name": "version",
          "type": "uint64",
          "internalType": "uint64"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "event",
      "name": "AssetConfigScheduled",
      "inputs": [
        {
          "name": "assetId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "version",
          "type": "uint64",
          "indexed": true,
          "internalType": "uint64"
        },
        {
          "name": "effectiveAt",
          "type": "uint64",
          "indexed": false,
          "internalType": "uint64"
        },
        {
          "name": "configHash",
          "type": "bytes32",
          "indexed": false,
          "internalType": "bytes32"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "InvalidDecimals",
      "inputs": [
        {
          "name": "stockTokenDecimals",
          "type": "uint8",
          "internalType": "uint8"
        },
        {
          "name": "cashTokenDecimals",
          "type": "uint8",
          "internalType": "uint8"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidEffectiveTime",
      "inputs": [
        {
          "name": "effectiveAt",
          "type": "uint64",
          "internalType": "uint64"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidLtvOrder",
      "inputs": [
        {
          "name": "originationLtvBps",
          "type": "uint16",
          "internalType": "uint16"
        },
        {
          "name": "targetLtvBps",
          "type": "uint16",
          "internalType": "uint16"
        },
        {
          "name": "triggerLtvBps",
          "type": "uint16",
          "internalType": "uint16"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidMaxActiveReceipts",
      "inputs": [
        {
          "name": "maxActiveReceipts",
          "type": "uint8",
          "internalType": "uint8"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidMaxFills",
      "inputs": [
        {
          "name": "maxFills",
          "type": "uint8",
          "internalType": "uint8"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidRate",
      "inputs": [
        {
          "name": "rateNumerator",
          "type": "uint32",
          "internalType": "uint32"
        },
        {
          "name": "rateDenominator",
          "type": "uint64",
          "internalType": "uint64"
        }
      ]
    },
    {
      "type": "error",
      "name": "Unauthorized",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnknownConfig",
      "inputs": [
        {
          "name": "assetId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "version",
          "type": "uint64",
          "internalType": "uint64"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnsupportedCorporateActions",
      "inputs": [
        {
          "name": "actionMask",
          "type": "uint8",
          "internalType": "uint8"
        }
      ]
    },
    {
      "type": "error",
      "name": "ZeroAddress",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ZeroAssetId",
      "inputs": []
    }
  ],
  "receiver": [
    {
      "type": "constructor",
      "inputs": [
        {
          "name": "oracle_",
          "type": "address",
          "internalType": "contract SessionOracle"
        },
        {
          "name": "forwarder_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "forwarder",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "onReport",
      "inputs": [
        {
          "name": "metadata",
          "type": "bytes",
          "internalType": "bytes"
        },
        {
          "name": "report",
          "type": "bytes",
          "internalType": "bytes"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "oracle",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract SessionOracle"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "supportsInterface",
      "inputs": [
        {
          "name": "interfaceId",
          "type": "bytes4",
          "internalType": "bytes4"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "pure"
    },
    {
      "type": "event",
      "name": "ReceiverReportAccepted",
      "inputs": [
        {
          "name": "reportHash",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "workflowId",
          "type": "bytes32",
          "indexed": false,
          "internalType": "bytes32"
        },
        {
          "name": "workflowName",
          "type": "bytes10",
          "indexed": false,
          "internalType": "bytes10"
        },
        {
          "name": "workflowOwner",
          "type": "address",
          "indexed": false,
          "internalType": "address"
        },
        {
          "name": "mode",
          "type": "uint8",
          "indexed": false,
          "internalType": "uint8"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "InvalidMetadataLength",
      "inputs": [
        {
          "name": "length",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidReportLength",
      "inputs": [
        {
          "name": "length",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "UnauthorizedReceiver",
      "inputs": [
        {
          "name": "caller",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "ZeroAddress",
      "inputs": []
    }
  ]
} as const;
