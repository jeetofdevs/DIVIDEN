import {
  createPublicClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { allocate, chunk } from "./allocate.js";
import { config as cfg } from "./config.js";
import { eligibleBalances, syncBalances } from "./holders.js";
import { announce } from "./notify.js";
import { ensureAllowance, sendBatch } from "./payout.js";
import { swapFeesToPayout } from "./swap.js";
import { fromBigIntMap, loadState, saveState, toBigIntMap, type Run, type State } from "./state.js";

const chain = defineChain({
  id: cfg.chainId,
  name: `chain-${cfg.chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [cfg.rpcUrl] } },
});
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
const account = privateKeyToAccount(cfg.privateKey);
const wallet = createWalletClient({ chain, account, transport: http(cfg.rpcUrl) });

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function payoutMeta(): Promise<{ decimals: number; symbol: string }> {
  if (cfg.payoutToken === "native") return { decimals: 18, symbol: "ETH" };
  const [decimals, symbol] = await Promise.all([
    publicClient.readContract({ address: cfg.payoutToken, abi: erc20Abi, functionName: "decimals" }),
    publicClient.readContract({ address: cfg.payoutToken, abi: erc20Abi, functionName: "symbol" }),
  ]);
  return { decimals, symbol };
}

async function payoutBalance(who: Address): Promise<bigint> {
  if (cfg.payoutToken === "native") return publicClient.getBalance({ address: who });
  return publicClient.readContract({
    address: cfg.payoutToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
  });
}

async function executeRun(state: State, run: Run, meta: { decimals: number; symbol: string }) {
  const persist = () => saveState(cfg.statePath, state);
  const unsent = run.batches
    .filter((b) => b.status === "queued")
    .flatMap((b) => b.amounts.map(BigInt))
    .reduce((a, b) => a + b, 0n);
  await ensureAllowance(publicClient, wallet, cfg, unsent);

  for (const [i, batch] of run.batches.entries()) {
    await sendBatch(publicClient, wallet, cfg, batch, persist);
    log(`  batch ${i + 1}/${run.batches.length}: ${batch.status}${batch.hash ? ` ${batch.hash}` : ""}${batch.error ? ` (${batch.error})` : ""}`);
  }

  // Batch yang gagal dikembalikan ke saldo pending supaya dibayar di putaran berikutnya.
  const pending = toBigIntMap(state.pending);
  let paid = 0n;
  let paidHolders = 0;
  let paidOps = 0n;
  for (const batch of run.batches) {
    batch.recipients.forEach((to, j) => {
      const amount = BigInt(batch.amounts[j]);
      if (batch.status === "failed") pending.set(to, (pending.get(to) ?? 0n) + amount);
      else if (to === run.operations?.address) paidOps += amount;
      else {
        paid += amount;
        paidHolders++;
      }
    });
  }
  state.pending = fromBigIntMap(pending);
  run.status = "done";
  run.finishedAt = new Date().toISOString();
  persist();

  const failed = run.batches.filter((b) => b.status === "failed").length;
  const summary =
    `💰 DIVIDEN #${run.id}: ${formatUnits(paid, meta.decimals)} ${meta.symbol} dibagikan ke ${paidHolders} holder` +
    (paidOps > 0n ? ` + ${formatUnits(paidOps, meta.decimals)} ${meta.symbol} ke wallet operasional` : "") +
    (failed ? ` (${failed} transaksi gagal, dijadwalkan ulang)` : "");
  log(summary);
  if (paid > 0n) await announce(cfg, cfg.explorerUrl ? `${summary}\n${cfg.explorerUrl}/address/${account.address}` : summary);
}

async function tick() {
  const state = loadState(cfg.statePath);
  const meta = await payoutMeta();

  const open = state.runs.find((r) => r.status === "sending");
  if (open) {
    log(`Melanjutkan distribusi #${open.id} yang belum selesai`);
    await executeRun(state, open, meta);
    return;
  }

  // 1. Tukar fee (mis. token Anda dari pair) ke token payout (mis. $AI)
  if (cfg.swap && !cfg.dryRun) await swapFeesToPayout(publicClient, wallet, cfg, log);

  // 2. Snapshot holder
  const head = await publicClient.getBlockNumber();
  const snapshotBlock = head - cfg.confirmations;
  log(`Sinkronisasi holder sampai blok ${snapshotBlock}`);
  await syncBalances(publicClient, cfg, state, snapshotBlock, log);
  const balances = await eligibleBalances(publicClient, cfg, state, account.address);
  saveState(cfg.statePath, state);

  // 3. Hitung pool yang bisa dibagikan
  const pending = toBigIntMap(state.pending);
  const owed = [...pending.values()].reduce((a, b) => a + b, 0n);
  const reserve = cfg.payoutToken === "native" ? parseUnits(cfg.gasReserve, meta.decimals) : 0n;
  const balance = await payoutBalance(account.address);
  const available = balance - reserve - owed;
  const pool = available > 0n ? (available * cfg.distributeBps) / 10_000n : 0n;
  log(
    `Saldo ${formatUnits(balance, meta.decimals)} ${meta.symbol}, ` +
      `pending ${formatUnits(owed, meta.decimals)}, pool ${formatUnits(pool, meta.decimals)}`,
  );
  if (pool < parseUnits(cfg.minPool, meta.decimals)) {
    log(`Pool di bawah MIN_POOL (${cfg.minPool} ${meta.symbol}) — lewati putaran ini`);
    return;
  }

  // 4. Alokasi
  const tokenDecimals = await publicClient.readContract({
    address: cfg.token,
    abi: erc20Abi,
    functionName: "decimals",
  });
  const opsCut = cfg.operations ? (pool * cfg.operations.bps) / 10_000n : 0n;
  const result = allocate({
    balances,
    pool: pool - opsCut,
    pending,
    minHolding: parseUnits(cfg.minHolding, tokenDecimals),
    minPayout: parseUnits(cfg.minPayout, meta.decimals),
  });
  const payouts = opsCut > 0n ? [{ address: cfg.operations!.wallet, amount: opsCut }, ...result.payouts] : result.payouts;
  if (opsCut > 0n) log(`Operasional: ${formatUnits(opsCut, meta.decimals)} ${meta.symbol} → ${cfg.operations!.wallet}`);
  log(`${result.eligibleHolders} holder berhak, ${result.payouts.length} dibayar putaran ini, ${result.pending.size} ditahan (di bawah MIN_PAYOUT)`);

  if (cfg.dryRun) {
    if (cfg.swap) log("(Auto-swap tidak dijalankan saat DRY_RUN)");
    for (const p of result.payouts.slice(0, 20)) log(`  ${p.address}  ${formatUnits(p.amount, meta.decimals)} ${meta.symbol}`);
    if (result.payouts.length > 20) log(`  ... dan ${result.payouts.length - 20} lainnya`);
    log("DRY_RUN=true — tidak ada yang dikirim. Set DRY_RUN=false untuk mengirim sungguhan.");
    return;
  }
  if (payouts.length === 0) {
    state.pending = fromBigIntMap(result.pending);
    saveState(cfg.statePath, state);
    return;
  }

  // 5. Simpan rencana distribusi SEBELUM mengirim apa pun
  const size = cfg.disperse ? Math.max(1, cfg.batchSize) : 1;
  const run: Run = {
    id: (state.runs.at(-1)?.id ?? 0) + 1,
    createdAt: new Date().toISOString(),
    snapshotBlock: snapshotBlock.toString(),
    payoutToken: cfg.payoutToken,
    pool: pool.toString(),
    allocated: result.allocated.toString(),
    eligibleHolders: result.eligibleHolders,
    operations: opsCut > 0n ? { address: cfg.operations!.wallet, amount: opsCut.toString() } : undefined,
    status: "sending",
    batches: chunk(payouts, size).map((group) => ({
      recipients: group.map((p) => p.address),
      amounts: group.map((p) => p.amount.toString()),
      status: "queued",
    })),
  };
  state.runs.push(run);
  state.pending = fromBigIntMap(result.pending);
  saveState(cfg.statePath, state);

  // 6. Kirim
  log(`Distribusi #${run.id}: ${run.batches.length} transaksi`);
  await executeRun(state, run, meta);
}

async function main() {
  log(`DIVIDEN — distributor ${account.address}, token ${cfg.token}, payout ${cfg.payoutToken}${cfg.dryRun ? " [DRY RUN]" : ""}`);
  if (process.argv.includes("--once")) {
    await tick();
    return;
  }
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("Putaran gagal:", err);
    }
    log(`Putaran berikutnya dalam ${cfg.intervalMinutes} menit`);
    await new Promise((r) => setTimeout(r, cfg.intervalMinutes * 60_000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
