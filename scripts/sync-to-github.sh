#!/usr/bin/env sh
# 把当前仓库的提交强制镜像到 GitHub。
#
# 只做一件事：读 GitHub 上远端分支的 sha，如果不等于 CNB_COMMIT 就强制推过去。
# 推送走 git 自带的 https 凭据，不依赖任何插件镜像。
#
# 环境变量：
#   GITHUB_USERNAME / GITHUB_TOKEN  必填，GitHub 用户名与 Personal Access Token（需 repo 权限）
#                                   变量缺失的常见原因是凭据仓库里的 imports 文件读不到（仓库私有、
#                                   路径不存在、分支写错），报错里会直接点明，不再只报一句 git 鉴权失败。
#   GITHUB_REPO                     可选，目标仓库 owner/name，默认 fykyx521/cnbissue
#   GITHUB_BRANCH                   可选，目标分支，默认取当前分支名
#   CNB_COMMIT                      可选，要同步的提交，构建环境自动注入
set -eu

# 先把凭据查干净再往下走：变量没注入时直接指出是配置问题，而不是等到 git 报鉴权失败
if [ -z "${GITHUB_USERNAME:-}" ]; then
  echo "conf: GITHUB_USERNAME 未注入" >&2
  echo "conf: 检查 .cnb.yml 的 imports 是否指向了可读的凭据文件（例如" >&2
  echo "conf:   https://cnb.cool/i0358/model-key/-/blob/main/github.yml）" >&2
  echo "conf: 该文件需包含 GITHUB_USERNAME / GITHUB_TOKEN 两行，且仓库对构建可见" >&2
  exit 1
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "conf: GITHUB_TOKEN 未注入" >&2
  echo "conf: 检查 .cnb.yml 的 imports 是否指向了可读的凭据文件（例如" >&2
  echo "conf:   https://cnb.cool/i0358/model-key/-/blob/main/github.yml）" >&2
  echo "conf: 该文件需包含 GITHUB_USERNAME / GITHUB_TOKEN 两行，且仓库对构建可见" >&2
  exit 1
fi

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
git config --global credential.helper store

# 读远端不需要凭据，但读到空可能是仓库/分支不存在，也可能是仓库私有 —— 两种情况在日志里分开提示
REMOTE_SHA=$(git ls-remote --heads "$TARGET" "refs/heads/$BRANCH" | cut -f1)
echo "GitHub 当前: ${REMOTE_SHA:-<远端无此分支，若仓库私有请确认 Token 有 repo 权限>}"

if [ "$REMOTE_SHA" = "$CNB_COMMIT" ]; then
  echo "已是最新，无需同步"
  exit 0
fi

# 推送需要凭据，失败时单独给出结论，避免和上面的读操作混在一起
if ! git push --force "$TARGET" "$CNB_COMMIT:refs/heads/$BRANCH"; then
  echo "conf: 推送 GitHub 失败，常见原因是仓库里 imports 的 GITHUB_TOKEN 无效、过期或字符错误" >&2
  echo "conf: 请核对凭据仓库中 GITHUB_TOKEN 的每一位字符，必要时重新签发 Token" >&2
  exit 1
fi
echo "同步完成: $BRANCH -> $REMOTE_SHA => $CNB_COMMIT"
