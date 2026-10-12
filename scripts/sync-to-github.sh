#!/usr/bin/env sh
# 把当前仓库的提交强制镜像到 GitHub。
#
# 只做一件事：读 GitHub 上远端分支的 sha，如果不等于 CNB_COMMIT 就强制推过去。
# 推送走 git 自带的 https 凭据，不依赖任何插件镜像。
#
# 环境变量：
#   GITHUB_USERNAME / GITHUB_TOKEN  必填，GitHub 用户名与 Personal Access Token（需 repo 权限）
#   GITHUB_REPO                     可选，目标仓库 owner/name，默认 fykyx521/cnbissue
#   GITHUB_BRANCH                   可选，目标分支，默认取当前分支名
#   CNB_COMMIT                      可选，要同步的提交，构建环境自动注入
set -eu

: "${GITHUB_USERNAME:?缺少 GITHUB_USERNAME}"
: "${GITHUB_TOKEN:?缺少 GITHUB_TOKEN}"

REPO="${GITHUB_REPO:-fykyx521/cnbissue}"
BRANCH="${GITHUB_BRANCH:-${CNB_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}}"
TARGET="https://github.com/${REPO}.git"

if [ -z "${CNB_COMMIT:-}" ]; then
  CNB_COMMIT=$(git rev-parse HEAD)
fi

echo "源提交:     $CNB_COMMIT"
echo "目标仓库:   $TARGET"
echo "目标分支:   $BRANCH"

git config user.name  "${GITHUB_USERNAME}"
git config user.email "${GITHUB_USERNAME}@users.noreply.github.com"

# 凭据只落在这台构建机的 ~/.git-credentials，不写进仓库配置
CRED_FILE="$HOME/.git-credentials"
printf 'https://%s:%s@github.com\n' "$GITHUB_USERNAME" "$GITHUB_TOKEN" > "$CRED_FILE"
chmod 600 "$CRED_FILE"

REMOTE_SHA=$(git ls-remote --heads "$TARGET" "refs/heads/$BRANCH" | cut -f1)
echo "GitHub 当前: ${REMOTE_SHA:-<空仓库>}"

if [ "$REMOTE_SHA" = "$CNB_COMMIT" ]; then
  echo "已是最新，无需同步"
  exit 0
fi

git push --force "$TARGET" "$CNB_COMMIT:refs/heads/$BRANCH"
echo "同步完成: $BRANCH -> $REMOTE_SHA => $CNB_COMMIT"
