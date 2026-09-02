# BunnyEra Pay

多商户支付管理平台。生产域名：https://pay.bunnyera.com

本地开发：

```bash
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

打开 http://localhost:3000 。生产部署使用 `Dockerfile` 与 `docker-compose.prod.yml`，应用监听 3000，由 Nginx 反代。
