use anyhow::Result;
use arti_client::{TorClient, TorClientConfig};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::watch;
use tor_config::CfgPath;
use tracing::{info, warn};

/// wrapper for the Arti TOR client
#[derive(Clone)]
pub struct TorClientManager {
    client: TorClient<tor_rtcompat::PreferredRuntime>,
    ready_rx: watch::Receiver<bool>,
}

impl TorClientManager {
    /// create and bootstrap a new Tor client
    /// returns the client and a receiver that signals when bootstrap is complete
    pub async fn new(data_dir: Option<PathBuf>) -> Result<Self> {
        info!("initializing TOR client...");

        // configure Tor client with custom or default data directory
        let config = if let Some(dir) = data_dir {
            info!("using custom TOR data directory: {:?}", dir);
            let mut builder = TorClientConfig::builder();

            // set the storage directory
            let cfg_path = CfgPath::new(dir.to_string_lossy().into_owned());
            builder.storage().state_dir(cfg_path.clone());
            builder.storage().cache_dir(cfg_path);

            // enable .onion address connections
            builder.address_filter().allow_onion_addrs(true);

            builder.build()?
        } else {
            info!("using default TOR data directory (~/.local/share/arti)");
            let mut builder = TorClientConfig::builder();

            // enable .onion address connections
            builder.address_filter().allow_onion_addrs(true);

            builder.build()?
        };

        // create a channel to signal when bootstrap is complete
        let (ready_tx, ready_rx) = watch::channel(false);

        info!("starting TOR client bootstrap...");

        let client = TorClient::create_bootstrapped(config).await?;

        info!("TOR client bootstrapped successfully!");

        // signal that we're ready
        if ready_tx.send(true).is_err() {
            warn!("failed to send ready signal (receiver dropped)");
        }

        Ok(Self { client, ready_rx })
    }

    /// get the underlying TorClient
    pub fn client(&self) -> &TorClient<tor_rtcompat::PreferredRuntime> {
        &self.client
    }

    /// get a receiver to watch for ready status
    pub fn ready_receiver(&self) -> watch::Receiver<bool> {
        self.ready_rx.clone()
    }

    /// check if the Tor client is ready
    #[allow(dead_code)]
    pub fn is_ready(&self) -> bool {
        *self.ready_rx.borrow()
    }
}

/// start bootstrapping the Tor client in the background
/// returns immediately with a handle that can be used to check status
pub async fn bootstrap_tor_client(data_dir: Option<PathBuf>) -> Result<Arc<TorClientManager>> {
    let manager = TorClientManager::new(data_dir).await?;
    Ok(Arc::new(manager))
}
