import {
  type RailgunERC20Amount,
  type RailgunNFTAmount,
  type RailgunNFTAmountRecipient,
  type TransactionGasDetails,
  EVMGasType,
  getEVMGasTypeForTransaction,
  TXIDVersion,
  NetworkName,
  RailgunERC20AmountRecipient,
  RailgunERC20Recipient,
} from "@railgun-community/shared-models";
import {
  getShieldPrivateKeySignatureMessage,
  NFTTokenType,
  gasEstimateForShieldBaseToken,
  gasEstimateForUnprovenCrossContractCalls,
  generateCrossContractCallsProof,
  populateProvedCrossContractCalls,
} from "@railgun-community/wallet";
import {
  type HDNodeWallet,
  type Wallet,
  type ContractTransaction,
  keccak256,
} from "ethers";

/** logger utilities */
export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    if (process.env.LOG_LEVEL === "debug") {
      console.debug(
        `[DEBUG] ${new Date().toISOString()} - ${message}`,
        ...args
      );
    }
  },
};

/**
 * Generates a shield private key signature by signing a predefined message with the provided wallet
 * and then hashing the signature with keccak256.
 *
 * @param wallet - The wallet (Wallet or HDNodeWallet) used to sign the shield signature message
 * @returns A Promise that resolves to the shield private key signature as a hex string
 */
export const getShieldSignature = async (
  wallet: Wallet | HDNodeWallet
): Promise<string> => {
  const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
  const shieldPrivateKey = keccak256(
    await wallet.signMessage(shieldSignatureMessage)
  );
  return shieldPrivateKey;
};

/**
 * Serializes token address and amount into a RailgunERC20Amount format for relay adapt unshield transactions.
 *
 * @param tokenAddress - The Ethereum address of the ERC20 token
 * @param amount - The token amount as a BigInt value
 * @returns A RailgunERC20Amount object containing the token address and amount
 */
export const serializeERC20RelayAdaptUnshield = (
  tokenAddress: string,
  amount: bigint
): RailgunERC20Amount => {
  return {
    tokenAddress,
    amount,
  };
};

/**
 * Serializes an ERC721 token for relay adaptation to unshield it.
 *
 * This function creates a RailgunNFTAmount object that represents an ERC721 token
 * with the specified address and token ID. The amount is always set to 1 since
 * ERC721 tokens are non-fungible and can only be transferred as whole units.
 *
 * @param tokenAddress - The contract address of the ERC721 token.
 * @param tokenSubID - The unique identifier of the specific ERC721 token.
 * @returns A RailgunNFTAmount object configured for ERC721 unshielding.
 */
export const serializeERC721RelayAdaptUnshield = (
  tokenAddress: string,
  tokenSubID: string
): RailgunNFTAmount => {
  return {
    nftAddress: tokenAddress,
    amount: 1n,
    tokenSubID,
    nftTokenType: NFTTokenType.ERC721,
  };
};

/**
 * Serializes ERC20 transfer data into a RailgunERC20AmountRecipient object.
 *
 * @param tokenAddress - The address of the ERC20 token contract
 * @param amount - The amount of tokens to transfer as a bigint
 * @param recipient - The address of the transfer recipient
 * @returns A RailgunERC20AmountRecipient object containing the transfer details
 */
export const serializeERC20Transfer = (
  tokenAddress: string,
  amount: bigint,
  recipient: string
): RailgunERC20AmountRecipient => {
  return {
    tokenAddress,
    amount,
    recipientAddress: recipient,
  };
};

/**
 * Serializes an ERC721 NFT transfer into a RailgunNFTAmountRecipient object.
 *
 * @param nftAddress - The contract address of the ERC721 NFT
 * @param tokenSubID - The token ID of the ERC721 NFT
 * @param recipient - The address of the recipient who will receive the NFT
 * @returns A RailgunNFTAmountRecipient object representing the ERC721 transfer with amount always set to 1n
 */
export const serializeERC721Transfer = (
  nftAddress: string,
  tokenSubID: string,
  recipient: string
): RailgunNFTAmountRecipient => {
  return {
    nftAddress,
    amount: 1n, // shield amount - always 1n for ERC-721
    tokenSubID,
    nftTokenType: NFTTokenType.ERC721,
    recipientAddress: recipient,
  };
};

export const getOriginalGasDetailsForTransaction = async (
  wallet: Wallet | HDNodeWallet,
  network: NetworkName,
  sendWithPublicWallet: boolean
): Promise<TransactionGasDetails> => {
  const gasDetails = await getGasDetailsForTransaction(
    network,
    0n,
    sendWithPublicWallet,
    wallet
  );
  return gasDetails;
};

/**
 * Retrieves gas details for a transaction based on network and wallet information.
 *
 * This function determines the appropriate EVM gas type for the transaction and
 * creates a structured gas details object with the necessary gas parameters.
 * For Type0 and Type1 transactions, it returns gasPrice, while for Type2 transactions,
 * it returns maxFeePerGas and maxPriorityFeePerGas according to EIP-1559.
 *
 * @param network - The blockchain network name to perform the transaction on
 * @param gasEstimate - The estimated gas amount required for the transaction as a bigint
 * @param sendWithPublicWallet - Indicates whether the transaction is being sent from a public wallet
 * @param wallet - The wallet instance used to sign and populate the transaction
 *
 * @returns A promise that resolves to a TransactionGasDetails object containing appropriate gas parameters
 * for the specified network and transaction type
 *
 * @example
 * const gasDetails = await getGasDetailsForTransaction(
 *   'ethereum',
 *   250000n,
 *   false,
 *   myWallet
 * );
 */
export const getGasDetailsForTransaction = async (
  network: NetworkName,
  gasEstimate: bigint,
  sendWithPublicWallet: boolean,
  wallet: Wallet | HDNodeWallet
) => {
  const evmGasType: EVMGasType = getEVMGasTypeForTransaction(
    network,
    sendWithPublicWallet
  );

  let gasDetails: TransactionGasDetails;

  // populate tx
  // send 1 wei to self. get gas details
  // THIS IS AN INSECURE WAY TO GET GAS ESTIMATE
  // DO NOT USE IN PRODUCTION
  const { maxFeePerGas, maxPriorityFeePerGas } =
    await wallet.populateTransaction({
      to: wallet.address,
      value: 1n,
    });

  switch (evmGasType) {
    case EVMGasType.Type0:
    case EVMGasType.Type1:
      gasDetails = {
        evmGasType,
        gasEstimate,
        gasPrice: BigInt(maxFeePerGas?.valueOf() ?? 0), // Proper calculation of network gasPrice is not covered in this guide
      };
      break;
    case EVMGasType.Type2:
      // Proper calculation of gas Max Fee and gas Max Priority Fee is not covered in this guide. See: https://docs.alchemy.com/docs/how-to-build-a-gas-fee-estimator-using-eip-1559

      gasDetails = {
        evmGasType,
        gasEstimate,
        maxFeePerGas: BigInt(maxFeePerGas?.valueOf() ?? 0),
        maxPriorityFeePerGas: BigInt(maxPriorityFeePerGas?.valueOf() ?? 0),
      };
      break;
  }
  return gasDetails;
};

export const baseShieldGasEstimate = async (
  network: NetworkName,
  wallet: Wallet | HDNodeWallet,
  erc20AmountRecipient: RailgunERC20AmountRecipient,
  railgunWalletAddress: string
) => {
  const shieldPrivateKey = await getShieldSignature(wallet);

  // Address of public wallet we are shielding from
  const fromWalletAddress = wallet.address;

  const { gasEstimate } = await gasEstimateForShieldBaseToken(
    TXIDVersion.V2_PoseidonMerkle,
    network,
    railgunWalletAddress,
    shieldPrivateKey,
    erc20AmountRecipient,
    fromWalletAddress
  );

  return gasEstimate;
};

process.on("uncaughtException", (err, origin) => {
  console.log("Uncaught Error", err, origin);
});

process.on("unhandledRejection", async (reason, promise) => {
  console.log("Unhandled rejection", reason, promise);
});

export const crossContractGasEstimate = async (
  wallet: Wallet | HDNodeWallet,
  encryptionKey: string,
  network: NetworkName,
  railgunWalletID: string,
  erc20AmountUnshieldAmounts: RailgunERC20Amount[],
  erc721AmountUnshieldAmounts: RailgunNFTAmount[],
  erc20ShieldRecipients: RailgunERC20Recipient[],
  erc721AmountShieldRecipients: RailgunNFTAmountRecipient[],
  crossContractCalls: ContractTransaction[],
  minGasLimit: bigint, // provided by user, or cookbook output.
  sendWithPublicWallet: boolean = true,
  feeTokenDetails: RailgunERC20AmountRecipient | undefined = undefined
) => {
  const originalGasDetails = await getOriginalGasDetailsForTransaction(
    wallet,
    network,
    sendWithPublicWallet
  );
  console.log("CrossContract: originalGasDetails: ", originalGasDetails);
  const { gasEstimate } = await gasEstimateForUnprovenCrossContractCalls(
    TXIDVersion.V2_PoseidonMerkle,
    network,
    railgunWalletID,
    encryptionKey,
    erc20AmountUnshieldAmounts,
    erc721AmountUnshieldAmounts,
    erc20ShieldRecipients,
    erc721AmountShieldRecipients,
    crossContractCalls,
    originalGasDetails,
    feeTokenDetails,
    sendWithPublicWallet,
    minGasLimit
  );
  return gasEstimate;
};

export const crossContractGenerateProof = async (
  encryptionKey: string,
  network: NetworkName,
  railgunWalletID: string,
  erc20AmountUnshieldAmounts: RailgunERC20Amount[],
  erc721AmountUnshieldAmounts: RailgunNFTAmount[],
  erc20AmountShieldRecipients: RailgunERC20Recipient[],
  erc721AmountShieldRecipients: RailgunNFTAmountRecipient[],
  crossContractCalls: ContractTransaction[],
  overallBatchMinGasPrice: bigint,
  minGasLimit: bigint,
  sendWithPublicWallet: boolean = true,
  broadcasterFeeERC20AmountRecipient:
    | RailgunERC20AmountRecipient
    | undefined = undefined
) => {
  const progressCallback = (progress: number) => {
    // Handle proof progress (show in UI).
    // Proofs can take 20-30 seconds on slower devices.
    console.log("CrossContract Call Proof progress: ", progress);
  };
  // GENERATES RAILGUN SPENDING PROOF
  await generateCrossContractCallsProof(
    TXIDVersion.V2_PoseidonMerkle,
    network,
    railgunWalletID,
    encryptionKey,
    erc20AmountUnshieldAmounts,
    erc721AmountUnshieldAmounts,
    erc20AmountShieldRecipients,
    erc721AmountShieldRecipients,
    crossContractCalls,
    broadcasterFeeERC20AmountRecipient,
    sendWithPublicWallet,
    overallBatchMinGasPrice,
    minGasLimit,
    progressCallback
  );
};

export const crossContractCallsPopulateTransaction = async (
  network: NetworkName,
  railgunWalletID: string,
  erc20AmountUnshieldAmounts: RailgunERC20Amount[],
  erc721AmountUnshieldAmounts: RailgunNFTAmount[],
  erc20AmountShieldRecipients: RailgunERC20Recipient[],
  erc721AmountShieldRecipients: RailgunNFTAmountRecipient[],
  crossContractCalls: ContractTransaction[],
  transactionGasDetails: TransactionGasDetails,
  overallBatchMinGasPrice: bigint,
  sendWithPublicWallet: boolean = true,

  broadcasterFeeERC20AmountRecipient:
    | RailgunERC20AmountRecipient
    | undefined = undefined
) => {
  const populateResponse = await populateProvedCrossContractCalls(
    TXIDVersion.V2_PoseidonMerkle,
    network,
    railgunWalletID,
    erc20AmountUnshieldAmounts,
    erc721AmountUnshieldAmounts,
    erc20AmountShieldRecipients,
    erc721AmountShieldRecipients,
    crossContractCalls,
    broadcasterFeeERC20AmountRecipient,
    sendWithPublicWallet,
    overallBatchMinGasPrice,
    transactionGasDetails
  );

  return populateResponse;
};
