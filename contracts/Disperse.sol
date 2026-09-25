// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @notice Kirim ETH / ERC-20 ke banyak alamat dalam satu transaksi (hemat gas).
///         Antarmuka sama dengan disperse.app, jadi bot DIVIDEN bisa langsung memakainya.
contract Disperse {
    function disperseEther(address[] calldata recipients, uint256[] calldata values) external payable {
        require(recipients.length == values.length, "length mismatch");
        uint256 sent;
        for (uint256 i = 0; i < recipients.length; i++) {
            (bool ok, ) = recipients[i].call{value: values[i]}("");
            require(ok, "eth transfer failed");
            sent += values[i];
        }
        require(sent == msg.value, "value mismatch");
    }

    function disperseToken(IERC20 token, address[] calldata recipients, uint256[] calldata values) external {
        require(recipients.length == values.length, "length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            require(token.transferFrom(msg.sender, recipients[i], values[i]), "token transfer failed");
        }
    }
}
