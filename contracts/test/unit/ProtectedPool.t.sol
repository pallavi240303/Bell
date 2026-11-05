// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ProtectedPool} from "../../src/ProtectedPool.sol";
import {MockCashToken} from "../helpers/MockCashToken.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {BaselineMarket} from "../../src/demo/BaselineMarket.sol";
import {MockStockToken} from "../../src/demo/MockStockToken.sol";
import {LoanVault} from "../../src/LoanVault.sol";
import {VaultAPI} from "./LoanVault.t.sol";

interface BaselineAPI {
    struct Loan {
        address borrower;
        uint256 principal;
        uint256 collateral;
        bool closed;
    }
    function setPrice(uint256 price) external;
    function fund(uint256 cash) external;
    function borrow(uint256 principal, uint256 collateral) external returns (uint256);
    function liquidate(uint256 loanId) external returns (uint256 recovered, uint256 loss);
    function repay(uint256 loanId) external;
    function getLoan(uint256 loanId) external view returns (Loan memory);
    function totalDebt() external view returns (uint256);
    function totalBadDebt() external view returns (uint256);
}

interface PoolDebtAPI {
    function registerLoan(uint256 receiptId) external;
    function closeLoan(uint256 receiptId) external;
    function totalAssets() external view returns (uint256);
    function activeReceiptIds() external view returns (uint256[] memory);
    function redeem(uint256 shares, address to) external returns (uint256);
    function disburse(address to, uint256 assets) external;
}

contract PoolCash is ERC20 {
    constructor() ERC20("Cash", "CASH") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ProtectedPoolTest is Test {
    MockCashToken internal token;
    ProtectedPool internal p;
    PoolDebtAPI internal api;
    mapping(uint256 => uint256) public debtOf;

    function setUp() public {
        token = new MockCashToken();
        p = new ProtectedPool(address(token), address(this));
        p.initialize(address(this));
        api = PoolDebtAPI(address(p));
        token.mint(address(this), 10_000);
        token.approve(address(p), type(uint256).max);
    }

    // Missing live debt in the share denominator would dilute existing lenders.
    function testDepositUsesExactLiveDebtNAV() public {
        p.deposit(100);
        debtOf[1] = 101;
        api.registerLoan(1);
        assertEq(api.totalAssets(), 201);
        assertEq(p.deposit(100), 50e12);
        debtOf[1] = 150;
        assertEq(api.totalAssets(), 350);
    }

    function testActiveSetRejectsUnauthorizedZeroDuplicateAndOverflow() public {
        vm.prank(address(9));
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(9)));
        api.registerLoan(1);
        vm.expectRevert(Errors.InvalidReceiptId.selector);
        api.registerLoan(0);
        for (uint256 i = 1; i <= 32; i++) {
            debtOf[i] = i;
            api.registerLoan(i);
        }
        vm.expectRevert();
        api.registerLoan(1);
        vm.expectRevert();
        api.registerLoan(33);
        assertEq(api.activeReceiptIds().length, 32);
        assertEq(api.totalAssets(), 528);
    }

    function testClosureRequiresZeroDebtAndRemovesExactlyOneId() public {
        debtOf[1] = 7;
        debtOf[2] = 11;
        debtOf[3] = 13;
        api.registerLoan(1);
        api.registerLoan(2);
        api.registerLoan(3);
        vm.expectRevert();
        api.closeLoan(2);
        debtOf[2] = 0;
        vm.prank(address(9));
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(9)));
        api.closeLoan(2);
        api.closeLoan(2);
        assertEq(api.totalAssets(), 20);
        uint256[] memory ids = api.activeReceiptIds();
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 3);
        vm.expectRevert();
        api.closeLoan(2);
        debtOf[3] = 0;
        api.closeLoan(3);
        assertEq(api.totalAssets(), 7);
    }

    // A NAV-backed but illiquid redemption must not burn shares or steal other balances.
    function testRedemptionIsLimitedByLiquidityAndBurnsOnlyCallerShares() public {
        p.deposit(100);
        debtOf[1] = 80;
        api.registerLoan(1);
        api.disburse(address(7), 80);
        assertEq(api.totalAssets(), 100);
        assertEq(token.balanceOf(address(7)), 80);
        vm.expectRevert();
        api.redeem(21e12, address(this));
        assertEq(p.balanceOf(address(this)), 100e12);
        vm.prank(address(9));
        vm.expectRevert();
        api.redeem(1e12, address(9));
        assertEq(api.redeem(20e12, address(8)), 20);
        assertEq(token.balanceOf(address(8)), 20);
        assertEq(p.balanceOf(address(this)), 80e12);
        assertEq(api.totalAssets(), 80);
    }

    function testVirtualOffsetsAbsorbDonationAndFloorBothConversions() public {
        p.deposit(1);
        token.mint(address(p), 1);
        assertEq(p.deposit(1), 666_666_666_666);
        vm.expectRevert();
        api.redeem(1, address(this));
        assertEq(api.redeem(1e12, address(this)), 1);
        token.mint(address(p), 2e12);
        vm.expectRevert();
        p.deposit(1);
        vm.expectRevert();
        p.deposit(0);
    }

    function testDisburseIsManagerOnlyAndCannotSendToZeroOrSelf() public {
        p.deposit(100);
        vm.prank(address(9));
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(9)));
        api.disburse(address(9), 1);
        vm.expectRevert();
        api.disburse(address(0), 1);
        vm.expectRevert();
        api.disburse(address(p), 1);
        vm.expectRevert();
        api.disburse(address(9), 101);
        vm.expectRevert();
        api.disburse(address(9), 0);
        api.disburse(address(9), 1);
        assertEq(token.balanceOf(address(9)), 1);
    }

    function testTransferFeesAndReentrancyRollbackRedemptionAndDisbursement() public {
        p.deposit(100);
        token.setShortTransfer(true);
        vm.expectRevert();
        api.redeem(10e12, address(8));
        vm.expectRevert();
        api.disburse(address(8), 10);
        token.setShortTransfer(false);
        token.setSenderFee(1);
        vm.expectRevert();
        api.redeem(10e12, address(8));
        vm.expectRevert();
        api.disburse(address(8), 10);
        token.setSenderFee(0);
        token.setTransferHook(address(p), abi.encodeCall(PoolDebtAPI.redeem, (1e12, address(8))));
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        api.redeem(10e12, address(8));
        assertEq(token.balanceOf(address(p)), 100);
        assertEq(token.balanceOf(address(8)), 0);
        assertEq(p.totalSupply(), 100e12);
        token.setTransferHook(address(0), "");
        assertEq(api.redeem(10e12, address(8)), 10);
        api.disburse(address(8), 10);
        assertEq(token.balanceOf(address(8)), 20);
    }

    function testDepositFeesRollbackBalancesAllowanceAndShares() public {
        uint256 approved = token.allowance(address(this), address(p));
        token.setShortTransferFrom(true);
        vm.expectRevert();
        p.deposit(10);
        token.setShortTransferFrom(false);
        token.setSenderFee(1);
        vm.expectRevert();
        p.deposit(10);
        assertEq(token.balanceOf(address(p)), 0);
        assertEq(token.balanceOf(address(this)), 10_000);
        assertEq(token.allowance(address(this), address(p)), approved);
        assertEq(p.totalSupply(), 0);
    }

    function testBindingIsOwnerOnlyNonzeroAndOneShot() public {
        ProtectedPool fresh = new ProtectedPool(address(token), address(this));
        vm.prank(address(9));
        vm.expectRevert(abi.encodeWithSelector(Errors.Unauthorized.selector, address(9)));
        fresh.initialize(address(9));
        vm.expectRevert(Errors.ZeroAddress.selector);
        fresh.initialize(address(0));
        fresh.initialize(address(this));
        vm.expectRevert(Errors.AlreadyInitialized.selector);
        fresh.initialize(address(9));
    }

    // A representable mint must not leave totalSupply + virtualShares overflowing forever.
    function testDepositCannotOverflowVirtualShareHeadroomAndLockRedemption() public {
        uint256 enormous = type(uint256).max / 1e12;
        token.mint(address(9), enormous);
        vm.startPrank(address(9));
        token.approve(address(p), enormous);
        vm.expectRevert(Errors.MathResultOverflow.selector);
        p.deposit(enormous);
        vm.stopPrank();
        assertEq(p.totalSupply(), 0);
        assertEq(token.balanceOf(address(p)), 0);
        assertEq(p.deposit(1), 1e12);
        assertEq(api.redeem(1e12, address(this)), 1);
    }

    // A comparator crash must change only its own cash/debt and collateral custody.
    function testBaselineLossCannotReachProtectedCashOrVaultCollateral() public {
        p.deposit(1000);
        debtOf[1] = 20;
        api.registerLoan(1);
        MockStockToken stock = new MockStockToken(address(this));
        VaultAPI vault = VaultAPI(address(new LoanVault(address(this))));
        vault.initialize(address(this));
        stock.mint(address(this), 110e18);
        stock.approve(address(vault), 100e18);
        vault.createDebt(
            1,
            VaultAPI.DebtTerms(
                address(this),
                keccak256("STOCK"),
                address(stock),
                20,
                0,
                1,
                uint64(block.timestamp),
                uint64(block.timestamp + 100),
                100e18,
                1,
                1
            )
        );
        BaselineAPI base = BaselineAPI(address(new BaselineMarket(address(token), address(stock), address(this))));
        token.approve(address(base), type(uint256).max);
        stock.approve(address(base), 10e18);
        base.fund(1000);
        base.setPrice(100);
        uint256 loanId = base.borrow(600, 10e18);
        assertEq(token.balanceOf(address(base)), 400);
        base.setPrice(20);
        (uint256 recovered, uint256 loss) = base.liquidate(loanId);
        assertEq(recovered, 200);
        assertEq(loss, 400);
        assertEq(base.totalBadDebt(), 400);
        assertEq(base.totalDebt(), 0);
        assertEq(token.balanceOf(address(base)), 600);
        assertEq(api.totalAssets(), 1020);
        assertEq(token.balanceOf(address(p)), 1000);
        assertEq(p.balanceOf(address(this)), 1000e12);
        assertEq(stock.balanceOf(address(vault)), 100e18);
        assertEq(vault.backingOf(1), 100e18);
        assertEq(token.allowance(address(p), address(base)), 0);
        assertEq(stock.allowance(address(vault), address(base)), 0);
        vm.prank(address(base));
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(base)));
        api.disburse(address(base), 1);
        vm.prank(address(base));
        vm.expectRevert(abi.encodeWithSelector(Errors.UnauthorizedManager.selector, address(base)));
        vault.releaseCollateral(1, address(base), 1, 1, 1);
    }

    function testBaselineBorrowLiquidationAndRepaymentUseRealBalances() public {
        MockStockToken stock = new MockStockToken(address(this));
        BaselineAPI base = BaselineAPI(address(new BaselineMarket(address(token), address(stock), address(this))));
        token.approve(address(base), type(uint256).max);
        stock.mint(address(this), 30e18);
        stock.approve(address(base), type(uint256).max);
        base.fund(1000);
        base.setPrice(100);
        vm.prank(address(9));
        vm.expectRevert();
        base.setPrice(1);
        vm.expectRevert();
        base.borrow(601, 10e18);
        vm.expectRevert();
        base.borrow(0, 10e18);
        vm.expectRevert();
        base.borrow(1, 0);
        uint256 first = base.borrow(600, 10e18);
        vm.expectRevert();
        base.liquidate(first);
        vm.expectRevert();
        base.borrow(600, 10e18);
        base.repay(first);
        assertTrue(base.getLoan(first).closed);
        assertEq(token.balanceOf(address(base)), 1000);
        assertEq(stock.balanceOf(address(this)), 30e18);
        vm.expectRevert();
        base.repay(first);
        uint256 second = base.borrow(600, 10e18);
        base.setPrice(0);
        (uint256 recovered, uint256 loss) = base.liquidate(second);
        assertEq(recovered, 0);
        assertEq(loss, 600);
        assertEq(token.balanceOf(address(base)), 400);
        vm.expectRevert();
        base.liquidate(second);
        vm.expectRevert();
        base.liquidate(9);
    }

    function testBaselineTransferFailuresRestoreLoansAndReserves() public {
        MockStockToken stock = new MockStockToken(address(this));
        BaselineAPI base = BaselineAPI(address(new BaselineMarket(address(token), address(stock), address(this))));
        token.approve(address(base), type(uint256).max);
        stock.mint(address(this), 10e18);
        stock.approve(address(base), type(uint256).max);
        token.setShortTransferFrom(true);
        vm.expectRevert();
        base.fund(1000);
        token.setShortTransferFrom(false);
        token.setSenderFee(1);
        vm.expectRevert();
        base.fund(1000);
        token.setSenderFee(0);
        base.fund(1000);
        base.setPrice(100);
        token.setShortTransfer(true);
        vm.expectRevert();
        base.borrow(600, 10e18);
        token.setShortTransfer(false);
        token.setSenderFee(1);
        vm.expectRevert();
        base.borrow(600, 10e18);
        assertEq(base.totalDebt(), 0);
        assertEq(stock.balanceOf(address(this)), 10e18);
        assertEq(token.balanceOf(address(base)), 1000);
        token.setSenderFee(0);
        uint256 id = base.borrow(600, 10e18);
        token.setShortTransferFrom(true);
        vm.expectRevert();
        base.repay(id);
        token.setShortTransferFrom(false);
        base.setPrice(20);
        stock.setPaused(true);
        vm.expectRevert();
        base.liquidate(id);
        assertFalse(base.getLoan(id).closed);
        assertEq(base.totalDebt(), 600);
        assertEq(base.totalBadDebt(), 0);
        assertEq(token.balanceOf(address(base)), 400);
        stock.setPaused(false);
        base.liquidate(id);
        assertEq(base.totalBadDebt(), 400);
    }

    function testBaselineConstructorRejectsInvalidCustodyTokensAndOwner() public {
        MockStockToken stock = new MockStockToken(address(this));
        vm.expectRevert();
        new BaselineMarket(address(0), address(stock), address(this));
        vm.expectRevert();
        new BaselineMarket(address(token), address(0), address(this));
        vm.expectRevert();
        new BaselineMarket(address(token), address(stock), address(0));
        vm.expectRevert();
        new BaselineMarket(address(stock), address(token), address(this));
    }

    function testDepositRequiresBoundManagerAndMintsOffsetShares() public {
        PoolCash cash = new PoolCash();
        ProtectedPool pool = new ProtectedPool(address(cash), address(this));
        cash.mint(address(this), 100);
        cash.approve(address(pool), 100);
        vm.expectRevert();
        pool.deposit(100);
        pool.initialize(address(1));
        assertEq(pool.deposit(100), 100e12);
        assertEq(pool.balanceOf(address(this)), 100e12);
        assertEq(cash.balanceOf(address(pool)), 100);
    }
}

/// @dev Task 5 harness only: the production CoverManager is implemented in the next task.
contract VaultPoolManagerHarness {
    ProtectedPool public immutable pool;
    LoanVault public immutable vault;
    MockCashToken public immutable cash;

    constructor(ProtectedPool pool_, LoanVault vault_, MockCashToken cash_) {
        pool = pool_;
        vault = vault_;
        cash = cash_;
    }

    function debtOf(uint256 id) external view returns (uint256) {
        return vault.debtOf(id);
    }

    function open(uint256 id, LoanVault.DebtTerms calldata terms) external {
        vault.createDebt(id, terms);
        pool.registerLoan(id);
        pool.disburse(terms.borrower, terms.originalPrincipal);
    }

    function repayAndClose(uint256 id, address payer) external {
        uint256 debt = vault.debtOf(id);
        require(cash.transferFrom(payer, address(pool), debt), "harness cash transfer");
        vault.reduceDebt(id, vault.getDebt(id).cumulativeDebtReduction + debt);
        pool.closeLoan(id);
    }
}

contract ProtectedPoolBoundTest is Test {
    MockCashToken internal cash;
    ProtectedPool internal pool;
    LoanVault internal vault;
    VaultPoolManagerHarness internal manager;
    MockStockToken internal stock;

    function setUp() public {
        vm.warp(1000);
        cash = new MockCashToken();
        stock = new MockStockToken(address(this));
        pool = new ProtectedPool(address(cash), address(this));
        vault = new LoanVault(address(this));
        manager = new VaultPoolManagerHarness(pool, vault, cash);
        pool.initialize(address(manager));
        vault.initialize(address(manager));
        cash.mint(address(this), 1_000_000);
        cash.approve(address(pool), type(uint256).max);
        cash.approve(address(manager), type(uint256).max);
        stock.mint(address(this), 320e18);
        stock.approve(address(vault), type(uint256).max);
        pool.deposit(64_000);
        LoanVault.DebtTerms memory terms = LoanVault.DebtTerms(
            address(this), keccak256("STOCK"), address(stock), 1000, 800, 10000, 1000, 1010, 10e18, 1, 1
        );
        for (uint256 id = 1; id <= 32; ++id) {
            manager.open(id, terms);
        }
        vm.warp(1005);
    }

    function _cool() internal {
        vm.cool(address(pool));
        vm.cool(address(vault));
        vm.cool(address(manager));
        vm.cool(address(cash));
    }

    function testBenchmarkExactNAVSupplyRedemptionAndClosureAt32ActiveLoans() public {
        assertEq(pool.totalAssets(), 76_800);
        _cool();
        uint256 start = gasleft();
        uint256 nav = pool.totalAssets();
        uint256 used = start - gasleft();
        assertEq(nav, 76_800);
        emit log_named_uint("cold 32-loan NAV gas", used);
        assertLt(used, 1_000_000);
        _cool();
        start = gasleft();
        uint256 shares = pool.deposit(76_801);
        used = start - gasleft();
        assertEq(shares, 64_001e12);
        emit log_named_uint("cold 32-loan deposit gas", used);
        assertLt(used, 1_000_000);
        _cool();
        start = gasleft();
        uint256 redeemed = pool.redeem(shares, address(this));
        used = start - gasleft();
        assertEq(redeemed, 76_801);
        emit log_named_uint("cold 32-loan redemption gas", used);
        assertLt(used, 1_000_000);
        _cool();
        start = gasleft();
        manager.repayAndClose(16, address(this));
        used = start - gasleft();
        emit log_named_uint("cold 32-loan repayment and close harness gas", used);
        assertLt(used, 1_000_000);
        assertEq(pool.activeReceiptIds().length, 31);
        assertEq(pool.totalAssets(), 76_800);
        assertEq(vault.debtOf(16), 0);
        vm.warp(2000);
        assertEq(pool.totalAssets(), 89_200);
        assertEq(vault.debtOf(16), 0);
    }
}
