import {
  NetworkName,
  NETWORK_CONFIG as ALL_NETWORK_CONFIG,
} from "@railgun-community/shared-models";
import { parseEther } from "ethers";
import ENV from "../../demo-data/env.json";

/** our EVM network */
export const NETWORK = ENV.network! as NetworkName;
if (!NETWORK) {
  throw new Error("NETWORK is not set");
}
if (!Object.values(NetworkName).includes(NETWORK)) {
  throw new Error(`NETWORK '${NETWORK}' is not valid`);
}

/** the network config for our EVM network */
export const NETWORK_CONFIG = ALL_NETWORK_CONFIG[NETWORK];

/** the RPC URL for our EVM network, should be over TOR */
export const RPC_URL = ENV.rpcUrl!;
if (!RPC_URL) {
  throw new Error("RPC_URL is not set");
}

export const PORT = process.env.PORT || 8080;

export const MIN_USER_CLEARNET_BALANCE = parseEther("0.00001");
export const MIN_USER_SHIELDED_BALANCE = parseEther("0.0000001");
export const MIN_HIDDEN_PAYMENTS_BALANCE = parseEther("0.00000001");
export const TICKET_COST = parseEther("0.0000000003");
