# Hidden Payment Channels service & SDK

Think of this service as a wrapper around [railgun](https://github.com/Railgun-Community/wallet) that exposes an API
server so a service provider / or a user can claim / generate tickets.

This service should be decoupled from the Hidden Payment Channel SDK in the future.
As this is a proof of concept, currently the service exposes an API by default with the prefunded [demo wallets](../demo-data/).
