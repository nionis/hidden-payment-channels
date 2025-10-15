use crate::{
    hpc_service::HpcClient,
    proxy_tor_client::ProxyTorClient,
    rpc_utils::{self, JsonRpcErrorResponse},
};
use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{Response, StatusCode},
    response::IntoResponse,
    routing::post,
};
use bytes::Bytes;
use percent_encoding::percent_decode_str;
use tokio::sync::watch;
use tower::ServiceBuilder;
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tracing::{error, info, warn};

/// types of errors that can occur
#[derive(Debug, Clone, Copy)]
pub enum ErrorType {
    Timeout,
    Connection,
    Upstream,
}

/// shared application state
#[derive(Clone)]
pub struct AppState {
    pub client: ProxyTorClient,
    pub issue_payment_tickets: bool,
    pub ready_rx: watch::Receiver<bool>,
    pub hpc_client: HpcClient,
}

/// create the axum router with all routes and middleware
pub fn create_router(state: AppState) -> Router {
    let mut router = Router::new();

    // main RPC endpoint - with payment middleware
    router = router.route("/", post(rpc_handler));

    // request tracing
    router
        .layer(
            ServiceBuilder::new()
                // request tracing
                .layer(
                    TraceLayer::new_for_http()
                        .on_response(DefaultOnResponse::new().level(tracing::Level::INFO)),
                ),
        )
        .with_state(state)
}

/// main RPC handler - forwards JSON-RPC requests to TOR, attaches payment ticket if necessary
async fn rpc_handler(State(state): State<AppState>, request: Request) -> impl IntoResponse {
    let start_time = std::time::Instant::now();
    // let timestamp = chrono::Utc::now();

    // extract provider URL from query parameter
    let uri = request.uri();
    let provider_url_override: Option<String> = uri.query().and_then(|q| {
        // parse query string for 'p' parameter
        // simple manual parsing: split by '&' and look for 'p='
        q.split('&').find_map(|param| {
            if let Some(stripped) = param.strip_prefix("p=") {
                // URL decode the value
                percent_decode_str(stripped)
                    .decode_utf8()
                    .ok()
                    .map(|s| s.to_string())
            } else {
                None
            }
        })
    });

    // provider URL is required in proxy mode
    let provider_url = match provider_url_override {
        Some(url) => {
            info!("using provider URL: {}", url);

            // validate the URL scheme
            if !url.starts_with("http://") && !url.starts_with("https://") {
                warn!("invalid provider URL scheme: {}", url);
                return create_error_response(
                    StatusCode::BAD_REQUEST,
                    JsonRpcErrorResponse::parse_error(
                        "Provider URL must start with http:// or https://",
                    ),
                );
            }
            url
        }
        None => {
            warn!("missing required provider URL parameter");
            return create_error_response(
                StatusCode::BAD_REQUEST,
                JsonRpcErrorResponse::parse_error(
                    "Provider URL is required. Use ?p=<provider_url> query parameter",
                ),
            );
        }
    };

    // generate payment ticket for .onion providers in proxy mode
    let payment_ticket = if state.issue_payment_tickets {
        info!("generating payment ticket...");

        let hpc_client = state.hpc_client;

        match hpc_client.generate_ticket().await {
            Ok(ticket) => {
                info!("Payment ticket generated with nonce: {}", ticket.nonce);
                Some(ticket)
            }
            Err(e) => {
                error!("Failed to generate payment ticket: {}", e);
                return create_error_response(
                    StatusCode::PAYMENT_REQUIRED,
                    JsonRpcErrorResponse::parse_error(format!("Failed to generate payment: {}", e)),
                );
            }
        }
    } else {
        None
    };

    // extract headers and body from the request
    let (parts, body) = request.into_parts();
    let headers = parts.headers;

    // read the body
    let body = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(e) => {
            error!("failed to read request body: {}", e);
            return create_error_response(
                StatusCode::BAD_REQUEST,
                JsonRpcErrorResponse::parse_error(format!("Failed to read request body: {}", e)),
            );
        }
    };

    // validate content-type
    let content_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !content_type.contains("application/json") {
        warn!("invalid content-type: {}", content_type);
        return create_error_response(
            StatusCode::BAD_REQUEST,
            JsonRpcErrorResponse::parse_error("Content-Type must be application/json"),
        );
    }

    // extract request details for logging
    let request_id = rpc_utils::extract_request_id(&body);
    let method = rpc_utils::extract_request_method(&body);
    // let params = rpc_utils::extract_request_params(&body, 100);

    info!(
        "Received RPC request: {} bytes, method={:?}, id={:?}",
        body.len(),
        method,
        request_id
    );

    // forward the request to upstream
    let response = state
        .client
        .forward_request_with_payment(body.clone(), provider_url, payment_ticket.as_ref())
        .await;

    let response = match response {
        Ok(resp) => resp,
        Err(e) => {
            // let duration_ms = start_time.elapsed().as_millis() as u64;
            error!("failed to forward request: {}", e);

            let error_response = if e.to_string().contains("timeout") {
                JsonRpcErrorResponse::timeout_error()
            } else {
                JsonRpcErrorResponse::connection_error(e.to_string())
            };

            // if we have a request ID, include it in the error
            let error_response = if let Some(id) = request_id {
                JsonRpcErrorResponse::with_id(error_response.error, id)
            } else {
                error_response
            };

            return create_error_response(StatusCode::BAD_GATEWAY, error_response);
        }
    };

    // convert the response to bytes
    let (response_parts, response_bytes) = match response_to_bytes(response).await {
        Ok(r) => r,
        Err(e) => {
            // let duration_ms = start_time.elapsed().as_millis() as u64;
            error!("failed to read response body: {}", e);

            let error_response = JsonRpcErrorResponse::connection_error(e.to_string());
            let error_response = if let Some(id) = request_id {
                JsonRpcErrorResponse::with_id(error_response.error, id)
            } else {
                error_response
            };
            return create_error_response(StatusCode::BAD_GATEWAY, error_response);
        }
    };

    let duration_ms = start_time.elapsed().as_millis() as u64;
    let status_code = response_parts.status().as_u16();
    // let is_success = status_code >= 200 && status_code < 300;

    info!(
        "forwarded response: status={}, {} bytes, duration={}ms",
        status_code,
        response_bytes.len(),
        duration_ms
    );

    // build the response with the upstream status and headers
    // hack: we need to map the status code as axum uses http 1.x and our client uses hyper 0.14
    let status = StatusCode::from_u16(response_parts.status().as_u16())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    let mut response_builder = Response::builder().status(status);

    // copy relevant headers from upstream
    for (key, value) in response_parts.headers() {
        let key_str = key.as_str();
        // forward most headers but skip hop-by-hop headers
        if !matches!(
            key_str.to_lowercase().as_str(),
            "connection" | "keep-alive" | "transfer-encoding" | "upgrade"
        ) {
            // Convert header key and value to strings and back for compatibility
            if let Ok(value_str) = value.to_str() {
                response_builder = response_builder.header(key_str, value_str);
            }
        }
    }

    response_builder
        .body(Body::from(response_bytes))
        .unwrap_or_else(|e| {
            error!("Failed to build response: {}", e);
            create_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                JsonRpcErrorResponse::new(rpc_utils::JsonRpcError::server_error("Internal error")),
            )
        })
}

/// helper to create a JSON-RPC error response
fn create_error_response(status: StatusCode, error: JsonRpcErrorResponse) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(error.to_json_bytes()))
        .unwrap()
}

/// convert a hyper response body to bytes
async fn response_to_bytes(
    response: hyper::Response<hyper::Body>,
) -> anyhow::Result<(hyper::Response<()>, Bytes)> {
    let (parts, body) = response.into_parts();

    let bytes = hyper::body::to_bytes(body).await.map_err(|e| {
        error!("Failed to read response body: {}", e);
        anyhow::anyhow!("Failed to read response body: {}", e)
    })?;

    let response_without_body = hyper::Response::from_parts(parts, ());
    Ok((response_without_body, bytes))
}
