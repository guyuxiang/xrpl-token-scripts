import { ethers, BigNumber } from "ethers";
import { Token } from "@uniswap/sdk-core";
import { FeeAmount } from "@uniswap/v3-sdk";

// ============ 配置 ============
const RPC_URL = "https://cold-methodical-surf.unichain-sepolia.quiknode.pro/42ae3ab40beb6d16e4c2810d922476fcf38144fd/";

// Uniswap V3 合约地址
const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const QUOTER_V2_ADDRESS = "0x61fFE014BA17989E743c5F6cB21bF9697530B7e7";
const FACTORY_ADDRESS = "0x0227628f3F023bb0BB9804a33a1dC0380EA8EC35";

// Chain ID
const CHAIN_ID = 11155111; // Sepolia

// 代币地址
const USDT_ADDRESS = "0x2d7efff683b0a21e0989729e0249c42cdf9ee442";
const GLUSD_ADDRESS = "0x948e15b38f096d3a664fdeef44c13709732b2110";

// 费率
const FEE = FeeAmount.MEDIUM; // 3000 (0.3%)

// ============ 代币实例 ============
const USDT = new Token(CHAIN_ID, USDT_ADDRESS, 18, "USDT", "USDT");
const GLUSD = new Token(CHAIN_ID, GLUSD_ADDRESS, 18, "GLUSD", "GLUSD");

// 排序代币
const [token0, token1] = GLUSD.sortsBefore(USDT) ? [GLUSD, USDT] : [USDT, GLUSD];

// ============ ABI ============
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

const SWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
  "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)"
];

const POOL_ABI = [
  "function initialize(uint160 sqrtPriceX96) external",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function tickSpacing() external view returns (int24)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

// ============ 工具函数 ============
function getRandomAmount(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// sqrtPriceX96 计算
function sqrtToX96(price: number): bigint {
  return BigInt(Math.floor(Math.sqrt(price) * Math.pow(2, 96)));
}

// ============ 核心函数 ============

/**
 * 获取或创建池子
 */
async function getOrCreatePool(factory: any, signer: any): Promise<string> {
  const poolAddress = await factory.getPool(token0.address, token1.address, FEE);
  
  if (poolAddress !== ethers.constants.AddressZero) {
    console.log("Pool exists:", poolAddress);
    return poolAddress;
  }
  
  console.log("Creating new pool...");
  const tx = await factory.createPool(token0.address, token1.address, FEE);
  const receipt = await tx.wait();
  
  const poolCreatedEvent = receipt.events?.find((e: any) => e.event === "PoolCreated");
  const newPoolAddress = poolCreatedEvent?.args?.pool;
  
  console.log("Pool created:", newPoolAddress);
  return newPoolAddress;
}

/**
 * 初始化池子价格
 */
async function initializePool(pool: any, signer: any): Promise<void> {
  try {
    const initialPrice = "1";
    const sqrtPriceX96 = sqrtToX96(parseFloat(initialPrice)).toString();
    
    const tx = await pool.initialize(sqrtPriceX96);
    await tx.wait();
    console.log("Pool initialized with price:", initialPrice);
  } catch (error: any) {
    if (error.message?.includes("already initialized")) {
      console.log("Pool already initialized");
    } else {
      console.log("Initialize error:", error.message);
    }
  }
}

/**
 * 获取池状态
 */
async function getPoolState(poolAddress: string, provider: any) {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const slot0 = await pool.slot0();
  const liquidity = await pool.liquidity();
  const tickSpacing = await pool.tickSpacing();
  
  return {
    sqrtPriceX96: slot0.sqrtPriceX96,
    tick: slot0.tick,
    liquidity: liquidity,
    tickSpacing: tickSpacing
  };
}

/**
 * 添加流动性 (简化版)
 */
async function addLiquidity(
  poolAddress: string,
  signer: ethers.Wallet,
  amount0: string,
  amount1: string
): Promise<void> {
  const token0Contract = new ethers.Contract(token0.address, ERC20_ABI, signer);
  const token1Contract = new ethers.Contract(token1.address, ERC20_ABI, signer);
  
  const amount0Parsed = ethers.utils.parseUnits(amount0, token0.decimals);
  const amount1Parsed = ethers.utils.parseUnits(amount1, token1.decimals);
  
  console.log("Approving tokens...");
  await token0Contract.approve(poolAddress, amount0Parsed);
  await token1Contract.approve(poolAddress, amount1Parsed);
  
  console.log(`Adding liquidity: ${amount0} ${token0.symbol} + ${amount1} ${token1.symbol}`);
  console.log("Note: Full liquidity requires PositionManager contract");
}

/**
 * 执行 Swap
 */
async function performSwap(
  signer: ethers.Wallet,
  inputToken: Token,
  outputToken: Token,
  amountIn: string
): Promise<void> {
  const router = new ethers.Contract(SWAP_ROUTER_ADDRESS, SWAP_ROUTER_ABI, signer);
  const quoter = new ethers.Contract(QUOTER_V2_ADDRESS, [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, int24 tickAfter, uint256 computedInVariant)"
  ], signer.provider);
  
  const amountInParsed = ethers.utils.parseUnits(amountIn, inputToken.decimals);
  
  // 获取报价
  const quote = await quoter.quoteExactInputSingle({
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    fee: FEE,
    amountIn: amountInParsed,
    sqrtPriceLimitX96: 0
  });
  
  const amountOutMin = quote.amountOut.mul(95).div(100); // 5% 滑点
  
  console.log(`\n--- Swap: ${inputToken.symbol} -> ${outputToken.symbol} ---`);
  console.log(`Input: ${amountIn} ${inputToken.symbol}`);
  console.log(`Output: ${ethers.utils.formatUnits(quote.amountOut, outputToken.decimals)} ${outputToken.symbol}`);
  
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  
  const tx = await router.exactInputSingle({
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    fee: FEE,
    recipient: signer.address,
    deadline: deadline,
    amountIn: amountInParsed,
    amountOutMinimum: amountOutMin,
    sqrtPriceLimitX96: 0
  });
  
  const receipt = await tx.wait();
  console.log(`Success! Tx: ${receipt.transactionHash}`);
}

/**
 * 批准代币
 */
async function ensureApprovals(signer: ethers.Wallet): Promise<void> {
  console.log("Checking approvals...");
  
  const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
  const glusdContract = new ethers.Contract(GLUSD_ADDRESS, ERC20_ABI, signer);
  
  const usdtAllowance = await usdtContract.allowance(signer.address, SWAP_ROUTER_ADDRESS);
  const glusdAllowance = await glusdContract.allowance(signer.address, SWAP_ROUTER_ADDRESS);
  
  if (usdtAllowance.eq(0)) {
    console.log("Approving USDT...");
    await (await usdtContract.approve(SWAP_ROUTER_ADDRESS, ethers.constants.MaxUint256)).wait();
  }
  
  if (glusdAllowance.eq(0)) {
    console.log("Approving GLUSD...");
    await (await glusdContract.approve(SWAP_ROUTER_ADDRESS, ethers.constants.MaxUint256)).wait();
  }
  
  console.log("Approvals ready");
}

/**
 * 获取余额
 */
async function getBalances(signer: ethers.Wallet): Promise<{ usdt: string; glusd: string }> {
  const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer.provider);
  const glusdContract = new ethers.Contract(GLUSD_ADDRESS, ERC20_ABI, signer.provider);
  
  const [usdt, glusd] = await Promise.all([
    usdtContract.balanceOf(signer.address),
    glusdContract.balanceOf(signer.address)
  ]);
  
  return {
    usdt: ethers.utils.formatUnits(usdt, USDT.decimals),
    glusd: ethers.utils.formatUnits(glusd, GLUSD.decimals)
  };
}

// ============ 主函数 ============
async function main(): Promise<void> {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(
    "298149d01f7a23cb938ab6874ea345516479fb70bd5e14c99c0ffaf84798ca80",
    provider
  );
  
  console.log("Wallet:", signer.address);
  console.log("Token0:", token0.symbol, token0.address);
  console.log("Token1:", token1.symbol, token1.address);
  
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
  
  // 1. 获取/创建池子
  console.log("\n=== Step 1: Get/Create Pool ===");
  const poolAddress = await getOrCreatePool(factory, signer);
  
  // 2. 初始化
  console.log("\n=== Step 2: Initialize Pool ===");
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  await initializePool(pool, signer);
  
  // 3. 添加流动性
  console.log("\n=== Step 3: Add Liquidity ===");
  await addLiquidity(poolAddress, signer, "1000", "1000");
  
  // 4. 批准
  console.log("\n=== Step 4: Approvals ===");
  await ensureApprovals(signer);
  
  // 5. 显示余额
  console.log("\n=== Balances ===");
  const balances = await getBalances(signer);
  console.log(`USDT: ${balances.usdt}`);
  console.log(`GLUSD: ${balances.glusd}`);
  
  // 6. 开始 Swap 循环
  console.log("\n=== Start Swapping ===");
  
  let inputToken = USDT;
  let outputToken = GLUSD;
  let swapCount = 1;
  
  while (true) {
    try {
      const bals = await getBalances(signer);
      console.log(`\nBalances - USDT: ${bals.usdt}, GLUSD: ${bals.glusd}`);
      
      const amount = getRandomAmount(10, 100);
      const currentBalance = inputToken.symbol === "USDT" 
        ? parseFloat(bals.usdt) 
        : parseFloat(bals.glusd);
      
      if (currentBalance < amount) {
        console.log(`Low balance for ${inputToken.symbol}, using 90%`);
        const adjusted = Math.floor(currentBalance * 0.9).toString();
        if (parseFloat(adjusted) < 1) break;
        await performSwap(signer, inputToken, outputToken, adjusted);
      } else {
        await performSwap(signer, inputToken, outputToken, amount.toString());
      }
      
      // 切换方向
      [inputToken, outputToken] = [outputToken, inputToken];
      swapCount++;
      
      await delay(10000);
    } catch (error) {
      console.error("Error:", error);
      await delay(30000);
    }
  }
  
  const final = await getBalances(signer);
  console.log("\n=== Final ===");
  console.log(`USDT: ${final.usdt}`);
  console.log(`GLUSD: ${final.glusd}`);
}

main().catch(console.error);
