# CNB Issue / PR 手机端管理工具

基于 [CNB OpenAPI](https://api.cnb.cool/swagger.json) 的移动端优先 Web 应用，用于管理 CNB 仓库的 Issue 与 PR（合并请求）。

- **后端**：Node.js 原生 `http`，零依赖，单文件 `server.js`。唯一接口 `/api/proxy/*` 原样转发到 `https://api.cnb.cool/*`，并注入 `CNB_TOKEN`，令牌不下发到浏览器。
- **前端**：React 18 + Vite 5，移动端优先设计（底部导航、44px 触控热区、安全区适配、桌面端限宽居中）。

## 功能

### Issue（完整 CRUD）
- 列表：按状态筛选、关键词搜索、分页加载（触底自动加载）
- 详情：标题、正文、作者、处理人、标签、优先级、起止日期
- 创建 / 编辑：标题、正文、优先级、标签、处理人
- 关闭与重开：关闭时必须选择原因（`completed` / `not_planned`）
- 标签管理
- 评论列表与发表，「替我上班」默认勾选（可取消），开启 NPC 工作模式
- 评论框上方的快捷用语 chip，一键把 `@CodeBuddy …` 招呼语填进草稿

### Pull Request（合并为核心）
- 列表：按状态（待合并 / 已关闭 / 全部）、目标分支筛选
- 详情：源/目标分支与 SHA、评审人、可合并状态、阻塞原因
- 创建 / 编辑 / 关闭 / 重开
- **合并**：三种合并方式 **Squash（默认）** / Merge / Rebase，可填写合并提交标题与描述，可开启强制合并
- **懒加载 Tab**：变更文件、提交、评审、讨论 —— 首次点击才发起请求，结果缓存，切换不再重复请求

### 主题
- **深色 / 浅色两套**，右上角一键切换，选择记在 `localStorage`，下次打开沿用（默认深色）
- 只换 CSS 变量，类名不动：颜色全在 `web/src/styles.css` 的 `:root` 与 `:root[data-theme='light']` 里
- 首屏由 `index.html` 的内联脚本定主题，刷新不会先深后浅闪一下
- 顶栏 / 底栏是半透明 + 高斯模糊，底色也做成了变量（`--bar-bg` / `--tabbar-bg`），否则浅色下会留一条黑边
- `<meta name="theme-color">`（浏览器地址栏、PWA 状态栏）跟着一起换

### 其他
- **多仓库切换**：一个输入框同时支持「筛选已有仓库列表」与「直接输入 `组织/仓库`」
  - 仓库列表来源优先 `/user/repos`，令牌缺少 `account-engage:r` 时自动回退到 `/{组织}/-/repos`
  - 输入组织名可展开该组织下的全部仓库；输入 `组织/仓库` 会多出一行「直接使用」
- **选择被记住**：选中的仓库写入 `localStorage`，下次打开自动选中；点击顶部「仓库」随时可改
  - 缓存的仓库若已失效或无权限，列表会给出中文提示并提供「切换仓库」按钮直接打开选择器

## 评论快捷用语（召唤 NPC）

评论框上方排了一行 chip，点一下就把招呼语填进草稿，省得每次手敲 `@CodeBuddy`：

| chip | 填进草稿 |
| --- | --- |
| 召唤 CodeBuddy | `@CodeBuddy ` |
| 改代码 | `@CodeBuddy 帮我改掉这个问题：` |
| 解释一下 | `@CodeBuddy 解释一下这里为什么这么写：` |
| 加个测试 | `@CodeBuddy 给这段加个测试：` |
| 看看这个 PR | `@CodeBuddy 帮我看看这个 PR：` |

- **只填草稿，不代发**。发不发、开不开「替我上班」仍归用户决定。
- 草稿已有正文时招呼语前置，正文原样保留。
- 切换 chip 会换掉旧招呼语，不会叠成 `@CodeBuddy @CodeBuddy …`。
- 当前生效那条高亮，再点一次即收回（只摘招呼语）。
- 正文中间的 `@CodeBuddy` 不算招呼语，不会被误摘。

想加指令只改 `web/src/components/CommentShortcuts.jsx` 里的 `SHORTCUTS` 数组，一行一条。

## NPC 工作模式（替我上班）

在 Issue / PR 评论区**「替我上班」默认已勾选**，直接发表评论请求体就带上 `work_mode: true`：

```json
{ "body": "@CodeBuddy 帮我改掉这个 bug", "work_mode": true }
```

| 位置 | 字段名 | 取值 |
| --- | --- | --- |
| 评论 / Issue / 评审接口的请求体 | `work_mode` | `boolean` |
| API 触发流水线时的 `npc` 对象 | `workMode` | `boolean`（`npc.name` 只接受 `CodeBuddy`） |
| Issue 详情返回的 `statuses.npc[].context` | `npc.work_mode` | 字符串 `"true"` |

`work_mode` 出现在 5 个写接口上：创建 Issue、Issue 评论、PR 评论、PR 评审、评审回复。
列表与详情接口不回传该值，所以**前端无法反查某条评论当时是否开了工作模式**。

开关**默认选中**：没在本地存过选择就是勾上的，评论发出去即带 `work_mode: true`。
用户手动取消后，这份选择会写进 `localStorage`（`cnb-manager:work-mode`）并在之后沿用；
勾上同样会被记住。为了让「默认选中」在下一条评论依然成立，发送成功后**不再把开关重置为关闭**。

开不开的区别在于令牌范围：不勾时 `CNB_TOKEN` 以只读为主（`repo-code:r`、`repo-pr:r`），
只能读代码、写评论；勾上后才拿到 `repo-code:rw`、`repo-pr:rw`，NPC 才能推代码、建分支、发 PR。
开启工作模式还要求触发者在仓库里是**开发者及以上**，`Reporter` / `Guest` 勾了也无效。

- 工作模式：<https://docs.cnb.cool/zh/build/npc.html>
- API 触发 NPC：<https://docs.cnb.cool/zh/build/npc-integration.html>
- `CNB_TOKEN` 权限分配：<https://docs.cnb.cool/zh/build/build-in-env.html>

## 同步到 GitHub

CNB 仓库的提交会镜像一份到 GitHub，**强制推送**，以 CNB 为准。

### 流水线

`.cnb.yml` 挂在 `main` 的 `push` 与 `pull_request.merged` 上，覆盖「直接推主干」和
「PR 合并后（squash / rebase 会造新提交）」两种情况：

```yaml
main:
  push:
    - <<: *github-mirror
  pull_request.merged:
    - <<: *github-mirror
```

目标仓库地址写在 `.github-repo` 锚点的 `GITHUB_REPO` 里，换仓库只改这一行。

### 凭据

账号密码不写进本仓库，通过 `imports` 从独立仓库引用（写法同 `i0358/model-key`）：

```yaml
imports:
  - https://cnb.cool/i0358/model-key/-/blob/main/github.yml
```

那个文件里只要两行：

```yaml
GITHUB_USERNAME: <用户名>
GITHUB_TOKEN: <Personal Access Token，需 repo 权限>
```

> `github.yml` 是公开仓库里的明文凭据，任何人可见。要换 Token 或担心泄露，
> 把这两个变量挪到私有密钥仓库再改 `imports` 地址。

### 逻辑

`scripts/sync-to-github.sh` 只做一件事，不依赖任何插件镜像：

1. `git ls-remote` 读 GitHub 上目标分支的 sha
2. 与 `CNB_COMMIT` 相同就直接退出（重复触发不产生空推送）
3. 不同则 `git push --force <sha>:refs/heads/<分支>`

用 Token 换来的凭据只落在构建机的 `~/.git-credentials`，写完即用，不落仓库配置。

本地手动跑：

```bash
GITHUB_USERNAME=fykyx521 \
GITHUB_TOKEN=<token> \
GITHUB_REPO=fykyx521/cnbissue \
sh scripts/sync-to-github.sh
```

可用 `GITHUB_BRANCH` 覆盖目标分支，默认取当前分支名。

## 环境要求

- Node.js >= 18

## 准备令牌

在 CNB 个人设置中创建访问令牌，需要包含以下权限：

| 权限 | 用途 | 缺失时 |
| --- | --- | --- |
| `repo-issue:r` / `repo-issue:rw` | 查看 / 创建、编辑 Issue | Issue 页面报 403 |
| `repo-pr:r` / `repo-pr:rw` | 查看 / 创建、编辑、合并 PR | PR 页面报 403 |
| `repo-code:r` / `repo-code:rw` | 只读拉取 / 推送分支、建分支 | 只能读 issue、pr，写不动代码 |
| `account-engage:r` | 列出可管理的仓库 | 退回到「手动输入 组织/仓库」 |

令牌权限不足时接口返回 `403 errcode 10023`，页面会附带中文提示。

**注意区分两类令牌**：只勾了 issue / pr 权限的令牌，能评论、能开关 issue，但**不能推送代码、不能建分支**。这种令牌写代码时会看到：

```
remote: Your token does not have the repo-code:rw scope required to push to this repository.
fatal: unable to access 'https://cnb.cool/<org>/<repo>.git/': 403
```

平台 API 也一致：

```bash
cnb git create-branch --repo <org>/<repo> --name <branch> --start-point <sha>
# 403 errcode 10023: Missing required scopes: repo-code:rw
```

一句话：**要提 PR，令牌必须有 `repo-code:rw`**；只读代码 `repo-code:r` 就够，但推分支必须是 rw。

> `account-engage:r` 缺失时，仓库选择器会自动切换为手动输入模式并记住上次填写的仓库，不影响其余功能。

## 启动

```bash
# 1. 安装前端依赖并构建
npm install
npm run build

# 2. 配置令牌（推荐写入 .env，避免每次都 export）
cp .env.example .env
# 编辑 .env，填入 CNB_TOKEN

# 3. 启动
npm start
```

浏览器打开 `http://<服务器IP>:3000`（手机与服务器需在同一网络）。

也可以直接用环境变量：

```bash
CNB_TOKEN=你的令牌 npm start
```

### 开发模式

```bash
npm run dev            # 启动后端 (3000)
npm run dev --prefix web   # 启动 Vite (5173)，自动代理 /api 到 3000
```

## 接口说明

后端只暴露一个接口：

```
ANY /api/proxy/<cnb 路径>
```

例如：

```bash
curl http://localhost:3000/api/proxy/user/repos
curl "http://localhost:3000/api/proxy/{org}/{repo}/-/issues?page=1&page_size=20&state=open"
```

- 请求方法、query、body 原样转发
- 自动注入 `Authorization: Bearer $CNB_TOKEN` 与 `Accept: application/vnd.cnb.api+json`（缺少 Accept 头 CNB 会返回 406）
- 上游状态码与响应体原样返回
- 路径前缀白名单校验，防止被当作任意 URL 代理

## 目录结构

```
issue/
├── .cnb.yml           # 流水线：push 时镜像同步到 GitHub
├── scripts/
│   └── sync-to-github.sh
├── server.js          # 零依赖代理 + 静态托管
├── package.json
├── .env.example
└── web/
    ├── vite.config.js
    └── src/
        ├── api.js           # 接口封装
        ├── constants.js     # 枚举与格式化
        ├── hooks.js         # 分页 / 懒加载 hooks
        ├── App.jsx          # 外壳：仓库选择器 + 底部 Tab + 路由
        ├── components/      # UI 组件、卡片、懒加载 Tab、合并弹层
        └── pages/           # Issue 与 PR 页面
```

## 注意

- CNB 的 Issue 状态筛选**不支持** `all`，前端「全部」选项通过不传 `state` 实现。
- 主题只改 CSS 变量，新增颜色**不要写死**（如 `#0b0d12`、`color: #fff`），
  否则浅色下会漏出深色底。反色文字用 `--on-accent` / `--on-green`，`web/test/theme.test.mjs` 会盯着这条。
- Issue 的 `state` 与 `state_reason` 必须成对提交，否则接口返回 `errcode 2000054`。前端已在关闭 / 重开时自动成对传递。
- `GET /user/repos` 的 `role` 参数只接受 `owner`（也是默认值），传其它值返回 `errcode 3`。
- PR 提交列表的真实结构是 `{ sha, commit: { message, author: { name, email, date } } }`，消息在嵌套的 `commit.message` 里。
- 弹层通过 React portal 挂到 `body`。若直接渲染在带 `backdrop-filter` 的顶栏内部，`position: fixed` 会相对顶栏而非视口定位。
- 后端代理的路径白名单同时放行 `/{组织}/{仓库}/-/{资源}` 与 `/{组织}/-/{资源}` 两种形态，其余一律 403。
