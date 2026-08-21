#!/bin/bash
# ============================================
# BunnyEra Pay 生产环境部署脚本
# 使用方式: bash deploy.sh
# ============================================

set -e

echo "=========================================="
echo "  BunnyEra Pay 生产环境部署"
echo "=========================================="

# 检查 .env 文件
if [ ! -f .env ]; then
  echo "❌ 错误: 缺少 .env 文件"
  echo "   请复制 .env.example 并填入真实配置："
  echo "   cp .env.example .env"
  exit 1
fi

# 检查必要环境变量
source .env
if [ -z "$DATABASE_URL" ] || [ -z "$JWT_SECRET" ] || [ -z "$REDIS_URL" ]; then
  echo "❌ 错误: .env 中缺少必要变量 (DATABASE_URL, JWT_SECRET, REDIS_URL)"
  exit 1
fi

if [ "$NODE_ENV" != "production" ]; then
  echo "⚠️  警告: NODE_ENV 不是 production，是否继续？(y/N)"
  read -r confirm
  if [ "$confirm" != "y" ]; then
    exit 1
  fi
fi

echo ""
echo "1/4 启动数据库和 Redis..."
docker compose -f docker-compose.prod.yml up -d postgres redis
echo "等待数据库就绪..."
sleep 10

echo ""
echo "2/4 应用已审核的数据库迁移..."
if [ ! -d prisma/migrations ]; then
  echo "❌ 错误: 缺少 prisma/migrations，拒绝对生产数据库执行 db push。"
  echo "   请先在非生产环境生成、审核并提交 migration。"
  exit 1
fi
npx prisma migrate deploy

echo ""
echo "3/4 构建应用..."
NODE_ENV=production npm run build

echo ""
echo "4/4 启动应用容器..."
docker compose -f docker-compose.prod.yml up -d app

echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "应用地址: http://127.0.0.1:3000"
echo "=========================================="
echo ""
echo "首次部署后请创建管理员账号："
echo "  NODE_ENV=development ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=your_password npm run db:seed"
echo ""
echo "查看日志: docker compose -f docker-compose.prod.yml logs -f app"
echo "停止服务: docker compose -f docker-compose.prod.yml down"
