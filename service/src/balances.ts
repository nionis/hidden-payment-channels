import {
  setOnUTXOMerkletreeScanCallback,
  setOnTXIDMerkletreeScanCallback,
  setOnBalanceUpdateCallback,
  refreshBalances,
} from "@railgun-community/wallet";
import {
  delay,
  MerkletreeScanUpdateEvent,
  RailgunBalancesEvent,
  RailgunERC20Amount,
  RailgunWalletBalanceBucket,
} from "@railgun-community/shared-models";
import { getAddress } from "ethers";
import { NETWORK_CONFIG } from "./env";

import dotenv from "dotenv";
dotenv.config();

const BALANCE_POLLER_INTERVAL = 1000 * 60 * 1; // 1 min

/**
 * Example Callback function that gets invoked during a private balance scan process.
 * This function handles updates on the progress and status of the UTXO Merkletree scan.
 *
 * @param eventData - The event data containing information about the scan progress
 * @param eventData.progress - The current progress of the scan (typically a number between 0 and 1)
 * @param eventData.scanStatus - The current status of the scan process
 *
 */
const onUTXOMerkletreeScanCallback = (eventData: MerkletreeScanUpdateEvent) => {
  // Will get called throughout a private balance scan.
  // Handle updates on scan progress and status here, i.e. progress bar or loading indicator in the UI.
  console.log("UTXO scan update:", eventData.progress, eventData.scanStatus);
};

/**
 * Example Callback function for handling Merkle tree scan updates during a private balance scan.
 * This function is invoked with status updates throughout the scanning process.
 *
 * @param {MerkletreeScanUpdateEvent} eventData - The event data containing scan progress information
 * @param {number} eventData.progress - The progress percentage of the scan (0-100)
 * @param {string} eventData.scanStatus - The current status of the scan
 *
 */
const onTXIDMerkletreeScanCallback = (eventData: MerkletreeScanUpdateEvent) => {
  // Will get called throughout a private balance scan.
  // Handle updates on scan progress and status here, i.e. progress bar or loading indicator in the UI.
  console.log("TXID scan update:", eventData.progress, eventData.scanStatus);
};

/**
 * Callback function triggered when a RAILGUN wallet's balance is updated.
 *
 * This function is called at the end of a private balance scan for a RAILGUN wallet
 * for each txidVersion and balanceBucket. The function logs balance updates and
 * stores the updated balances in a cache.
 *
 * @param balancesFormatted - The updated balances event containing:
 *   - txidVersion: Currently only V2_PoseidonMerkle, with V3_PoseidonMerkle planned for future
 *   - chain: The blockchain network
 *   - railgunWalletID: Unique identifier for the RAILGUN wallet
 *   - balanceBucket: Category of funds based on the Private POI system status:
 *     - "Spendable": Funds available for use in private DeFi interactions
 *     - "ShieldBlocked": Funds that are blocked from being shielded
 *     - "ShieldPending": Funds in the process of being shielded
 *     - "ProofSubmitted": Funds for which proofs have been submitted
 *     - "MissingInternalPOI": Funds missing internal proof of innocence
 *     - "MissingExternalPOI": Funds missing external proof of innocence
 *     - "Spent": Funds that have been spent
 *   - erc20Amounts: Array of ERC20 token amounts in the wallet
 *   - nftAmounts: Array of NFT amounts in the wallet
 */
const onBalanceUpdateCallback = (balancesFormatted: RailgunBalancesEvent) => {
  // Will get called at the end of a private balance scan for a RAILGUN wallet
  // for each txidVersion and balanceBucket (explained below).
  // RailgunBalancesEvent includes:
  // *txidVersion: TXIDVersion;
  // chain: Chain;
  // railgunWalletID: string;
  // *balanceBucket: RailgunWalletBalanceBucket;
  // erc20Amounts: RailgunERC20Amount[];
  // nftAmounts: RailgunNFTAmount[];
  // *txidVersion: Currently, there is only the V2_PoseidonMerkle txidVersion. In the future,
  // with the launch of V3_PoseidonMerkle, there will be options to migrate balances
  // from V2 to V3.
  // *balanceBucket: With the Private Proof of Innocence system, balances are categorized
  // into "Spendable", "ShieldBlocked", "ShieldPending", "ProofSubmitted", "MissingInternalPOI",
  // "MissingExternalPOI", and "Spent". As funds move through the Private POI system, as
  // explained here: https://docs.railgun.org/wiki/assurance/private-proofs-of-innocence,
  // they will automatically end up in the "Spendable" category, which is when they are
  // able to be used in private DeFi interactions.
  // Handle updates on the private token balances of each available RAILGUN wallet here.
  console.log("Balances updated:", balancesFormatted.balanceBucket);
  if (balancesFormatted.erc20Amounts.length > 0) {
    console.log("ERC20 Balances: ", balancesFormatted.erc20Amounts);
  }
  balanceCache.set(balancesFormatted.balanceBucket, balancesFormatted);
};

/**
 * Sets up callbacks for balance-related operations.
 *
 * This function configures three callbacks:
 * 1. UTXO Merkletree scanning callback
 * 2. TXID Merkletree scanning callback
 * 3. Balance update callback
 *
 * These callbacks are essential for tracking and managing wallet balance updates
 * and scanning operations in the Railgun privacy system.
 *
 * @returns {void}
 */
export const setupBalanceCallbacks = () => {
  setOnUTXOMerkletreeScanCallback(onUTXOMerkletreeScanCallback);
  setOnTXIDMerkletreeScanCallback(onTXIDMerkletreeScanCallback);
  setOnBalanceUpdateCallback(onBalanceUpdateCallback);
};

/**
 * Polls for balance updates for specified RAILGUN wallets at regular intervals.
 *
 * This function starts the private balance scan for all provided RAILGUN wallet IDs.
 * It runs in the background and triggers the appropriate callbacks as the scan progresses.
 * When the scan completes, it calls the onBalanceUpdateCallback.
 * After completion, it waits for a specified interval before polling again recursively.
 *
 * @param walletIds - Array of RAILGUN wallet IDs to poll balances for
 * @returns A Promise that resolves when the current polling iteration is complete
 *
 * @remarks
 * - Uses the TEST_NETWORK configuration to determine the chain
 * - Automatically retries on error
 * - Will resolve the balanceLoadedPromise with "Loaded Balances" if it exists
 * - Waits for BALANCE_POLLER_INTERVAL milliseconds between polling iterations
 */
export const runBalancePoller = async (walletIds: string[]) => {
  // Run this function to start the private balance scan for all RAILGUN wallets.
  // This function will run in the background and call the callbacks above as the scan progresses.
  // It will also call the onBalanceUpdateCallback when the scan is complete.

  const chain = NETWORK_CONFIG.chain;
  console.log("Running balance poller... on chain", chain);
  try {
    // scan for all wallets.

    await refreshBalances(chain, walletIds);
  } catch (error) {
    console.error("BALANCE REFRESH ERROR", error);
    await refreshBalances(chain, walletIds);
  }
  console.log("Balance poller complete. Waiting for next poll...");
  if (balanceLoadedPromise != null) {
    balanceLoadedPromise("Loaded Balances");
    balanceLoadedPromise = undefined;
  }
  await delay(BALANCE_POLLER_INTERVAL);
  runBalancePoller(walletIds);
};

let balanceLoadedPromise: ((value: unknown) => void) | null | undefined =
  undefined;

/**
 * Waits for balances to be loaded by returning a Promise that resolves
 * when the balanceLoadedPromise is resolved elsewhere in the application.
 *
 * @returns {Promise<void>} A Promise that resolves when balances are loaded
 *
 * @example
 * await waitForBalancesLoaded();
 * // Now you can safely access balances
 */
export const waitForBalancesLoaded = async () => {
  return new Promise((resolve) => {
    balanceLoadedPromise = resolve;
  });
};

/**
 * Cache for storing RAILGUN wallet balance events.
 * This map uses {@link RailgunWalletBalanceBucket} as keys and stores {@link RailgunBalancesEvent} as values.
 * The cache helps reduce redundant balance lookups by storing the most recent balance events for each wallet bucket.
 */
export const balanceCache = new Map<
  RailgunWalletBalanceBucket,
  RailgunBalancesEvent
>();

/**
 * Retrieves the spendable balances from the balance cache.
 *
 * This function accesses the RAILGUN wallet's spendable balances from the cache.
 * Spendable balances are funds that are available for immediate use in transactions.
 *
 * @returns {Object} The spendable balances retrieved from the balance cache.
 *
 * @example
 * const balances = getSpendableBalances();
 * console.log(balances);
 */
export const getSpendableBalances = () => {
  return balanceCache.get(RailgunWalletBalanceBucket.Spendable);
};

export function getSpendableWethBalance(): RailgunERC20Amount {
  return (
    balanceCache
      .get(RailgunWalletBalanceBucket.Spendable)
      ?.erc20Amounts.find((erc20Amount) => {
        return (
          getAddress(erc20Amount.tokenAddress) ===
          getAddress(NETWORK_CONFIG.baseToken.wrappedAddress)
        );
      }) ?? {
      tokenAddress: NETWORK_CONFIG.baseToken.wrappedAddress,
      amount: 0n,
    }
  );
}

/**
 * Displays the spendable balances of ERC20 tokens available to the wallet.
 *
 * This function retrieves spendable balances using the `getSpendableBalances()` function
 * and logs each ERC20 token balance to the console. If no balances are found,
 * it logs a message indicating that no spendable balances were found.
 *
 * @example
 * // Display all spendable token balances in the wallet
 * displaySpendableBalances();
 *
 * @returns {void}
 */
export const displaySpendableBalances = () => {
  const balances = getSpendableBalances();

  if (balances) {
    for (const erc20Amount of balances.erc20Amounts) {
      console.log("ERC20 Balance: ", erc20Amount);
    }
  } else {
    console.log("No spendable balances found.");
  }
};
