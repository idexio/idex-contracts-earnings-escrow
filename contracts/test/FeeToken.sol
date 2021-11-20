// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.6.8;

import { ERC20 } from '@openzeppelin/contracts/token/ERC20/ERC20.sol';


contract FeeToken is ERC20 {
  uint256 public INITIAL_SUPPLY = 10**32;

  constructor() public ERC20('FeeToken', 'FTKN') {
    _mint(msg.sender, INITIAL_SUPPLY);
  }

  function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
      _transfer(_msgSender(), recipient, amount - 1);
      return true;
  }
}
