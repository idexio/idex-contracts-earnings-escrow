import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

import { EarningsEscrowInstance } from '../types/truffle-contracts/EarningsEscrow';

export interface AssetDistribution {
  nonce: string;
  parentNonce: string;
  walletAddress: string;
  assetAddress: string;
  quantity: string;
}

export interface SignedAssetDistribution extends AssetDistribution {
  exchangeSignature: string;
}

export const ethAddress = '0x0000000000000000000000000000000000000000';

export const getStakingDistributionHash = (
  escrowAddress: string,
  distribution: AssetDistribution,
): string => {
  return solidityHashOfParams([
    ['address', escrowAddress],
    ['uint128', uuidToUint8Array(distribution.nonce)],
    ['uint128', uuidToUint8Array(distribution.parentNonce)],
    ['address', distribution.walletAddress],
    ['address', distribution.assetAddress],
    ['uint256', distribution.quantity],
  ]);
};

export const getStakingEscrowDistributeArguments = (
  distribution: SignedAssetDistribution,
): EarningsEscrowInstance['distribute']['arguments'] => {
  return {
    nonce: uuidToUint8Array(distribution.nonce),
    parentNonce: uuidToUint8Array(distribution.parentNonce),
    walletAddress: distribution.walletAddress,
    assetAddress: distribution.assetAddress,
    quantity: distribution.quantity,
    exchangeSignature: distribution.exchangeSignature,
  };
};

type TypeValuePair =
  | ['string' | 'address' | 'uint256', string]
  | ['uint128', string | Uint8Array]
  | ['uint8' | 'uint64', number]
  | ['bool', boolean];

const solidityHashOfParams = (params: TypeValuePair[]): string => {
  const fields = params.map((param) => param[0]);
  const values = params.map((param) => param[1]);
  return ethers.utils.solidityKeccak256(fields, values);
};

export type LoadContractResult = {
  abi: any[];
  bytecode: string;
};

const _compiledContractMap = new Map<string, LoadContractResult>();
const loadContract = (filename: 'EarningsEscrow'): LoadContractResult => {
  if (!_compiledContractMap.has(filename)) {
    const { abi, bytecode } = JSON.parse(
      fs
        .readFileSync(
          path.join(__dirname, '..', 'contracts', `${filename}.json`),
        )
        .toString('utf8'),
    );
    _compiledContractMap.set(filename, { abi, bytecode });
  }
  return _compiledContractMap.get(filename) as LoadContractResult; // Will never be undefined as it gets set above
};

export const loadEscrowContract = (): LoadContractResult =>
  loadContract('EarningsEscrow');

export const uuidToUint8Array = (uuid: string): Uint8Array =>
  ethers.utils.arrayify(uuidToHexString(uuid));

export const uuidToHexString = (uuid: string): string =>
  `0x${uuid.replace(/-/g, '')}`;
