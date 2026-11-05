// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Errors} from "./lib/Errors.sol";
import {FixedPointMath} from "./lib/FixedPointMath.sol";
import {Types} from "./lib/Types.sol";

interface IPoolDebtProvider {
    function debtOf(uint256 receiptId) external view returns (uint256);
}

contract ProtectedPool is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    IERC20Metadata public immutable cashToken;
    address public immutable owner;
    address public coverManager;
    uint256[] private _activeReceiptIds;
    mapping(uint256 receiptId => uint256 indexPlusOne) private _activeIndex;

    error ActiveReceiptLimit();
    error DebtNotClosed();
    error ZeroConversion();
    error InsufficientLiquidity();

    modifier onlyManager() {
        if (msg.sender != coverManager) revert Errors.UnauthorizedManager(msg.sender);
        _;
    }

    constructor(address cashToken_, address owner_) ERC20("Protected Pool Share", "BELL-P") {
        if (cashToken_ == address(0) || owner_ == address(0)) revert Errors.ZeroAddress();
        cashToken = IERC20Metadata(cashToken_);
        if (cashToken.decimals() != 6) revert Errors.InvalidDecimals(18, cashToken.decimals());
        owner = owner_;
    }

    function initialize(address manager) external {
        if (msg.sender != owner) revert Errors.Unauthorized(msg.sender);
        if (coverManager != address(0)) revert Errors.AlreadyInitialized();
        if (manager == address(0)) revert Errors.ZeroAddress();
        coverManager = manager;
    }

    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (coverManager == address(0)) revert Errors.NotInitialized();
        uint256 poolBefore = cashToken.balanceOf(address(this));
        shares = FixedPointMath.mulDivDown(assets, totalSupply() + 1e12, totalAssets() + 1);
        if (shares == 0) revert ZeroConversion();
        if (shares > type(uint256).max - 1e12 - totalSupply()) revert Errors.MathResultOverflow();
        uint256 senderBefore = cashToken.balanceOf(msg.sender);
        cashToken.safeTransferFrom(msg.sender, address(this), assets);
        uint256 senderAfter = cashToken.balanceOf(msg.sender);
        uint256 poolAfter = cashToken.balanceOf(address(this));
        uint256 spent = senderBefore >= senderAfter ? senderBefore - senderAfter : 0;
        uint256 received = poolAfter >= poolBefore ? poolAfter - poolBefore : 0;
        if (spent != assets) revert Errors.InvalidTokenBalanceDelta(assets, spent);
        if (received != assets) revert Errors.InvalidTokenBalanceDelta(assets, received);
        _mint(msg.sender, shares);
    }

    function redeem(uint256 shares, address to) external nonReentrant returns (uint256 assets) {
        if (to == address(0)) revert Errors.ZeroAddress();
        assets = FixedPointMath.mulDivDown(shares, totalAssets() + 1, totalSupply() + 1e12);
        if (assets == 0) revert ZeroConversion();
        if (assets > cashToken.balanceOf(address(this))) revert InsufficientLiquidity();
        _burn(msg.sender, shares);
        _pushExact(to, assets);
    }

    function disburse(address to, uint256 assets) external nonReentrant onlyManager {
        if (to == address(0)) revert Errors.ZeroAddress();
        if (assets == 0) revert ZeroConversion();
        if (assets > cashToken.balanceOf(address(this))) revert InsufficientLiquidity();
        _pushExact(to, assets);
    }

    function _pushExact(address to, uint256 assets) private {
        if (to == address(this)) revert Errors.InvalidTokenBalanceDelta(assets, 0);
        uint256 senderBefore = cashToken.balanceOf(address(this));
        uint256 recipientBefore = cashToken.balanceOf(to);
        cashToken.safeTransfer(to, assets);
        uint256 senderAfter = cashToken.balanceOf(address(this));
        uint256 recipientAfter = cashToken.balanceOf(to);
        uint256 spent = senderBefore >= senderAfter ? senderBefore - senderAfter : 0;
        uint256 received = recipientAfter >= recipientBefore ? recipientAfter - recipientBefore : 0;
        if (spent != assets) revert Errors.InvalidTokenBalanceDelta(assets, spent);
        if (received != assets) revert Errors.InvalidTokenBalanceDelta(assets, received);
    }

    function registerLoan(uint256 receiptId) external onlyManager {
        if (receiptId == 0 || _activeIndex[receiptId] != 0) revert Errors.InvalidReceiptId();
        if (_activeReceiptIds.length == Types.REQUIRED_MAX_ACTIVE_RECEIPTS) revert ActiveReceiptLimit();
        _activeReceiptIds.push(receiptId);
        _activeIndex[receiptId] = _activeReceiptIds.length;
    }

    function closeLoan(uint256 receiptId) external onlyManager {
        uint256 index = _activeIndex[receiptId];
        if (index == 0) revert Errors.InvalidReceiptId();
        if (IPoolDebtProvider(coverManager).debtOf(receiptId) != 0) revert DebtNotClosed();
        uint256 last = _activeReceiptIds[_activeReceiptIds.length - 1];
        _activeReceiptIds[index - 1] = last;
        _activeIndex[last] = index;
        _activeReceiptIds.pop();
        delete _activeIndex[receiptId];
    }

    function totalAssets() public view returns (uint256 assets) {
        assets = cashToken.balanceOf(address(this));
        for (uint256 i; i < _activeReceiptIds.length; ++i) {
            assets += IPoolDebtProvider(coverManager).debtOf(_activeReceiptIds[i]);
        }
    }

    function activeReceiptIds() external view returns (uint256[] memory) {
        return _activeReceiptIds;
    }
}
