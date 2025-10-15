# TODO

test if in TOR

```
curl -vX POST 'http://localhost:8545/?p=https://check.torproject.org/api/ip'
```

```
cargo r --bin tor-provider-user --tor-data-dir .tor-user
```

http://127.0.0.1:8545/?p=https://ethereum-sepolia-rpc.publicnode.com

```
cargo r --bin tor-provider-host -- --tor-data-dir .tor-host --listen-addr 127.0.0.1:9545 --nimbus-rpc-url http://127.0.0.1:8546
```
