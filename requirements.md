1. tor reverse proxy

```
sudo apt update && sudo apt install tor
brew install tor
```

```
tor -f ./hidden-service-mock/torrc
curl --socks5 127.0.0.1:9050 https://check.torproject.org/api/ip
```
