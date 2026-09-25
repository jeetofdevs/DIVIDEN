import type { Address } from "viem";

export interface AllocationInput {
  /** Saldo token holder yang sudah lolos filter pengecualian. */
  balances: Map<Address, bigint>;
  /** Jumlah token payout yang dibagikan putaran ini. */
  pool: bigint;
  /** Jatah yang belum dibayar dari putaran sebelumnya (di bawah MIN_PAYOUT). */
  pending: Map<Address, bigint>;
  minHolding: bigint;
  minPayout: bigint;
}

export interface Payout {
  address: Address;
  amount: bigint;
}

export interface AllocationResult {
  /** Dibayar putaran ini (jatah baru + carry-over >= minPayout). */
  payouts: Payout[];
  /** Jatah yang masih ditahan untuk putaran berikutnya. */
  pending: Map<Address, bigint>;
  eligibleHolders: number;
  totalEligibleBalance: bigint;
  /** Bagian pool yang benar-benar teralokasi (sisa pembulatan tetap di wallet). */
  allocated: bigint;
}

/**
 * Membagi pool secara proporsional terhadap saldo holder.
 * Jatah kecil diakumulasi di `pending` sampai mencapai minPayout,
 * supaya holder kecil tidak "dibayar" lebih sedikit dari biaya gasnya.
 */
export function allocate(input: AllocationInput): AllocationResult {
  const eligible = [...input.balances].filter(
    ([, balance]) => balance > 0n && balance >= input.minHolding,
  );
  const total = eligible.reduce((sum, [, balance]) => sum + balance, 0n);

  const owed = new Map(input.pending);
  let allocated = 0n;
  if (total > 0n && input.pool > 0n) {
    for (const [holder, balance] of eligible) {
      const share = (input.pool * balance) / total;
      if (share === 0n) continue;
      allocated += share;
      owed.set(holder, (owed.get(holder) ?? 0n) + share);
    }
  }

  const payouts: Payout[] = [];
  const pending = new Map<Address, bigint>();
  for (const [holder, amount] of owed) {
    if (amount >= input.minPayout) payouts.push({ address: holder, amount });
    else if (amount > 0n) pending.set(holder, amount);
  }
  payouts.sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));

  return {
    payouts,
    pending,
    eligibleHolders: eligible.length,
    totalEligibleBalance: total,
    allocated,
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
