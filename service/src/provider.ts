// copied from railgun-community/wallet
import { FallbackProviderJsonConfig } from "@railgun-community/shared-models";
import { loadProvider } from "@railgun-community/wallet";
import { JsonRpcProvider, Wallet } from "ethers";
import { RPC_URL, NETWORK, NETWORK_CONFIG, CLEARNET_MNEMONIC } from "./env";

/**
 * Loads an Engine provider with the specified URL.
 *
 * This function initializes a provider for the test network using either:
 * 1. A local development provider (default: http://127.0.0.1:8600)
 * 2. External providers that can be uncommented and configured
 *
 * The provider is configured with fallback options, priorities, and weights
 * to ensure reliable connectivity.
 *
 * @param providerUrl - The URL of the primary provider, defaults to "http://127.0.0.1:8600"
 * @returns A Promise that resolves when the provider is successfully loaded
 *
 * @example
 * // Load with default local provider
 * await loadEngineProvider();
 *
 * // Load with custom provider URL
 * await loadEngineProvider("http://my-custom-provider:8600");
 */
export const loadEngineProvider = async () => {
  const TEST_PROVIDERS_JSON: FallbackProviderJsonConfig = {
    chainId: NETWORK_CONFIG.chain.id,
    providers: [getProviderInfo(RPC_URL)],
  };

  const pollingInterval = 1000 * 60 * 5; // 5 min

  return loadProvider(TEST_PROVIDERS_JSON, NETWORK, pollingInterval);
};

export const getProviderInfo = (providerUrl: string) => {
  return {
    provider: providerUrl,
    priority: 3,
    weight: 2,
    maxLogsPerBatch: 1,
  };
};

export const getProviderWallet = () => {
  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = Wallet.fromPhrase(CLEARNET_MNEMONIC, provider);

  return {
    provider,
    wallet,
  };
};
