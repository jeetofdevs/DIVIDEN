import { getAddress, isAddress, type Address, type Hex } from "viem";

try {
  process.loadEnvFile();
} catch {
  // Tidak ada file .env — pakai environment variable yang sudah di-set.
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Environment variable ${name} wajib diisi`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function address(name: string, value: string): Address {
  if (!isAddress(value)) throw new Error(`${name} bukan alamat valid: ${value}`);
  return getAddress(value);
}

function int(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} harus bilangan bulat >= 0`);
  return n;
}

function bool(value: string): boolean {
  return ["1", "true", "yes", "ya"].includes(value.toLowerCase());
}

const payoutTokenRaw = optional("PAYOUT_TOKEN", "native");
const disperseRaw = process.env.DISPERSE_ADDRESS?.trim();
const distributeBps = int("DISTRIBUTE_BPS", optional("DISTRIBUTE_BPS", "10000"));
if (distributeBps > 10_000) throw new Error("DISTRIBUTE_BPS maksimal 10000 (100%)");

export const config = {
  rpcUrl: required("RPC_URL"),
  chainId: int("CHAIN_ID", required("CHAIN_ID")),
  privateKey: required("DISTRIBUTOR_PRIVATE_KEY") as Hex,

  /** Token Anda yang holder-nya menerima pembagian. */
  token: address("TOKEN_ADDRESS", required("TOKEN_ADDRESS")),
  /** Blok saat token di-deploy — awal pemindaian event Transfer. */
  tokenDeployBlock: BigInt(int("TOKEN_DEPLOY_BLOCK", required("TOKEN_DEPLOY_BLOCK"))),

  /** "native" (ETH) atau alamat ERC-20 (mis. Stock Token NVDA). */
  payoutToken:
    payoutTokenRaw.toLowerCase() === "native"
      ? ("native" as const)
      : address("PAYOUT_TOKEN", payoutTokenRaw),

  /** Porsi saldo wallet distributor yang dibagikan tiap putaran (basis poin, 10000 = 100%). */
  distributeBps: BigInt(distributeBps),
  /** Dalam satuan token payout (mis. "0.01" ETH). */
  gasReserve: optional("GAS_RESERVE", "0.005"),
  minPool: optional("MIN_POOL", "0.01"),
  minPayout: optional("MIN_PAYOUT", "0.0001"),
  /** Dalam satuan token Anda. */
  minHolding: optional("MIN_HOLDING", "0"),

  excluded: (process.env.EXCLUDED_ADDRESSES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((a) => address("EXCLUDED_ADDRESSES", a)),
  /** Kecualikan semua smart contract (pool LP, kontrak launchpad, dll). */
  excludeContracts: bool(optional("EXCLUDE_CONTRACTS", "true")),

  disperse: disperseRaw ? address("DISPERSE_ADDRESS", disperseRaw) : undefined,
  batchSize: int("BATCH_SIZE", optional("BATCH_SIZE", "100")),

  intervalMinutes: int("INTERVAL_MINUTES", optional("INTERVAL_MINUTES", "60")),
  confirmations: BigInt(int("CONFIRMATIONS", optional("CONFIRMATIONS", "5"))),
  logBlockRange: BigInt(int("LOG_BLOCK_RANGE", optional("LOG_BLOCK_RANGE", "10000"))),
  dryRun: bool(optional("DRY_RUN", "true")),
  statePath: optional("STATE_PATH", "data/state.json"),

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim(),
  telegramChatId: process.env.TELEGRAM_CHAT_ID?.trim(),
  explorerUrl: process.env.EXPLORER_URL?.trim().replace(/\/$/, ""),
};

export type Config = typeof config;
