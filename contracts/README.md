# Hidden Payment Channels smart contract

Vault-like smart contract which allows anyone to top it up, only one railgun address is permitted to claim these funds
using payment tickets.

- This contract is assigned to ONE consumer railgun address ONLY
- Anyone can topup this contract with WETH
- Only the assigned railgun address can claim tickets

## Deploy

If you want to deploy this contract yourself, just run this command.
It uses the [demo](../demo-data/) accounts for deploying.

```
npx hardhat ignition deploy ignition/modules/HiddenPaymentChannels.ts --network sepolia
```
