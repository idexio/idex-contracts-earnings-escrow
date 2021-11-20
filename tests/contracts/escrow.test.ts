import { v1 as uuidv1 } from 'uuid';

import { FeeTokenInstance } from '../../types/truffle-contracts/FeeToken';
import { TestTokenInstance } from '../../types/truffle-contracts/TestToken';

import { ethAddress, getSignature } from './helpers';
import {
  getStakingDistributionHash,
  getStakingEscrowDistributeArguments,
  SignedAssetDistribution,
} from '../../lib';

contract('EarningsEscrow', (accounts) => {
  let token: TestTokenInstance;
  let feeToken: FeeTokenInstance;

  const EarningsEscrow = artifacts.require('EarningsEscrow');

  const FeeToken = artifacts.require('FeeToken');
  const Token = artifacts.require('TestToken');

  beforeEach(async () => {
    feeToken = await FeeToken.new();
    token = await Token.new();
  });

  describe('constructor', () => {
    it('should work', async () => {
      await EarningsEscrow.new(
        token.address,
        accounts[0],
      );
    });

    it('should fail for non-contract token address', async () => {
      let error;
      try {
        await EarningsEscrow.new('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', accounts[0]);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Invalid asset address/i);
    });
  });

  describe('getAssetAddress', () => {
    it('should work with an ERC20 token', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );
      const assetAddress = await escrow.getAssetAddress();
      expect(assetAddress).to.equal(token.address);
    });

    it('should work with native asset', async () => {
      const escrow = await EarningsEscrow.new(
        ethAddress,
        accounts[0],
      );
      const assetAddress = await escrow.getAssetAddress();
      expect(assetAddress).to.equal(ethAddress);
    });
  });

  describe('loadTotalDistributed', () => {
    it('should fail with zero address', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );
      let error;
      try {
        await escrow.loadTotalDistributed(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Invalid wallet address/i);
    });
  });

  describe('setAdmin', async () => {
    it('should work for valid address', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      await escrow.setAdmin(accounts[1]);
    });

    it('should revert for empty address', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      let error;
      try {
        await escrow.setAdmin(ethAddress);
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet address/i);
    });

    it('should revert for setting same address as current', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );
      await escrow.setAdmin(accounts[1]);

      let error;
      try {
        await escrow.setAdmin(accounts[1]);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/must be different/i);
    });

    it('should revert when not called by owner', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      let error;
      try {
        await escrow.setAdmin(accounts[1], { from: accounts[1] });
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/caller must be owner/i);
    });
  });

  describe('removeAdmin', async () => {
    it('should work', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      await escrow.removeAdmin();
    });
  });

  describe('setExchange', () => {
    it('should work', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      await escrow.setExchange(accounts[1]);
      const events = await escrow.getPastEvents('ExchangeChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(events[0].returnValues.previousValue).to.equal(accounts[0]);
      expect(events[0].returnValues.newValue).to.equal(accounts[1]);
    });

    it('should fail for non-admin caller', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      let error;
      try {
        await escrow.setExchange(accounts[1], { from: accounts[1] });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Caller must be admin/i);
    });

    it('should fail for invalid address', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      let error;
      try {
        await escrow.setExchange(ethAddress);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Invalid wallet address/i);
    });

    it('should fail setting same address', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      let error;
      try {
        await escrow.setExchange(accounts[0]);
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /Must be different from current exchange/i,
      );
    });
  });

  describe('removeExchange', () => {
    it('should work', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      await escrow.setExchange(accounts[1]);
      await escrow.removeExchange();

      const events = await escrow.getPastEvents('ExchangeChanged', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(2);
      expect(events[1].returnValues.previousValue).to.equal(accounts[1]);
      expect(events[1].returnValues.newValue).to.equal(ethAddress);
    });
  });

  describe('distribute', () => {
    it('should work for native token', async() => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const depositQuantity = web3.utils.toWei('1.0', 'ether').toString();
      const distributionQuantity = web3.utils.toWei('0.5', 'ether').toString();

      const escrow = await EarningsEscrow.new(
        ethAddress,
        exchangeWallet,
      );

      await web3.eth.sendTransaction({
        from: accounts[0],
        to: escrow.address,
        value: depositQuantity,
      });

      await escrow.distribute(
        getStakingEscrowDistributeArguments(
          await getSignedDistribution(
            escrow.address,
            '00000000-0000-0000-0000-000000000000',
            exchangeWallet,
            targetWallet,
            ethAddress,
            distributionQuantity,
            web3,
          ),
        ),
        { from: targetWallet },
      );

      const events = await escrow.getPastEvents('AssetsDistributed', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(events[0].returnValues.wallet).to.equal(targetWallet);
      expect(events[0].returnValues.quantity).to.equal(distributionQuantity);
      expect(events[0].returnValues.totalQuantity).to.equal(distributionQuantity);

      const tokenEvents = await escrow.getPastEvents('NativeAssetEscrowed', {
        fromBlock: 0,
      });
      expect(tokenEvents).to.be.an('array');
      expect(tokenEvents.length).to.equal(1);
      expect(tokenEvents[0].returnValues.from).to.equal(accounts[0]);
      expect(tokenEvents[0].returnValues.quantity).to.equal(depositQuantity);

    });

    it('should fail for native token when underfunded', async() => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const depositQuantity = web3.utils.toWei('1.0', 'ether').toString();
      const distributionQuantity = web3.utils.toWei('5.0', 'ether').toString();

      const escrow = await EarningsEscrow.new(
        ethAddress,
        exchangeWallet,
      );

      await web3.eth.sendTransaction({
        from: accounts[0],
        to: escrow.address,
        value: depositQuantity,
      });

      let error;
      try {
        await escrow.distribute(
          getStakingEscrowDistributeArguments(
            await getSignedDistribution(
              escrow.address,
              '00000000-0000-0000-0000-000000000000',
              exchangeWallet,
              targetWallet,
              ethAddress,
              distributionQuantity,
              web3,
            ),
          ),
          { from: targetWallet },
        );
      } catch(e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /ETH transfer failed/i,
      );
    });

    it('should work', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        exchangeWallet,
      );

      await token.transfer(escrow.address, quantity);

      await escrow.distribute(
        getStakingEscrowDistributeArguments(
          await getSignedDistribution(
            escrow.address,
            '00000000-0000-0000-0000-000000000000',
            exchangeWallet,
            targetWallet,
            token.address,
            quantity,
            web3,
          ),
        ),
        { from: targetWallet },
      );

      const events = await escrow.getPastEvents('AssetsDistributed', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(events[0].returnValues.wallet).to.equal(targetWallet);
      expect(events[0].returnValues.quantity).to.equal(quantity);
      expect(events[0].returnValues.totalQuantity).to.equal(quantity);

      const tokenEvents = await token.getPastEvents('Transfer', {
        fromBlock: 0,
      });
      expect(tokenEvents).to.be.an('array');
      expect(tokenEvents.length).to.equal(3);
      expect(tokenEvents[2].returnValues.from).to.equal(escrow.address);
      expect(tokenEvents[2].returnValues.to).to.equal(targetWallet);
      expect(tokenEvents[2].returnValues.value).to.equal(quantity);
    });

    it('should fail when underfunded', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const quantity = '10000000';
      const distributionQuantity = '20000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        exchangeWallet,
      );

      await token.transfer(escrow.address, quantity);

      let error;

      try {
        await escrow.distribute(
          getStakingEscrowDistributeArguments(
            await getSignedDistribution(
              escrow.address,
              '00000000-0000-0000-0000-000000000000',
              exchangeWallet,
              targetWallet,
              token.address,
              distributionQuantity,
              web3,
            ),
          ),
          { from: targetWallet },
        );
      } catch(e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /ERC20: transfer amount exceeds balance/i,
      );
    });

    it('should fail for a token that takes fees', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const quantity = '20000000';
      const distributionQuantity = '10000000';

      const escrow = await EarningsEscrow.new(
        feeToken.address,
        exchangeWallet,
      );

      await feeToken.transfer(escrow.address, quantity);

      let error;
      try {
        await escrow.distribute(
          getStakingEscrowDistributeArguments(
            await getSignedDistribution(
              escrow.address,
              '00000000-0000-0000-0000-000000000000',
              exchangeWallet,
              targetWallet,
              feeToken.address,
              distributionQuantity,
              web3,
            ),
          ),
          { from: targetWallet },
        );
      } catch(e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /Token contract returned transfer success without expected balance change/i,
      );
    });

    it('should work for multiple distributions', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        exchangeWallet,
      );

      await token.transfer(escrow.address, `${quantity}0`); // Transfer in 10x

      const signedDistribution1 = await getSignedDistribution(
        escrow.address,
        '00000000-0000-0000-0000-000000000000',
        exchangeWallet,
        targetWallet,
        token.address,
        quantity,
        web3,
      );
      await escrow.distribute(
        getStakingEscrowDistributeArguments(signedDistribution1),
        { from: targetWallet },
      );
      await escrow.distribute(
        getStakingEscrowDistributeArguments(
          await getSignedDistribution(
            escrow.address,
            signedDistribution1.nonce,
            exchangeWallet,
            targetWallet,
            token.address,
            quantity,
            web3,
          ),
        ),
        { from: targetWallet },
      );

      const events = await escrow.getPastEvents('AssetsDistributed', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(2);
      expect(events[0].returnValues.wallet).to.equal(targetWallet);
      expect(events[0].returnValues.quantity).to.equal(quantity);
      expect(events[0].returnValues.totalQuantity).to.equal(quantity);
      expect(events[1].returnValues.wallet).to.equal(targetWallet);
      expect(events[1].returnValues.quantity).to.equal(quantity);
      expect(events[1].returnValues.totalQuantity).to.equal(
        (BigInt(quantity) * BigInt(2)).toString(),
      );
      const finalTotalQuantity = await escrow.loadTotalDistributed(
        targetWallet,
      );
      expect(finalTotalQuantity.toString(10)).to.equal(
        (BigInt(quantity) * BigInt(2)).toString(),
      );
    });

    it('should fail for invalid contract address', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        exchangeWallet,
      );

      await token.transfer(escrow.address, quantity);

      let error;
      try {
        await escrow.distribute(
          getStakingEscrowDistributeArguments(
            await getSignedDistribution(
              '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
              '00000000-0000-0000-0000-000000000000',
              exchangeWallet,
              targetWallet,
              token.address,
              quantity,
              web3,
            ),
          ),
          { from: targetWallet },
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Invalid exchange signature/i);
    });

    it('should fail for non-exchange wallet', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        exchangeWallet,
      );

      await token.transfer(escrow.address, quantity);

      let error;
      try {
        await escrow.distribute(
          getStakingEscrowDistributeArguments(
            await getSignedDistribution(
              escrow.address,
              '00000000-0000-0000-0000-000000000000',
              exchangeWallet,
              targetWallet,
              token.address,
              quantity,
              web3,
            ),
          ),
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Invalid caller/i);
    });

    it('should fail for duplicate parent nonce', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        exchangeWallet,
      );

      await token.transfer(escrow.address, quantity);

      let error;
      try {
        await escrow.distribute(
          getStakingEscrowDistributeArguments(
            await getSignedDistribution(
              escrow.address,
              '00000000-0000-0000-0000-000000000000',
              exchangeWallet,
              targetWallet,
              token.address,
              quantity,
              web3,
              '00000000-0000-0000-0000-000000000000',
            ),
          ),
          { from: targetWallet },
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Nonce must be different from parent/i);
    });

    it('should fail for invalidated nonce', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        exchangeWallet,
      );

      await token.transfer(escrow.address, quantity);

      await escrow.distribute(
        getStakingEscrowDistributeArguments(
          await getSignedDistribution(
            escrow.address,
            '00000000-0000-0000-0000-000000000000',
            exchangeWallet,
            targetWallet,
            token.address,
            quantity,
            web3,
          ),
        ),
        { from: targetWallet },
      );

      let error;
      try {
        await escrow.distribute(
          getStakingEscrowDistributeArguments(
            await getSignedDistribution(
              escrow.address,
              '00000000-0000-0000-0000-000000000000',
              exchangeWallet,
              targetWallet,
              token.address,
              quantity,
              web3,
            ),
          ),
          { from: targetWallet },
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Invalidated nonce/i);
    });

    it('should fail for invalid nonce timestamp', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        exchangeWallet,
      );

      await token.transfer(escrow.address, quantity);

      const signedDistribution1 = await getSignedDistribution(
        escrow.address,
        '00000000-0000-0000-0000-000000000000',
        exchangeWallet,
        targetWallet,
        token.address,
        quantity,
        web3,
        uuidv1({ msecs: Date.now() + 10000 }),
      );
      await escrow.distribute(
        getStakingEscrowDistributeArguments(signedDistribution1),
        { from: targetWallet },
      );

      let error;
      try {
        await escrow.distribute(
          getStakingEscrowDistributeArguments(
            await getSignedDistribution(
              escrow.address,
              signedDistribution1.nonce,
              exchangeWallet,
              targetWallet,
              token.address,
              quantity,
              web3,
              uuidv1({ msecs: Date.now() - 10000 }),
            ),
          ),
          { from: targetWallet },
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(
        /Nonce timestamp must be later than parent/i,
      );
    });

    it('should fail for invalid token address', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const quantity = '10000000';

      const wrongToken = await Token.new();
      const escrow = await EarningsEscrow.new(
        token.address,
        exchangeWallet,
      );

      await token.transfer(escrow.address, quantity);

      let error;
      try {
        await escrow.distribute(
          getStakingEscrowDistributeArguments(
            await getSignedDistribution(
              escrow.address,
              '00000000-0000-0000-0000-000000000000',
              exchangeWallet,
              targetWallet,
              wrongToken.address,
              quantity,
              web3,
            ),
          ),
          { from: targetWallet },
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Invalid asset address/i);
    });

    it('should fail for invalid exchangeSignature', async () => {
      const exchangeWallet = accounts[1];
      const targetWallet = accounts[2];
      const wrongExchangeWallet = accounts[3];
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        exchangeWallet,
      );

      await token.transfer(escrow.address, quantity);

      let error;
      try {
        await escrow.distribute(
          getStakingEscrowDistributeArguments(
            await getSignedDistribution(
              escrow.address,
              '00000000-0000-0000-0000-000000000000',
              wrongExchangeWallet,
              targetWallet,
              token.address,
              quantity,
              web3,
            ),
          ),
          { from: targetWallet },
        );
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Invalid exchange signature/i);
    });
  });

  describe('withdrawEscrow', () => {
    it('should work', async () => {
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        ethAddress,
        accounts[1],
      );

      await web3.eth.sendTransaction({
        from: accounts[0],
        to: escrow.address,
        value: quantity,
      });

      await escrow.withdrawEscrow(quantity);

      const events = await escrow.getPastEvents('EscrowWithdrawn', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(events[0].returnValues.quantity).to.equal(quantity);
      expect(events[0].returnValues.newEscrowBalance).to.equal('0');
    });

    it('should work with native asset', async () => {
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[1],
      );

      await token.transfer(escrow.address, quantity);

      await escrow.withdrawEscrow(quantity);

      const events = await escrow.getPastEvents('EscrowWithdrawn', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
      expect(events[0].returnValues.quantity).to.equal(quantity);
      expect(events[0].returnValues.newEscrowBalance).to.equal('0');
    });

    it('should fail for non-admin caller', async () => {
      const quantity = '10000000';

      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      await token.transfer(escrow.address, quantity);

      let error;
      try {
        await escrow.withdrawEscrow(quantity, { from: accounts[1] });
      } catch (e) {
        error = e;
      }
      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/Caller must be admin/i);
    });
  });

  describe('loadLastNonce', async () => {
    it('should work for valid address', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      const lastNonce = (await escrow.loadLastNonce(accounts[1])).toString();
      expect(lastNonce).to.equal('0');
    });

    it('should revert for empty address', async () => {
      const escrow = await EarningsEscrow.new(
        token.address,
        accounts[0],
      );

      let error;
      try {
        await escrow.loadLastNonce(ethAddress);
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/invalid wallet address/i);
    });
  });
});

async function getSignedDistribution(
  escrowAddress: string,
  parentNonce: string,
  exchangeWallet: string,
  targetWallet: string,
  assetAddress: string,
  quantity: string,
  web3: Web3,
  nonce?: string,
): Promise<SignedAssetDistribution> {
  const distribution = {
    nonce: nonce || uuidv1(),
    parentNonce,
    walletAddress: targetWallet,
    assetAddress,
    quantity,
  };
  return {
    ...distribution,
    exchangeSignature: await getSignature(
      web3,
      getStakingDistributionHash(escrowAddress, distribution),
      exchangeWallet,
    ),
  };
}
