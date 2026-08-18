#!/bin/bash
cd /www/wwwroot/bunnyera-pay-v2
export PORT=3001
export HOSTNAME=127.0.0.1
exec /www/server/nodejs/v20.19.6/bin/npm run start -- -p 3001
