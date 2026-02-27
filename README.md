# XRPL IOU 发行与 DEX 交易脚本

[English](./README_EN.md) | 中文

使用 TypeScript + xrpl.js 实现 XRPL 上的 IOU 发行和 DEX 交易。

---

## 🚀 功能特性

- ✅ IOU 代币发行（通过 TrustLine）
- ✅ IOU 授权与转账
- ✅ DEX 限价单创建与取消
- ✅ 订单簿查询
- ✅ 跨发行方 IOU 交易（通过 XRP 桥接）
- ✅ 自动交易机器人示例

---

## 📦 安装

```bash
npm install
```

---

## 💻 使用方法

### 1. 基础示例

```bash
# 发行 IOU
npx ts-node examples/basic-example.ts issue

# 发行并授权
npx ts-node examples/basic-example.ts authorize

# DEX 交易 (IOU/XRP)
npx ts-node examples/basic-example.ts dex

# IOU-IOU 交易
npx ts-node examples/basic-example.ts iou
```

### 2. 代码示例

#### 连接网络

```typescript
import { createClient, createTestAccount } from "./xrpl-token";

const client = createClient("devnet"); // mainnet, testnet, devnet
await client.connect();

// 创建测试账户
const wallet = await createTestAccount("devnet");
```

#### 发行 IOU

```typescript
import { authorizeHolder } from "./xrpl-token";

// 发行 IOU = 发送给接收方（自动创建 TrustLine）
await authorizeHolder(
  client,
  wallet,           // 发行方钱包
  recipientAddress, // 接收方地址
  "COI",            // 货币代码 (3字符)
  "1000"            // 数量
);
```

#### DEX 挂单交易

```typescript
import { createOffer } from "./xrpl-token";
import { xrpToDrops } from "xrpl";

// 卖 10 IOU，买 5 XRP
await createOffer(
  client,
  wallet,
  // 付出
  { currency: "COI", issuer: wallet.address, value: "10" },
  // 获得
  xrpToDrops("5"),
  "sell"
);
```

#### 跨发行方 IOU 交易

```typescript
// 跨发行方交易需要通过 XRP 桥接
// XRPL 会自动找到最佳路径
const offer: OfferCreate = {
  TransactionType: "OfferCreate",
  Account: wallet.address,
  // 付出 COINA (发行方 A)
  TakerGets: { currency: "COINA", issuer: "rIssuerA...", value: "10" },
  // 获得 COINB (发行方 B)
  TakerPays: { currency: "COINB", issuer: "rIssuerB...", value: "5" }
};
```

---

## 📚 XRPL DEX 核心概念

### 1. IOU 与 TrustLine

XRPL 的 IOU 不是"预先发行"的，而是通过 **TrustLine** 存在的：

```typescript
// 发行 IOU = 发送 IOU 给接收方（自动创建 TrustLine）
const payment = {
  TransactionType: "Payment",
  Account: issuer.address,
  Destination: holder.address,
  Amount: { currency: "COI", issuer: issuer.address, value: "1000" }
};
```

### 2. Order Book (订单簿)

```
┌─────────────────────────────────────────────┐
│              ORDER BOOK (COI/XRP)           │
├─────────────────────────────────────────────┤
│  BIDS (买单)        │  ASKS (卖单)          │
│  买 XRP  卖 COI    │  卖 XRP  买 COI       │
│  ─────────────────│───────────────────    │
│  10.5 XRP ← 100 COI │ 100 COI → 10 XRP   │
│  10.2 XRP ← 100 COI │ 100 COI → 10.2 XRP │
└─────────────────────────────────────────────┘
```

### 3. 跨发行方交易

不同发行方的 IOU 不能直接交易，必须通过 **XRP 桥接**：

```
❌ COINA (发行方 A) → COINB (发行方 B)

✅ COINA → XRP → COINB
```

XRPL 的 **Path Finding** 会自动找到最佳交易路径。

---

## 📖 XRPL DEX 技术详解

### 货币代码规则

| 类型 | 格式 | 例子 |
|------|------|------|
| XRP | 空字符串 | `""` |
| 标准 IOU | 3 字符 | `"USD"`, `"COI"` |
| 自定义 IOU | 40 字符 HEX | `"000000000000000000000000...` |

### 交易对表示

```typescript
// XRP/COI 交易对
{
  taker_pays: { currency: "XRP", issuer: "" },  // 空 = XRP
  taker_gets: { currency: "COI", issuer: "rABC..." }
}

// COI/COJ 交易对 (同发行方)
{
  taker_pays: { currency: "COI", issuer: "rABC..." },
  taker_gets: { currency: "COJ", issuer: "rABC..." }
}

// 跨发行方 (通过 XRP 桥接)
{
  taker_pays: { currency: "COI", issuer: "rA..." },
  taker_gets: { currency: "COJ", issuer: "rB..." }
}
```

### 核心 API

```typescript
// 查询订单簿
await client.request({
  command: "book_offers",
  taker_pays: { currency: "COI", issuer: "rABC..." },
  taker_gets: { currency: "XRP", issuer: "" },
  limit: 10
});

// 查找交易路径
await client.request({
  command: "ripple_path_find",
  source_account: sender,
  destination_amount: { currency: "COJ", issuer: "rB...", value: "100" }
});
```

---

## 🔧 配置

修改 `xrpl-token.ts` 中的网络配置：

```typescript
const NETWORK_URLS = {
  mainnet: "wss://s1.ripple.com",
  testnet: "wss://s.altnet.rippletest.net:51233",
  devnet: "wss://s.devnet.rippletest.net:51233",
};
```

---

## 📁 文件结构

```
├── xrpl-token.ts           # 核心功能库
├── examples/
│   ├── basic-example.ts    # 基础示例
│   └── trading-bot.ts      # 自动交易机器人
├── package.json
└── tsconfig.json
```

---

## ⚠️ 注意事项

1. **Currency Code** - IOU 必须是 3 字符（如 COI, COJ）
2. **Issuer** - IOU 必须指定发行方地址
3. **TrustLine** - 交易前必须先创建 TrustLine
4. **跨发行方交易** - 需要通过 XRP 桥接
5. **测试网** - 生产环境使用 Mainnet，测试用 Devnet 或 Testnet

---

## 📜 License

MIT

---

## 🔗 相关链接

- [XRPL 官方文档](https://xrpl.org/docs.html)
- [xrpl.js GitHub](https://github.com/XRPLF/xrpl.js)
- [XRPL DEX 文档](https://xrpl.org/decentralized-exchange.html)
