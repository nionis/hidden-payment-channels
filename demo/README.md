# Demo Configuration

- [env.json](./env.json)
- [wallets.json](./wallets.json)
  - contract deployer
  - host clearnet wallet & host shielded wallet (ex: RPC provider)
  - user clearnet wallet & user shielded wallet
  - user signer wallet (used only in signing tickets)

#### fund distribution

You may ignore this section.
It describes how I distribute the funds around the wallets.

- from faucet to safe: 0.1 ETH
- from safe to clearnet addresses: 0.0001 ETH
- ETH to shielded wallets: 0.000001 WETH
- shielded WETH to topups: 0.0000001 WETH
- ticket cost: 0.0000000003 WETH
