/**
 * XRPL DEX 自动交易机器人
 * 
 * 功能：
 * - 监听订单簿
 * - 自动挂单
 * - 价格套利
 * - 止损机制
 * 
 * 运行方式:
 * npx ts-node examples/trading-bot.ts
 */

import {
  Client,
  Wallet,
  OfferCreate,
  OfferCancel,
  AccountOffers,
  BookOffers,
  xrpToDrops,
  dropsToXrp,
} from "xrpl";
import { createClient, createTestAccount, issueIOU, authorizeHolder } from "../xrpl-token";

// ============== 配置 ==============

interface BotConfig {
  // 网络
  network: "mainnet" | "testnet" | "devnet";
  
  // 交易对
  baseCurrency: string;    // 基础货币 (如 XRP)
  baseIssuer?: string;     // 如果是 IOU，需要 issuer
  quoteCurrency: string;   // 报价货币
  quoteIssuer: string;     // 报价货币发行方
  
  // 交易参数
  minTradeAmount: string;  // 最小交易金额
  maxSpread: number;      // 最大买卖价差 (%)
  checkInterval: number;  // 检查间隔 (ms)
  
  // 钱包
  wallet: Wallet;
}

// ============== 交易机器人类 ==============

export class DEXTradingBot {
  private client: Client;
  private config: BotConfig;
  private isRunning: boolean = false;
  private myOffers: Map<number, { type: "buy" | "sell"; amount: string; price: string }> = new Map();

  constructor(config: BotConfig) {
    this.config = config;
    this.client = createClient(config.network);
  }

  /**
   * 启动机器人
   */
  async start(): Promise<void> {
    console.log("🤖 DEX 交易机器人启动...");
    console.log(`   网络: ${this.config.network}`);
    console.log(`   交易对: ${this.config.baseCurrency}/${this.config.quoteCurrency}`);
    console.log(`   钱包: ${this.config.wallet.address}`);

    await this.client.connect();
    this.isRunning = true;

    // 主循环
    this.runLoop();
  }

  /**
   * 停止机器人
   */
  async stop(): Promise<void> {
    console.log("\n🛑 停止机器人...");
    this.isRunning = false;
    
    // 取消所有挂单
    await this.cancelAllOffers();
    
    await this.client.disconnect();
    console.log("✅ 机器人已停止");
  }

  /**
   * 主循环
   */
  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // 1. 获取订单簿
        const orderBook = await this.getOrderBook();
        
        // 2. 分析最优价格
        const bestBid = orderBook.bids[0];
        const bestAsk = orderBook.asks[0];
        
        console.log(`\n📊 当前订单簿 (${this.config.baseCurrency}/${this.config.quoteCurrency})`);
        console.log(`   最佳买价: ${bestBid ? this.formatPrice(bestBid) : "无"}`);
        console.log(`   最佳卖价: ${bestAsk ? this.formatPrice(bestAsk) : "无"}`);
        
        // 3. 决定是否挂单
        if (bestBid && bestAsk) {
          const spread = this.calculateSpread(bestBid, bestAsk);
          console.log(`   当前价差: ${spread.toFixed(2)}%`);
          
          if (spread > this.config.maxSpread) {
            // 价差足够，可以挂单
            await this.placeSmartOrder(bestBid, bestAsk);
          }
        }

        // 4. 等待下次检查
        await this.sleep(this.config.checkInterval);

      } catch (error) {
        console.error("❌ 循环出错:", error);
        await this.sleep(5000); // 出错后等待 5 秒
      }
    }
  }

  /**
   * 获取订单簿
   */
  private async getOrderBook(): Promise<{ bids: any[]; asks: any[] }> {
    const taker_pays = {
      currency: this.config.baseCurrency,
      issuer: this.config.baseIssuer || this.config.quoteIssuer,
    };
    
    const taker_gets = {
      currency: this.config.quoteCurrency,
      issuer: this.config.quoteIssuer,
    };

    // asks: 别人要卖 baseCurrency，买 quoteCurrency
    const asksResponse = await this.client.request({
      command: "book_offers",
      taker_pays,
      taker_gets: taker_pays,
      taker_gets: {
        currency: this.config.quoteCurrency,
        issuer: this.config.quoteIssuer,
      },
      limit: 10,
      ledger_index: "validated",
    } as BookOffers);

    // bids: 别人要买 baseCurrency，卖 quoteCurrency
    const bidsResponse = await this.client.request({
      command: "book_offers",
      taker_pays: taker_gets,
      taker_gets: taker_pays,
      limit: 10,
      ledger_index: "validated",
    } as BookOffers);

    return {
      bids: bidsResponse.result.offers || [],
      asks: asksResponse.result.offers || [],
    };
  }

  /**
   * 格式化价格
   */
  private formatPrice(offer: any): string {
    const takerGets = typeof offer.TakerGets === "string" 
      ? dropsToXrp(offer.TakerGets) 
      : offer.TakerGets.value;
    
    const takerPays = typeof offer.TakerPays === "string"
      ? dropsToXrp(offer.TakerPays)
      : offer.TakerPays.value;
    
    const price = parseFloat(takerGets) / parseFloat(takerPays);
    return price.toFixed(6);
  }

  /**
   * 计算价差
   */
  private calculateSpread(bid: any, ask: any): number {
    const bidPrice = parseFloat(this.formatPrice(bid));
    const askPrice = parseFloat(this.formatPrice(ask));
    return ((askPrice - bidPrice) / bidPrice) * 100;
  }

  /**
   * 智能挂单
   */
  private async placeSmartOrder(bestBid: any, bestAsk: any): Promise<void> {
    const midPrice = (parseFloat(this.formatPrice(bestBid)) + parseFloat(this.formatPrice(bestAsk))) / 2;
    
    // 在中间价附近挂单
    const sellPrice = (midPrice * 0.99).toFixed(6); // 略低于中间价
    const buyPrice = (midPrice * 1.01).toFixed(6);  // 略高于中间价

    console.log(`\n📝 尝试挂单...`);
    console.log(`   卖价: ${sellPrice}, 买价: ${buyPrice}`);

    // 检查余额决定挂单类型
    // 这里简化处理，实际需要查询真实余额
    
    // 示例：挂卖单
    try {
      const offer: OfferCreate = {
        TransactionType: "OfferCreate",
        Account: this.config.wallet.address,
        TakerGets: {
          currency: this.config.baseCurrency,
          issuer: this.config.baseIssuer || this.config.quoteIssuer,
          value: this.config.minTradeAmount,
        },
        TakerPays: xrpToDrops((parseFloat(this.config.minTradeAmount) * parseFloat(sellPrice)).toFixed(2)),
      };

      const result = await this.client.submitAndWait(offer, {
        wallet: this.config.wallet,
      });

      console.log(`✅ 挂单成功!`);
      console.log(`   交易哈希: ${result.result.hash}`);
      
      // 记录挂单
      this.myOffers.set(result.result.Sequence, {
        type: "sell",
        amount: this.config.minTradeAmount,
        price: sellPrice,
      });

    } catch (error) {
      console.log(`❌ 挂单失败:`, error);
    }
  }

  /**
   * 取消所有挂单
   */
  private async cancelAllOffers(): Promise<void> {
    const response = await this.client.request({
      command: "account_offers",
      account: this.config.wallet.address,
    } as AccountOffers);

    const offers = response.result.offers || [];
    
    for (const offer of offers) {
      try {
        const cancel: OfferCancel = {
          TransactionType: "OfferCancel",
          Account: this.config.wallet.address,
          OfferSequence: offer.OfferSequence,
        };

        await this.client.submitAndWait(cancel, {
          wallet: this.config.wallet,
        });
        
        console.log(`   取消挂单 #${offer.OfferSequence}`);
      } catch (error) {
        console.error(`   取消挂单失败 #${offer.OfferSequence}:`, error);
      }
    }

    this.myOffers.clear();
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============== 运行示例 ==============

export async function runTradingBotExample(): Promise<void> {
  console.log("=".repeat(50));
  console.log("🤖 XRPL DEX 自动交易机器人示例");
  console.log("=".repeat(50));

  // 1. 创建测试账户
  const wallet = await createTestAccount();
  console.log(`\n钱包地址: ${wallet.address}`);

  // 2. 发行自定义代币
  const client = createClient("testnet");
  await client.connect();

  const currencyCode = "MYBOT";
  await issueIOU(client, wallet, currencyCode, wallet.address, "100000");
  
  await client.disconnect();

  // 3. 配置机器人
  const config: BotConfig = {
    network: "testnet",
    baseCurrency: currencyCode,
    baseIssuer: wallet.address,
    quoteCurrency: "XRP",
    quoteIssuer: "", // XRP 没有 issuer
    minTradeAmount: "10",
    maxSpread: 2, // 2% 以上才挂单
    checkInterval: 10000, // 10 秒检查一次
    wallet,
  };

  // 4. 启动机器人
  const bot = new DEXTradingBot(config);
  
  // 运行 1 分钟后自动停止（示例）
  setTimeout(() => {
    bot.stop().then(() => process.exit(0));
  }, 60000);

  await bot.start();
}

// 运行示例
// runTradingBotExample().catch(console.error);
