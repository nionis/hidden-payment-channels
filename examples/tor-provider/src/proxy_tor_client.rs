use crate::tor::TorClientManager;
use anyhow::Result;
use bytes::Bytes;
use hyper::{Body, Request, Response, Uri};
use rustls::RootCertStore;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio_rustls::rustls::ServerName;
use tracing::{debug, error, info};

/// HTTP client that routes all requests through TOR (used in user mode)
#[derive(Clone)]
pub struct ProxyTorClient {
    tor_manager: Arc<TorClientManager>,
    tls_connector: tokio_rustls::TlsConnector,
    timeout: Duration,
}

impl ProxyTorClient {
    /// create a new HTTP client that routes through TOR
    pub fn new(tor_manager: Arc<TorClientManager>, timeout: Duration) -> Result<Self> {
        debug!("creating TOR HTTP client");

        // create rustls config with webpki root certificates
        info!("creating TLS connector with webpki root certificates...");
        let mut root_cert_store = RootCertStore::empty();

        // add webpki root certificates using add_trust_anchors
        root_cert_store.add_trust_anchors(webpki_roots::TLS_SERVER_ROOTS.iter().map(|ta| {
            rustls::OwnedTrustAnchor::from_subject_spki_name_constraints(
                ta.subject,
                ta.spki,
                ta.name_constraints,
            )
        }));

        let config = rustls::ClientConfig::builder()
            .with_safe_defaults()
            .with_root_certificates(root_cert_store)
            .with_no_client_auth();

        let tls_connector = tokio_rustls::TlsConnector::from(Arc::new(config));
        info!(
            "TLS connector created with {} root certificates",
            webpki_roots::TLS_SERVER_ROOTS.len()
        );

        Ok(Self {
            tor_manager,
            timeout,
            tls_connector,
        })
    }

    /// forward a request to the upstream RPC endpoint over TOR, no ticket
    pub async fn forward_request(
        &self,
        body: Bytes,
        provider_url: String,
    ) -> Result<Response<Body>> {
        self.forward_request_with_payment(body, provider_url, None)
            .await
    }

    /// forward a request to the upstream RPC endpoint over TOR, with optional payment ticket
    pub async fn forward_request_with_payment(
        &self,
        body: Bytes,
        provider_url: String,
        payment_ticket: Option<&crate::hpc_service::PaymentTicket>,
    ) -> Result<Response<Body>> {
        debug!(
            "forwarding request to {} ({} bytes)",
            provider_url,
            body.len()
        );

        // Parse the upstream URL
        let uri: Uri = provider_url.parse()?;
        let host = uri
            .host()
            .ok_or_else(|| anyhow::anyhow!("no RPC host in URL"))?;
        let scheme = uri.scheme_str().unwrap_or("https");
        let is_https = scheme == "https";

        let port = match uri.port_u16() {
            Some(p) => p,
            _ if is_https => 443,
            _ => 80,
        };

        debug!(
            "connecting to {}:{} via TOR (https={})",
            host, port, is_https
        );

        // send the request with timeout
        let response = tokio::time::timeout(self.timeout, async {
            debug!("establishing Tor circuit to {}:{}", host, port);

            // connect through TOR
            let stream = self
                .tor_manager
                .client()
                .connect((host, port))
                .await
                .map_err(|e| {
                    error!("failed to connect through TOR: {}", e);
                    anyhow::anyhow!("TOR connection failed: {}", e)
                })?;

            debug!("TOR circuit established");

            // wrap with TLS if needed
            if is_https {
                debug!("initiating TLS handshake with {}", host);

                let server_name = ServerName::try_from(host).map_err(|e| {
                    error!("invalid DNS name '{}': {}", host, e);
                    anyhow::anyhow!("invalid DNS name: {}", e)
                })?;

                let tls_stream = self
                    .tls_connector
                    .connect(server_name, stream)
                    .await
                    .map_err(|e| {
                        error!("TLS handshake failed: {}", e);
                        error!("error details: {:?}", e);
                        anyhow::anyhow!("TLS handshake failed: {}", e)
                    })?;

                debug!("TLS handshake successful");
                self.make_request_with_ticket(host, &uri, body, payment_ticket, tls_stream)
                    .await
            } else {
                self.make_request_with_ticket(host, &uri, body, payment_ticket, stream)
                    .await
            }
        })
        .await
        .map_err(|_| {
            error!("request timeout after {:?}", self.timeout);
            anyhow::anyhow!("request timeout after {:?}", self.timeout)
        })??;

        debug!("received response: status={}", response.status());

        Ok(response)
    }

    /// make an HTTP request over an established stream with optional payment ticket
    async fn make_request_with_ticket<S>(
        &self,
        host: &str,
        uri: &Uri,
        body: Bytes,
        payment_ticket: Option<&crate::hpc_service::PaymentTicket>,
        stream: S,
    ) -> Result<Response<Body>>
    where
        S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
    {
        debug!("performing HTTP handshake");

        // perform HTTP handshake
        let (mut request_sender, connection) = hyper::client::conn::http1::handshake(stream)
            .await
            .map_err(|e| {
                error!("HTTP handshake failed: {}", e);
                anyhow::anyhow!("HTTP handshake failed: {}", e)
            })?;

        // spawn a task to poll the connection
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                error!("HTTP connection error: {}", e);
            }
        });

        debug!("building HTTP request");

        // build the request
        let path = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
        let mut request_builder = Request::builder()
            .method("POST")
            .uri(path)
            .header("Host", host)
            .header("content-type", "application/json")
            .header("user-agent", "tor-provider/1.0");

        // add payment ticket header if provided
        if let Some(ticket) = payment_ticket {
            let ticket_json = serde_json::to_string(ticket).map_err(|e| {
                error!("failed to serialize payment ticket: {}", e);
                anyhow::anyhow!("Failed to serialize payment ticket: {}", e)
            })?;

            debug!("attaching payment ticket with nonce: {}", ticket.nonce);
            request_builder = request_builder.header("X-Payment-Ticket", ticket_json);
        }

        let request = request_builder.body(Body::from(body)).map_err(|e| {
            error!("failed to build request: {}", e);
            anyhow::anyhow!("failed to build request: {}", e)
        })?;

        debug!("sending HTTP request");

        // send the request
        let response = request_sender.send_request(request).await.map_err(|e| {
            error!("failed to send request: {}", e);
            anyhow::anyhow!("failed to send request: {}", e)
        })?;

        debug!("HTTP request completed successfully");

        Ok(response)
    }

    /// convert a hyper response body to bytes
    pub async fn response_to_bytes(response: Response<Body>) -> Result<(Response<()>, Bytes)> {
        let (parts, body) = response.into_parts();

        let bytes = hyper::body::to_bytes(body).await.map_err(|e| {
            error!("failed to read response body: {}", e);
            anyhow::anyhow!("failed to read response body: {}", e)
        })?;

        debug!("read {} bytes from response body", bytes.len());

        let response_without_body = Response::from_parts(parts, ());
        Ok((response_without_body, bytes))
    }
}
