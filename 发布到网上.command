#!/bin/bash
cd "$(dirname "$0")"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

[ -x /usr/bin/git ] && git() { /usr/bin/git "$@"; }

node scripts/build.js || exit 1

if [ ! -d .git ]; then
  git init >/dev/null
  git symbolic-ref HEAD refs/heads/main
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  URL=$(osascript -e 'text returned of (display dialog "第一次发布：请先在 GitHub 新建一个公开仓库（不要勾选 README），然后粘贴仓库地址：" default answer "https://github.com/用户名/仓库名.git" with title "发布博客" buttons {"取消", "确定"} default button "确定" cancel button "取消")' 2>/dev/null) || exit 0
  git remote add origin "$URL"
fi

git add -A
git commit -m "更新博客 $(date '+%Y-%m-%d %H:%M')" >/dev/null 2>&1 || echo "没有新的改动，直接推送"

if git push -u origin main; then
  REMOTE=$(git remote get-url origin)
  USER_REPO=$(echo "$REMOTE" | sed -E 's#(https://github.com/|git@github.com:)##; s#\.git$##')
  USER=${USER_REPO%%/*}
  REPO=${USER_REPO#*/}
  echo ""
  echo "✅ 发布成功！"
  echo "第一次发布需要到仓库 Settings → Pages，Branch 选 main、目录选 /(root)，点 Save。"
  echo "几分钟后访问：https://$USER.github.io/$REPO/"
  open "https://github.com/$USER_REPO/settings/pages"
else
  echo ""
  echo "❌ 推送失败。如果提示要密码：用户名填 GitHub 用户名，密码填 GitHub 的 Personal Access Token"
  echo "（GitHub → Settings → Developer settings → Personal access tokens 生成，勾选 repo 权限）"
fi
