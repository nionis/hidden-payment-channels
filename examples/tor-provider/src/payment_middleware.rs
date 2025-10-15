use crate::hpc_service::{HpcClient, PaymentTicket};
use crate::rpc_utils::JsonRpcErrorResponse;
use axum::{
    body::Body,
    extract::{Request, State},
    http::{Response, StatusCode},
    middleware::Next,
};
use tracing::{debug, info, warn};

/// shared state for payment middleware
#[derive(Clone)]
pub struct PaymentMiddlewareState {
    pub hpc_client: HpcClient,
}

/// this middleware requires a valid payment ticket for all requests
pub async fn payment_verification_middleware(
    State(state): State<PaymentMiddlewareState>,
    request: Request,
    next: Next,
) -> Result<Response<Body>, Response<Body>> {
    debug!("processing request");

    // Extract payment ticket from header
    let ticket_header = request
        .headers()
        .get("X-Payment-Ticket")
        .and_then(|v| v.to_str().ok());

    let ticket_json = match ticket_header {
        Some(json) => json,
        None => {
            warn!("payment required but no ticket provided");
            return Err(create_payment_required_response(
                "Payment required. Please provide a valid payment ticket.",
            ));
        }
    };

    // parse ticket
    let ticket: PaymentTicket = match serde_json::from_str(ticket_json) {
        Ok(t) => t,
        Err(e) => {
            warn!("invalid ticket JSON: {}", e);
            return Err(create_error_response(
                StatusCode::BAD_REQUEST,
                "Invalid ticket format",
            ));
        }
    };

    debug!("validating ticket with nonce: {}", ticket.nonce);

    // validate ticket with Railgun service
    let is_valid = match state.hpc_client.validate_ticket(&ticket).await {
        Ok(valid) => valid,
        Err(e) => {
            warn!(
                "failed to validate ticket with nonce {}: {}",
                ticket.nonce, e
            );
            return Err(create_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to validate payment ticket",
            ));
        }
    };

    if !is_valid {
        warn!("could not verify ticket with nonce {}", ticket.nonce);
        return Err(create_payment_required_response(
            "Invalid or expired payment ticket. Please generate a new ticket.",
        ));
    }

    info!(
        "payment ticket with nonce {} validated successfully",
        ticket.nonce
    );

    // process request
    Ok(next.run(request).await)
}

/// create a 402 Payment Required response
fn create_payment_required_response(message: &str) -> Response<Body> {
    let error = JsonRpcErrorResponse::new(crate::rpc_utils::JsonRpcError {
        code: -32000,
        message: message.to_string(),
        data: None,
    });

    Response::builder()
        .status(StatusCode::PAYMENT_REQUIRED)
        .header("content-type", "application/json")
        .body(Body::from(error.to_json_bytes()))
        .unwrap()
}

/// create a generic error response
fn create_error_response(status: StatusCode, message: &str) -> Response<Body> {
    let error = JsonRpcErrorResponse::new(crate::rpc_utils::JsonRpcError {
        code: -32000,
        message: message.to_string(),
        data: None,
    });

    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(error.to_json_bytes()))
        .unwrap()
}
