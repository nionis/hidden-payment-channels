export interface RailgunWallet {
  railgunId: string;
  railgunAddress: string;
  publicViewingKey: string;
  mnemonic?: string;
  encryptionKey?: string;
}

export interface Ticket {
  toRailgunAddress: string;
  nonce: bigint;
  amount: bigint;
  hiddenPaymentChannelsContractAddress: string;
}

export interface ClaimableTicket extends Ticket {
  signature: string;
}
