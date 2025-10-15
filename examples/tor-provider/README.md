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
