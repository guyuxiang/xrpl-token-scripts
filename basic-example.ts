// basic-example.ts
// XRPL IOU Direct Trading Full Flow

import xrpl from "xrpl";
const { Client } = xrpl;

const XRPL_WS = "wss://s.devnet.rippletest.net:51233";
const ROR = "ROR";
const RLSD = "524C534400000000000000000000000000000000";

// Flag to disable no_ripple - allows rippling
const TF_CLEAR_NO_RIPPLE = 131072; // tfAllowRipple

async function submitTx(client: any, wallet: any, tx: any, desc: string) {
  for (let i = 0; i < 3; i++) {
    try {
      const result = await client.submitAndWait(tx, { wallet });
      const meta: any = result.result.meta;
      const hash = result.result.hash;
      console.log(`[${desc}] ${meta?.TransactionResult || 'done'}`);
      if (meta?.TransactionResult === 'tesSUCCESS') {
        console.log(`   https://devnet.xrpl.org/transactions/${hash}`);
      }
      return result;
    } catch (e: any) {
      if (e.message?.includes("temREDUNDANT")) {
        console.log(`[${desc}] Already exists`);
        return { result: { hash: "already" } };
      }
      if (e.message?.includes("LastLedger")) { continue; }
      console.log(`[${desc}] Error: ${e.message?.slice(0,60)}`);
    }
  }
  return {};
}

async function getBalance(client: any, addr: string, currency: string, issuer: string) {
  try {
    const lines = await client.request({ command: "account_lines", account: addr });
    const line = lines.result.lines?.find((l: any) => 
      l.currency === currency && l.account === issuer
    );
    return line?.balance || "0";
  } catch { return "0"; }
}

async function main() {
  const client = new Client(XRPL_WS);
  await client.connect();
  console.log("Connected\n");

  const [a, b, ua, ub] = await Promise.all([
    client.fundWallet(), client.fundWallet(),
    client.fundWallet(), client.fundWallet()
  ]);
  const issuerA = a.wallet, issuerB = b.wallet;
  const userA = ua.wallet, userB = ub.wallet;

  console.log("IssuerA (ROR):", issuerA.address);
  console.log("IssuerB (RLSD):", issuerB.address);
  console.log("UserA (holds ROR):", userA.address);
  console.log("UserB (holds RLSD):", userB.address);

  // ===== STEP 1: Issuer creates trustline to self WITH rippling =====
  console.log("\n--- Self-Issuance Setup ---");
  await submitTx(client, issuerA, {
    TransactionType: "TrustSet",
    Account: issuerA.address,
    Flags: TF_CLEAR_NO_RIPPLE,  // Enable rippling
    LimitAmount: { currency: ROR, issuer: issuerA.address, value: "100000000" },
  } as any, "1a.IssuerA sets trust to self");

  await submitTx(client, issuerB, {
    TransactionType: "TrustSet",
    Account: issuerB.address,
    Flags: TF_CLEAR_NO_RIPPLE,
    LimitAmount: { currency: RLSD, issuer: issuerB.address, value: "100000000" },
  } as any, "1b.IssuerB sets trust to self");

  // Self-issue
  await submitTx(client, issuerA, {
    TransactionType: "Payment",
    Account: issuerA.address,
    Destination: issuerA.address,
    Amount: { currency: ROR, issuer: issuerA.address, value: "100000" },
  } as any, "2.IssuerA self-issue ROR");

  await submitTx(client, issuerB, {
    TransactionType: "Payment",
    Account: issuerB.address,
    Destination: issuerB.address,
    Amount: { currency: RLSD, issuer: issuerB.address, value: "100000" },
  } as any, "3.IssuerB self-issue RLSD");

  // User trusts - also with rippling
  await submitTx(client, userA, {
    TransactionType: "TrustSet",
    Account: userA.address,
    Flags: TF_CLEAR_NO_RIPPLE,
    LimitAmount: { currency: ROR, issuer: issuerA.address, value: "100000000" },
  } as any, "4.UserA trusts ROR");

  await submitTx(client, userB, {
    TransactionType: "TrustSet",
    Account: userB.address,
    Flags: TF_CLEAR_NO_RIPPLE,
    LimitAmount: { currency: RLSD, issuer: issuerB.address, value: "100000000" },
  } as any, "5.UserB trusts RLSD");

  // Issuance to users
  await submitTx(client, issuerA, {
    TransactionType: "Payment",
    Account: issuerA.address,
    Destination: userA.address,
    Amount: { currency: ROR, issuer: issuerA.address, value: "10000" },
  } as any, "6.IssuerA -> UserA: 10000 ROR");

  await submitTx(client, issuerB, {
    TransactionType: "Payment",
    Account: issuerB.address,
    Destination: userB.address,
    Amount: { currency: RLSD, issuer: issuerB.address, value: "10000" },
  } as any, "7.IssuerB -> UserB: 10000 RLSD");

  // Cross trust
  await submitTx(client, userA, {
    TransactionType: "TrustSet",
    Account: userA.address,
    Flags: TF_CLEAR_NO_RIPPLE,
    LimitAmount: { currency: RLSD, issuer: issuerB.address, value: "100000000" },
  } as any, "8.UserA trusts RLSD");

  await submitTx(client, userB, {
    TransactionType: "TrustSet",
    Account: userB.address,
    Flags: TF_CLEAR_NO_RIPPLE,
    LimitAmount: { currency: ROR, issuer: issuerA.address, value: "100000000" },
  } as any, "9.UserB trusts ROR");

  // Check balances
  console.log("\n--- Balances before trading ---");
  const balA_ROR = await getBalance(client, userA.address, ROR, issuerA.address);
  const balA_RLSD = await getBalance(client, userA.address, RLSD, issuerB.address);
  const balB_ROR = await getBalance(client, userB.address, ROR, issuerA.address);
  const balB_RLSD = await getBalance(client, userB.address, RLSD, issuerB.address);
  console.log(`UserA: ROR=${balA_ROR}, RLSD=${balA_RLSD}`);
  console.log(`UserB: ROR=${balB_ROR}, RLSD=${balB_RLSD}`);

  // Wait for ledger
  await new Promise(r => setTimeout(r, 3000));

  // ========== ORDER BOOK TRADING ==========
  console.log("\n--- OrderBook Trading ---");
  
  // UserA: SELL ROR -> BUY RLSD (gives ROR, wants RLSD)
  await submitTx(client, userA, {
    TransactionType: "OfferCreate",
    Account: userA.address,
    TakerPays: { currency: ROR, issuer: issuerA.address, value: "500" },  // Gives 500 ROR
    TakerGets: { currency: RLSD, issuer: issuerB.address, value: "400" },   // Wants 400 RLSD
  } as any, "10.UserA: SELL 500 ROR for 400 RLSD");

  await new Promise(r => setTimeout(r, 3000));

  // UserB: BUY ROR <- SELL RLSD (gives RLSD, wants ROR)
  await submitTx(client, userB, {
    TransactionType: "OfferCreate",
    Account: userB.address,
    TakerPays: { currency: RLSD, issuer: issuerB.address, value: "400" },   // Gives 400 RLSD
    TakerGets: { currency: ROR, issuer: issuerA.address, value: "500" },    // Wants 500 ROR
  } as any, "11.UserB: BUY 500 ROR with 400 RLSD");

  // Check final balances
  console.log("\n--- Balances after trading ---");
  const balA_ROR_f = await getBalance(client, userA.address, ROR, issuerA.address);
  const balA_RLSD_f = await getBalance(client, userA.address, RLSD, issuerB.address);
  const balB_ROR_f = await getBalance(client, userB.address, ROR, issuerA.address);
  const balB_RLSD_f = await getBalance(client, userB.address, RLSD, issuerB.address);
  console.log(`UserA: ROR=${balA_ROR_f}, RLSD=${balA_RLSD_f}`);
  console.log(`UserB: ROR=${balB_ROR_f}, RLSD=${balB_RLSD_f}`);

  await client.disconnect();
  console.log("\nDone!");
}

main().catch(console.error);
