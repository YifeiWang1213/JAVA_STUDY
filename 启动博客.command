#!/bin/bash
cd "$(dirname "$0")"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if lsof -i :4000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "博客已经在运行"
else
  nohup node server.js > .server.log 2>&1 &
  sleep 1
  echo "博客已启动"
fi

open "http://localhost:4000"
echo "浏览器已打开：http://localhost:4000（可以关闭这个窗口）"
