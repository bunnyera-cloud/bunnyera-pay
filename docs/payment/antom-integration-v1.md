# Antom Integration V1 — 接入准备与设计文档

> 阶段：接入准备与设计（不含真实接入）
> 基线：Payment Core V1.1（commit ef27c89）
> 状态：骨架代码已就绪，外部请求默认禁用，未注册进 resolver，未接生产
> 核验更正（2026-08-21）：PaymentChannel enum 已含 ANTOM，无需 schema 迁移

---

## 1. Antom 在 BunnyEra Pay 中的位置

Antom（Ant International 全球收单，AMS API）作为一个新的 PaymentProvider Adapter 接入，
完全复用 Payment Core V1.1 既有架构，不重新设计核心：

| 既有组件 | 复用方式 |
|---|---|
| `PaymentProvider` interface（provider.ts） | AntomProvider 直接实现，无需改接口 |
| `resolveProvider()`（resolver.ts） | Antom 注册点已预留（注释标注 ANTOM_* 插入位置），enum 已含 ANTOM，下一阶段可直接注册 |
| `handleWebhook()` webhook contract | Antom webhook 走统一验签→解析契约 |
| `executeChannelRefund()`（refund-service.ts） | Antom 退款复用四段式 fail-closed 流程 |
| PaymentConfig 配置表 | 复用现有字段承载 Antom 配置，无需 schema 变更（见第 3 节） |

骨架文件：`src/lib/payment/antom.ts`

## 2. 官方文档已确认能力清单

以下能力已从 Antom 官方文档（docs.antom.com，2026-08 检索）确认：

### 2.1 API 基础结构

- 全部为 HTTP POST + JSON 请求/响应
- 请求头三要素：`client-id`、`request-time`（毫秒时间戳）、`signature`
- Signature header 格式：`algorithm=RSA256,keyVersion=<版本>,signature=<urlEncoded base64 签名>`
- 通用结果结构：`result { resultCode, resultStatus, resultMessage }`
  - `resultStatus`: `S`=成功、`F`=失败、`U`=未知（未知必须查单/重试，不得视为成功）

### 2.2 Sandbox / Test 环境

- **存在 Sandbox**。线上支付 Sandbox 请求 URL 前缀为 `/ams/sandbox/api/<endpoint>`，
  Production 为 `/ams/api/<endpoint>`（请求地址仅 path 不同）
- Sandbox client-id 形如 `SANDBOX_5X...`
- Sandbox 中若不按规定格式响应异步通知，Antom 不会重发

### 2.3 网关域名（按区域）

| 区域 | 域名 |
|---|---|
| 亚洲 | `https://open-sea-global.alipay.com`（推荐） |
| 北美（非美商户） | `https://open-na-global.alipay.com`（推荐） |
| 北美（美商户） | `https://open.antglobal-us.com` |
| 欧洲 | `https://open-de-global.alipay.com`（推荐） |

### 2.4 Authentication / 签名机制（RSA2 = SHA256withRSA）

- 密钥对在 Antom Dashboard 生成；商户私钥签名请求，Antom 公钥验证响应/Webhook
- 签名原文（content_to_be_signed）：
  ```
  <http-method> <http-uri>
  <client-id>.<request-time>.<request-body>
  ```
  （method 与 uri 之间一个空格，第一行与第二行之间换行）
- 生成公式：`urlEncode(base64Encode(sha256withRSA(content, privateKey)))`
- 请求签名、响应验签、Webhook 验签使用同一套规则；Webhook 验签额外使用
  实际接收请求的 URI 与 method

### 2.5 凭证结构

| 凭证 | 用途 |
|---|---|
| Client ID | 请求头身份标识 |
| 商户 RSA 私钥（PKCS8） | 请求签名 |
| Antom 平台公钥 | 验证响应与 Webhook 签名 |
| merchantAccountId（可选） | 单 client-id 多商户账号场景 |

### 2.6 API 能力

| API | Endpoint（相对前缀） | 要点 |
|---|---|---|
| 支付创建 pay | `/v1/payments/pay` | productCode=CASHIER_PAYMENT；必填 paymentRequestId / paymentAmount / settlementStrategy / paymentMethod / env / order / paymentRedirectUrl；返回 normalUrl/schemeUrl/applinkUrl 收银台跳转地址与 paymentId |
| 支付查询 inquiryPayment | `/v1/payments/inquiryPayment` | paymentStatus：SUCCESS / FAIL / CANCELLED / PROCESSING |
| 取消 cancel | `/v1/payments/cancel` | 仅未达终态可取消；FAIL 状态也可 cancel |
| 退款 refund | `/v1/payments/refund` | 幂等键 refundRequestId；需原支付 paymentId；支持部分退款与多次退款（合同约束内） |
| 退款查询 inquiryRefund | `/v1/payments/inquiryRefund` | 按 refundRequestId 查询终态 |
| 支付结果通知 notifyPayment | 商户 paymentNotifyUrl | notifyType=PAYMENT_RESULT（终态）/ PAYMENT_PENDING（中间态）/ UPDATE_AMOUNT_RESULT |

### 2.7 幂等要求

- `paymentRequestId`：支付幂等键，相同值达到终态（S/F）后重复请求返回相同结果（最长 64 字符）
- `refundRequestId`：退款幂等键，resultStatus=U 或超时时必须用**相同** refundRequestId 重试
- 我方映射：`paymentRequestId = 订单 orderNo`、`refundRequestId = 退款单 refundNo`（均天然唯一）

### 2.8 支付方式分类

- **Card**：paymentMethodType=CARD（需 paymentFactor，支持 3DS）
- **APM / Wallet**：paymentMethodType 为具体方式（如 ALIPAY_CN、PAYNOW、KAKAOPAY、APPLEPAY、GOOGLEPAY、ONLINEBANKING_YAPILY 等）
- 具体可用方式列表与合同开通相关 —— **待 Antom 商务确认**

### 2.9 金额表示

- `Amount { currency, value }`，value 为**最小货币单位字符串**（如 SGD 42.00 → "4200"）
- 与我方整数分约定天然一致；JPY/KRW 等无"分"币种的处理 —— **待 Antom 技术确认**

### 2.10 Webhook 通知机制（已确认部分）

- 终态通知（成功或失败）推送到 paymentNotifyUrl（请求参数优先于 Dashboard 配置）
- 通知头含 `request-time` / `client-id` / `signature`，验签规则同请求签名（使用接收 URI + POST）
- 商户需返回固定格式确认（`result.resultCode=SUCCESS, resultStatus=S`）
- 未确认时 Antom 在 24h 内最多重发 8 次：间隔 0s/2m/10m/10m/1h/2h/6h/15h
- paymentId 与 paymentRequestId 一一对应

## 3. 配置设计（无需修改 Prisma schema）

现有 `PaymentConfig` 模型字段足够容纳 Antom 配置：

| PaymentConfig 字段 | Antom 用途 |
|---|---|
| `appId` | Antom Client ID |
| `privateKey` | 商户 RSA 私钥（敏感，见下方安全建议） |
| `publicKey` | Antom 平台公钥（验签用） |
| `gateway` | API 基址域名（如 https://open-sea-global.alipay.com） |
| `extraConfig` (Json) | merchantAccountId / keyVersion / settlementCurrency / paymentMethodType 默认值等 |
| `isSandbox` | Sandbox / Production 切换（决定 path 前缀） |
| `notifyUrl` | paymentNotifyUrl |

`PaymentConfig.channel` 为 `PaymentChannel` enum 类型。**已核验：enum 中已预留 `ANTOM` 值**（Prisma Client 同步生成），
配置存储与渠道注册均无需 schema 变更。

### 密钥安全建议（报告项，本轮不实施）

现有体系（支付宝等）私钥直接存于数据库。建议 Antom 接入时采用更安全的模式：

1. **首选**：私钥放环境变量（如 `ANTOM_PRIVATE_KEY`），PaymentConfig.privateKey 只存
   引用标记（如 `env:ANTOM_PRIVATE_KEY`），读取时解析
2. 数据库仅保存非敏感配置（clientId、公钥、网关、模式）
3. 任何日志、审计记录、错误响应不得输出私钥/签名值

是否采用及迁移范围 —— **待项目决策**。

## 4. 状态映射表

### 4.1 Payment 状态（Antom → BunnyEra OrderStatus / OrderQueryResult）

| Antom paymentStatus / resultStatus | 含义 | BunnyEra 映射 | 说明 |
|---|---|---|---|
| SUCCESS | 支付成功 | `PAID`（订单 PAID） | 唯一允许标记成功的路径 |
| PROCESSING | 处理中 | `UNKNOWN`（查单）/ 订单保持 UNPAID | 不误判，等待终态 |
| FAIL | 支付失败 | `CLOSED` | 失败终态，不可再支付（可用新 paymentRequestId 新建订单） |
| CANCELLED | 已取消 | `CLOSED` | cancel API 或用户放弃的终态 |
| 过期 | 无独立状态 | — | Antom 以 paymentExpiryTime 超时后归入 FAIL/CANCELLED（**待确认**），由 inquiryPayment 终态覆盖 |
| 未识别值 | — | `UNKNOWN`（fail-closed） | 绝不误判 success |
| resultStatus=U | 未知 | 查单确认 | pay/refund 调用返回 U 时必须 inquiry 补偿 |

### 4.2 Refund 状态（Antom → BunnyEra RefundStatus）

| Antom 退款结果 | BunnyEra 映射 | 说明 |
|---|---|---|
| resultStatus=S（refund 成功） | `SUCCESS` | refund-service 事务更新订单 |
| REFUND_IN_PROCESS / resultStatus=U | `PROCESSING` | 不得标记成功；用 inquiryRefund 或异步通知确认终态 |
| resultStatus=F（REFUND_WINDOW_EXCEED 等） | `FAILED` | 订单不变，记录失败原因 |
| CANCELLED | — | Antom 退款无 cancelled 概念（**待确认**），失败即 FAILED |
| 未识别 | `UNKNOWN` → fail-closed | 订单不变 |

### 4.3 Webhook CallbackData 映射

| notifyPayment 字段 | CallbackData 字段 |
|---|---|
| paymentRequestId | orderNo |
| paymentId | tradeNo |
| paymentAmount.value（整数最小单位） | amount |
| paymentAmount.currency | currency |
| result.resultStatus=S → SUCCESS，其余 → FAILED | status（fail-closed） |
| paymentTime | paidAt |

## 5. Webhook 验签设计

1. **路由契约**（下一轮实现 `src/app/api/pay/antom/notify/route.ts`）：
   读取原始 text body → 按订单/配置定位 → `resolveProvider` → `handleWebhook({ body: rawText, headers })` → 仅 verified=true 才进入业务更新
2. **验签原文**：`POST <webhookPath>\n<client-id>.<request-time>.<rawBody>`，Antom 公钥验证
3. **一致性校验**：header `client-id` 必须与配置 clientId 一致
4. **重放防护**：
   - 官方文档未给出 request-time 有效窗口规范 —— **待 Antom 技术确认**
   - 建议实现侧自行校验 request-time 时间窗（如 ±10 分钟）+ CallbackLog 去重（既有机制）
5. **幂等/重复通知**：
   - 终态幂等：订单已 PAID 时重复通知直接 ACK，不重复处理（复用 alipay/wechat notify 的事务模式）
   - 必须返回 `{"result":{"resultCode":"SUCCESS","resultStatus":"S","resultMessage":"success"}}`，否则 Antom 24h 内重发最多 8 次
6. **中间态**：`notifyType=PAYMENT_PENDING` 不更新订单状态，ACK 接收；
   建议同时触发 inquiryPayment 主动查单（下一轮）
7. **禁止项**（硬约束）：不得 isVerified=true 假验签、不得跳过验签、
   不得信任 body 中 success 字段而不验签、不得未验证来源更新订单

## 6. 退款流程（复用 refund-service 四段式）

```
退款单 APPROVED
  → 条件更新 APPROVED→PROCESSING（执行权锁，防重复执行）
  → AntomProvider.refund()
      refundRequestId=refundNo（幂等），paymentId=订单 tradeNo（必须存在）
      S → success；U → REFUND_IN_PROCESS（不标记成功）；F → failed
  → AntomProvider.queryRefund() 确认终态
  → 仅 SUCCESS：事务更新退款单 + 订单 refundAmount/状态
  → 审计日志记录成败
```

前置要求：订单 `tradeNo` 必须存储 Antom `paymentId`（createPayment 返回时写入，既有链路已如此）。
PROCESSING 退款的定时补偿任务 —— 与现有渠道共用的下一轮待办。

## 7. Sandbox 流程（下一轮执行计划）

1. Antom Dashboard 注册并生成 Sandbox 密钥对（client-id `SANDBOX_*`）
2. PaymentConfig 写入 Sandbox 配置（isSandbox=true，gateway 用 Antom 提供的 Sandbox 域名）
3. schema 扩展 PaymentChannel enum（如 `ANTOM_CASHIER`）+ resolver.ts 注册 ANTOM_* 分支
4. 打开骨架 `externalRequestsEnabled`（仅 Sandbox 配置下）
5. 端到端：pay → 收银台 → notifyPayment 验签 → inquiryPayment 对账 → refund → inquiryRefund
6. 全链路在 Sandbox 验证通过前，不得配置任何 Production 凭证

## 8. Production 上线前置条件

- [ ] Sandbox 全链路（支付/通知/查单/退款/退款查询）验证通过
- [ ] Production client-id、商户私钥（建议环境变量方式）、Antom 公钥就位
- [ ] paymentNotifyUrl 公网可达（HTTPS），Dashboard 与请求参数一致性确认
- [ ] 合同开通的 paymentMethodType 列表与前端收银台展示对齐
- [ ] 结算币种（settlementStrategy.settlementCurrency）按合同配置
- [ ] 重放窗口、退款窗口（refund window）合同条款确认并落入运营文档
- [ ] 对账方案（downloadBill 未实现，Antom 对账文件接口待确认）

## 9. 待 Antom 商务/技术确认事项

1. 商户合同区域与对应网关域名（亚洲/北美/欧洲）
2. Sandbox 账户开通流程与 Sandbox 域名（文档显示 path 前缀区分，域名是否相同需确认）
3. 开通的 paymentMethodType 清单（Card / APM / Wallet 具体范围）
4. 支持的结算币种与交易币种列表；JPY/KRW 等零小数位币种的 Amount.value 语义
5. 退款窗口（refundable period）具体时长
6. Webhook request-time 官方建议的重放防护窗口
7. paymentExpiryTime 超时后 inquiryPayment 的确切终态值（FAIL vs CANCELLED）
8. 对账/账单下载 API 是否可用及其规格
9. 多 merchantAccountId 场景是否需要（影响 PaymentConfig.extraConfig 设计）
10. installment（分期）是否纳入 V1 范围

## 10. 骨架代码安全声明

`src/lib/payment/antom.ts`（本轮新增，未注册、未启用）：

- `externalRequestsEnabled` 恒为 `false`：sendRequest 在未启用时直接抛错，
  **不发任何真实请求**
- 无 hardcoded 凭证；所有凭证构造函数注入
- 缺配置 fail-closed（getConfigIssues 输出缺失项清单，供 resolver 拒绝）
- 日志不输出 key/token/signature
- handleWebhook：验签失败/非终态/缺字段一律 `verified=false`
- 未识别状态一律 UNKNOWN，绝不误判 success

## 11. 已知结构约束（正式接入前必须解决）

1. ~~PaymentChannel enum 无 ANTOM 值~~ —— **接入前核验已澄清：enum 已预留 `ANTOM`**（与 Foundation V1
   审计报告一致），无 schema 依赖。resolver.ts 增加 `ANTOM` 分支实例化 AntomProvider 即可注册，
   骨架 `channel` 字段已移除类型断言。
2. 响应签名验证：sendRequest 目前仅 TODO 标注（Sandbox 阶段实现），
   在实现前所有 API 响应不得用于标记成功（由 externalRequestsEnabled=false 保证）。
3. notify route 尚未创建：handleWebhook 已就绪，路由为下一轮工作。
