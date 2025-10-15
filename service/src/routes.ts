import express, { Request, Response } from "express";
import { isEngineInitialized } from "./engine";
import { logger } from "./utils";
import { Contract } from "ethers";
import { ClaimableTicket, Ticket } from "./types";
import {
  solidityPackedKeccak256,
  keccak256,
  toUtf8Bytes,
  hexlify,
  recoverAddress,
} from "ethers";
import { Wallet } from "ethers";
import { TICKET_COST } from "./env";
import { claim_ticket } from "./actions";

// @ts-expect-error quick fix express serializes bigints to strings
BigInt.prototype.toJSON = function () {
  return String(this);
};

let hostNonce = 0n;
let userNonce = 0n;

export default function createRoutes(
  hpcContract: Contract,
  hpcContractAddress: string,
  latestNonce: bigint,
  signingWallet: Wallet,
  hostRailgunInfo: {
    id: string;
    address: string;
    encryptionKey: string;
  },
  hostClearnetWallet: Wallet
) {
  hostNonce = latestNonce;
  userNonce = latestNonce;
  const router = express.Router();

  function verifyTicket(ticket: ClaimableTicket): {
    valid: boolean;
    error?: string;
  } {
    if (!ticket) {
      return { valid: false, error: "ticket is required" };
    }

    if (ticket.nonce < userNonce) {
      return { valid: false, error: "ticket is outdated" };
    }
    if (ticket.toRailgunAddress !== hostRailgunInfo.address) {
      return { valid: false, error: "ticket is not for the host" };
    }
    if (ticket.hiddenPaymentChannelsContractAddress !== hpcContractAddress) {
      return {
        valid: false,
        error: "ticket is not for the hidden payments contract",
      };
    }
    if (ticket.amount < TICKET_COST) {
      return { valid: false, error: "ticket is not for the correct amount" };
    }

    const messageHash = solidityPackedKeccak256(
      ["bytes32", "uint256", "uint256", "address"],
      [
        keccak256(toUtf8Bytes(ticket.toRailgunAddress)),
        ticket.amount.toString(),
        ticket.nonce.toString(),
        ticket.hiddenPaymentChannelsContractAddress,
      ]
    );

    const signer = recoverAddress(messageHash, ticket.signature);

    if (signer !== signingWallet.address) {
      return {
        valid: false,
        error: "ticket is not signed by the correct wallet",
      };
    }

    return { valid: true };
  }

  // middleware to check if engine is initialized
  function requireEngineInitialized(
    req: Request,
    res: Response,
    next: express.NextFunction
  ) {
    if (!isEngineInitialized()) {
      return res.status(503).json({
        error:
          "HiddenPaymentChannels service not initialized yet. Please wait and try again.",
      });
    }
    next();
  }

  router.use(requireEngineInitialized);

  // GET /api/hidden-payments/available-funds
  // get available funds for a hidden payments contract
  router.get(
    "/hidden-payments/available-funds",

    async (req: Request, res: Response) => {
      try {
        const totalFunded = await hpcContract.totalAmountFunded();
        const totalWithdrawn = await hpcContract.totalAmountWithdrawn();
        const availableFunds = totalFunded - totalWithdrawn;

        res.json({
          totalFunded: totalFunded,
          totalWithdrawn: totalWithdrawn,
          availableFunds: availableFunds,
        });
      } catch (error: any) {
        logger.error("Error getting balance:", error);
        res.status(500).json({
          error: "Failed to get balance",
          details: error.message,
        });
      }
    }
  );

  // POST /api/ticket/generate
  // generate a claimable ticket
  router.post(
    "/ticket/generate",

    async (req: Request, res: Response) => {
      try {
        const unclaimedTickets = userNonce - hostNonce;
        // only once the user claims a ticket, the nonce should be incremented
        const newNonce = userNonce === 0n ? userNonce + 1n : userNonce;

        const ticket: Ticket = {
          toRailgunAddress: hostRailgunInfo.address,
          nonce: newNonce,
          amount: TICKET_COST + TICKET_COST * unclaimedTickets,
          hiddenPaymentChannelsContractAddress: hpcContractAddress,
        };

        // Construct the message hash exactly as the contract does:
        // keccak256(abi.encodePacked(keccak256(toRailgunAddress), amount, nonce, address(this)))
        const messageHash = solidityPackedKeccak256(
          ["bytes32", "uint256", "uint256", "address"],
          [
            keccak256(toUtf8Bytes(ticket.toRailgunAddress)),
            ticket.amount.toString(),
            ticket.nonce.toString(),
            ticket.hiddenPaymentChannelsContractAddress,
          ]
        );

        // Sign without the Ethereum signed message prefix
        const signature = signingWallet.signingKey.sign(messageHash);
        const compactSignature = hexlify(
          signature.r +
            signature.s.slice(2) +
            signature.v.toString(16).padStart(2, "0")
        );

        const claimableTicket: ClaimableTicket = {
          ...ticket,
          signature: compactSignature,
        };

        console.log("generated ticket", ticket.nonce, ticket.amount);

        res.json({ ticket: claimableTicket });
      } catch (error: any) {
        logger.error("Error generating ticket:", error);
        res.status(500).json({
          error: "Failed to generate ticket",
          details: error.message,
        });
      }
    }
  );

  // POST /api/ticket/validate
  // validate a claimable ticket
  router.post(
    "/ticket/validate",

    async (req: Request, res: Response) => {
      try {
        const { ticket } = req.body as { ticket: ClaimableTicket };

        const { valid, error } = verifyTicket(ticket);
        if (!valid) {
          return res.status(400).json({ error });
        }

        console.log("validated ticket", ticket.nonce, ticket.amount);
        res.json({ valid: true });
      } catch (error: any) {
        logger.error("Error validating ticket:", error);
        res.status(500).json({
          error: "Failed to validate ticket",
          details: error.message,
        });
      }
    }
  );

  /**
   * Claim payment ticket
   * POST /api/ticket/claim
   * Body: { ticket: PaymentTicket, privateKey: string, network?: string }
   */
  router.post(
    "/ticket/claim",

    async (req: Request, res: Response) => {
      try {
        const { ticket } = req.body as { ticket: ClaimableTicket };
        const { valid, error } = verifyTicket(ticket);
        if (!valid) {
          return res.status(400).json({ error });
        }

        await claim_ticket(hostClearnetWallet, hostRailgunInfo, ticket);
        res.json({ result: true });
      } catch (error: any) {
        logger.error("Error claiming ticket:", error);
        res.status(500).json({
          error: "Failed to claim ticket",
          details: error.message,
        });
      }
    }
  );

  return router;
}
