# Running the demo

In the [README.md](README.md#overview) I describe a scenario of Alice and Bob wanting to buy / sell RPC services.

Following this guide will help you recreate this scenario on your machine, both Alice and Bob scenarios locally.

The guide assumes you are familiar with command prompts, and some basic dev tooling, if not, please DM me we can do this together.

## 1. Getting the demo wallets

This demo is solely designed to work a set of wallets specified in [demo-data](./demo-data/).

If you are a judge, please DM me to send you two JSON files with all the DEMO wallets.

## 2. Running HiddenPaymentChannels service

The HiddenPaymentChannels is used by both Alice and Bob.

For demo purposes it's designed to work for both as a single instance, so we only need to have one service running.

1. go to [service](./service/)
2. install nodejs (tested with nodejs v12)
3. run `yarn`
4. then to start it run `yarn dev`

You should see the following:

```bash
[INFO] 2025-10-15T12:10:39.383Z - =================================================
[INFO] 2025-10-15T12:10:39.383Z - Server running on http://localhost:8080
[INFO] 2025-10-15T12:10:39.383Z - API endpoints:
[INFO] 2025-10-15T12:10:39.383Z -   GET  /api/hidden-payments/available-funds (used by host)
[INFO] 2025-10-15T12:10:39.383Z -   POST /api/ticket/generate (used by user)
[INFO] 2025-10-15T12:10:39.383Z -   POST /api/ticket/validate (used by host)
[INFO] 2025-10-15T12:10:39.383Z -   POST /api/ticket/claim (used by host)
[INFO] 2025-10-15T12:10:39.383Z - =================================================
```

Result: HiddenPaymentChannels API running at `http://localhost:8080`

## 3. Running an RPC provider

You can run any RPC provider you want, it does not effect HiddenPaymentChannels (which operates in Sepolia test network).

You could use [nimbus client](https://github.com/status-im/nimbus-eth1), or a proxy:

```bash
mitmproxy --mode reverse:https://ethereum-sepolia-rpc.publicnode.com --listen-host 127.0.0.1 --listen-port 8546
```

Result: RPC provider running at `http://localhost:8546`

## 4. Building tor-provider

1. go to [tor-provider](./examples/tor-provider/)
2. install rust and cargo
3. run `cargo build --release`

Result, you should see the following:

```bash
[INFO] 2025-10-15T12:10:39.383Z - =================================================
[INFO] 2025-10-15T12:10:39.383Z - Server running on http://localhost:8080
[INFO] 2025-10-15T12:10:39.383Z - API endpoints:
[INFO] 2025-10-15T12:10:39.383Z -   GET  /api/hidden-payments/available-funds (used by host)
[INFO] 2025-10-15T12:10:39.383Z -   POST /api/ticket/generate (used by user)
[INFO] 2025-10-15T12:10:39.383Z -   POST /api/ticket/validate (used by host)
[INFO] 2025-10-15T12:10:39.383Z -   POST /api/ticket/claim (used by host)
[INFO] 2025-10-15T12:10:39.383Z - =================================================
```

## 5. Running Bob's hidden RPC service

Bob needs to use `tor-provider-host` as he is hosting a hidden service through TOR, and has to validate payment tickets.

```bash
./target/release/tor-provider-host --tor-data-dir .tor-host --listen-addr 127.0.0.1:9545 --nimbus-rpc-url http://127.0.0.1:8546
```

Result, you should see the following:

```bash
2025-10-15T12:25:36.264015Z  INFO tor_provider_host: ═══════════════════════════════════════════════════════════
2025-10-15T12:25:36.264018Z  INFO tor_provider_host:   Hidden Service Ready!
2025-10-15T12:25:36.264019Z  INFO tor_provider_host:   .onion address: h4m4yplubktilro5krjix2hhgdwoentvpi324q526ui4exwjmyszvbqd.onion:80
2025-10-15T12:25:36.264021Z  INFO tor_provider_host:   Architecture: .onion → Axum proxy (:9545) → Nimbus (http://127.0.0.1:8546)
2025-10-15T12:25:36.264558Z  INFO tor_provider_host:   Payment verification: ENABLED
```

## 6. Running Alice's RPC over TOR proxy

Alice needs to use `tor-provider-user` as she needs to access Bob's onion address, and has to issue payment tickets.

```
./target/release/tor-provider-user --tor-data-dir .tor-user
```

## Testing with cURL

Make sure to update the .onion url with yours

```bash
curl -vX POST 'http://localhost:8545/?p=http://h4m4yplubktilro5krjix2hhgdwoentvpi324q526ui4exwjmyszvbqd.onion/' \  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

Result, should be a valid RPC response:

```bash
{"jsonrpc":"2.0","id":1,"result":"0x8fb187"}
```

Also in HiddenPaymentChannels you can confirm a ticket was generated and validated.

```bash
[INFO] 2025-10-15T12:28:20.630Z - POST /api/ticket/generate
userNonce: 108, hostNonce: 108
generated ticket with nonce 108 and amount 0.0000000003 WETH
[INFO] 2025-10-15T12:28:26.615Z - POST /api/ticket/validate
verified ticket with nonce 108 and amount 0.0000000003 WETH
```

## I pray to the DEMO Gods

Add `http://localhost:8545/?p=http://h4m4yplubktilro5krjix2hhgdwoentvpi324q526ui4exwjmyszvbqd.onion/` in metamask's networks.

Make sure to add it into `Sepolia Testnet` network, otherwise it wont work.
