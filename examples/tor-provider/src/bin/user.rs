use anyhow::Result;
use clap::Parser;
use tokio::net::TcpListener;
use tokio::signal;
use tor_provider::config::UserConfig;
use tor_provider::hpc_service::HpcClient;
use tor_provider::proxy_tor_client::ProxyTorClient;
use tor_provider::server_user::AppState;
use tor_provider::server_user::create_router;
use tor_provider::tor::bootstrap_tor_client;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // initialize tracing/logging
    init_tracing();

    // parse configuration from environment and CLI
    let config = UserConfig::parse();
    info!("loaded configuration: {:?}", config);
    info!("starting in USER mode");

    // bootstrap Tor client
    info!("starting TOR client bootstrap...");
    let tor_manager = bootstrap_tor_client(config.tor.tor_data_dir.clone()).await?;
    info!("TOR client ready!");

    // create HTTP client that routes through Tor
    let tor_http_client = ProxyTorClient::new(tor_manager.clone(), config.tor.request_timeout())?;
    info!("created TOR HTTP client (provider URL must be specified via query parameter)");

    // create HPC client
    let hpc_client = HpcClient::new(config.hpc.hpc_service_url.clone());
    info!("HiddenPaymentChannels client initialized");

    // create application state
    let app_state = AppState {
        client: tor_http_client,
        issue_payment_tickets: config.issue_payment_tickets,
        hpc_client: hpc_client,
        ready_rx: tor_manager.ready_receiver(),
    };

    // create the router
    let app = create_router(app_state);

    // bind to the listen address
    let listener = TcpListener::bind(&config.listen_addr).await?;
    info!("server listening on {}", config.listen_addr);
    info!(
        "add this to your wallet: http://{}/?p=https://ethereum-sepolia-rpc.publicnode.com",
        config.listen_addr
    );

    // start the server with graceful shutdown
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("server shut down gracefully");
    Ok(())
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
