import { getAddress, parseAbiItem, zeroAddress, type Address, type PublicClient } from "viem";
import type { Config } from "./config.js";
import type { State } from "./state.js";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const DEAD = getAddress("0x000000000000000000000000000000000000dEaD");
/** Prefix bytecode EOA yang didelegasikan via EIP-7702 — tetap dianggap wallet biasa. */
const EIP7702_PREFIX = "0xef0100";

/**
 * Memperbarui saldo holder secara inkremental dari event Transfer,
 * mulai dari blok terakhir yang dipindai sampai `toBlock`.
 */
export async function syncBalances(
  client: PublicClient,
  cfg: Config,
  state: State,
  toBlock: bigint,
  log: (msg: string) => void,
): Promise<void> {
  let from = state.scan.lastBlock === null ? cfg.tokenDeployBlock : BigInt(state.scan.lastBlock) + 1n;
  if (from > toBlock) return;

  const balances = state.scan.balances;
  const add = (who: Address, delta: bigint) => {
    if (who === zeroAddress) return;
    const next = BigInt(balances[who] ?? "0") + delta;
    if (next === 0n) delete balances[who];
    else balances[who] = next.toString();
  };

  while (from <= toBlock) {
    const to = from + cfg.logBlockRange - 1n < toBlock ? from + cfg.logBlockRange - 1n : toBlock;
    const logs = await client.getLogs({
      address: cfg.token,
      event: transferEvent,
      fromBlock: from,
      toBlock: to,
    });
    for (const { args } of logs) {
      add(getAddress(args.from!), -args.value!);
      add(getAddress(args.to!), args.value!);
    }
    state.scan.lastBlock = to.toString();
    log(`  pindai blok ${from}–${to}: ${logs.length} transfer`);
    from = to + 1n;
  }
}

/** Saldo holder yang berhak menerima, setelah semua pengecualian diterapkan. */
export async function eligibleBalances(
  client: PublicClient,
  cfg: Config,
  state: State,
  distributor: Address,
): Promise<Map<Address, bigint>> {
  const excluded = new Set<Address>([zeroAddress, DEAD, cfg.token, distributor, ...cfg.excluded]);
  const result = new Map<Address, bigint>();

  for (const [holder, raw] of Object.entries(state.scan.balances) as [Address, string][]) {
    if (excluded.has(holder)) continue;
    if (cfg.excludeContracts && (await isContract(client, state, holder))) continue;
    result.set(holder, BigInt(raw));
  }
  return result;
}

async function isContract(client: PublicClient, state: State, who: Address): Promise<boolean> {
  const cached = state.isContract[who];
  if (cached !== undefined) return cached;
  const code = await client.getCode({ address: who });
  const contract = !!code && code !== "0x" && !code.startsWith(EIP7702_PREFIX);
  // Hanya cache hasil "kontrak": EOA bisa saja menjadi kontrak nanti (CREATE2), tapi tidak sebaliknya.
  if (contract) state.isContract[who] = true;
  return contract;
}
