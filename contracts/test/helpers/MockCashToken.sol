// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract MockCashToken {
    string public constant name = "Mock Cash";
    string public constant symbol = "mCASH";
    uint8 public constant decimals = 6;

    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    bool public shortTransferFrom;
    bool public shortTransfer;
    bool public failTransfer;
    address public transferHookTarget;
    bytes public transferHookData;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (failTransfer) return false;
        uint256 delivered = shortTransfer && amount != 0 ? amount - 1 : amount;
        _move(msg.sender, to, delivered);
        if (transferHookTarget != address(0)) {
            (bool ok, bytes memory result) = transferHookTarget.call(transferHookData);
            if (!ok) {
                assembly ("memory-safe") {
                    revert(add(result, 32), mload(result))
                }
            }
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 approved = allowance[from][msg.sender];
        require(approved >= amount, "allowance");
        allowance[from][msg.sender] = approved - amount;
        uint256 delivered = shortTransferFrom && amount != 0 ? amount - 1 : amount;
        _move(from, to, delivered);
        return true;
    }

    function setShortTransferFrom(bool enabled) external {
        shortTransferFrom = enabled;
    }

    function setShortTransfer(bool enabled) external {
        shortTransfer = enabled;
    }

    function setFailTransfer(bool enabled) external {
        failTransfer = enabled;
    }

    function setTransferHook(address target, bytes calldata data) external {
        transferHookTarget = target;
        transferHookData = data;
    }

    function _move(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
