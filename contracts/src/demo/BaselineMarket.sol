// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Errors} from "../lib/Errors.sol";
import {FixedPointMath} from "../lib/FixedPointMath.sol";
import {SettlementMath} from "../lib/SettlementMath.sol";

/// @notice Demo-only spot-price comparator. Funders donate separate reserves; no protected capital is referenced.
/// @dev No interest or liquidation bonus: losses are computed from principal and the posted spot price.
contract BaselineMarket is ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    struct Loan {
        address borrower;
        uint256 principal;
        uint256 collateral;
        bool closed;
    }
    IERC20Metadata public immutable cashToken;
    IERC20Metadata public immutable stockToken;
    address public immutable owner;
    uint256 public price;
    uint256 public totalDebt;
    uint256 public totalBadDebt;
    uint256 public nextLoanId = 1;
    mapping(uint256 loanId => Loan loan) private _loans;

    error InvalidLoan();
    error UnsafeOrigination();
    error HealthyLoan();

    constructor(address cash, address stock, address owner_) {
        if (cash == address(0) || stock == address(0) || owner_ == address(0)) revert Errors.ZeroAddress();
        cashToken = IERC20Metadata(cash);
        stockToken = IERC20Metadata(stock);
        uint8 cashDecimals = cashToken.decimals();
        uint8 stockDecimals = stockToken.decimals();
        if (cashDecimals != 6 || stockDecimals != 18) revert Errors.InvalidDecimals(stockDecimals, cashDecimals);
        owner = owner_;
    }

    function setPrice(uint256 price_) external {
        if (msg.sender != owner) revert Errors.Unauthorized(msg.sender);
        if (price_ > type(uint96).max) revert Errors.UnsupportedPrice();
        price = price_;
    }

    function fund(uint256 cash) external nonReentrant {
        if (cash == 0) revert Errors.UnsupportedCashAmount();
        _moveExact(cashToken, msg.sender, address(this), cash);
    }

    function borrow(uint256 principal, uint256 collateral) external nonReentrant returns (uint256 loanId) {
        if (principal == 0 || collateral == 0) revert InvalidLoan();
        if (SettlementMath.isUnsafe(principal, collateral, price, 6000)) revert UnsafeOrigination();
        loanId = nextLoanId++;
        _loans[loanId] = Loan(msg.sender, principal, collateral, false);
        totalDebt += principal;
        _moveExact(stockToken, msg.sender, address(this), collateral);
        _moveExact(cashToken, address(this), msg.sender, principal);
    }

    function liquidate(uint256 loanId) external nonReentrant returns (uint256 recovered, uint256 loss) {
        Loan storage loan = _activeLoan(loanId);
        if (!SettlementMath.isUnsafe(loan.principal, loan.collateral, price, 7500)) revert HealthyLoan();
        uint256 collateralValue = FixedPointMath.mulDivDown(loan.collateral, price, 1e18);
        recovered = collateralValue < loan.principal ? collateralValue : loan.principal;
        loss = loan.principal - recovered;
        loan.closed = true;
        totalDebt -= loan.principal;
        totalBadDebt += loss;
        if (recovered != 0) _moveExact(cashToken, msg.sender, address(this), recovered);
        _moveExact(stockToken, address(this), msg.sender, loan.collateral);
    }

    function repay(uint256 loanId) external nonReentrant {
        Loan storage loan = _activeLoan(loanId);
        loan.closed = true;
        totalDebt -= loan.principal;
        _moveExact(cashToken, msg.sender, address(this), loan.principal);
        _moveExact(stockToken, address(this), loan.borrower, loan.collateral);
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return _loans[loanId];
    }

    function _activeLoan(uint256 loanId) private view returns (Loan storage loan) {
        loan = _loans[loanId];
        if (loan.borrower == address(0) || loan.closed) revert InvalidLoan();
    }

    function _moveExact(IERC20Metadata token, address from, address to, uint256 amount) private {
        if (from == to) revert Errors.InvalidTokenBalanceDelta(amount, 0);
        uint256 senderBefore = token.balanceOf(from);
        uint256 recipientBefore = token.balanceOf(to);
        if (from == address(this)) token.safeTransfer(to, amount);
        else token.safeTransferFrom(from, to, amount);
        uint256 senderAfter = token.balanceOf(from);
        uint256 recipientAfter = token.balanceOf(to);
        uint256 spent = senderBefore >= senderAfter ? senderBefore - senderAfter : 0;
        uint256 received = recipientAfter >= recipientBefore ? recipientAfter - recipientBefore : 0;
        if (spent != amount) revert Errors.InvalidTokenBalanceDelta(amount, spent);
        if (received != amount) revert Errors.InvalidTokenBalanceDelta(amount, received);
    }
}
