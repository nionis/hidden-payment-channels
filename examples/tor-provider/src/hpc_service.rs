use anyhow::{Result, anyhow};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};

/// Payment ticket structure
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PaymentTicket {
    pub to_railgun_address: String,
    pub nonce: String,
    pub amount: String,
    pub hidden_payment_channels_contract_address: String,
    pub signature: String,
}

/// Wallet creation response
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WalletCreateResponse {
    pub railgun_address: String,
    pub mnemonic: String,
}

/// Wallet load response
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WalletLoadResponse {
    pub railgun_address: String,
    #[serde(rename = "railgunWalletID")]
    pub railgun_wallet_id: String,
}

/// Balance response
#[derive(Serialize, Deserialize, Debug)]
pub struct BalanceResponse {
    pub balance: String,
}

/// Transaction response
#[derive(Serialize, Deserialize, Debug)]
pub struct TransactionResponse {
    pub transaction: serde_json::Value,
}

/// Ticket generate response
#[derive(Serialize, Deserialize, Debug)]
pub struct TicketGenerateResponse {
    pub ticket: PaymentTicket,
}

/// Ticket validate response
#[derive(Serialize, Deserialize, Debug)]
pub struct TicketValidateResponse {
    pub valid: bool,
}

/// Ticket claim response
#[derive(Serialize, Deserialize, Debug)]
pub struct TicketClaimResponse {
    pub result: bool,
}

/// Available funds response
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AvailableFundsResponse {
    pub total_funded: String,
    pub total_withdrawn: String,
    pub available_funds: String,
}

/// HTTP client for communicating with the HiddenPaymentChannels service
#[derive(Clone)]
pub struct HpcClient {
    base_url: String,
    client: Client,
}

impl HpcClient {
    /// create a new HiddenPaymentChannels client
    pub fn new(base_url: String) -> Self {
        info!("creating HiddenPaymentChannels client for {}", base_url);
        Self {
            base_url,
            client: Client::new(),
        }
    }

    /// generate a payment ticket
    pub async fn generate_ticket(&self) -> Result<PaymentTicket> {
        info!("generating payment ticket");

        let response = self
            .client
            .post(format!("{}/api/ticket/generate", self.base_url))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            error!("failed to generate ticket: {}", error_text);
            return Err(anyhow!("Failed to generate ticket: {}", error_text));
        }

        let ticket_response = response.json::<TicketGenerateResponse>().await?;
        info!(
            "ticket generated with nonce: {}",
            ticket_response.ticket.nonce
        );
        Ok(ticket_response.ticket)
    }

    /// validate a payment ticket
    pub async fn validate_ticket(&self, ticket: &PaymentTicket) -> Result<bool> {
        debug!("validating ticket with nonce: {}", ticket.nonce);

        let response = self
            .client
            .post(format!("{}/api/ticket/validate", self.base_url))
            .json(&serde_json::json!({ "ticket": ticket }))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            error!("failed to validate ticket: {}", error_text);
            return Err(anyhow!("Failed to validate ticket: {}", error_text));
        }

        let validate_response = response.json::<TicketValidateResponse>().await?;
        debug!("ticket validation result: {}", validate_response.valid);
        Ok(validate_response.valid)
    }

    /// claim a payment ticket
    pub async fn claim_ticket(&self, ticket: &PaymentTicket) -> Result<bool> {
        info!("claiming ticket with nonce: {}", ticket.nonce);

        let response = self
            .client
            .post(format!("{}/api/ticket/claim", self.base_url))
            .json(&serde_json::json!({ "ticket": ticket }))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            error!("failed to claim ticket: {}", error_text);
            return Err(anyhow!("Failed to claim ticket: {}", error_text));
        }

        let claim_response = response.json::<TicketClaimResponse>().await?;
        info!("ticket claim result: {}", claim_response.result);
        Ok(claim_response.result)
    }

    /// get available funds for hidden payments
    pub async fn get_available_funds(&self) -> Result<AvailableFundsResponse> {
        debug!("getting available funds");

        let response = self
            .client
            .get(format!(
                "{}/api/hidden-payments/available-funds",
                self.base_url
            ))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            error!("failed to get available funds: {}", error_text);
            return Err(anyhow!("Failed to get available funds: {}", error_text));
        }

        let funds_response = response.json::<AvailableFundsResponse>().await?;
        debug!("available funds: {}", funds_response.available_funds);
        Ok(funds_response)
    }
}
