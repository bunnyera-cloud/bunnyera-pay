#!/usr/bin/env bash
# =============================================================================
# BunnyEra Pay —— 数据库备份（安全底线）
#
# 作用：
#   1. 读取生产环境文件 .env.production 里的 DATABASE_URL
#   2. pg_dump 导出，再 gzip 压缩
#   3. 若配置了 rclone 远端，把压缩包上传到对象存储
#   4. 删除本地超过 7 天的旧备份，防止磁盘写满
#
# 服务器落地路径：
#   /www/wwwroot/bunnyera-pay/scripts/backup-db.sh
#   chmod 750 该文件，属主 bunnyera:bunnyera
# 备份目录（仓库外，避免被网站目录扫到）：
#   /www/wwwroot/bunnyera-pay-backups/postgres
#
# ---------- 如何配置 Crontab（每天凌晨 3 点）----------
# 1) 先确认已安装客户端：
#      command -v pg_dump
#      Debian/Ubuntu: sudo apt-get install -y postgresql-client
# 2) 先手工跑一次（会读 .env.production，请确认权限 600）：
#      sudo -u bunnyera /www/wwwroot/bunnyera-pay/scripts/backup-db.sh
# 3) 用 bunnyera 用户编辑定时任务：
#      sudo -u bunnyera crontab -e
# 4) 每天 03:00 执行：
#      0 3 * * * /www/wwwroot/bunnyera-pay/scripts/backup-db.sh >> /www/wwwroot/bunnyera-pay/logs/backup-db.log 2>&1
#    若希望避开整点高峰，可改成 10 3 * * *（03:10）。
# 5) 查看是否已写入：
#      sudo -u bunnyera crontab -l
#
# ---------- 如何配置 rclone 上传到对象存储 ----------
# 安装：curl https://rclone.org/install.sh | sudo bash
# 交互配置：rclone config
#   AWS S3 示例远端名：s3
#   阿里云 OSS 示例远端名：oss
#   Cloudflare R2 示例远端名：r2（S3 兼容，endpoint 填 R2）
# 然后在 crontab 前加变量，例如：
#   0 3 * * * RCLONE_REMOTE='r2:bunnyera-pay-db' /www/wwwroot/bunnyera-pay/scripts/backup-db.sh >> /www/wwwroot/bunnyera-pay/logs/backup-db.log 2>&1
#
# RCLONE_REMOTE 留空：只做本地备份，不上传。
# 本脚本不会打印 DATABASE_URL，也不会改 PAYMENT_ENV。
# =============================================================================

set -euo pipefail

APP_ROOT="${APP_ROOT:-/www/wwwroot/bunnyera-pay}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/.env.production}"
# 备份放在站点目录外，避免被 Nginx 当静态文件扫到。
BACKUP_DIR="${BACKUP_DIR:-/www/wwwroot/bunnyera-pay-backups/postgres}"
# 本地保留天数。对象存储侧的生命周期规则请在桶上单独配。
KEEP_DAYS="${KEEP_DAYS:-7}"
# 例：r2:bunnyera-pay-db   oss:bunnyera-pay-db   s3:bunnyera-pay-db
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

LOG_PREFIX="[backup-db $(date '+%Y-%m-%d %H:%M:%S')]"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "$LOG_PREFIX 找不到 $ENV_FILE" >&2
  exit 1
fi

# set -a：source 进来的变量自动 export，供 pg_dump 使用。
# 只读 DATABASE_URL，不 echo 文件内容。
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "$LOG_PREFIX DATABASE_URL 为空" >&2
  exit 1
fi

if [[ "${DATABASE_URL}" == *"CHANGE_ME"* || "${DATABASE_URL}" == *"replace_me"* ]]; then
  echo "$LOG_PREFIX DATABASE_URL 仍是占位符，拒绝备份" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "$LOG_PREFIX 未安装 pg_dump。Debian/Ubuntu: sudo apt-get install -y postgresql-client" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
# 新建文件默认仅属主可读写。
umask 077

stamp="$(date '+%Y%m%d-%H%M%S')"
outfile="$BACKUP_DIR/bunnyera-pay-${stamp}.sql.gz"

echo "$LOG_PREFIX 开始备份到 $outfile"
# --no-owner --no-acl：恢复时不强制原角色，方便在备机导入。
# 先写 .tmp，成功后再改名，避免留下半截压缩包。
if ! pg_dump --no-owner --no-acl --dbname="$DATABASE_URL" | gzip -9 > "$outfile.tmp"; then
  rm -f "$outfile.tmp"
  echo "$LOG_PREFIX pg_dump 失败" >&2
  exit 1
fi
mv "$outfile.tmp" "$outfile"
chmod 600 "$outfile"
echo "$LOG_PREFIX 本地备份完成 $(du -h "$outfile" | awk '{print $1}')"

if [[ -n "$RCLONE_REMOTE" ]]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "$LOG_PREFIX 已设置 RCLONE_REMOTE 但未安装 rclone" >&2
    exit 1
  fi
  echo "$LOG_PREFIX 上传到 $RCLONE_REMOTE"
  # copy：把单个文件拷到远端目录，不删除远端历史包。
  rclone copy "$outfile" "$RCLONE_REMOTE" --quiet
  echo "$LOG_PREFIX 上传完成"
else
  echo "$LOG_PREFIX 未设置 RCLONE_REMOTE，跳过对象存储上传"
fi

echo "$LOG_PREFIX 清理 ${KEEP_DAYS} 天前的本地备份"
# +N 表示「修改时间超过 N 天」。只删本脚本命名的文件。
find "$BACKUP_DIR" -type f -name 'bunnyera-pay-*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete || true
echo "$LOG_PREFIX 备份结束"
