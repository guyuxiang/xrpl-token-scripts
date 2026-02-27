/**
 * XRPL IOU 发行与 DEX 交易脚本
 * 
 * 功能：
 * 1. 发行 IOU 代币（通过创建 TrustLine）
 * 2. 支付 IOU 给其他账户
 * 3. 在 DEX 上创建 Offer 进行交易
 * 4. 查询订单簿和取消订单
 * 
 * 使用方法：
 * npx ts-node xrpl-token.ts
 */

import {
  Client,
  Wallet,
  TrustSet,
  Payment,
  OfferCreate,
  OfferCancel,
  xrpToDrops,
  dropsToXrp,
} from "xrpl";

// ============== 配置 ==============

// 连接 XRPL 网络（可选: mainnet, testnet, devnet）
const XRPL_NETWORK = "testnet"; // 改为 "mainnet" 用于主网

const NETWORK_URLS = {
  mainnet: "wss://s1.ripple.com",
  testnet: "wss://s.altnet.rippletest.net:51233",
  devnet: "wss://s.devnet.rippletest.net:51233",
};

// 测试网水龙头获取测试 XRP
const FAUCET_URL = "https://faucet.altnet.rippletest.net/accounts";

// ============== 工具函数 ==============

/**
 * 创建客户端连接
 */
export function createClient(network: string = XRPL_NETWORK): Client {
  const url = NETWORK_URLS[network as keyof typeof NETWORK_URLS] || NETWORK_URLS.testnet;
  return new Client(url, {
    connectionTimeout: 30000, // 30秒超时
  });
}

/**
 * 通过水龙头创建测试账户
 * @param network 网络类型: testnet, devnet
 */
export async function createTestAccount(network: string = "devnet"): Promise<Wallet> {
  console.log(`📦 从水龙头创建测试账户 (${network})...`);
  
  const client = createClient(network);
  await client.connect();
  
  try {
    const response = await client.fundWallet();
    console.log("✅ 账户创建成功!");
    console.log(`   地址: ${response.wallet.address}`);
    console.log(`   余额: ${dropsToXrp(response.balance)} XRP`);
    return response.wallet;
  } finally {
    await client.disconnect();
  }
}

/**
 * 等待交易确认
 */
export async function waitForTransaction(
  client: Client,
  txHash: string
): Promise<void> {
  console.log(`⏳ 等待交易确认: ${txHash.slice(0, 20)}...`);
  
  const result: any = await (client.request as any)({
    command: "tx",
    transaction: txHash,
  });
  
  if (result.result.meta && typeof result.result.meta === "object" && "TransactionResult" in result.result.meta) {
    if (result.result.meta.TransactionResult === "tesSUCCESS") {
      console.log("✅ 交易成功确认!");
    } else {
      console.log(`❌ 交易失败: ${result.result.meta.TransactionResult}`);
    }
  }
}

/**
 * 获取未来某个 ledger 序列号
 * 使用更大的 offset 避免竞态
 */
async function getFutureLedgerSequence(client: Client): Promise<number> {
  try {
    const ledgerInfo: any = await (client.request as any)({ command: "ledger_current" });
    const current = ledgerInfo.result.ledger_current_index;
    console.log(`   当前 Ledger: ${current}`);
    // 使用很大的 offset（1000）确保交易在有效期内
    return current + 1000;
  } catch (e) {
    console.log(`   获取 ledger 失败，使用时间戳`);
    return Math.floor(Date.now() / 1000) + 3600;
  }
}

// ============== IOU 发行功能 ==============

/**
 * 发行 IOU - 实际上只需要给自己发送一笔 IOU 就能创建 TrustLine
 * XRPL 的 IOU 不需要"预先发行"，只需要设置 TrustLine 即可
 * 
 * @param client XRPL 客户端
 * @param wallet 发行方钱包
 * @param currencyCode 代币代码 (如 "USD", "MYT")
 * @param issuerAddress 发行方地址
 * @param amount 最大供应量（TrustLine 限额）
 */
export async function issueIOU(
  client: Client,
  wallet: Wallet,
  currencyCode: string,
  issuerAddress: string,
  amount: string = "1000000000" // 10亿
): Promise<string> {
  console.log(`\n🖊️ 发行 IOU: ${currencyCode}`);
  console.log(`   发行方: ${issuerAddress}`);
  console.log(`   供应量: ${amount}`);

  // XRPL 中，发行 IOU 实际上是通过向自己发送一笔 IOU 来创建 TrustLine
  // 这会在本地创建 TrustLine，允许持有该 IOU
  const payment: Payment = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: wallet.address,  // 给自己发送
    Amount: {
      currency: currencyCode,
      issuer: issuerAddress,
      value: amount,
    },
  };

  // 使用 autofill 自动填充
  const autofilledTx = await client.autofill(payment);
  console.log(`   LastLedgerSequence: ${autofilledTx.LastLedgerSequence}`);

  // 签名并提交
  const response = await client.submitAndWait(autofilledTx, {
    wallet,
  });

  console.log(`✅ TrustLine 创建成功!`);
  console.log(`   交易哈希: ${response.result.hash}`);
  
  return response.result.hash;
}

/**
 * 授权某个用户持有你的 IOU
 * 
 * @param client XRPL 客户端  
 * @param wallet 授权方钱包（I OU 发行方）
 * @param holderAddress 要授权的地址
 * @param currencyCode 代币代码
 * @param amount 授权金额
 */
export async function authorizeHolder(
  client: Client,
  wallet: Wallet,
  holderAddress: string,
  currencyCode: string,
  amount: string = "1000000000"
): Promise<string> {
  console.log(`\n🔐 授权持有者: ${holderAddress}`);
  console.log(`   代币: ${currencyCode}`);
  console.log(`   金额: ${amount}`);

  // 如果发行方就是持有者，不需要做任何事情
  if (wallet.address.toLowerCase() === holderAddress.toLowerCase()) {
    console.log(`   发行方和持有者相同，跳过`);
    return "no_transaction_needed";
  }

  // 发行方向接收方发送 IOU 来创建 TrustLine
  // 接收方需要先信任发行方的 IOU 才能接收
  
  const payment: Payment = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: holderAddress,
    Amount: {
      currency: currencyCode,
      issuer: wallet.address,
      value: amount,
    },
  };

  // 使用 autofill 自动填充
  const autofilledTx = await client.autofill(payment);
  
  const response = await client.submitAndWait(autofilledTx, {
    wallet,
  });

  console.log(`✅ 授权成功! IOU 已发送给持有者`);
  console.log(`   交易哈希: ${response.result.hash}`);

  return response.result.hash;
}

/**
 * 转移 IOU 给其他账户
 */
export async function transferIOU(
  client: Client,
  wallet: Wallet,
  destinationAddress: string,
  currencyCode: string,
  issuerAddress: string,
  amount: string
): Promise<string> {
  console.log(`\n💸 转移 IOU`);
  console.log(`   从: ${wallet.address}`);
  console.log(`   到: ${destinationAddress}`);
  console.log(`   金额: ${amount} ${currencyCode}`);
  console.log(`   发行方: ${issuerAddress}`);

  const payment: Payment = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: destinationAddress,
    Amount: {
      currency: currencyCode,
      issuer: issuerAddress,
      value: amount,
    },
  };

  const response = await client.submitAndWait(payment, {
    wallet,
  });

  console.log(`✅ IOU 转移成功!`);
  console.log(`   交易哈希: ${response.result.hash}`);

  return response.result.hash;
}

/**
 * 查询账户的 TrustLine 余额
 */
export async function getIOUBalance(
  client: Client,
  address: string,
  currencyCode: string,
  issuerAddress: string
): Promise<string> {
  const response: any = await client.request({
    command: "account_lines",
    account: address,
    ledger_index: "validated",
  });

  const lines = response.result.lines as Array<{
    currency: string;
    account: string;
    balance: string;
  }>;

  const line = lines.find(
    (l) => l.currency === currencyCode && l.account === issuerAddress
  );

  return line ? line.balance : "0";
}

// ============== DEX 交易功能 ==============

/**
 * 在 DEX 上创建买单/卖单
 * 
 * @param client XRPL 客户端
 * @param wallet 交易钱包
 * @param takerGets 付出的代币 {currency, issuer, value} 或 XRP 金额
 * @param takerGets 获得的代币
 * @param type "buy" 或 "sell"
 */
export async function createOffer(
  client: Client,
  wallet: Wallet,
  takerGets: any,
  takerPays: any,
  type: "buy" | "sell" = "sell"
): Promise<string> {
  console.log(`\n📝 创建 ${type === "buy" ? "买单" : "卖单"}`);
  console.log(`   付出: ${formatAmount(takerGets)}`);
  console.log(`   获得: ${formatAmount(takerPays)}`);

  const offerCreate: OfferCreate = {
    TransactionType: "OfferCreate",
    Account: wallet.address,
    TakerGets: takerGets,
    TakerPays: takerPays,
    // 可选参数
    // Expiration: Unix 时间戳
    // OfferSequence: 用于取消旧订单
  };

  // 使用 autofill 自动填充
  const autofilledTx = await client.autofill(offerCreate);

  const response = await client.submitAndWait(autofilledTx, {
    wallet,
  });

  console.log(`✅ Offer 创建成功!`);
  console.log(`   交易哈希: ${response.result.hash}`);

  // 获取创建的 Offer Sequence
  const offerSequence = response.result.Sequence;
  console.log(`   Offer Sequence: ${offerSequence}`);

  return response.result.hash;
}

/**
 * 取消 Offer
 */
export async function cancelOffer(
  client: Client,
  wallet: Wallet,
  offerSequence: number
): Promise<string> {
  console.log(`\n❌ 取消 Offer #${offerSequence}`);

  const offerCancel: OfferCancel = {
    TransactionType: "OfferCancel",
    Account: wallet.address,
    OfferSequence: offerSequence,
  };

  // 使用 autofill 自动填充
  const autofilledTx = await client.autofill(offerCancel);

  const response = await client.submitAndWait(autofilledTx, {
    wallet,
  });

  console.log(`✅ Offer 取消成功!`);
  console.log(`   交易哈希: ${response.result.hash}`);

  return response.result.hash;
}

/**
 * 查询账户的所有 Offers
 */
export async function getAccountOffers(
  client: Client,
  address: string
): Promise<any[]> {
  const response = await client.request({
    command: "account_offers",
    account: address,
  });

  return response.result.offers || [];
}

/**
 * 查询订单簿（某个交易对的所有挂单）
 */
export async function getOrderBook(
  client: Client,
  takerPaysCurrency: string, // 买单时买入的币种
  takerPaysIssuer: string,
  takerGetsCurrency: string, // 买单时付出的币种
  takerGetsIssuer: string,
  limit: number = 20
): Promise<{ bids: any[]; asks: any[] }> {
  // bids: 买单（你要卖XRP/IOU）
  // asks: 卖单（你要买XRP/IOU）
  
  const taker_pays = {
    currency: takerPaysCurrency,
    issuer: takerPaysIssuer,
  };
  
  const taker_gets = {
    currency: takerGetsCurrency,
    issuer: takerGetsIssuer,
  };

  // 获取卖单（别人要卖 taker_pays，买入 taker_gets）
  const asksResponse = await client.request({
    command: "book_offers",
    taker_pays,
    taker_gets,
    limit,
    ledger_index: "validated",
  });

  // 获取买单（别人要买 taker_pays，卖出 taker_gets）
  const bidsResponse = await client.request({
    command: "book_offers",
    taker_gets: taker_pays,
    taker_pays: taker_gets,
    limit,
    ledger_index: "validated",
  });

  return {
    bids: (bidsResponse.result.offers || []).map(normalizeOffer),
    asks: (asksResponse.result.offers || []).map(normalizeOffer),
  };
}

/**
 * 格式化金额显示
 */
function formatAmount(amount: any): string {
  if (typeof amount === "string") {
    return `${dropsToXrp(amount)} XRP`;
  }
  return `${amount.value} ${amount.currency}`;
}

/**
 * 规范化 Offer 数据
 */
function normalizeOffer(offer: any): any {
  // xrpl.js 的 normalizeNode 函数可以帮助规范化
  // 这里简化处理
  return {
    Account: offer.Account,
    TakerGets: offer.TakerGets,
    TakerPays: offer.TakerPays,
    OfferSequence: offer.OfferSequence,
  };
}

// ============== 示例：完整流程 ==============

/**
 * 完整示例：发行 IOU 并在 DEX 交易
 */
export async function runFullExample(): Promise<void> {
  console.log("=".repeat(50));
  console.log("🚀 XRPL IOU 发行与 DEX 交易完整示例");
  console.log("=".repeat(50));

  const client = createClient("testnet");
  await client.connect();

  try {
    // 1. 创建两个测试账户
    console.log("\n【步骤1】创建测试账户...");
    const [issuer, holder] = await Promise.all([
      createTestAccount(),
      createTestAccount(),
    ]);

    console.log(`\n📋 账户信息:`);
    console.log(`   发行方: ${issuer.address}`);
    console.log(`   持有者: ${holder.address}`);

    // 2. 发行 IOU (由发行方设置 TrustLine)
    const currencyCode = "MYTOKEN";
    await issueIOU(client, issuer, currencyCode, issuer.address, "1000000");

    // 3. 发行方给持有者发送 IOU
    await authorizeHolder(
      client,
      issuer,
      holder.address,
      currencyCode,
      "50000"
    );

    // 4. 查询持有者的 IOU 余额
    const balance = await getIOUBalance(
      client,
      holder.address,
      currencyCode,
      issuer.address
    );
    console.log(`\n💰 持有者 ${currencyCode} 余额: ${balance}`);

    // 5. 在 DEX 上创建卖单（卖 IOU 买 XRP）
    console.log("\n【步骤2】在 DEX 创建卖单...");
    await createOffer(
      client,
      holder,
      // 付出：500 IOU
      {
        currency: currencyCode,
        issuer: issuer.address,
        value: "500",
      },
      // 获得：10 XRP
      xrpToDrops("10").toString(),
      "sell"
    );

    // 6. 查询发行方的 Offers
    console.log("\n【步骤3】查询订单...");
    const holderOffers = await getAccountOffers(client, holder.address);
    console.log(`   持有者共有 ${holderOffers.length} 个挂单`);

    // 7. 如果有挂单，取消第一个
    if (holderOffers.length > 0) {
      await cancelOffer(client, holder, holderOffers[0].OfferSequence);
    }

    console.log("\n" + "=".repeat(50));
    console.log("✅ 示例执行完成!");
    console.log("=".repeat(50));

  } finally {
    await client.disconnect();
  }
}

// ============== 主程序入口 ==============

// 直接运行脚本时执行
// runFullExample().catch(console.error);
