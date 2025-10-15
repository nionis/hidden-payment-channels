use anyhow::Result;
use serde_json::Value;
use std::time::Duration;
use tokio::time::sleep;
use tracing::info;

/// manages connectivity to a nimbus-eth1 RPC endpoint
pub struct NimbusManager {
    rpc_url: String,
}

/// configuration for Nimbus connectivity
#[derive(Clone, Debug)]
pub struct NimbusConfig {
    pub rpc_url: String,
}

impl NimbusConfig {
    /// create config from host and port
    pub fn from_port(port: u16) -> Self {
        Self {
            rpc_url: format!("http://127.0.0.1:{}", port),
        }
    }

    /// get the port from the URL
    pub fn rpc_port(&self) -> u16 {
        self.rpc_url
            .split(':')
            .last()
            .and_then(|s| s.parse().ok())
            .unwrap_or(8546)
    }
}

impl NimbusManager {
    /// create a new NimbusManager that connects to an existing Nimbus instance
    pub fn new(config: NimbusConfig) -> Self {
        Self {
            rpc_url: config.rpc_url,
        }
    }

    /// wait for Nimbus to be ready by polling the RPC endpoint
    pub async fn wait_for_ready(&self, timeout: Duration) -> Result<()> {
        info!("waiting for Nimbus RPC to be ready at {}...", self.rpc_url);

        let start = std::time::Instant::now();
        let client = reqwest::Client::new();

        loop {
            if start.elapsed() > timeout {
                anyhow::bail!(
                    "timeout waiting for Nimbus RPC at {}. Make sure Nimbus is running.",
                    self.rpc_url
                );
            }

            // try to call eth_syncing
            let result = client
                .post(&self.rpc_url)
                .header("Content-Type", "application/json")
                .json(&serde_json::json!({
                    "jsonrpc": "2.0",
                    "method": "eth_syncing",
                    "params": [],
                    "id": 1
                }))
                .timeout(Duration::from_secs(2))
                .send()
                .await;

            match result {
                Ok(resp) if resp.status().is_success() => {
                    info!("nimbus RPC is responding at {}!", self.rpc_url);
                    return Ok(());
                }
                Ok(resp) => {
                    info!("nimbus RPC returned status: {}. Retrying...", resp.status());
                }
                Err(e) => {
                    info!("waiting for Nimbus RPC... ({})", e);
                }
            }

            sleep(Duration::from_secs(2)).await;
        }
    }

    /// perform a health check on Nimbus
    pub async fn health_check(&self) -> Result<bool> {
        let client = reqwest::Client::new();

        let result = client
            .post(&self.rpc_url)
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "eth_syncing",
                "params": [],
                "id": 1
            }))
            .timeout(Duration::from_secs(5))
            .send()
            .await;

        match result {
            Ok(resp) if resp.status().is_success() => {
                // Parse response to check sync status
                if let Ok(body) = resp.text().await {
                    if let Ok(json) = serde_json::from_str::<Value>(&body) {
                        if let Some(result) = json.get("result") {
                            if result.is_boolean() && result.as_bool() == Some(false) {
                                info!("Nimbus is fully synced");
                            } else {
                                info!("Nimbus is syncing: {:?}", result);
                            }
                        }
                    }
                }
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    /// get the RPC URL
    pub fn rpc_url(&self) -> &str {
        &self.rpc_url
    }
}
