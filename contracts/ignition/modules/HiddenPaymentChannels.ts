import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { bytesToHex, stringToBytes } from "viem";
import WALLETS from "../../../demo-data/wallets.json";

// deploys smart contract
export default buildModule("HiddenPaymentChannelsModule", (m) => {
  const hiddenPaymentChannels = m.contract("HiddenPaymentChannels", [
    // host railgun address (because they will be claiming tickets)
    bytesToHex(stringToBytes(WALLETS["host-railgun"].railgunAddress)),
    // user signer address (because they will be signing tickets)
    WALLETS["user-ticket-signer"].address,
  ]);

  return { hiddenPaymentChannels };
});
