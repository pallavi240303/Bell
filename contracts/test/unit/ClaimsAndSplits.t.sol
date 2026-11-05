// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MockStockToken} from "../../src/demo/MockStockToken.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {VaultAPI} from "./LoanVault.t.sol";
import {MockCashToken} from "../helpers/MockCashToken.sol";

interface ClaimAPI {
    struct Claim {
        address owner;
        uint256 receiptId;
        uint256 snapshotShares;
        uint128 reportMultiplierNumerator;
        uint128 reportMultiplierDenominator;
        uint64 maturesAt;
        bool withdrawn;
    }
    function recordClaim(
        uint256 receiptId,
        address buyer,
        uint256 shares,
        uint128 reportN,
        uint128 reportD,
        uint64 maturesAt
    ) external returns (uint256);
    function getClaim(uint256 claimId) external view returns (Claim memory);
    function withdrawClaim(uint256 claimId, address to) external returns (uint256);
}

interface StockAPI is IERC20Metadata {
    function mint(address to, uint256 amount) external;
    function setPaused(bool paused) external;
    function setRestricted(address account, bool restricted) external;
    function setMultiplier(uint128 numerator, uint128 denominator) external;
    function multiplierNumerator() external view returns (uint128);
    function multiplierDenominator() external view returns (uint128);
}

contract ClaimsAndSplitsTest is Test {
    StockAPI internal stock;
    VaultAPI internal vault;
    ClaimAPI internal claims;
    address internal constant BUYER = address(0xB0B);

    function setUp() public {
        vm.warp(1000);
        stock = StockAPI(address(new MockStockToken(address(this))));
        vault = VaultAPI(address(new LoanVault(address(this))));
        vault.initialize(address(this));
        claims = ClaimAPI(address(vault));
    }

    // Updating metadata must not issue any real tokens or mutate existing balances.
    function testStockMultiplierIsMetadataAndOnlyIssuerMintsBacking() public {
        assertEq(stock.decimals(), 18);
        stock.mint(address(this), 10e18);
        stock.setMultiplier(10, 1);
        assertEq(stock.multiplierNumerator(), 10);
        assertEq(stock.multiplierDenominator(), 1);
        assertEq(stock.totalSupply(), 10e18);
        assertEq(stock.balanceOf(address(this)), 10e18);
        vm.prank(address(9));
        vm.expectRevert(abi.encodeWithSelector(Errors.Unauthorized.selector, address(9)));
        stock.mint(address(9), 1);
        vm.prank(address(9));
        vm.expectRevert();
        stock.setMultiplier(2, 1);
        vm.prank(address(9));
        vm.expectRevert();
        stock.setPaused(true);
        vm.prank(address(9));
        vm.expectRevert();
        stock.setRestricted(address(this), true);
        vm.expectRevert(Errors.InvalidMultiplier.selector);
        stock.setMultiplier(0, 1);
        vm.expectRevert(Errors.InvalidMultiplier.selector);
        stock.setMultiplier(1, 0);
        vm.expectRevert(Errors.ZeroAddress.selector);
        new MockStockToken(address(0));
        stock.setMultiplier(1, 10);
        assertEq(stock.balanceOf(address(this)), 10e18);
        stock.mint(address(7), 90e18);
        assertEq(stock.totalSupply(), 100e18);
    }

    function testStockPauseAndEitherAddressRestrictionBlockTransfersAtomically() public {
        stock.mint(address(this), 10);
        stock.approve(address(9), 10);
        stock.setPaused(true);
        vm.expectRevert();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        stock.transfer(address(8), 1);
        vm.prank(address(9));
        vm.expectRevert();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        stock.transferFrom(address(this), address(8), 1);
        stock.setPaused(false);
        stock.setRestricted(address(this), true);
        vm.expectRevert();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        stock.transfer(address(8), 1);
        stock.setRestricted(address(this), false);
        stock.setRestricted(address(8), true);
        vm.expectRevert();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        stock.transfer(address(8), 1);
        assertEq(stock.balanceOf(address(this)), 10);
        assertEq(stock.allowance(address(this), address(9)), 10);
        stock.setRestricted(address(8), false);
        vm.prank(address(9));
        assertTrue(stock.transferFrom(address(this), address(8), 10));
        assertEq(stock.balanceOf(address(8)), 10);
    }

    function _loan(uint256 id, uint256 shares, uint128 snapN, uint128 snapD) internal {
        stock.mint(address(this), shares);
        stock.approve(address(vault), shares);
        VaultAPI.DebtTerms memory t = VaultAPI.DebtTerms(
            address(this), keccak256("STOCK"), address(stock), 1000, 0, 10000, 1000, 1010, shares, snapN, snapD
        );
        vault.createDebt(id, t);
    }

    // Exercise must record economic ownership without touching delivery or changing the report ratio.
    function testClaimRecordsSnapshotOwnershipAndOnlyOwnerCanWithdrawOnceMature() public {
        _loan(1, 10e18, 1, 1);
        uint256 id = claims.recordClaim(1, BUYER, 3e18, 1, 1, 1002);
        ClaimAPI.Claim memory claim = claims.getClaim(id);
        assertEq(claim.owner, BUYER);
        assertEq(claim.snapshotShares, 3e18);
        assertEq(claim.reportMultiplierNumerator, 1);
        assertEq(claim.reportMultiplierDenominator, 1);
        assertEq(vault.remainingSnapshotShares(1), 7e18);
        assertEq(stock.balanceOf(address(vault)), 10e18);
        vm.expectRevert();
        claims.withdrawClaim(id, address(this));
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(id, BUYER);
        vm.warp(1002);
        vm.expectRevert();
        claims.withdrawClaim(id, address(this));
        vm.prank(BUYER);
        assertEq(claims.withdrawClaim(id, BUYER), 3e18);
        assertEq(stock.balanceOf(BUYER), 3e18);
        assertEq(vault.backingOf(1), 7e18);
        assertEq(vault.accountedBacking(address(stock)), 7e18);
        assertTrue(claims.getClaim(id).withdrawn);
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(id, BUYER);
    }

    function testMetadataOnlySplitCannotDeliverOrConsumeAnotherReceiptsBacking() public {
        _loan(1, 10e18, 1, 1);
        _loan(2, 100e18, 1, 1);
        stock.setMultiplier(10, 1);
        uint256 id = claims.recordClaim(1, BUYER, 10e18, 10, 1, 1000);
        vault.reduceDebt(1, 1000);
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(id, BUYER);
        assertFalse(claims.getClaim(id).withdrawn);
        assertEq(vault.backingOf(2), 100e18);
        assertEq(vault.debtOf(1), 0);
        stock.mint(address(vault), 90e18);
        vault.creditBackingFromSurplus(1, 90e18);
        vm.expectRevert();
        vault.creditBackingFromSurplus(2, 1);
        // Later metadata cannot alter the authenticated conversion recorded for this claim.
        stock.setMultiplier(100, 1);
        vm.prank(BUYER);
        assertEq(claims.withdrawClaim(id, BUYER), 100e18);
        assertEq(stock.balanceOf(address(vault)), 100e18);
        assertEq(vault.backingOf(2), 100e18);
    }

    function testPausedOrRestrictedDeliveryLeavesClaimAndDebtClosureIntact() public {
        _loan(1, 10e18, 1, 1);
        stock.setPaused(true);
        uint256 id = claims.recordClaim(1, BUYER, 5e18, 1, 1, 1000);
        vault.reduceDebt(1, 1000);
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(id, BUYER);
        assertFalse(claims.getClaim(id).withdrawn);
        assertEq(vault.backingOf(1), 10e18);
        stock.setPaused(false);
        stock.setRestricted(BUYER, true);
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(id, BUYER);
        assertFalse(claims.getClaim(id).withdrawn);
        vm.warp(2000);
        assertEq(vault.debtOf(1), 0);
        stock.setRestricted(BUYER, false);
        stock.setRestricted(address(vault), true);
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(id, BUYER);
        stock.setRestricted(address(vault), false);
        vm.prank(BUYER);
        assertEq(claims.withdrawClaim(id, BUYER), 5e18);
        assertEq(vault.debtOf(1), 0);
    }

    function testReverseSplitAndRationalSnapshotConversionFloorOnlyOnce() public {
        _loan(1, 11, 1, 1);
        uint256 reverse = claims.recordClaim(1, BUYER, 11, 1, 10, 1000);
        vm.prank(BUYER);
        assertEq(claims.withdrawClaim(reverse, BUYER), 1);
        _loan(2, 10, 1, 3);
        uint256 rational = claims.recordClaim(2, BUYER, 1, 1, 2, 1000);
        vm.prank(BUYER);
        assertEq(claims.withdrawClaim(rational, BUYER), 1);
        assertEq(stock.balanceOf(BUYER), 2);
    }

    function testConversionUsesFullWidthIntermediateProducts() public {
        uint128 factor = uint128(1) << 120;
        _loan(1, factor, factor, factor);
        uint256 id = claims.recordClaim(1, BUYER, factor, factor, factor, 1000);
        vm.prank(BUYER);
        assertEq(claims.withdrawClaim(id, BUYER), uint256(1) << 120);
        assertEq(stock.balanceOf(BUYER), uint256(1) << 120);
    }

    function testClaimValidationDoesNotBurnEconomicSharesOnFailedDelivery() public {
        _loan(1, 10, 1, 1);
        vm.prank(address(9));
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(9)));
        claims.recordClaim(1, BUYER, 1, 1, 1, 1000);
        vm.expectRevert();
        claims.recordClaim(9, BUYER, 1, 1, 1, 1000);
        vm.expectRevert();
        claims.recordClaim(1, address(0), 1, 1, 1, 1000);
        vm.expectRevert();
        claims.recordClaim(1, BUYER, 11, 1, 1, 1000);
        vm.expectRevert();
        claims.recordClaim(1, BUYER, 0, 1, 1, 1000);
        vm.expectRevert();
        claims.recordClaim(1, BUYER, 1, 0, 1, 1000);
        vm.expectRevert();
        claims.recordClaim(1, BUYER, 1, 1, 0, 1000);
        uint256 id = claims.recordClaim(1, BUYER, 1, 1, 10, 1000);
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(id, BUYER);
        assertFalse(claims.getClaim(id).withdrawn);
        uint256 other = claims.recordClaim(1, BUYER, 9, 1, 1, 1000);
        vm.expectRevert();
        vault.releaseCollateral(1, address(this), 1, 1, 1);
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(other, address(0));
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(other, address(vault));
        vm.prank(BUYER);
        assertEq(claims.withdrawClaim(other, BUYER), 9);
    }

    function testClaimFeeOrReentrantTransferRollsBackInternalClaimAndBacking() public {
        MockCashToken bad = new MockCashToken();
        bad.mint(address(this), 100);
        bad.approve(address(vault), 100);
        vault.createDebt(
            1, VaultAPI.DebtTerms(address(this), keccak256("BAD"), address(bad), 1000, 0, 10000, 1000, 1010, 100, 1, 1)
        );
        uint256 id = claims.recordClaim(1, BUYER, 50, 1, 1, 1000);
        bad.setShortTransfer(true);
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(id, BUYER);
        bad.setShortTransfer(false);
        bad.setSenderFee(1);
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(id, BUYER);
        bad.setSenderFee(0);
        bad.setTransferHook(address(vault), abi.encodeCall(ClaimAPI.withdrawClaim, (id, BUYER)));
        vm.prank(BUYER);
        vm.expectRevert();
        claims.withdrawClaim(id, BUYER);
        assertFalse(claims.getClaim(id).withdrawn);
        assertEq(vault.backingOf(1), 100);
        assertEq(bad.balanceOf(address(vault)), 100);
        bad.setTransferHook(address(0), "");
        vm.prank(BUYER);
        assertEq(claims.withdrawClaim(id, BUYER), 50);
    }

    function testFuzzRationalClaimMatchesIndependentSmallIntegerArithmetic(
        uint64 rawShares,
        uint32 rawSnapN,
        uint32 rawSnapD,
        uint32 rawReportN,
        uint32 rawReportD
    ) public {
        uint256 shares = bound(rawShares, 1, 1e18);
        uint128 snapN = uint128(bound(rawSnapN, 1, 1e9));
        uint128 snapD = uint128(bound(rawSnapD, 1, 1e9));
        uint128 reportN = uint128(bound(rawReportN, 1, 1e9));
        uint128 reportD = uint128(bound(rawReportD, 1, 1e9));
        // Independent exact integer oracle: these bounded products fit a single uint256.
        uint256 expected = shares * uint256(reportN) * snapD / (uint256(reportD) * snapN);
        _loan(1, shares, snapN, snapD);
        uint256 id = claims.recordClaim(1, BUYER, shares, reportN, reportD, 1000);
        if (expected == 0) {
            vm.prank(BUYER);
            vm.expectRevert();
            claims.withdrawClaim(id, BUYER);
            assertFalse(claims.getClaim(id).withdrawn);
        } else {
            if (expected > shares) {
                stock.mint(address(vault), expected - shares);
                vault.creditBackingFromSurplus(1, expected - shares);
            }
            vm.prank(BUYER);
            assertEq(claims.withdrawClaim(id, BUYER), expected);
            assertEq(stock.balanceOf(BUYER), expected);
            assertEq(vault.backingOf(1), shares > expected ? shares - expected : 0);
        }
    }
}
