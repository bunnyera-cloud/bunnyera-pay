#!/usr/bin/env bash
# =============================================================================
# BunnyEra Pay —— 轻量健康检查（给 crontab 用）
#
# 作用：
#   定时 curl 本机 /api/health。
#   HTTP 200 视为正常，并把连续失败计数清零。
#   非 200、连接失败、超时，都算一次失败。
#   只有「连续失败次数刚好达到阈值」时才发 Webhook，避免恢复前每 5 分钟刷屏。
#
# 服务器落地路径（复制后必须去掉 Windows 回车）：
#   /www/wwwroot/bunnyera-pay/scripts/health-check.sh
#   chmod 750 该文件，属主 bunnyera:bunnyera
#
# ---------- 如何配置 Crontab（每 5 分钟）----------
# 1) 先手工跑一次，确认脚本本身没问题：
#      sudo -u bunnyera /www/wwwroot/bunnyera-pay/scripts/health-check.sh
# 2) 用 bunnyera 用户编辑定时任务（不要用 root 跑业务探测）：
#      sudo -u bunnyera crontab -e
# 3) 加入下面这一行（每 5 分钟执行，日志追加到应用 logs 目录）：
#      */5 * * * * /www/wwwroot/bunnyera-pay/scripts/health-check.sh >> /www/wwwroot/bunnyera-pay/logs/health-check.log 2>&1
# 4) 查看是否已写入：
#      sudo -u bunnyera crontab -l
#
# ---------- 如何配置飞书 / 钉钉 Webhook ----------
# 方式 A（推荐）：在 crontab 同一行前加环境变量
#   */5 * * * * WEBHOOK_KIND=feishu WEBHOOK_URL='https://open.feishu.cn/open-apis/bot/v2/hook/替换' \
#       /www/wwwroot/bunnyera-pay/scripts/health-check.sh >> /www/wwwroot/bunnyera-pay/logs/health-check.log 2>&1
#
# 方式 B：先 export 再写进 bunnyera 的 ~/.profile（不推荐把 URL 提交进 Git）
#
#   WEBHOOK_KIND=feishu     # 飞书机器人
#   WEBHOOK_KIND=dingtalk   # 钉钉机器人
#   飞书 URL 形如：https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
#   钉钉 URL 形如：https://oapi.dingtalk.com/robot/send?access_token=xxxx
#
# 留空 WEBHOOK_URL 时：只写本地日志，不外发。
# 探测走 127.0.0.1:3001，不经过公网，也不改 DNS / PAYMENT_ENV。
# =============================================================================

set -u

# 本机 standalone 监听地址。不要改成公网 IP，也不要走 https 外网域名。
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"

# 连续失败几次才告警。需求是 2 次。
FAIL_THRESHOLD="${FAIL_THRESHOLD:-2}"

# curl 超时秒数。超时与非 200 一样记为失败。
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-8}"

# 飞书或钉钉自定义机器人。生产环境用 crontab 注入，不要写进仓库。
WEBHOOK_URL="${WEBHOOK_URL:-}"
# feishu 或 dingtalk
WEBHOOK_KIND="${WEBHOOK_KIND:-feishu}"

APP_ROOT="${APP_ROOT:-/www/wwwroot/bunnyera-pay}"
# 连续失败计数文件。恢复 200 后会被写成 0。
STATE_FILE="${STATE_FILE:-$APP_ROOT/logs/health-fail-count}"
LOG_PREFIX="[health-check $(date '+%Y-%m-%d %H:%M:%S')]"

mkdir -p "$(dirname "$STATE_FILE")"

read_fail_count() {
  if [[ -f "$STATE_FILE" ]]; then
    tr -dc '0-9' < "$STATE_FILE"
  else
    printf '0'
  fi
}

write_fail_count() {
  printf '%s' "$1" > "$STATE_FILE"
  chmod 600 "$STATE_FILE" 2>/dev/null || true
}

# 按机器人类型组装文本消息。只发纯文本，不带任何密钥。
send_alert() {
  local message="$1"
  if [[ -z "$WEBHOOK_URL" ]]; then
    echo "$LOG_PREFIX 未配置 WEBHOOK_URL，跳过外发。告警内容：$message"
    return 0
  fi

  local payload
  if [[ "$WEBHOOK_KIND" == "dingtalk" ]]; then
    payload=$(printf '{"msgtype":"text","text":{"content":"%s"}}' "$message")
  else
    payload=$(printf '{"msg_type":"text","content":{"text":"%s"}}' "$message")
  fi

  if curl -fsS --max-time 10 \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$WEBHOOK_URL" >/dev/null; then
    echo "$LOG_PREFIX 已发送 Webhook 告警（${WEBHOOK_KIND}）"
  else
    echo "$LOG_PREFIX Webhook 发送失败，请检查 WEBHOOK_URL / WEBHOOK_KIND"
  fi
}

# -f 在非 200 时会让 curl 失败；这里关掉 -f，自己看状态码。
# 连接失败或超时时 http_code 为空，下面统一当成 000。
http_code="$(curl -sS -o /dev/null -w '%{http_code}' \
  --max-time "$TIMEOUT_SECONDS" \
  "$HEALTH_URL" || true)"

if [[ "$http_code" == "200" ]]; then
  write_fail_count 0
  echo "$LOG_PREFIX OK HTTP 200 $HEALTH_URL"
  exit 0
fi

prev="$(read_fail_count)"
if [[ -z "$prev" ]]; then
  prev=0
fi
fail_count=$((prev + 1))
write_fail_count "$fail_count"
echo "$LOG_PREFIX FAIL HTTP ${http_code:-000} 连续失败 ${fail_count} 次 $HEALTH_URL"

# 刚好达到阈值才告警；之后持续失败不再重复发，直到恢复 200 再重新计数。
if (( fail_count == FAIL_THRESHOLD )); then
  send_alert "BunnyEra Pay 健康检查连续 ${fail_count} 次失败。URL=${HEALTH_URL} HTTP=${http_code:-000} 主机=$(hostname)"
fi

exit 1
