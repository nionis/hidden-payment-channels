import { Wallet } from "ethers";
import {
  TXIDVersion,
  calculateGasPrice,
} from "@railgun-community/shared-models";
import {
  gasEstimateForUnprovenCrossContractCalls,
  generateCrossContractCallsProof,
  populateShieldBaseToken,
  populateProvedCrossContractCalls,
} from "@railgun-community/wallet";
import { RecipeERC20Info, RecipeInput } from "@railgun-community/cookbook";
import {
  serializeERC20Transfer,
  getShieldSignature,
  baseShieldGasEstimate,
  getGasDetailsForTransaction,
  getOriginalGasDetailsForTransaction,
} from "./utils";
import TopUpRecipe from "./cookbook/top-up.recipe";
import ClaimTicketStep from "./cookbook/claim-ticket.step";
import { NETWORK, NETWORK_CONFIG } from "./env";
import { getHiddenPaymentsContract } from "./contract";
import { ClaimableTicket } from "./types";

/**
 * Use this to shield public ETH to private WETH railgun address.
 * Funds from here move to topup HiddenPayments contract.
 * 1. transform ETH to WETH
 * 2. shield WETH to private railgun address
 */
export async function shield(
  clearnetWallet: Wallet,
  toRailgunAddress: string,
  amount: bigint
): Promise<void> {
  const erc20AmountRecipient = serializeERC20Transfer(
    NETWORK_CONFIG.baseToken.wrappedAddress,
    amount,
    toRailgunAddress
  );

  const gasEstimate = await baseShieldGasEstimate(
    NETWORK,
    clearnetWallet,
    erc20AmountRecipient,
    toRailgunAddress
  );

  const shieldPrivateKey = await getShieldSignature(clearnetWallet);

  const gasDetails = await getGasDetailsForTransaction(
    NETWORK,
    gasEstimate,
    true,
    clearnetWallet
  );

  const { transaction, nullifiers } = await populateShieldBaseToken(
    TXIDVersion.V2_PoseidonMerkle,
    NETWORK,
    toRailgunAddress,
    shieldPrivateKey,
    erc20AmountRecipient,
    gasDetails
  );

  const tx = await clearnetWallet.sendTransaction(transaction);
  console.log("tx: ", tx);
  await tx.wait();
}

export async function top_up(
  clearnetWallet: Wallet,
  railgun: {
    id: string;
    address: string;
    encryptionKey: string;
  },
  amount: bigint
) {
  const tokenInfo: RecipeERC20Info = {
    tokenAddress: NETWORK_CONFIG.baseToken.wrappedAddress,
    decimals: BigInt(NETWORK_CONFIG.baseToken.decimals),
    isBaseToken: false,
  };

  const recipe = new TopUpRecipe(clearnetWallet.provider as any, tokenInfo);

  const unshieldERC20Amounts = [
    {
      ...tokenInfo,
      amount,
    },
  ];

  console.log("unshieldERC20Amounts", unshieldERC20Amounts);

  const recipeInput: RecipeInput = {
    networkName: NETWORK as any,
    railgunAddress: railgun.address,
    erc20Amounts: unshieldERC20Amounts,
    nfts: [],
  };

  const {
    crossContractCalls,
    erc20AmountRecipients,
    nftRecipients,
    feeERC20AmountRecipients,
    minGasLimit,
  } = await recipe.getRecipeOutput(recipeInput);

  // Outputs to re-shield after the Recipe multicall.
  const shieldERC20Addresses = erc20AmountRecipients.map((x) => ({
    tokenAddress: x.tokenAddress,
    recipientAddress: x.recipient,
  }));

  // RAILGUN Wallet will generate a [unshield -> call -> re-shield]
  // transaction enclosing the Recipe multicall.

  const originalGasDetails = await getOriginalGasDetailsForTransaction(
    clearnetWallet,
    NETWORK,
    true
  );

  const { gasEstimate } = await gasEstimateForUnprovenCrossContractCalls(
    TXIDVersion.V2_PoseidonMerkle,
    NETWORK,
    railgun.id,
    railgun.encryptionKey,
    unshieldERC20Amounts,
    [],
    shieldERC20Addresses,
    [],
    crossContractCalls,
    originalGasDetails,
    undefined,
    true,
    minGasLimit
  );

  const transactionGasDetails = await getGasDetailsForTransaction(
    NETWORK,
    gasEstimate,
    true,
    clearnetWallet
  );
  const overallBatchMinGasPrice = calculateGasPrice(transactionGasDetails);

  await generateCrossContractCallsProof(
    TXIDVersion.V2_PoseidonMerkle,
    NETWORK,
    railgun.id,
    railgun.encryptionKey,
    unshieldERC20Amounts,
    [],
    shieldERC20Addresses,
    [],
    crossContractCalls,
    undefined,
    true,
    overallBatchMinGasPrice,
    minGasLimit,
    (number) => {
      console.log("proof progress: ", number);
    }
  );

  const { transaction } = await populateProvedCrossContractCalls(
    TXIDVersion.V2_PoseidonMerkle,
    NETWORK,
    railgun.id,
    unshieldERC20Amounts,
    [],
    shieldERC20Addresses,
    [],
    crossContractCalls,
    undefined,
    true,
    overallBatchMinGasPrice,
    transactionGasDetails
  );

  console.log("proof of topup done, sending");
  // Submit transaction to RPC.
  const tx = await clearnetWallet.sendTransaction(transaction);

  console.log("tx: ", tx);
  await tx.wait();
}

export async function claim_ticket(
  clearnetWallet: Wallet,
  railgun: {
    id: string;
    address: string;
    encryptionKey: string;
  },
  claimableTicket: ClaimableTicket
) {
  const tokenInfo: RecipeERC20Info = {
    tokenAddress: NETWORK_CONFIG.baseToken.wrappedAddress,
    decimals: BigInt(NETWORK_CONFIG.baseToken.decimals),
    isBaseToken: false,
  };
  const hiddenPaymentsContract = await getHiddenPaymentsContract(
    clearnetWallet.provider as any
  );
  const step = new ClaimTicketStep(
    hiddenPaymentsContract,
    tokenInfo,
    claimableTicket
  );

  const output = await step.getValidStepOutput({
    erc20Amounts: [],
    nfts: [],
    networkName: NETWORK as any,
  });

  const { crossContractCalls, outputERC20Amounts } = output;

  // For withdraw, we're not unshielding anything - just calling the contract
  const unshieldERC20Amounts: any[] = [];

  // Map output tokens to shield addresses
  const shieldERC20Addresses = outputERC20Amounts
    .filter((x) => x.recipient != null)
    .map((x) => ({
      tokenAddress: x.tokenAddress,
      recipientAddress: x.recipient!,
    }));

  // Minimum gas limit for withdraw transaction
  const minGasLimit = 2_500_000n;

  // RAILGUN Wallet will generate a [call -> shield]
  // transaction to withdraw from contract and shield to railgun address.

  const originalGasDetails = await getOriginalGasDetailsForTransaction(
    clearnetWallet,
    NETWORK,
    true
  );

  const { gasEstimate } = await gasEstimateForUnprovenCrossContractCalls(
    TXIDVersion.V2_PoseidonMerkle,
    NETWORK,
    railgun.id,
    railgun.encryptionKey,
    unshieldERC20Amounts,
    [],
    shieldERC20Addresses,
    [],
    crossContractCalls,
    originalGasDetails,
    undefined,
    true,
    minGasLimit
  );

  const transactionGasDetails = await getGasDetailsForTransaction(
    NETWORK,
    gasEstimate,
    true,
    clearnetWallet
  );
  const overallBatchMinGasPrice = calculateGasPrice(transactionGasDetails);

  await generateCrossContractCallsProof(
    TXIDVersion.V2_PoseidonMerkle,
    NETWORK,
    railgun.id,
    railgun.encryptionKey,
    unshieldERC20Amounts,
    [],
    shieldERC20Addresses,
    [],
    crossContractCalls,
    undefined,
    true,
    overallBatchMinGasPrice,
    minGasLimit,
    (number) => {
      console.log("proof progress: ", number);
    }
  );

  const { transaction } = await populateProvedCrossContractCalls(
    TXIDVersion.V2_PoseidonMerkle,
    NETWORK,
    railgun.id,
    unshieldERC20Amounts,
    [],
    shieldERC20Addresses,
    [],
    crossContractCalls,
    undefined,
    true,
    overallBatchMinGasPrice,
    transactionGasDetails
  );

  console.log("proof of withdraw done, sending");
  // Submit transaction to RPC.
  const tx = await clearnetWallet.sendTransaction(transaction);

  console.log("tx: ", tx);
  await tx.wait();
}
