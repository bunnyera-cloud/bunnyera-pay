# BunnyEra Pay V2 宝塔升级

## 升级前

1. 在宝塔为 `/www/wwwroot/yuanpay` 创建完整备份或云盘快照。
2. 备份服务器上的 `.env`、`data/` 和 `secrets/`。
3. 不要把 `.env`、私钥、支付平台公钥或现有订单数据放入更新压缩包。

## 覆盖升级

将本包解压到 `/www/wwwroot/yuanpay`，只覆盖程序文件。保留服务器原有：

- `.env`
- `data/catalog.json`
- `data/orders.json`
- `secrets/`

然后在宝塔终端执行：

```bash
cd /www/wwwroot/yuanpay
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 yuanpay
```

## 验收地址

- 收银台：`https://pay.bunnyera.com/`
- 企业入驻：`https://pay.bunnyera.com/merchant-register.html`
- 平台控制台：`https://pay.bunnyera.com/platform.html`
- 原商户业务后台：`https://pay.bunnyera.com/admin.html`
- 健康检查：`https://pay.bunnyera.com/health`

第一次打开平台控制台时使用服务器 `.env` 中原有的 `ADMIN_TOKEN`。不要在聊天、截图或公开页面中发送该令牌。

## 数据兼容

V2 不删除原有订单和企业档案。新平台数据首次写入时保存到 `data/platform.json`，并使用原子替换方式写入。杭州奕溪贸易有限公司作为首个已验证商户主体显示。

## 当前安全边界

V2 是多商户软件基线，不是支付牌照系统。企业注册后仍需连接自己名下的支付宝、微信、银联或其他持牌支付账户；客户货款不得进入 BunnyEra LLC 资金池。
