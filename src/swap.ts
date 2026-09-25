import {
  erc20Abi,
  formatUnits,
  parseAbi,
  parseUnits,
  type Account,
  type Address,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import type { Config } from "./config.js";

const v2RouterAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
]);

// Uniswap V3 SwapRouter02 + QuoterV2.
const v3RouterAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)",
]);
const v3QuoterAbi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

type Wallet = WalletClient<Transport, Chain, Account>;

/**
 * Menukar token fee (default: token Anda sendiri, bagian fee dari pair) di wallet
 * distributor menjadi PAYOUT_TOKEN (mis. $AI), dengan proteksi slippage.
 * SWAP_MAX_AMOUNT membatasi jumlah yang dijual per putaran supaya tidak menekan harga.
 */
export async function swapFeesToPayout(
  publicClient: PublicClient,
  wallet: Wallet,
  cfg: Config,
  log: (msg: string) => void,
): Promise<void> {
  const swap = cfg.swap;
  if (!swap || cfg.payoutToken === "native") return;
  const me = wallet.account.address;
  const tokenOut: Address = cfg.payoutToken;

  const decimals = await publicClient.readContract({ address: swap.tokenIn, abi: erc20Abi, functionName: "decimals" });
  const balance = await publicClient.readContract({
    address: swap.tokenIn,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [me],
  });
  const max = parseUnits(swap.maxAmount, decimals);
  const amountIn = max > 0n && balance > max ? max : balance;
  if (amountIn === 0n || amountIn < parseUnits(swap.minAmount, decimals)) return;

  const allowance = await publicClient.readContract({
    address: swap.tokenIn,
    abi: erc20Abi,
    functionName: "allowance",
    args: [me, swap.router],
  });
  if (allowance < amountIn) {
    const hash = await wallet.writeContract({
      address: swap.tokenIn,
      abi: erc20Abi,
      functionName: "approve",
      args: [swap.router, amountIn],
    });
    await expectSuccess(publicClient, hash, "approve swap");
  }

  const quoted = await quote(publicClient, cfg, amountIn, tokenOut);
  const minOut = (quoted * (10_000n - swap.slippageBps)) / 10_000n;
  if (minOut === 0n) {
    log(`Swap dilewati: kuotasi ${formatUnits(amountIn, decimals)} token menghasilkan 0`);
    return;
  }

  const outBalance = () =>
    publicClient.readContract({ address: tokenOut, abi: erc20Abi, functionName: "balanceOf", args: [me] });
  const before = await outBalance();

  let hash;
  if (swap.type === "v2") {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    const { request } = await publicClient.simulateContract({
      account: wallet.account,
      address: swap.router,
      abi: v2RouterAbi,
      functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
      args: [amountIn, minOut, [swap.tokenIn, tokenOut], me, deadline],
    });
    hash = await wallet.writeContract(request);
  } else {
    const { request } = await publicClient.simulateContract({
      account: wallet.account,
      address: swap.router,
      abi: v3RouterAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: swap.tokenIn,
          tokenOut,
          fee: swap.feeTier,
          recipient: me,
          amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    hash = await wallet.writeContract(request);
  }
  await expectSuccess(publicClient, hash, "swap");
  const [received, outDecimals] = await Promise.all([
    outBalance().then((after) => after - before),
    publicClient.readContract({ address: tokenOut, abi: erc20Abi, functionName: "decimals" }),
  ]);
  log(`Swap ${formatUnits(amountIn, decimals)} token fee → ${formatUnits(received, outDecimals)} token payout (${hash})`);
}

async function quote(publicClient: PublicClient, cfg: Config, amountIn: bigint, tokenOut: Address): Promise<bigint> {
  const swap = cfg.swap!;
  if (swap.type === "v2") {
    const amounts = await publicClient.readContract({
      address: swap.router,
      abi: v2RouterAbi,
      functionName: "getAmountsOut",
      args: [amountIn, [swap.tokenIn, tokenOut]],
    });
    return amounts[amounts.length - 1];
  }
  const { result } = await publicClient.simulateContract({
    address: swap.quoter!,
    abi: v3QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn: swap.tokenIn, tokenOut, amountIn, fee: swap.feeTier, sqrtPriceLimitX96: 0n }],
  });
  return result[0];
}

async function expectSuccess(publicClient: PublicClient, hash: `0x${string}`, what: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${what} gagal: ${hash}`);
}
