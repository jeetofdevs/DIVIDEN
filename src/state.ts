import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Address, Hex } from "viem";

export type BatchStatus = "queued" | "signed" | "confirmed" | "failed";

/** Satu transaksi on-chain: 1 penerima (transfer biasa) atau banyak (via Disperse). */
export interface Batch {
  recipients: Address[];
  amounts: string[];
  status: BatchStatus;
  rawTx?: Hex;
  hash?: Hex;
  error?: string;
}

export interface Run {
  id: number;
  createdAt: string;
  finishedAt?: string;
  snapshotBlock: string;
  payoutToken: Address | "native";
  pool: string;
  allocated: string;
  eligibleHolders: number;
  status: "sending" | "done";
  batches: Batch[];
}

export interface State {
  version: 1;
  scan: {
    /** Blok terakhir yang sudah dipindai (inklusif). */
    lastBlock: string | null;
    balances: Record<Address, string>;
  };
  /** Cache hasil cek "apakah alamat ini smart contract". */
  isContract: Record<Address, boolean>;
  pending: Record<Address, string>;
  runs: Run[];
}

function emptyState(): State {
  return { version: 1, scan: { lastBlock: null, balances: {} }, isContract: {}, pending: {}, runs: [] };
}

export function loadState(path: string): State {
  if (!existsSync(path)) return emptyState();
  return JSON.parse(readFileSync(path, "utf8")) as State;
}

/** Tulis atomik (tmp + rename) supaya file state tidak pernah setengah tertulis. */
export function saveState(path: string, state: State): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
}

export function toBigIntMap(record: Record<Address, string>): Map<Address, bigint> {
  return new Map(Object.entries(record).map(([k, v]) => [k as Address, BigInt(v)]));
}

export function fromBigIntMap(map: Map<Address, bigint>): Record<Address, string> {
  return Object.fromEntries([...map].map(([k, v]) => [k, v.toString()]));
}
