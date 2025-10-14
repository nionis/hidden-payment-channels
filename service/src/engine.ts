import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  startRailgunEngine,
  stopRailgunEngine,
} from "@railgun-community/wallet";
import { createArtifactStore } from "./artifact-store";
import { createNodeDatabase } from "./db";
import { loadEngineProvider } from "./provider";
import { setRailgunFees } from "@railgun-community/cookbook";
import { NETWORK } from "./env";
import { setupNodeGroth16 } from "./prover";

export async function start(dataDir: string): Promise<void> {
  console.log("starting railgun engine");

  // create directories
  const walletsDir = join(dataDir, "wallets");
  const artifactsDir = join(dataDir, "artifacts");
  await mkdir(walletsDir, { recursive: true });
  await mkdir(artifactsDir, { recursive: true });

  const dbPath = join(walletsDir, "engine.db");
  const db = createNodeDatabase(dataDir);
  console.log(`storing data at: ${dbPath}`);

  const artifactStore = createArtifactStore(artifactsDir);

  await startRailgunEngine(
    "default",
    db,
    true,
    artifactStore,
    false,
    false,
    ["https://ppoi-agg.horsewithsixlegs.xyz"],
    [],
    true
  );

  console.log("railgun engine started");

  const { feesSerialized } = await loadEngineProvider();
  console.log("loaded provider, feesSerialized:", feesSerialized);

  setRailgunFees(
    NETWORK as any,
    BigInt(feesSerialized.shieldFeeV2),
    BigInt(feesSerialized.unshieldFeeV2)
  );
  setupNodeGroth16();

  process.on("SIGINT", async (sigint) => {
    console.log("EXIT DETECTED", sigint);
    await stopRailgunEngine();
    process.exit(0);
  });
}
