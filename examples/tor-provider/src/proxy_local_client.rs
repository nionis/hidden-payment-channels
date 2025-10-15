use anyhow::Result;
use bytes::Bytes;
use hyper::{Body, Request, Response, Uri};
use std::time::Duration;
use tracing::{debug, error};

/// used in host mode to forward requests to local Nimbus instance
#[derive(Clone)]
pub struct ProxyLocalClient {
    client: hyper::Client<hyper::client::HttpConnector>,
    timeout: Duration,
}

impl ProxyLocalClient {
    /// Create a new local HTTP client (no Tor routing)
    pub fn new(timeout: Duration) -> Result<Self> {
        debug!("creating local HTTP client (no Tor)");

        let client = hyper::Client::builder()
            .pool_idle_timeout(Duration::from_secs(30))
            .build_http();

        Ok(Self { client, timeout })
    }

    /// forward a request to a local endpoint (Nimbus)
    pub async fn forward_request(&self, body: Bytes, target_url: String) -> Result<Response<Body>> {
        debug!(
            "forwarding request to local endpoint {} ({} bytes)",
            target_url,
            body.len()
        );

        // parse the target URL
        let uri: Uri = target_url.parse()?;

        // build the request
        let request = Request::builder()
            .method("POST")
            .uri(uri)
            .header("content-type", "application/json")
            .header("user-agent", "tor-provider/1.0")
            .body(Body::from(body))
            .map_err(|e| {
                error!("Failed to build request: {}", e);
                anyhow::anyhow!("Failed to build request: {}", e)
            })?;

        // send the request with timeout
        let response = tokio::time::timeout(self.timeout, self.client.request(request))
            .await
            .map_err(|_| {
                error!("Request timeout after {:?}", self.timeout);
                anyhow::anyhow!("Request timeout after {:?}", self.timeout)
            })?
            .map_err(|e| {
                error!("Failed to send request: {}", e);
                anyhow::anyhow!("Failed to send request: {}", e)
            })?;

        debug!(
            "Received response from local endpoint: status={}",
            response.status()
        );

        Ok(response)
    }
}
