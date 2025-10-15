# Tor Provider

A complete Rust implementation demonstrating how to use Hidden Payment Channels with Tor for maximum privacy. This example shows both the **service provider** (host) and **user client** sides of the payment system.

## Overview

This example implements a privacy-preserving RPC service where:

- **Service providers** can offer RPC services anonymously and privately through TOR hidden services
- **Users** can access these services and pay privately using Hidden Payment Channels
- All communication is routed through Tor for enhanced anonymity
- Payment tickets are automatically generated and validated

## Overview

### Host (Service Provider)

- Creates a Tor hidden service (`.onion` address)
- Proxies RPC requests to a local Nimbus client
- Validates payment tickets before processing requests
- Claims payments through the Hidden Payment Channels service

### User (Client)

- Connects to Tor hidden services via Tor
- Automatically generates payment tickets for requests
- Proxies RPC calls through the payment-protected service
- Maintains local proxy for easy wallet integration

## Quick Start

### Prerequisites

- Rust 1.70+
- Tor (will be downloaded automatically)
- [Nimbus client](https://github.com/status-im/nimbus-eth1) (for host mode)
- Hidden Payment Channels service running

### 1. Build the Project

```bash
cargo build --release
```

### 2. Run as Service Provider (Host)

```bash
# Start Nimbus client first
nimbus --network:sepolia --rpc --rpc-address:127.0.0.1 --rpc-port:9545

# Run the host service
cargo run --bin tor-provider-host -- \
  --tor-data-dir .tor-host \
  --listen-addr 127.0.0.1:9545 \
  --nimbus-rpc-url http://127.0.0.1:9545 \
  --hpc-service-url http://localhost:8080
```

This will:

- Create a Tor hidden service
- Display the `.onion` address for users to connect
- Proxy requests to your Nimbus client
- Validate payment tickets

### 3. Run as User (Client)

```bash
cargo run --bin tor-provider-user -- \
  --tor-data-dir .tor-user \
  --listen-addr 127.0.0.1:8545 \
  --hpc-service-url http://localhost:8080
```

This will:

- Create a local proxy at `http://localhost:8545`
- Route requests through Tor to the hidden service
- Automatically generate payment tickets
- Add the provider URL as a query parameter: `http://localhost:8545/?p=http://xyz.onion`
