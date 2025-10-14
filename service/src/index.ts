import { join } from "node:path";
import { setLoggers } from "@railgun-community/wallet";
import { start } from "./engine";
import { createWallet } from "./wallet";
import { logger } from "./utils";
import {
  setupBalanceCallbacks,
  runBalancePoller,
  waitForBalancesLoaded,
  getSpendableWethBalance,
} from "./balances";
import { getHiddenPaymentsContract, getWethContract } from "./contract";
import * as env from "./env";
import {
  Wallet,
  parseEther,
  formatUnits,
  keccak256,
  solidityPackedKeccak256,
  hexlify,
  toUtf8Bytes,
  Signature,
} from "ethers";
import { getProviderWallet } from "./provider";
import { shield, top_up, claim_ticket } from "./actions";
import { Ticket, ClaimableTicket } from "./types";

setLoggers(
  (msg: string) => logger.info("[railgun]", msg),
  (msg: string) => logger.error("[railgun]", msg)
);

const CWD_DIR = process.cwd();
const DATA_DIR = join(CWD_DIR, ".store");

async function main() {
  await start(DATA_DIR);

  const { provider } = getProviderWallet();

  const wethContract = await getWethContract(provider);
  const railgunWallet = await createWallet(
    env.RAILGUN_MNEMONIC,
    env.RAILGUN_ENCRYPTION_KEY
  );

  const hiddenPaymentsContract = await getHiddenPaymentsContract(provider);
  const hiddenPaymentsContractAddress =
    await hiddenPaymentsContract.getAddress();

  const clearnetWallet = new Wallet(
    Wallet.fromPhrase(env.CLEARNET_MNEMONIC).privateKey,
    provider
  );

  setupBalanceCallbacks();
  runBalancePoller([railgunWallet.railgunId]);
  await waitForBalancesLoaded();

  async function printBalances() {
    console.log(
      "clearnetWallet ETH",
      await provider.getBalance(clearnetWallet.address)
    );
    console.log(
      "clearnetWallet WETH",
      await wethContract.balanceOf(clearnetWallet.address)
    );
    console.log("railgun WETH", getSpendableWethBalance().amount);
  }

  async function shieldToWethToRailgunWallet() {
    const requiredShieldedWeth = parseEther("0.000001");
    const pendingShieldedWeth = getSpendableWethBalance().amount;
    const shieldedWeth = getSpendableWethBalance().amount;
    const totalShieldedWeth = pendingShieldedWeth + shieldedWeth;

    if (totalShieldedWeth < shieldedWeth) {
      console.log(
        "shielding to railgun wallet",
        requiredShieldedWeth - shieldedWeth
      );
      await shield(
        clearnetWallet,
        railgunWallet.railgunAddress,
        requiredShieldedWeth - shieldedWeth
      );
    }

    await waitForBalancesLoaded();
    console.log("railgunWallet WETH: ", getSpendableWethBalance());
  }

  async function topupHiddenPayments() {
    await top_up(
      clearnetWallet,
      {
        id: railgunWallet.railgunId,
        address: railgunWallet.railgunAddress,
        encryptionKey: railgunWallet.encryptionKey!,
      },
      parseEther("0.0000001")
    );
  }

  async function claimTickets() {
    const ticket: Ticket = {
      toRailgunAddress:
        "0zk1qy3sg6rnd24935jd9qs4lzmfhfl6sag0udlx35s48sm3hl0c8d83prv7j6fe3z53lajrmeetnfrx7p6fmwcsxkgctc6er9a6a24mcw4mdvcd6jraucxnce3nvan",
      nonce: 7n,
      amount: parseEther("0.00000000000009"),
      hiddenPaymentsAddress: hiddenPaymentsContractAddress,
    };
    const signingWallet = Wallet.fromPhrase(
      "rifle elder resource famous border snow artefact symbol taxi among cash extra"
    );

    // Construct the message hash exactly as the contract does:
    // keccak256(abi.encodePacked(keccak256(toRailgunAddress), amount, nonce, address(this)))
    const messageHash = solidityPackedKeccak256(
      ["bytes32", "uint256", "uint256", "address"],
      [
        keccak256(toUtf8Bytes(ticket.toRailgunAddress)),
        ticket.amount,
        ticket.nonce,
        ticket.hiddenPaymentsAddress,
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

    await claim_ticket(
      clearnetWallet,
      {
        id: railgunWallet.railgunId,
        address: railgunWallet.railgunAddress,
        encryptionKey: railgunWallet.encryptionKey!,
      },
      claimableTicket
    );
  }

  // wait until we have shielded balance
  while (true) {
    const shieldedWeth = getSpendableWethBalance().amount;
    if (shieldedWeth > parseEther("0.0000001")) {
      break;
    }
    await printBalances();
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // console.log("we have shielded balance");

  const totalFunded = await hiddenPaymentsContract.totalAmountFunded();
  const totalWithdrawn = await hiddenPaymentsContract.totalAmountWithdrawn();
  console.log(
    "Total Amount in HiddenPayments:",
    formatUnits(totalFunded - totalWithdrawn),
    "WETH"
  );

  // await topupHiddenPayments();
  await claimTickets();
}

main().catch((err) => {
  console.error("error", err);
  process.exit(1);
});
