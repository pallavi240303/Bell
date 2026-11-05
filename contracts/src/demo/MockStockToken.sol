// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Errors} from "../lib/Errors.sol";

/// @notice Demo issuer metadata never rebases balances. Split backing must be issued separately.
contract MockStockToken is ERC20 {
    address public immutable owner;
    bool public paused;
    mapping(address account => bool blocked) public restricted;
    uint128 public multiplierNumerator = 1;
    uint128 public multiplierDenominator = 1;

    error TransfersPaused();
    error RestrictedAddress(address account);

    constructor(address owner_) ERC20("Mock Stock", "mSTOCK") {
        if (owner_ == address(0)) revert Errors.ZeroAddress();
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Errors.Unauthorized(msg.sender);
        _;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
    }

    function setRestricted(address account, bool blocked) external onlyOwner {
        restricted[account] = blocked;
    }

    function setMultiplier(uint128 numerator, uint128 denominator) external onlyOwner {
        if (numerator == 0 || denominator == 0) revert Errors.InvalidMultiplier();
        multiplierNumerator = numerator;
        multiplierDenominator = denominator;
    }

    function _update(address from, address to, uint256 amount) internal override {
        // Issuance is separate from physical delivery; an issuer can back a paused claim.
        if (from != address(0)) {
            if (paused) revert TransfersPaused();
            if (restricted[from]) revert RestrictedAddress(from);
            if (restricted[to]) revert RestrictedAddress(to);
        }
        super._update(from, to, amount);
    }
}
