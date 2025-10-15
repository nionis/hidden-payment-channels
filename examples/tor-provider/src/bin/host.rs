use anyhow::Result;
use clap::Parser;
use tokio::net::TcpListener;
use tokio::signal;
use tor_provider::config::HostConfig;
use tor_provider::hidden_service::{HiddenServiceConfig, HiddenServiceManager};
use tor_provider::hpc_service::HpcClient;
use tor_provider::nimbus::{NimbusConfig, NimbusManager};
use tor_provider::proxy_local_client::ProxyLocalClient;
use tor_provider::server_host::{AppState, create_router};
use tor_provider::tor::bootstrap_tor_client;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // initialize tracing/logging
    init_tracing();

    // parse configuration from environment and CLI
    let config = HostConfig::parse();
    info!("loaded configuration: {:?}", config);
    info!("starting in HOST mode");

    // bootstrap Tor client
    info!("starting TOR client bootstrap...");
    let tor_manager = bootstrap_tor_client(config.tor.tor_data_dir.clone()).await?;
    info!("TOR client ready!");

    // connect to Nimbus
    let nimbus_config = NimbusConfig {
        rpc_url: config.nimbus_rpc_url.clone(),
    };
    let nimbus_manager = NimbusManager::new(nimbus_config);

    info!("connecting to Nimbus at {}...", config.nimbus_rpc_url);
    info!("make sure Nimbus is running before starting tor-provider in host mode!");

    info!("waiting for Nimbus RPC to be ready...");
    nimbus_manager
        .wait_for_ready(std::time::Duration::from_secs(120))
        .await?;
    info!("Nimbus RPC ready!");

    // initialise HiddenPaymentChannels client
    let hpc_client = HpcClient::new(config.hpc.hpc_service_url.clone());
    info!("HiddenPaymentChannels client initialized");

    // create local HTTP client for forwarding to Nimbus
    let local_client = ProxyLocalClient::new(config.tor.request_timeout())?;
    info!("created local HTTP client for Nimbus forwarding");

    // create application state
    let app_state = AppState {
        local_client: local_client,
        validate_tickets: config.validate_tickets,
        nimbus_rpc_url: config.nimbus_rpc_url.clone(),
        hpc_client: hpc_client,
        ready_rx: tor_manager.ready_receiver(),
    };

    // create the router with payment middleware (if enabled)
    let app = create_router(app_state);

    // bind Axum server to listen address
    let listener = TcpListener::bind(&config.listen_addr).await?;
    info!("Axum proxy server listening on {}", config.listen_addr);
    info!(
        "Axum proxy will forward requests to Nimbus at {}",
        config.nimbus_rpc_url
    );

    // set up hidden service to forward to Axum proxy (not directly to Nimbus)
    let hs_config = HiddenServiceConfig {
        tor_data_dir: config.tor.tor_data_dir.clone().unwrap_or_else(|| {
            dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("tor-provider")
        }),
        local_port: config.listen_addr.port(), // Forward to Axum proxy
        onion_port: config.hidden_service_port,
    };

    let mut hidden_service = HiddenServiceManager::new(hs_config)?;

    info!("starting Arti-based hidden service...");
    hidden_service
        .start(
            tor_manager,
            config.listen_addr.port(),
            config.hidden_service_port,
        )
        .await?;

    if let Some(onion_addr) = hidden_service.onion_address() {
        info!("═══════════════════════════════════════════════════════════");
        info!("  Hidden Service Ready!");
        info!("  .onion address: {}", onion_addr);
        info!(
            "  Architecture: .onion → Axum proxy (:{}) → Nimbus ({})",
            config.listen_addr.port(),
            config.nimbus_rpc_url
        );
        if config.validate_tickets {
            info!("  Payment verification: ENABLED");
        }
    }

    // Start the Axum server with graceful shutdown
    info!("starting Axum server...");
    let server_task = tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .with_graceful_shutdown(shutdown_signal())
        .await
    });

    // Wait for either the server to finish or shutdown signal
    info!("host mode running. Press Ctrl+C to stop...");
    let result = server_task.await?;

    // Cleanup
    info!("shutting down...");
    hidden_service.stop().await?;

    info!("shutdown complete");
    result.map_err(|e| anyhow::anyhow!("Server error: {}", e))
}

/// initialize tracing/logging with environment filter
fn init_tracing() {
    // default log level
    let default_log = "info,hyper=warn,arti=info";

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| default_log.into()),
        )
        .with(tracing_subscriber::fmt::layer().with_target(true))
        .init();
}

/// wait for shutdown signal (SIGINT/SIGTERM)
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    tokio::select! {
        _ = ctrl_c => {
            info!("Received SIGINT (Ctrl+C), initiating graceful shutdown...");
        },
        _ = terminate => {
            info!("Received SIGTERM, initiating graceful shutdown...");
        },
    }

    info!("Shutdown signal received, draining in-flight requests...");
}
