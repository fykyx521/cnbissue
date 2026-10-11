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
- 评论列表与发表

### Pull Request（合并为核心）
- 列表：按状态（待合并 / 已关闭 / 全部）、目标分支筛选
- 详情：源/目标分支与 SHA、评审人、可合并状态、阻塞原因
- 创建 / 编辑 / 关闭 / 重开
- **合并**：三种合并方式 **Squash（默认）** / Merge / Rebase，可填写合并提交标题与描述，可开启强制合并
- **懒加载 Tab**：变更文件、提交、评审、讨论 —— 首次点击才发起请求，结果缓存，切换不再重复请求

### 其他
- **多仓库切换**：一个输入框同时支持「筛选已有仓库列表」与「直接输入 `组织/仓库`」
  - 仓库列表来源优先 `/user/repos`，令牌缺少 `account-engage:r` 时自动回退到 `/{组织}/-/repos`
  - 输入组织名可展开该组织下的全部仓库；输入 `组织/仓库` 会多出一行「直接使用」
- **选择被记住**：选中的仓库写入 `localStorage`，下次打开自动选中；点击顶部「仓库」随时可改
  - 缓存的仓库若已失效或无权限，列表会给出中文提示并提供「切换仓库」按钮直接打开选择器

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
- Issue 的 `state` 与 `state_reason` 必须成对提交，否则接口返回 `errcode 2000054`。前端已在关闭 / 重开时自动成对传递。
- `GET /user/repos` 的 `role` 参数只接受 `owner`（也是默认值），传其它值返回 `errcode 3`。
- PR 提交列表的真实结构是 `{ sha, commit: { message, author: { name, email, date } } }`，消息在嵌套的 `commit.message` 里。
- 弹层通过 React portal 挂到 `body`。若直接渲染在带 `backdrop-filter` 的顶栏内部，`position: fixed` 会相对顶栏而非视口定位。
- 后端代理的路径白名单同时放行 `/{组织}/{仓库}/-/{资源}` 与 `/{组织}/-/{资源}` 两种形态，其余一律 403。
