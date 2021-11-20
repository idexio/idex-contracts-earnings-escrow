// SPDX-License-Identifier: LGPL-3.0-only

// IGNORE This is generated by Truffle
// https://www.trufflesuite.com/docs/truffle/getting-started/running-migrations#initial-migration

pragma solidity 0.6.8;

contract Migrations {
  address public owner;
  uint256 public last_completed_migration;

  constructor() public {
    owner = msg.sender;
  }

  modifier restricted() {
    if (msg.sender == owner) _;
  }

  function setCompleted(uint256 completed) public restricted {
    last_completed_migration = completed;
  }
}
