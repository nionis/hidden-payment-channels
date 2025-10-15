use clap::Parser;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

// tor config
#[derive(Parser, Debug, Clone, Serialize, Deserialize)]
pub struct TorConfig {
    /// tor data directory for state persistence (speeds up bootstrap)
    #[arg(long, env = "TOR_DATA_DIR")]
    pub tor_data_dir: Option<PathBuf>,

    /// request timeout in seconds
    #[arg(long, env = "REQUEST_TIMEOUT_SECS", default_value = "20")]
    pub request_timeout_secs: u64,
}

impl TorConfig {
    pub fn request_timeout(&self) -> Duration {
        Duration::from_secs(self.request_timeout_secs)
    }
}

// HiddenPaymentChannels config
#[derive(Parser, Debug, Clone, Serialize, Deserialize)]
pub struct HpcConfig {
    // HiddenPaymentChannels service URL
    #[arg(
        long,
        env = "HIDDEN_PAYMENT_CHANNELS_SERVICE_URL",
        default_value = "http://127.0.0.1:8080"
    )]
    pub hpc_service_url: String,
}

// tor-provider-user config
#[derive(Parser, Debug, Clone, Serialize, Deserialize)]
#[command(author, version, about, long_about = None)]
pub struct UserConfig {
    // tor config
    #[command(flatten)]
    pub tor: TorConfig,

    // HiddenPaymentChannels config
    #[command(flatten)]
    pub hpc: HpcConfig,

    // local server listen address
    #[arg(long, env = "LISTEN_ADDR", default_value = "127.0.0.1:8545")]
    pub listen_addr: SocketAddr,

    // disable payments
    #[arg(long, env = "ISSUE_PAYMENT_TICKETS", default_value = "true")]
    pub issue_payment_tickets: bool,
}

impl Default for UserConfig {
    fn default() -> Self {
        Self {
            tor: TorConfig {
                request_timeout_secs: 20,
                tor_data_dir: None,
            },
            hpc: HpcConfig {
                hpc_service_url: "http://127.0.0.1:3000".to_string(),
            },
            listen_addr: "127.0.0.1:8545".parse().unwrap(),
            issue_payment_tickets: true,
        }
    }
}

// tor-provider-host config
#[derive(Parser, Debug, Clone, Serialize, Deserialize)]
#[command(author, version, about, long_about = None)]
pub struct HostConfig {
    // tor config
    #[command(flatten)]
    pub tor: TorConfig,

    // HiddenPaymentChannels config
    #[command(flatten)]
    pub hpc: HpcConfig,

    // local server listen address
    #[arg(long, env = "LISTEN_ADDR", default_value = "127.0.0.1:9545")]
    pub listen_addr: SocketAddr,

    // Hidden service / Nimbus hosting configuration
    /// Nimbus RPC URL (e.g., http://127.0.0.1:8546)
    #[arg(long, env = "NIMBUS_RPC_URL", default_value = "http://127.0.0.1:8546")]
    pub nimbus_rpc_url: String,

    // port to expose on the .onion hidden service
    #[arg(long, env = "HIDDEN_SERVICE_PORT", default_value = "80")]
    pub hidden_service_port: u16,

    // validate tickets
    #[arg(long, env = "VALIDATE_TICKETS", default_value = "true")]
    pub validate_tickets: bool,
}

impl Default for HostConfig {
    fn default() -> Self {
        Self {
            tor: TorConfig {
                request_timeout_secs: 20,
                tor_data_dir: None,
            },
            hpc: HpcConfig {
                hpc_service_url: "http://127.0.0.1:3000".to_string(),
            },
            listen_addr: "127.0.0.1:9545".parse().unwrap(),
            nimbus_rpc_url: "http://127.0.0.1:8546".to_string(),
            hidden_service_port: 80,
            validate_tickets: true,
        }
    }
}
