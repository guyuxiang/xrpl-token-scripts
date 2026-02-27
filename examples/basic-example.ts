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
 */
export async function iouToIouTradingExample(): Promise<void> {
  console.log("=".repeat(50));
  console.log("📌 示例4: IOU-IOU 交易 (Devnet)");
  console.log("=".repeat(50));

  const client = createClient("devnet");
  await client.connect();

  try {
    const [maker, taker] = await Promise.all([
      createTestAccount("devnet"),
      createTestAccount("devnet"),
    ]);

    console.log(`\n📋 账户信息:`);
    console.log(`   做市商: ${maker.address}`);
    console.log(`   吃单者: ${taker.address}`);

    // 发行两种 IOU（直接通过发送来创建 TrustLine）
    const tokenA = "COI";  // 必须 3 个字符
    const tokenB = "COJ";  // 必须 3 个字符

    console.log(`\n🖊️ 发行 IOU A: ${tokenA}`);
    // 发行方不需要做任何特殊操作，IOU 可以直接发送给信任发行方的账户
    console.log(`   ${tokenA} 发行方: ${maker.address}`);

    console.log(`\n🖊️ 发行 IOU B: ${tokenB}`);
    // 发行方不需要做任何特殊操作，IOU 可以直接发送给信任发行方的账户
    console.log(`   ${tokenB} 发行方: ${maker.address}`);

    // 给 taker 发送一些 COI（taker 需要先信任 maker 的 IOU）
    console.log(`\n💸 给吃单者发送 ${tokenA}...`);
    await authorizeHolder(client, maker, taker.address, tokenA, "100");

    // 同样给 taker 发送一些 COJ
    console.log(`\n💸 给吃单者发送 ${tokenB}...`);
    await authorizeHolder(client, maker, taker.address, tokenB, "50");

    // 查询 taker 的余额
    const takerBalance = await getIOUBalance(client, taker.address, tokenA, maker.address);
    console.log(`   吃单者 ${tokenA} 余额: ${takerBalance}`);

    // 做市商挂单：卖 10 COINA，买 5 COINB
    console.log(`\n📝 做市商在 DEX 挂单...`);
    console.log(`   卖出: 10 ${tokenA}`);
    console.log(`   买入: 5 ${tokenB}`);
    
    await createOffer(
      client,
      maker,
      { currency: tokenA, issuer: maker.address, value: "10" },
      { currency: tokenB, issuer: maker.address, value: "5" },
      "sell"
    );

    // 查询做市商的挂单
    const offers = await getAccountOffers(client, maker.address);
    console.log(`\n📊 做市商当前挂单数: ${offers.length}`);
    if (offers.length > 0) {
      console.log(`   Offer Sequence: ${offers[0].OfferSequence}`);
    }

    // 模拟吃单者用 COINA 买入 COINB
    console.log(`\n🔄 吃单者进行交换...`);
    console.log(`   用 5 ${tokenA} 买入 ${tokenB}...`);
    
    await createOffer(
      client,
      taker,
      { currency: tokenA, issuer: maker.address, value: "5" },
      { currency: tokenB, issuer: maker.address, value: "2.5" },
      "buy"
    );

    // 查询最终余额
    const makerBalanceA = await getIOUBalance(client, maker.address, tokenA, maker.address);
    const makerBalanceB = await getIOUBalance(client, maker.address, tokenB, maker.address);
    const takerBalanceA = await getIOUBalance(client, taker.address, tokenA, maker.address);
    const takerBalanceB = await getIOUBalance(client, taker.address, tokenB, maker.address);

    console.log(`\n💰 最终余额:`);
    console.log(`   做市商 ${tokenA}: ${makerBalanceA}`);
    console.log(`   做市商 ${tokenB}: ${makerBalanceB}`);
    console.log(`   吃单者 ${tokenA}: ${takerBalanceA}`);
    console.log(`   吃单者 ${tokenB}: ${takerBalanceB}`);

    console.log("\n✅ IOU-IOU 交易测试完成!");

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
