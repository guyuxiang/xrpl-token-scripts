/**
 * 查询 Devnet 上的 RLUSD 信息
 */

import { Client } from "xrpl";

const DEVNET_URL = "wss://s.devnet.rippletest.net:51233";

async function main() {
  const client = new Client(DEVNET_URL);
  await client.connect();

  console.log("🔍 查询 Devnet 上的 RLUSD...\n");

  // RLUSD 发行方地址 (Ripple 官方)
  // RLUSD 在主网上的发行方: rQwdEXzFCi7d8hJC revqVqJQgewY1J3t
  // Devnet 上可能是不同的地址

  // 尝试查询已知的一些测试币
  const testTokens = [
    { currency: "RLUSD", issuer: "rQwdEXzFCi7d8hJC8EqC8pt4VVC9U8J" },  // 主网发行方
    { currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" },  // Bitstamp
    { currency: "EUR", issuer: "rhub8VRN55s94qWP8EQxHvWMxYXG2s3E" },   // Bitstamp
  ];

  for (const token of testTokens) {
    try {
      console.log(`\n📦 查询 ${token.currency} (${token.issuer})...`);
      
      // 尝试获取账户信息
      const accountInfo = await client.request({
        command: "account_info",
        account: token.issuer,
      });
      
      console.log(`   ✅ 账户存在: ${token.issuer}`);
      console.log(`   余额: ${accountInfo.result.account_data.Balance} drops`);
      
    } catch (error: any) {
      console.log(`   ❌ 账户不存在或无响应`);
    }
  }

  // 列出 Devnet 上的网关/发行方
  console.log("\n\n📋 尝试获取网关列表...");
  
  // 查询包含特定货币的订单簿
  try {
    const bookOffers = await client.request({
      command: "book_offers",
      taker_pays: { currency: "XRP", issuer: "" },
      taker_gets: { currency: "USD", issuer: "rQwdEXzFCi7d8hJC8EqC8pt4VVC9U8J" },
      limit: 5,
    });
    
    if (bookOffers.result.offers?.length > 0) {
      console.log("   ✅ 找到 RLUSD 相关订单");
    } else {
      console.log("   ⚠️ 未找到 RLUSD 订单");
    }
  } catch (e) {
    console.log("   ❌ 查询失败");
  }

  await client.disconnect();
  console.log("\n\n💡 提示: 如果 Devnet 上没有 RLUSD，可以:");
  console.log("   1. 使用水龙头创建账户后自行发行 IOU");
  console.log("   2. 关注 XRPL 官方测试网更新");
}

main().catch(console.error);
