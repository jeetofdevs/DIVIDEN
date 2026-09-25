import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { allocate, chunk, nextSlot } from "../src/allocate.js";

const A = "0x000000000000000000000000000000000000000A" as Address;
const B = "0x000000000000000000000000000000000000000b" as Address;
const C = "0x000000000000000000000000000000000000000C" as Address;

describe("allocate", () => {
  it("membagi pool proporsional terhadap saldo", () => {
    const r = allocate({
      balances: new Map([[A, 300n], [B, 100n]]),
      pool: 1000n,
      pending: new Map(),
      minHolding: 0n,
      minPayout: 0n,
    });
    expect(r.payouts).toEqual([
      { address: A, amount: 750n },
      { address: B, amount: 250n },
    ]);
    expect(r.allocated).toBe(1000n);
  });

  it("mengabaikan holder di bawah minHolding", () => {
    const r = allocate({
      balances: new Map([[A, 300n], [B, 5n]]),
      pool: 1000n,
      pending: new Map(),
      minHolding: 10n,
      minPayout: 0n,
    });
    expect(r.eligibleHolders).toBe(1);
    expect(r.payouts).toEqual([{ address: A, amount: 1000n }]);
  });

  it("menahan jatah kecil lalu membayarnya setelah terkumpul", () => {
    const input = {
      balances: new Map([[A, 990n], [B, 10n]]),
      pool: 1000n,
      minHolding: 0n,
      minPayout: 15n,
    };
    const first = allocate({ ...input, pending: new Map() });
    expect(first.payouts).toEqual([{ address: A, amount: 990n }]);
    expect(first.pending.get(B)).toBe(10n);

    const second = allocate({ ...input, pending: first.pending });
    expect(second.payouts).toContainEqual({ address: B, amount: 20n });
    expect(second.pending.size).toBe(0);
  });

  it("tetap membayar pending holder yang sudah menjual", () => {
    const r = allocate({
      balances: new Map([[A, 100n]]),
      pool: 100n,
      pending: new Map([[C, 50n]]),
      minHolding: 0n,
      minPayout: 50n,
    });
    expect(r.payouts).toContainEqual({ address: C, amount: 50n });
  });

  it("tidak pernah mengalokasikan lebih dari pool (pembulatan ke bawah)", () => {
    const r = allocate({
      balances: new Map([[A, 1n], [B, 1n], [C, 1n]]),
      pool: 100n,
      pending: new Map(),
      minHolding: 0n,
      minPayout: 0n,
    });
    expect(r.allocated).toBe(99n);
    expect(r.payouts.reduce((s, p) => s + p.amount, 0n)).toBeLessThanOrEqual(100n);
  });

  it("aman saat tidak ada holder", () => {
    const r = allocate({ balances: new Map(), pool: 100n, pending: new Map(), minHolding: 0n, minPayout: 0n });
    expect(r.payouts).toEqual([]);
    expect(r.allocated).toBe(0n);
  });
});

describe("chunk", () => {
  it("memecah daftar menjadi batch", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("nextSlot", () => {
  it("jatuh tepat di awal jam berikutnya", () => {
    expect(nextSlot(Date.parse("2026-09-25T13:47:12Z"), 60)).toBe(Date.parse("2026-09-25T14:00:00Z"));
  });
  it("tepat di awal jam → jadwalkan jam berikutnya, bukan sekarang", () => {
    expect(nextSlot(Date.parse("2026-09-25T14:00:00Z"), 60)).toBe(Date.parse("2026-09-25T15:00:00Z"));
  });
  it("mendukung interval lain", () => {
    expect(nextSlot(Date.parse("2026-09-25T14:07:00Z"), 15)).toBe(Date.parse("2026-09-25T14:15:00Z"));
  });
});
