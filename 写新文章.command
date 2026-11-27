#!/bin/bash
cd "$(dirname "$0")"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

ask() {
  osascript -e "text returned of (display dialog \"$1\" default answer \"$2\" with title \"新建文章\" buttons {\"取消\", \"确定\"} default button \"确定\" cancel button \"取消\")" 2>/dev/null
}

KIND=$(osascript -e 'button returned of (display dialog "要写什么？" with title "新建文章" buttons {"取消", "刷题题解", "学习笔记"} default button "学习笔记" cancel button "取消")' 2>/dev/null) || exit 0

TITLE=$(ask "文章标题：" "") || exit 0
[ -z "$TITLE" ] && exit 0

if [ "$KIND" = "刷题题解" ]; then
  DIFF=$(osascript -e 'choose from list {"简单", "中等", "困难"} with title "新建文章" with prompt "题目难度：" default items {"中等"}' 2>/dev/null)
  [ "$DIFF" = "false" ] && exit 0
  LINK=$(ask "原题链接（可留空）：" "https://leetcode.cn/problems/") || exit 0
  [ "$LINK" = "https://leetcode.cn/problems/" ] && LINK=""
  OUT=$(node scripts/new.js algo "$TITLE" "$DIFF" "$LINK")
else
  OUT=$(node scripts/new.js note "$TITLE")
fi
echo "$OUT"

FILE=$(echo "$OUT" | sed -n 's/^已创建：//p')
[ -z "$FILE" ] && exit 1

if command -v cursor >/dev/null 2>&1; then
  cursor "$(pwd)" "$FILE"
else
  open -t "$FILE"
fi

if ! lsof -i :4000 -sTCP:LISTEN >/dev/null 2>&1; then
  nohup node server.js > .server.log 2>&1 &
  sleep 1
fi
open "http://localhost:4000"
echo "写完保存后，刷新浏览器即可看到（可以关闭这个窗口）"
