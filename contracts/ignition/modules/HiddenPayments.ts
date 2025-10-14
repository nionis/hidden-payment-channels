import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { bytesToHex, stringToBytes } from "viem";
import WALLETS from "../../../demo/wallets.json";

// deploys smart contract
export default buildModule("HiddenPaymentsModule", (m) => {
  const hiddenPayments = m.contract("HiddenPayments", [
    // host railgun address (because they will be claiming tickets)
    bytesToHex(stringToBytes(WALLETS["host-railgun"].railgunAddress)),
    // user signer address (because they will be signing tickets)
    WALLETS["user-ticket-signer"].address,
  ]);

  return { hiddenPayments };
});
