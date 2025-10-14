// copied from railgun-community/wallet
import { getProver, SnarkJSGroth16 } from "@railgun-community/wallet";
import { groth16 } from "snarkjs";

export const setupNodeGroth16 = async (): Promise<void> => {
  // @ts-ignore
  getProver().setSnarkJSGroth16(groth16 as SnarkJSGroth16);
};
