import type { RailgunWallet } from "./types";
import { randomBytes } from "node:crypto";
import { Wallet } from "ethers";
import {
  createRailgunWallet as createRailgunWalletBase,
  loadWalletByID,
  getWalletShareableViewingKey,
} from "@railgun-community/wallet";

/** create a wallet from a mnemonic */
export async function createWallet(
  mnemonic: string,
  encryptionKey: string
): Promise<RailgunWallet> {
  const railgunWallet = await createRailgunWalletBase(
    encryptionKey,
    mnemonic,
    0
  );

  const publicViewingKey = await getWalletShareableViewingKey(
    railgunWallet.id
  )!;

  return {
    mnemonic,
    encryptionKey,
    railgunId: railgunWallet.id,
    railgunAddress: railgunWallet.railgunAddress,
    publicViewingKey: publicViewingKey,
  };
}

/** generate a random wallet */
export async function generateRandomWallet(): Promise<RailgunWallet> {
  const mnemonic = Wallet.createRandom().mnemonic!.phrase;
  const encryptionKey = randomBytes(32).toString("hex");
  return createWallet(mnemonic, encryptionKey);
}

/** load a wallet from a storage */
export async function loadWallet(
  railgunId: string,
  encryptionKey: string
): Promise<RailgunWallet> {
  const { id, railgunAddress } = await loadWalletByID(
    encryptionKey,
    railgunId,
    false
  );
  const publicViewingKey = await getWalletShareableViewingKey(id)!;
  return {
    railgunId: id,
    railgunAddress: railgunAddress,
    publicViewingKey: publicViewingKey,
  };
}
