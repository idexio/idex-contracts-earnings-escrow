export const ethAddress = web3.utils.bytesToHex([...Buffer.alloc(20)]);

export const getSignature = async (
  web3: Web3,
  data: string,
  wallet: string,
): Promise<string> => {
  const signature = await web3.eth.sign(data, wallet);
  // https://github.com/OpenZeppelin/openzeppelin-contracts/issues/2190
  // The Ethereum spec requires a v value of 27 or 28, but ganache's RPC signature returns
  // a 0 or 1 instead. Add 27 in this case to make compatible with ECDSA recover
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) {
    v += 27;
  }
  const vHex = v.toString(16);
  return signature.slice(0, 130) + vHex;
};
