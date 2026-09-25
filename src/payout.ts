import {
  encodeFunctionData,
  erc20Abi,
  keccak256,
  parseAbi,
  TransactionReceiptNotFoundError,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import type { Config } from "./config.js";
import type { Batch } from "./state.js";

const disperseAbi = parseAbi([
  "function disperseEther(address[] recipients, uint256[] values) payable",
  "function disperseToken(address token, address[] recipients, uint256[] values)",
]);

type Wallet = WalletClient<Transport, Chain, Account>;

function buildCall(cfg: Config, batch: Batch): { to: Address; value: bigint; data?: Hex } {
  const amounts = batch.amounts.map(BigInt);
  const total = amounts.reduce((a, b) => a + b, 0n);

  if (cfg.disperse) {
    const data =
      cfg.payoutToken === "native"
        ? encodeFunctionData({ abi: disperseAbi, functionName: "disperseEther", args: [batch.recipients, amounts] })
        : encodeFunctionData({
            abi: disperseAbi,
            functionName: "disperseToken",
            args: [cfg.payoutToken, batch.recipients, amounts],
          });
    return { to: cfg.disperse, value: cfg.payoutToken === "native" ? total : 0n, data };
  }

  if (batch.recipients.length !== 1) throw new Error("Tanpa DISPERSE_ADDRESS, satu batch = satu penerima");
  if (cfg.payoutToken === "native") return { to: batch.recipients[0], value: total };
  return {
    to: cfg.payoutToken,
    value: 0n,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [batch.recipients[0], total] }),
  };
}

/** Untuk mode Disperse + ERC-20: pastikan kontrak Disperse boleh menarik token payout. */
export async function ensureAllowance(
  publicClient: PublicClient,
  wallet: Wallet,
  cfg: Config,
  needed: bigint,
): Promise<void> {
  if (!cfg.disperse || cfg.payoutToken === "native") return;
  const current = await publicClient.readContract({
    address: cfg.payoutToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: [wallet.account.address, cfg.disperse],
  });
  if (current >= needed) return;
  const hash = await wallet.writeContract({
    address: cfg.payoutToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [cfg.disperse, needed],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`approve gagal: ${hash}`);
}

/**
 * Mengirim satu batch secara idempoten:
 * transaksi ditandatangani dan disimpan (`persist`) SEBELUM dikirim,
 * sehingga kalau bot mati di tengah jalan, saat restart transaksi yang sama
 * dicek/di-broadcast ulang — tidak pernah terkirim dua kali.
 */
export async function sendBatch(
  publicClient: PublicClient,
  wallet: Wallet,
  cfg: Config,
  batch: Batch,
  persist: () => void,
): Promise<void> {
  if (batch.status === "confirmed" || batch.status === "failed") return;

  if (batch.status === "queued") {
    const request = await wallet.prepareTransactionRequest({ ...buildCall(cfg, batch), account: wallet.account });
    const rawTx = await wallet.signTransaction(request);
    batch.rawTx = rawTx;
    batch.hash = keccak256(rawTx);
    batch.status = "signed";
    persist();
  }

  const hash = batch.hash!;
  const existing = await findReceipt(publicClient, hash);
  if (!existing) {
    try {
      await publicClient.sendRawTransaction({ serializedTransaction: batch.rawTx! });
    } catch (err) {
      // Bisa jadi sudah ada di mempool / sudah ditambang di sela-sela pengecekan.
      if (!(await findReceipt(publicClient, hash)) && !isAlreadyKnown(err)) {
        batch.status = "failed";
        batch.error = errorMessage(err);
        persist();
        return;
      }
    }
  }

  const receipt = existing ?? (await publicClient.waitForTransactionReceipt({ hash, timeout: 300_000 }));
  batch.status = receipt.status === "success" ? "confirmed" : "failed";
  if (receipt.status !== "success") batch.error = "transaksi revert";
  persist();
}

async function findReceipt(client: PublicClient, hash: Hex) {
  try {
    return await client.getTransactionReceipt({ hash });
  } catch (err) {
    if (err instanceof TransactionReceiptNotFoundError) return undefined;
    throw err;
  }
}

function isAlreadyKnown(err: unknown): boolean {
  return /already known|already imported|known transaction/i.test(errorMessage(err));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? (err as { shortMessage?: string }).shortMessage ?? err.message : String(err);
}
