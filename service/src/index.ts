import { join } from "node:path";
import { setLoggers } from "@railgun-community/wallet";
import { start, stop } from "./engine";
import { createWallet } from "./wallet";
import { logger } from "./utils";
import {
  setupBalanceCallbacks,
  runBalancePoller,
  waitForBalancesLoaded,
  getSpendableWethBalance,
  getPendingWethBalance,
} from "./balances";
import { getHiddenPaymentChannelsContract, getWethContract } from "./contract";
import {
  MIN_USER_CLEARNET_BALANCE,
  MIN_USER_SHIELDED_BALANCE,
  MIN_HIDDEN_PAYMENTS_BALANCE,
  PORT,
} from "./env";
import { formatUnits } from "ethers";
import { PROVIDER, getProviderWallet } from "./provider";
import { shield, top_up } from "./actions";
import WALLETS from "../../demo-data/wallets.json";
import express from "express";
import cors from "cors";
import createRoutes from "./routes";

setLoggers(
  (msg: string) => logger.debug("[railgun]", msg),
  (msg: string) => logger.error("[railgun]", msg)
);

const CWD_DIR = process.cwd();
const DATA_DIR = join(CWD_DIR, ".store");

async function main() {
  // start railgun engine
  await start(DATA_DIR);

  // get demo wallets
  const [
    hostRailgunWallet,
    userRailgunWallet,
    hostClearnetWallet,
    userClearnetWallet,
    userTicketSignerWallet,
  ] = await Promise.all([
    createWallet(
      WALLETS["host-railgun"].mnemonic,
      WALLETS["host-railgun"].encryptionKey
    ),
    createWallet(
      WALLETS["user-railgun"].mnemonic,
      WALLETS["user-railgun"].encryptionKey
    ),
    getProviderWallet(WALLETS["host-clearnet"].mnemonic),
    getProviderWallet(WALLETS["user-clearnet"].mnemonic),
    getProviderWallet(WALLETS["user-ticket-signer"].mnemonic),
  ]);

  // get smart contracts
  const wethContract = await getWethContract(PROVIDER);
  const wethContractAddress = await wethContract.getAddress();
  const hpcContract = await getHiddenPaymentChannelsContract(PROVIDER);
  const hpcContractAddress = await hpcContract.getAddress();

  console.log("----- DEMO WALLETS -----");
  console.log("hostRailgunWallet", hostRailgunWallet.railgunAddress);
  console.log("userRailgunWallet", userRailgunWallet.railgunAddress);
  console.log("hostClearnetWallet", hostClearnetWallet.address);
  console.log("userClearnetWallet", userClearnetWallet.address);
  console.log("userTicketSignerWallet", userTicketSignerWallet.address);
  console.log("----- SMART CONTRACTS -----");
  console.log("wethContract", wethContractAddress);
  console.log("hiddenPaymentChannelsContract", hpcContractAddress);

  // get balance updates
  setupBalanceCallbacks();
  runBalancePoller([hostRailgunWallet.railgunId, userRailgunWallet.railgunId]);
  await waitForBalancesLoaded();

  let balances:
    | {
        hostRailgunWalletSpendableBalance: bigint;
        hostRailgunWalletPendingBalance: bigint;
        userRailgunWalletSpendableBalance: bigint;
        userRailgunWalletPendingBalance: bigint;
        hostClearnetWalletBalance: bigint;
        userClearnetWalletBalance: bigint;
        userTicketSignerWalletBalance: bigint;
        hiddenPaymentChannelsContractBalance: bigint;
      }
    | undefined;

  async function updateBalances() {
    const hostRailgunWalletSpendableBalance = getSpendableWethBalance(
      hostRailgunWallet.railgunId
    );
    const hostRailgunWalletPendingBalance = getPendingWethBalance(
      hostRailgunWallet.railgunId
    );
    const userRailgunWalletSpendableBalance = getSpendableWethBalance(
      userRailgunWallet.railgunId
    );
    const userRailgunWalletPendingBalance = getPendingWethBalance(
      userRailgunWallet.railgunId
    );
    const [
      hostClearnetWalletBalance,
      userClearnetWalletBalance,
      userTicketSignerWalletBalance,
      hiddenPaymentChannelsContractBalance,
    ] = await Promise.all([
      PROVIDER.getBalance(hostClearnetWallet.address),
      PROVIDER.getBalance(userClearnetWallet.address),
      wethContract.balanceOf(userTicketSignerWallet.address),
      wethContract.balanceOf(hpcContractAddress),
    ]);

    const newBalances = {
      hostRailgunWalletSpendableBalance: hostRailgunWalletSpendableBalance,
      hostRailgunWalletPendingBalance: hostRailgunWalletPendingBalance,
      userRailgunWalletSpendableBalance: userRailgunWalletSpendableBalance,
      userRailgunWalletPendingBalance: userRailgunWalletPendingBalance,
      hostClearnetWalletBalance: hostClearnetWalletBalance,
      userClearnetWalletBalance: userClearnetWalletBalance,
      userTicketSignerWalletBalance: userTicketSignerWalletBalance,
      hiddenPaymentChannelsContractBalance:
        hiddenPaymentChannelsContractBalance,
    };

    // for (const [name, balance] of Object.entries(newBalances)) {
    //   console.log(name, balance);
    // }

    for (const [name, balance] of Object.entries(newBalances)) {
      if (balances && balance !== balances[name as keyof typeof balances]) {
        console.log(
          `👀 ${name} balance changed:`,
          balance - balances[name as keyof typeof balances]
        );
      }
    }

    balances = newBalances;
  }
  await updateBalances();
  setInterval(updateBalances, 10000);

  if (!balances) {
    throw Error("could not load balances");
  }

  // ensure all wallets have enough balances
  // 1. host & user clearnet wallets
  // 2. user has shielded balance
  // 3. user has topped up HiddenPaymentChannels contract

  // check if user has enough clearnet balance (ETH)
  if (balances.userClearnetWalletBalance < MIN_USER_CLEARNET_BALANCE) {
    const err = [
      `user clearnet (ETH) balance is less than the minimum required: ${balances.userClearnetWalletBalance} < ${MIN_USER_CLEARNET_BALANCE}`,
      `wallet address: ${userClearnetWallet.address}`,
      `balance: ${formatUnits(balances.userClearnetWalletBalance, 18)}`,
      `minimum required: ${formatUnits(MIN_USER_CLEARNET_BALANCE, 18)}`,
      `suggested: top up with ${formatUnits(
        MIN_USER_CLEARNET_BALANCE * 10n,
        18
      )} ETH`,
    ];
    throw Error(err.join("\n"));
  }
  console.log("✅ user's clearnet balance is enough");

  // check if user has enough shielded balance
  if (balances.userRailgunWalletSpendableBalance < MIN_USER_SHIELDED_BALANCE) {
    console.log("adding funds to user's shielded balance");
    await shield(
      userClearnetWallet,
      userRailgunWallet.railgunAddress,
      MIN_USER_SHIELDED_BALANCE * 10n
    );
  }
  console.log("✅ user's shielded balance is enough");

  // check if user has topped up HiddenPaymentChannels contract
  if (
    balances.hiddenPaymentChannelsContractBalance < MIN_HIDDEN_PAYMENTS_BALANCE
  ) {
    console.log("topping up HiddenPaymentChannels contract");
    await top_up(
      userClearnetWallet,
      {
        id: userRailgunWallet.railgunId,
        address: userRailgunWallet.railgunAddress,
        encryptionKey: userRailgunWallet.encryptionKey!,
      },
      MIN_HIDDEN_PAYMENTS_BALANCE * 10n
    );
  }
  console.log("✅ HiddenPaymentChannels has enough balance");

  // check if host has enough clearnet balance (ETH)
  if (balances.hostClearnetWalletBalance < MIN_USER_CLEARNET_BALANCE) {
    const err = [
      `host clearnet (ETH) balance is less than the minimum required: ${balances.hostClearnetWalletBalance} < ${MIN_USER_CLEARNET_BALANCE}`,
      `wallet address: ${hostClearnetWallet.address}`,
      `balance: ${formatUnits(balances.hostClearnetWalletBalance, 18)}`,
      `minimum required: ${formatUnits(MIN_USER_CLEARNET_BALANCE, 18)}`,
      `suggested: top up with ${formatUnits(
        MIN_USER_CLEARNET_BALANCE * 10n,
        18
      )} ETH`,
    ];
    throw Error(err.join("\n"));
  }
  console.log("✅ host's clearnet balance is enough");

  const latestNonce = await hpcContract.lastTicketNonce();

  console.log("initializing API server");

  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // Error handler
  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      logger.error("Unhandled error:", err);
      res.status(500).json({
        error: "Internal server error",
        details: err.message,
      });
    }
  );

  // API routes
  app.use(
    "/api",
    createRoutes(
      hpcContract,
      hpcContractAddress,
      latestNonce,
      userTicketSignerWallet,
      {
        id: hostRailgunWallet.railgunId,
        address: hostRailgunWallet.railgunAddress,
        encryptionKey: hostRailgunWallet.encryptionKey!,
      },
      hostClearnetWallet
    )
  );

  // Root endpoint
  app.get("/", (req, res) => {
    res.json({
      service: "HiddenPaymentChannels Service",
      version: "0.0.1",
      status: "running",
    });
  });

  // Start Express server
  app.listen(PORT, () => {
    logger.info("=================================================");
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info("API endpoints:");
    logger.info("  GET  /api/hidden-payments/available-funds (used by host)");
    logger.info("  POST /api/ticket/generate (used by user)");
    logger.info("  POST /api/ticket/validate (used by host)");
    logger.info("  POST /api/ticket/claim (used by host)");
    logger.info("=================================================");
  });
}

main().catch((err) => {
  console.error("error", err);
  stop();
  process.exit(0);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully...");
  try {
    await stop();
    logger.info("Graceful shutdown complete");
  } catch (error) {
    logger.error("Error during shutdown:", error);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully...");
  try {
    await stop();
    logger.info("Graceful shutdown complete");
  } catch (error) {
    logger.error("Error during shutdown:", error);
  }
  process.exit(0);
});
