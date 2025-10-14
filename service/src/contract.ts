import { ethers } from "ethers";
import HiddenPayments from "../../contracts/ignition/deployments/chain-11155111/artifacts/HiddenPaymentsModule#HiddenPayments.json";
import Addresses from "../../contracts/ignition/deployments/chain-11155111/deployed_addresses.json";
import { NETWORK_CONFIG } from "./env";

// get the HiddenPayments contract instance
export async function getHiddenPaymentsContract(provider: ethers.Provider) {
  return new ethers.Contract(
    Addresses["HiddenPaymentsModule#HiddenPayments"],
    HiddenPayments.abi,
    provider
  );
}

// get the WETH contract instance
export async function getWethContract(provider: ethers.Provider) {
  return new ethers.Contract(
    NETWORK_CONFIG.baseToken.wrappedAddress,
    [
      "function deposit() payable",
      "function withdraw(uint256)",
      "function balanceOf(address) view returns (uint256)",
    ],
    provider
  );
}
