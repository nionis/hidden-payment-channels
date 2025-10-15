# Hidden Payment Channels service & SDK

Think of this service as a wrapper around [railgun](https://github.com/Railgun-Community/wallet) and the our SDK that exposes an restful API
so a service provider / or a user can claim / generate tickets.

This service should be decoupled from the Hidden Payment Channel SDK in the future.
As this is a proof of concept, currently the service exposes an API by default with the prefunded [demo wallets](../demo-data/).

## API

The service exposes a RESTful API with the following endpoints:

### GET /api/hidden-payments/available-funds

**Used by:** Host  
**Description:** Get available funds for the hidden payments contract

**Response:**

```json
{
  "totalFunded": "1000000000000000000",
  "totalWithdrawn": "500000000000000000",
  "availableFunds": "500000000000000000"
}
```

### POST /api/ticket/generate

**Used by:** User  
**Description:** Generate a claimable payment ticket

**Response:**

```json
{
  "ticket": {
    "toRailgunAddress": "0x...",
    "nonce": "123",
    "amount": "1000000000000000000",
    "hiddenPaymentChannelsContractAddress": "0x...",
    "signature": "0x..."
  }
}
```

### POST /api/ticket/validate

**Used by:** Host  
**Description:** Validate a claimable ticket before claiming

**Request Body:**

```json
{
  "ticket": {
    "toRailgunAddress": "0x...",
    "nonce": "123",
    "amount": "1000000000000000000",
    "hiddenPaymentChannelsContractAddress": "0x...",
    "signature": "0x..."
  }
}
```

**Response:**

```json
{
  "valid": true
}
```

**Error Response:**

```json
{
  "error": "ticket is outdated"
}
```

### POST /api/ticket/claim

**Used by:** Host  
**Description:** Claim a validated payment ticket

**Request Body:**

```json
{
  "ticket": {
    "toRailgunAddress": "0x...",
    "nonce": "123",
    "amount": "1000000000000000000",
    "hiddenPaymentChannelsContractAddress": "0x...",
    "signature": "0x..."
  }
}
```

**Response:**

```json
{
  "result": true
}
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200` - Success
- `400` - Bad Request (invalid ticket, etc.)
- `500` - Internal Server Error
- `503` - Service Not Available (engine not initialized)

Error responses include details:

```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```
