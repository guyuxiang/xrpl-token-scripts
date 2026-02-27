/**
 * XRPL IOU 发行与 DEX 交易示例
 * 
 * 运行方式:
 * npx ts-node examples/basic-example.ts
 */

import {
  createClient,
  createTestAccount,
  issueIOU,
  authorizeHolder,
  transferIOU,
  getIOUBalance,
  createOffer,
  cancelOffer,
  getAccountOffers,
} from "../xrpl-token";
import { xrpToDrops, dropsToXrp } from "xrpl";

/**
 * 示例1: 基础 IOU 发行流程
 */
export async function issueIOUExample(): Promise<void> {
  console.log("=".repeat(50));
  console.log("📌 示例1: 发行 IOU 代币");
  console.log("=".repeat(50));

  const client = createClient("testnet");
  await client.connect();

  try {
    // 创建发行方账户
    const issuer = await createTestAccount();
    console.log(`发行方地址: ${issuer.address}`);

    // 给自己设置 TrustLine（发行 IOU）
    // 实际上就是设置 TrustLine，issuer 和 holder 都是自己
    await issueIOU(client, issuer, "MYCOIN", issuer.address, "1000000");

    console.log("\n✅ IOU 发行完成!");
    console.log(`   代币代码: MYCOIN`);
    console.log(`   发行方: ${issuer.address}`);
    console.log(`   最大供应量: 1,000,000`);

  } finally {
    await client.disconnect();
  }
}

/**
 * 示例2: 发行并授权给其他用户
 */
export async function authorizeHolderExample(): Promise<void> {
  console.log("=".repeat(50));
  console.log("📌 示例2: 发行并授权给其他用户");
  console.log("=".repeat(50));

  const client = createClient("testnet");
  await client.connect();

  try {
    // 创建发行方和接收方
    const [issuer, holder] = await Promise.all([
      createTestAccount(),
      createTestAccount(),
    ]);

    console.log(`发行方: ${issuer.address}`);
    console.log(`接收方: ${holder.address}`);

    // 发行 IOU
    await issueIOU(client, issuer, "GOLD", issuer.address, "10000");

    // 发送 IOU 给接收方（自动创建 TrustLine）
    await authorizeHolder(client, issuer, holder.address, "GOLD", "1000");

    // 查询余额
    const balance = await getIOUBalance(client, holder.address, "GOLD", issuer.address);
    console.log(`\n接收方 GOLD 余额: ${balance}`);

  } finally {
    await client.disconnect();
  }
}

/**
 * 示例3: DEX 挂单交易
 */
export async function dexTradingExample(): Promise<void> {
  console.log("=".repeat(50));
  console.log("📌 示例3: DEX 挂单交易");
  console.log("=".repeat(50));

  const client = createClient("testnet");
  await client.connect();

  try {
    // 创建两个账户：一个挂单，一个吃单
    const [maker, taker] = await Promise.all([
      createTestAccount(),
      createTestAccount(),
    ]);

    console.log(`做市商: ${maker.address}`);
    console.log(`吃单者: ${taker.address}`);

    // 1. 做市商发行 IOU
    const currencyCode = "SILVER";
    await issueIOU(client, maker, currencyCode, maker.address, "10000");

    // 2. 给吃单者发送一些 IOU
    await authorizeHolder(client, maker, taker.address, currencyCode, "1000");

    // 3. 做市商在 DEX 上挂卖单：卖 10 IOU，买 5 XRP
    console.log("\n📝 做市商挂卖单...");
    await createOffer(
      client,
      maker,
      // 付出：10 SILVER
      {
        currency: currencyCode,
        issuer: maker.address,
        value: "10",
      },
      // 获得：5 XRP
      xrpToDrops("5").toString(),
      "sell"
    );

    // 4. 查询做市商的挂单
    const offers = await getAccountOffers(client, maker.address);
    console.log(`\n做市商当前挂单数: ${offers.length}`);

    // 5. 取消挂单（可选）
    if (offers.length > 0) {
      console.log("\n❌ 取消挂单...");
      await cancelOffer(client, maker, offers[0].OfferSequence);
    }

  } finally {
    await client.disconnect();
  }
}

/**
 * 示例4: IOU 之间交易 (使用 Devnet)
 * 
 * 交易需求:
 * - TokenA: ROR1
 * - TokenB: RLUSD
 * - 卖家卖出 10000 ROR1，换 8000 RLUSD
 * - 买家花费 8000 RLUSD，买入 10000 ROR1
 */
export async function iouToIouTradingExample(): Promise<void> {
  console.log("=".repeat(50));
  console.log("📌 示例4: ROR1/RLUSD 交易 (Devnet)");
  console.log("=".repeat(50));
  console.log("需求: 卖家卖出 10000 ROR1 → 获得 8000 RLUSD");
  console.log("       买家花费 8000 RLUSD → 获得 10000 ROR1");
  console.log("=".repeat(50));

  const client = createClient("devnet");
  await client.connect();

  try {
    const [maker, taker] = await Promise.all([
      createTestAccount("devnet"),
      createTestAccount("devnet"),
    ]);

    console.log(`\n📋 账户信息:`);
    console.log(`   卖家(Maker): ${maker.address}`);
    console.log(`   买家(Taker): ${taker.address}`);

    // 货币代码
    const tokenA = "ROR";  // 简化为3字符 (ROR1 需40字符hex格式)
    const tokenB = "RLU";  // 简化为3字符 (RLUSD 需40字符hex格式)

    console.log(`\n🖊️ 发行代币:`);
    console.log(`   Token A: ${tokenA} (代表 ROR1)`);
    console.log(`   Token B: ${tokenB} (代表 RLUSD)`);

    console.log(`\n🖊️ 发行 IOU A: ${tokenA}`);
    // 发行方不需要做任何特殊操作，IOU 可以直接发送给信任发行方的账户
    console.log(`   ${tokenA} 发行方: ${maker.address}`);

    console.log(`\n🖊️ 发行 IOU B: ${tokenB}`);
    // 发行方不需要做任何特殊操作，IOU 可以直接发送给信任发行方的账户
    console.log(`   ${tokenB} 发行方: ${maker.address}`);

    // 给 taker 发送一些 tokenA（taker 需要先信任 maker 的 IOU）
    console.log(`\n💸 给买家发送 ${tokenA} (ROR1)...`);
    await authorizeHolder(client, maker, taker.address, tokenA, "10000");

    // 同样给 taker 发送一些 tokenB
    console.log(`\n💸 给买家发送 ${tokenB} (RLUSD)...`);
    await authorizeHolder(client, maker, taker.address, tokenB, "8000");

    // 查询 taker 的余额
    const takerBalanceA = await getIOUBalance(client, taker.address, tokenA, maker.address);
    const takerBalanceB = await getIOUBalance(client, taker.address, tokenB, maker.address);
    console.log(`\n📊 买家初始余额:`);
    console.log(`   ${tokenA} (ROR1): ${takerBalanceA}`);
    console.log(`   ${tokenB} (RLU): ${takerBalanceB}`);

    // 卖家挂单：卖出 10000 ROR，换 8000 RLU
    console.log(`\n📝 卖家(Maker)在 DEX 挂单...`);
    console.log(`   卖出: 10000 ${tokenA} (ROR1)`);
    console.log(`   买入: 8000 ${tokenB} (RLU)`);
    
    await createOffer(
      client,
      maker,
      // 付出: 10000 ROR
      { currency: tokenA, issuer: maker.address, value: "10000" },
      // 获得: 8000 RLU
      { currency: tokenB, issuer: maker.address, value: "8000" },
      "sell"
    );

    // 查询卖家的挂单
    const offers = await getAccountOffers(client, maker.address);
    console.log(`\n📊 卖家当前挂单数: ${offers.length}`);
    if (offers.length > 0) {
      console.log(`   Offer Sequence: ${offers[0].OfferSequence}`);
    }

    // 买家挂单：花费 8000 RLU，买入 10000 ROR
    console.log(`\n🔄 买家(Taker)进行交换...`);
    console.log(`   付出: 8000 ${tokenB} (RLU)`);
    console.log(`   获得: 10000 ${tokenA} (ROR1)`);
    
    await createOffer(
      client,
      taker,
      // 付出: 8000 RLU
      { currency: tokenB, issuer: maker.address, value: "8000" },
      // 获得: 10000 ROR
      { currency: tokenA, issuer: maker.address, value: "10000" },
      "buy"
    );

    // 查询最终余额
    const makerBalanceA = await getIOUBalance(client, maker.address, tokenA, maker.address);
    const makerBalanceB = await getIOUBalance(client, maker.address, tokenB, maker.address);
    const takerFinalBalanceA = await getIOUBalance(client, taker.address, tokenA, maker.address);
    const takerFinalBalanceB = await getIOUBalance(client, taker.address, tokenB, maker.address);

    console.log(`\n💰 最终余额:`);
    console.log(`   卖家 ${tokenA} (ROR1): ${makerBalanceA}`);
    console.log(`   卖家 ${tokenB} (RLU): ${makerBalanceB}`);
    console.log(`   买家 ${tokenA} (ROR1): ${takerFinalBalanceA}`);
    console.log(`   买家 ${tokenB} (RLU): ${takerFinalBalanceB}`);

    console.log("\n✅ ROR1/RLSD 交易测试完成!");

  } finally {
    await client.disconnect();
  }
}

// 运行示例
const examples: Record<string, () => Promise<void>> = {
  issue: issueIOUExample,
  authorize: authorizeHolderExample,
  dex: dexTradingExample,
  iou: iouToIouTradingExample,
};

const exampleName = process.argv[2] || "issue";

console.log(`运行示例: ${exampleName}`);

const runExample = examples[exampleName];
if (runExample) {
  runExample().catch(console.error);
} else {
  console.log(`可用示例: ${Object.keys(examples).join(", ")}`);
  console.log(`运行方式: npx ts-node examples/basic-example.ts <example-name>`);
}
