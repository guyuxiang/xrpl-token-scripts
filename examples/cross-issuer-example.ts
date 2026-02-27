/**
 * XRPL 跨发行方 IOU 交易测试
 */

import { Client, Wallet, Payment, OfferCreate, xrpToDrops } from "xrpl";

const ROR = "524F523100000000000000000000000000000000";
const RLU = "524C555344000000000000000000000000000000";
const DEVNET = "wss://s.devnet.rippletest.net:51233";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getSeq(client: Client, addr: string): Promise<number> {
  const r: any = await (client.request as any)({ command: "account_info", account: addr });
  return r.result.account_data.Sequence;
}

async function getLedger(client: Client): Promise<number> {
  const r: any = await (client.request as any)({ command: "ledger_current" });
  return r.result.ledger_current_index;
}

async function checkTx(client: Client, hash: string): Promise<boolean> {
  for (let i = 0; i < 25; i++) {
    try {
      const r: any = await (client.request as any)({ command: "tx", transaction: hash });
      if (r.result.validated) {
        const result = r.result.meta?.TransactionResult;
        console.log(`   结果: ${result}`);
        return result === "tesSUCCESS";
      }
    } catch (e) {}
    await wait(1000);
  }
  console.log("   超时");
  return false;
}

async function payIOU(client: Client, from: Wallet, to: string, amount: string, currency: string, issuer: Wallet): Promise<boolean> {
  const ledger = await getLedger(client);
  const seq = await getSeq(client, from.address);
  
  const tx: Payment = {
    TransactionType: "Payment",
    Account: from.address,
    Destination: to,
    LastLedgerSequence: ledger + 100,
    Sequence: seq,
    Fee: "500",
    Amount: { currency, issuer: issuer.address, value: amount }
  };
  
  console.log(`   ${from.address.slice(0,10)} -> ${to.slice(0,10)} ${amount}`);
  try {
    const r = await client.submitAndWait(tx, { wallet: from });
    return await checkTx(client, r.result.hash);
  } catch (e: any) {
    if (e.message?.includes("temREDUNDANT")) {
      console.log("   结果: TrustLine已存在");
      return true;
    }
    console.log(`   错误: ${e.message?.slice(0,40)}`);
    return false;
  }
}

async function sendXRP(client: Client, from: Wallet, to: string, amount: string): Promise<boolean> {
  const ledger = await getLedger(client);
  const seq = await getSeq(client, from.address);
  
  const tx: Payment = {
    TransactionType: "Payment",
    Account: from.address,
    Destination: to,
    LastLedgerSequence: ledger + 100,
    Sequence: seq,
    Fee: "500",
    Amount: xrpToDrops(amount).toString()
  };
  
  console.log(`   ${from.address.slice(0,10)} -> ${to.slice(0,10)} ${amount} XRP`);
  try {
    const r = await client.submitAndWait(tx, { wallet: from });
    return await checkTx(client, r.result.hash);
  } catch (e: any) {
    console.log(`   错误: ${e.message?.slice(0,40)}`);
    return false;
  }
}

async function offerTx(client: Client, wallet: Wallet, gets: any, pays: any): Promise<string> {
  const ledger = await getLedger(client);
  const seq = await getSeq(client, wallet.address);
  
  const tx: OfferCreate = {
    TransactionType: "OfferCreate",
    Account: wallet.address,
    LastLedgerSequence: ledger + 100,
    Sequence: seq,
    Fee: "500",
    TakerGets: gets,
    TakerPays: pays
  };
  
  console.log(`   挂单`);
  try {
    const r = await client.submitAndWait(tx, { wallet });
    await checkTx(client, r.result.hash);
    return r.result.hash;
  } catch (e: any) {
    console.log(`   错误: ${e.message?.slice(0,40)}`);
    return "";
  }
}

async function main() {
  console.log("=".repeat(50));
  console.log("跨发行方 IOU 交易测试");
  console.log("=".repeat(50));
  
  const client = new Client(DEVNET);
  await client.connect();

  try {
    console.log("\n📦 创建账户...");
    const [w1, w2, w3, w4] = await Promise.all([
      client.fundWallet(), client.fundWallet(),
      client.fundWallet(), client.fundWallet()
    ]);
    
    const issA = w1.wallet;
    const issB = w2.wallet;
    const userA = w3.wallet;
    const userB = w4.wallet;
    
    console.log(`   发行方A: ${issA.address}`);
    console.log(`   发行方B: ${issB.address}`);
    console.log(`   用户A: ${userA.address}`);
    console.log(`   用户B: ${userB.address}`);

    // ===== 步骤1: 发行方A发行ROR =====
    console.log("\n[步骤1] 发行方A给自己发行ROR");
    await payIOU(client, issA, issA.address, "100000", ROR, issA);
    await wait(8000);

    // ===== 步骤2: 发行方B发行RLSD =====
    console.log("\n[步骤2] 发行方B给自己发行RLSD");
    await payIOU(client, issB, issB.address, "100000", RLU, issB);
    await wait(8000);

    // ===== 步骤3: 用户A设置ROR信任 =====
    console.log("\n[步骤3] 用户A设置ROR信任");
    const ok3 = await payIOU(client, issA, userA.address, "10000", ROR, issA);
    if (!ok3) { console.log("失败"); return; }
    await wait(8000);

    // ===== 步骤4: 用户B设置RLSD信任 =====
    console.log("\n[步骤4] 用户B设置RLSD信任");
    const ok4 = await payIOU(client, issB, userB.address, "10000", RLU, issB);
    if (!ok4) { console.log("失败"); return; }
    await wait(8000);

    // ===== 步骤5: 用户A设置跨发行方信任(信任RLSD) =====
    console.log("\n[步骤5] 用户A设置跨发行方信任(信任RLSD)");
    const ok5 = await payIOU(client, issB, userA.address, "10000", RLU, issB);
    if (!ok5) { console.log("失败"); return; }
    await wait(8000);

    // ===== 步骤6: 用户B设置跨发行方信任(信任ROR) =====
    console.log("\n[步骤6] 用户B设置跨发行方信任(信任ROR)");
    const ok6 = await payIOU(client, issA, userB.address, "10000", ROR, issA);
    if (!ok6) { console.log("失败"); return; }
    await wait(8000);

    // ===== 步骤7: 给用户XRP用于桥接 =====
    console.log("\n[步骤7a] 给用户A发送XRP");
    await sendXRP(client, issA, userA.address, "50");
    await wait(8000);

    console.log("\n[步骤7b] 给用户B发送XRP");
    await sendXRP(client, issB, userB.address, "50");
    await wait(8000);

    // ===== 步骤8: 挂单交易 =====
    console.log("\n[步骤8a] 用户A挂单: 卖出5000 ROR -> 买入4000 RLU");
    const tx8a = await offerTx(client, userA,
      { currency: ROR, issuer: issA.address, value: "5000" },
      { currency: RLU, issuer: issB.address, value: "4000" }
    );
    if (tx8a) console.log(`   链接: https://devnet.xrpl.org/transactions/${tx8a}`);

    console.log("\n[步骤8b] 用户B挂单: 买入5000 ROR <- 卖出4000 RLU");
    const tx8b = await offerTx(client, userB,
      { currency: RLU, issuer: issB.address, value: "4000" },
      { currency: ROR, issuer: issA.address, value: "5000" }
    );
    if (tx8b) console.log(`   链接: https://devnet.xrpl.org/transactions/${tx8b}`);

    console.log("\n" + "=".repeat(50));
    console.log("测试完成!");
    console.log("=".repeat(50));
    
  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
