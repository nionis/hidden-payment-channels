use serde::{Deserialize, Serialize};
use serde_json::json;

/// Standard JSON-RPC 2.0 error codes
#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub enum JsonRpcErrorCode {
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
    ServerError = -32000, // -32000 to -32099 are reserved for implementation-defined server errors
}

/// JSON-RPC 2.0 error response
#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// JSON-RPC 2.0 error response wrapper
#[derive(Debug, Serialize)]
pub struct JsonRpcErrorResponse {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    pub error: JsonRpcError,
}

impl JsonRpcError {
    /// create a new JSON-RPC error
    pub fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    /// create a new JSON-RPC error with additional data
    pub fn with_data(code: i32, message: impl Into<String>, data: serde_json::Value) -> Self {
        Self {
            code,
            message: message.into(),
            data: Some(data),
        }
    }

    /// create a server error (-32000) for upstream failures
    pub fn server_error(message: impl Into<String>) -> Self {
        Self::new(JsonRpcErrorCode::ServerError as i32, message)
    }

    /// create a server error with additional data
    pub fn server_error_with_data(message: impl Into<String>, data: serde_json::Value) -> Self {
        Self::with_data(JsonRpcErrorCode::ServerError as i32, message, data)
    }
}

impl JsonRpcErrorResponse {
    /// create a new error response with null id
    pub fn new(error: JsonRpcError) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: None,
            error,
        }
    }

    /// create a new error response with a specific id
    pub fn with_id(error: JsonRpcError, id: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: Some(id),
            error,
        }
    }

    /// create an error response for upstream timeout
    pub fn timeout_error() -> Self {
        Self::new(JsonRpcError::server_error("Upstream request timeout"))
    }

    /// create an error response for upstream connection failure
    pub fn connection_error(details: impl Into<String>) -> Self {
        Self::new(JsonRpcError::server_error_with_data(
            "Failed to connect to upstream",
            json!({ "details": details.into() }),
        ))
    }

    /// create an error response for body size limit exceeded
    #[allow(dead_code)]
    pub fn body_too_large(limit: usize) -> Self {
        Self::new(JsonRpcError::server_error_with_data(
            "Request body too large",
            json!({ "max_bytes": limit }),
        ))
    }

    /// create an error response for invalid JSON
    pub fn parse_error(details: impl Into<String>) -> Self {
        Self::new(JsonRpcError::with_data(
            JsonRpcErrorCode::ParseError as i32,
            "Parse error",
            json!({ "details": details.into() }),
        ))
    }

    /// serialize to JSON bytes
    pub fn to_json_bytes(&self) -> Vec<u8> {
        serde_json::to_vec(self).unwrap_or_else(|_| {
            // Fallback if serialization fails (should never happen)
            b"{\"jsonrpc\":\"2.0\",\"id\":null,\"error\":{\"code\":-32603,\"message\":\"Internal error\"}}".to_vec()
        })
    }
}

/// try to extract the "id" field from a JSON-RPC request body
/// this is best-effort and returns None if parsing fails
pub fn extract_request_id(body: &[u8]) -> Option<serde_json::Value> {
    #[derive(Deserialize)]
    struct RequestId {
        id: Option<serde_json::Value>,
    }

    serde_json::from_slice::<RequestId>(body)
        .ok()
        .and_then(|r| r.id)
}

/// try to extract the "method" field from a JSON-RPC request body
/// this is best-effort and returns None if parsing fails
pub fn extract_request_method(body: &[u8]) -> Option<String> {
    #[derive(Deserialize)]
    struct RequestMethod {
        method: Option<String>,
    }

    serde_json::from_slice::<RequestMethod>(body)
        .ok()
        .and_then(|r| r.method)
}

/// try to extract the "params" field from a JSON-RPC request body (truncated)
/// this is best-effort and returns None if parsing fails
pub fn extract_request_params(body: &[u8], max_len: usize) -> Option<String> {
    #[derive(Deserialize)]
    struct RequestParams {
        params: Option<serde_json::Value>,
    }

    serde_json::from_slice::<RequestParams>(body)
        .ok()
        .and_then(|r| r.params)
        .map(|p| {
            let s = serde_json::to_string(&p).unwrap_or_default();
            if s.len() > max_len {
                format!("{}...", &s[..max_len])
            } else {
                s
            }
        })
}
