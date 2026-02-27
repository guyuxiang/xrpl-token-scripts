/**
 * 更广泛地搜索 Devnet 上的测试代币
 */

import { Client } from "xrpl";

const DEVNET_URL = "wss://s.devnet.rippletest.net:51233";

async function main() {
  const client = new Client(DEVNET_URL);
  await client.connect();

  console.log("🔍 搜索 Devnet 上的测试代币...\n");

  // 已知的 XRPL 官方测试发行方
  const knownIssuers = [
    "rQwdEXzFCi7d8hJC8EqC8pt4VVC9U8J", // RLUSD 主网
    "rhub8VRN55s94qWP8EQxHvWMxYXG2s3E", // Bitstamp EUR
    "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", // Bitstamp USD
    "rKiCet8SdvWxPJn2Q5DtCK5s7t6gP8qFq", //Gatehub USD
    "r9cZxb8079Mh6mNYCz7x4q3KqZ9h1xPLq", // Chainier
    "rN3CKs3u2ygC7m3kW1H3JkJKp3Y2Y9K",  // 另一个测试发行方
  ];

  console.log("📋 检查已知发行方账户...\n");
  
  for (const issuer of knownIssuers) {
    try {
      const info = await client.request({
        command: "account_info",
        account: issuer,
      });
      console.log(`✅ ${issuer}`);
      console.log(`   余额: ${parseInt(info.result.account_data.Balance) / 1000000} XRP`);
    } catch (e) {
      // 忽略错误
    }
  }

  // 尝试通过订单簿搜索所有有流动性的 IOU
  console.log("\n📊 搜索有订单簿的代币...\n");

  // 常见的测试代币代码
  const testCurrencies = ["USD", "EUR", "GBP", "BTC", "ETH", "RLUSD", "RLGBP", "RLEUR"];

  for (const currency of testCurrencies) {
    try {
      // 尝试各种可能的发行方
      const issuers = [
        "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
        "rhub8VRN55s94qWP8EQxHvWMxYXG2s3E",
        "rQwdEXzFCi7d8hJC8EqC8pt4VVC9U8J",
      ];

      for (const issuer of issuers) {
        try {
          const offers = await client.request({
            command: "book_offers",
            taker_pays: { currency: "XRP", issuer: "" },
            taker_gets: { currency, issuer },
            limit: 1,
          });

          if (offers.result.offers?.length > 0) {
            console.log(`✅ 找到 ${currency}/${issuer} 的订单!`);
            break;
          }
        } catch (e) {
          // 继续尝试下一个
        }
      }
    } catch (e) {
      // 继续
    }
  }

  console.log("\n💡 结论: Devnet 上可能没有 Ripple 官方 RLUSD");
  console.log("   - RLUSD 主要在 Mainnet 上");
  console.log("   - Devnet 可能需要手动设置");
  console.log("   - 可以自己发行测试 IOU");

  await client.disconnect();
}

main().catch(console.error);
