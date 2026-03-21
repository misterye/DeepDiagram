# DeepDiagram 部署指南

> 前端 → Cloudflare Pages | 后端 → Google Cloud Run | 数据库 → Neon PostgreSQL

---

## 架构总览

```
                    ┌─────────────────────────┐
    用户浏览器 ──────┤  Cloudflare Pages (前端)  │
                    │  静态 SPA: React + Vite  │
                    └──────────┬──────────────┘
                               │ HTTPS 跨域请求
                               ▼
                    ┌─────────────────────────┐
                    │  Google Cloud Run (后端)  │
                    │  FastAPI + Uvicorn       │
                    └──────────┬──────────────┘
                               │ asyncpg (SSL)
                               ▼
                    ┌─────────────────────────┐
                    │  Neon PostgreSQL (数据库) │
                    │  Serverless Postgres     │
                    └─────────────────────────┘
```

---

## 第一步：创建 Neon PostgreSQL 数据库

### 1.1 注册 & 创建项目

1. 访问 [https://neon.tech](https://neon.tech) 并注册账号
2. 点击 **New Project**
3. 填写：
   - **Project name**: `deepdiagram`
   - **Region**: 选择离 Cloud Run 最近的区域（推荐 `asia-southeast1` 对应 Singapore）
   - **Database name**: `deepdiagram`
4. 创建完成后，在 **Dashboard > Connection Details** 中获取连接字符串

### 1.2 获取连接字符串

Neon 会提供如下格式的连接字符串：

```
postgresql://username:password@ep-xxx-xxx-123456.us-east-2.aws.neon.tech/deepdiagram?sslmode=require
```

**转换为 asyncpg 驱动格式**（后端使用 SQLAlchemy + asyncpg）：

```
postgresql+asyncpg://username:password@ep-xxx-xxx-123456.us-east-2.aws.neon.tech/deepdiagram?ssl=require
```

> [!IMPORTANT]
> - 将 `postgresql://` 替换为 `postgresql+asyncpg://`
> - 将 `sslmode=require` 替换为 `ssl=require`
> - 请妥善保管此字符串，后续在 Cloud Run 中使用

### 1.3 Neon 控制台可选设置

| 设置 | 推荐值 | 说明 |
|------|--------|------|
| **Auto-suspend** | 5 分钟 | Free 版默认，空闲时自动休眠 |
| **Compute size** | 0.25~1 CU | Free 版上限 0.25 CU，Pro 版可调 |
| **Pooler** | 关闭或 Transaction mode | 如果并发连接多可开启连接池 |

---

## 第二步：部署后端到 Google Cloud Run

### 2.1 前置条件

- 安装 [Google Cloud CLI (gcloud)](https://cloud.google.com/sdk/docs/install)
- 拥有一个 Google Cloud 项目（记下 Project ID）
- 启用以下 API：
  ```bash
  gcloud services enable run.googleapis.com
  gcloud services enable artifactregistry.googleapis.com
  gcloud services enable cloudbuild.googleapis.com
  ```

### 2.2 创建 Artifact Registry 仓库

```bash
gcloud artifacts repositories create deepdiagram \
  --repository-format=docker \
  --location=asia-southeast1 \
  --description="DeepDiagram Docker images"
```

### 2.3 修改后端代码

#### 2.3.1 修改 `backend/Dockerfile`

将最后一行 CMD 改为读取 Cloud Run 的 `PORT` 环境变量：

```dockerfile
# 原来：
# CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# 改为：
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

#### 2.3.2 修改 `backend/app/core/config.py`

更新 CORS 配置，允许 Cloudflare Pages 的域名：

```python
# 原来：
# BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000", "*"]

# 改为（替换 your-project 为你的 Cloudflare Pages 项目名，或保留 * 允许所有来源）：
BACKEND_CORS_ORIGINS: list[str] = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://your-project.pages.dev",     # Cloudflare Pages 默认域名
    "https://your-custom-domain.com",     # 如果有自定义域名
]
```

> [!TIP]
> 当前代码中 CORS 列表已包含 `"*"`（允许所有来源），因此在开发/测试阶段无需修改。生产环境建议移除 `"*"` 并指定具体域名。

### 2.4 构建并推送 Docker 镜像

```bash
# 配置 Docker 认证
gcloud auth configure-docker asia-southeast1-docker.pkg.dev

# 构建并推送（在项目根目录执行）
gcloud builds submit ./backend \
  --tag asia-southeast1-docker.pkg.dev/YOUR_PROJECT_ID/deepdiagram/backend:latest
```

> 将 `YOUR_PROJECT_ID` 替换为你的 Google Cloud 项目 ID，`asia-southeast1` 替换为你选择的区域。

### 2.5 部署到 Cloud Run

```bash
gcloud run deploy deepdiagram-backend \
  --image asia-southeast1-docker.pkg.dev/YOUR_PROJECT_ID/deepdiagram/backend:latest \
  --platform managed \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --port 8000 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80 \
  --set-env-vars "\
DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx.neon.tech/deepdiagram?ssl=require,\
OPENAI_API_KEY=sk-your-key,\
OPENAI_BASE_URL=https://api.openai.com,\
MODEL_ID=claude-sonnet-3.7,\
LANGCHAIN_TRACING_V2=false,\
THINKING_VERBOSITY=concise,\
MAX_TOKENS=16384"
```

> [!WARNING]
> 上述命令将敏感信息（API Key）直接放在环境变量中。生产环境强烈建议使用 **Google Secret Manager**：
> ```bash
> # 创建 Secret
> echo -n "sk-your-key" | gcloud secrets create openai-api-key --data-file=-
>
> # 部署时引用 Secret
> gcloud run deploy deepdiagram-backend \
>   ... \
>   --set-secrets "OPENAI_API_KEY=openai-api-key:latest"
> ```

### 2.6 环境变量清单

| 环境变量 | 必填 | 示例值 | 说明 |
|----------|------|--------|------|
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://...` | Neon 连接字符串（asyncpg 格式） |
| `OPENAI_API_KEY` | ✅ | `sk-proj-...` | LLM API Key |
| `OPENAI_BASE_URL` | ✅ | `https://api.openai.com` | LLM API 地址 |
| `MODEL_ID` | ❌ | `claude-sonnet-3.7` | 模型 ID，空则用默认值 |
| `DEEPSEEK_API_KEY` | ❌ | `sk-...` | DeepSeek API Key（优先于 OpenAI） |
| `DEEPSEEK_BASE_URL` | ❌ | `https://api.deepseek.com` | DeepSeek API 地址 |
| `MAX_TOKENS` | ❌ | `16384` | 最大 token 数 |
| `LANGCHAIN_TRACING_V2` | ❌ | `false` | LangSmith 追踪开关 |
| `THINKING_VERBOSITY` | ❌ | `concise` | 思考详细程度 |

### 2.7 验证后端部署

部署成功后，Cloud Run 会输出一个 URL（类似 `https://deepdiagram-backend-xxx-as.a.run.app`）。

```bash
# 测试根路径
curl https://deepdiagram-backend-xxx-as.a.run.app/
# 期望返回：{"message":"DeepDiagram API is running"}

# 测试 API 路由
curl https://deepdiagram-backend-xxx-as.a.run.app/api/sessions
# 期望返回：{"sessions":[]} 或带有数据的 JSON
```

**记下此 URL**，前端需要用到。

### 2.8 Cloud Run 参数说明

| 参数 | 推荐值 | 原因 |
|------|--------|------|
| `--memory 1Gi` | 1 GiB | PyMuPDF、pandas 等文档处理库内存消耗较大 |
| `--cpu 1` | 1 vCPU | LangGraph 编排 + 异步处理的最低要求 |
| `--timeout 300` | 300 秒 | SSE 流式输出可能持续较长时间 |
| `--min-instances 0` | 0 | 节省成本，允许缩容到零 |
| `--concurrency 80` | 80 | FastAPI 异步天然支持高并发 |
| `--allow-unauthenticated` | — | 前端需要公开访问 API |

---

## 第三步：部署前端到 Cloudflare Pages

### 3.1 前置条件

- 拥有 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
- 项目代码已推送到 GitHub

### 3.2 修改前端代码

需要修改 **3 处**代码以支持云端部署：

#### 3.2.1 修改 `frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',   // 原来是 '/app'，改为根路径
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

> [!NOTE]
> `server.proxy` 仅在本地开发生效，Cloudflare Pages 上不会使用，保留不影响。

#### 3.2.2 创建 API 基础 URL 配置

创建文件 `frontend/src/lib/api.ts`：

```typescript
// API 基础 URL：生产环境使用环境变量，本地开发使用空字符串（走 Vite proxy）
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
```

#### 3.2.3 更新所有 API 调用

在以下 3 个文件中，将硬编码的 `/api/...` 替换为使用 `API_BASE_URL`：

**`frontend/src/store/chatStore.ts`**：

```typescript
import { API_BASE_URL } from '../lib/api';

// 将所有 fetch('/api/...') 改为：
const response = await fetch(`${API_BASE_URL}/api/sessions`);
const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`);
const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, { method: 'DELETE' });
```

**`frontend/src/components/ChatPanel.tsx`**：

```typescript
import { API_BASE_URL } from '../lib/api';

// 将 fetch('/api/chat/completions', ...) 改为：
const response = await fetch(`${API_BASE_URL}/api/chat/completions`, {
```

**`frontend/src/components/common/SettingsModal.tsx`**：

```typescript
import { API_BASE_URL } from '../lib/api';

// 将 fetch('/api/test-model', ...) 改为：
const response = await fetch(`${API_BASE_URL}/api/test-model`, {
```

#### 3.2.4 创建 `frontend/public/_redirects`

用于 SPA 路由回退（Cloudflare Pages 专用）：

```
/*  /index.html  200
```

#### 3.2.5 修改 `frontend/nginx.conf`（适配 base 路径变更）

如果你仍然需要在 Docker 环境中部署（双栈兼容），需将 nginx.conf 中的 `/app` 改为 `/`：

```nginx
location / {
    root /usr/share/nginx/html;
    index index.html index.htm;
    try_files $uri $uri/ /index.html;
    # ...
}
```

> [!TIP]
> 如果你不再需要 Docker 部署前端，可以跳过此步。

### 3.3 在 Cloudflare Pages 上创建项目

#### 方式一：通过 Cloudflare Dashboard 连接 GitHub

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → 点击 **Create**
3. 选择 **Pages** → **Connect to Git**
4. 授权并选择 GitHub 仓库 `DeepDiagram`
5. 配置构建设置：

| 设置项 | 值 |
|-------|-----|
| **Project name** | `deepdiagram`（决定默认域名 `deepdiagram.pages.dev`） |
| **Production branch** | `main` |
| **Framework preset** | `None` |
| **Root directory (advanced)** | `frontend` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |

#### 方式二：通过 Wrangler CLI 部署

```bash
# 安装 Wrangler
npm install -g wrangler

# 登录
wrangler login

# 在 frontend 目录下构建
cd frontend
npm install
npm run build

# 首次创建项目并部署
wrangler pages deploy dist --project-name deepdiagram

# 后续更新
wrangler pages deploy dist --project-name deepdiagram
```

### 3.4 设置环境变量

在 Cloudflare Pages Dashboard 中：

**Settings** → **Environment variables** → 添加：

| 变量名 | 值 | 环境 |
|--------|-----|------|
| `VITE_API_BASE_URL` | `https://deepdiagram-backend-xxx-as.a.run.app` | Production |
| `VITE_API_BASE_URL` | `（空）` | Preview（可选，Preview 环境使用本地代理） |
| `NODE_VERSION` | `20` | Production & Preview |

> [!IMPORTANT]
> - `VITE_API_BASE_URL` 的值就是第二步部署 Cloud Run 后获得的 URL（**末尾不要加 `/`**）
> - Vite 环境变量必须以 `VITE_` 开头才能在前端代码中访问
> - 设置环境变量后需要**重新触发部署**才会生效

### 3.5 自定义域名（可选）

1. 在 Cloudflare Pages 项目中 → **Custom domains** → **Set up a custom domain**
2. 输入你的域名（例如 `deepd.example.com`）
3. Cloudflare 会自动配置 DNS 和 SSL 证书

### 3.6 验证前端部署

访问 `https://deepdiagram.pages.dev`（或你的自定义域名），应看到 DeepDiagram 前端界面。

- 打开浏览器 DevTools → Network，确认 API 请求发送到了 Cloud Run 的 URL
- 尝试创建一个新对话，验证前后端通信正常

---

## 第四步：验证完整链路

### 4.1 端到端测试清单

- [ ] 访问前端页面，界面正常加载
- [ ] 创建新对话，SSE 流式输出正常
- [ ] 上传文件，文档解析正常
- [ ] 切换/删除对话，会话管理正常
- [ ] AI 配置设置中的 Test 按钮可用
- [ ] 刷新页面后历史记录正常加载

### 4.2 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 前端 API 请求 404 | `VITE_API_BASE_URL` 未设置或值错误 | 检查 Cloudflare Pages 环境变量 |
| CORS 跨域错误 | 后端未允许前端域名 | 修改 `config.py` 中的 `BACKEND_CORS_ORIGINS` |
| 数据库连接失败 | Neon 连接字符串格式错误 | 确认使用 `postgresql+asyncpg://` 前缀和 `?ssl=require` |
| SSE 流中断 | Cloud Run 请求超时 | 确认 `--timeout 300` 设置 |
| 前端路由 404 | 缺少 SPA 回退配置 | 确认 `_redirects` 文件存在 |
| 冷启动慢 | Cloud Run `min-instances=0` | 设为 `1` 避免冷启动（会产生费用） |
| Neon 数据库休眠后首次请求慢 | Free 版 auto-suspend | 升级 Pro 或容忍约 1~3 秒冷启动 |

---

## 第五步：CI/CD 自动化（可选）

### 5.1 Cloudflare Pages 自动部署

只要连接了 GitHub 仓库，每次 push 到 `main` 分支时 Cloudflare Pages 会**自动构建并部署**前端，无需额外配置。

### 5.2 Cloud Run 自动部署

可以修改现有的 `.github/workflows/docker-build-push.yml` 来自动部署后端到 Cloud Run：

```yaml
# 在现有 workflow 的 build-and-push job 后添加：

  deploy-backend:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Deploy to Cloud Run
        uses: google-github-actions/deploy-cloudrun@v2
        with:
          service: deepdiagram-backend
          region: asia-southeast1
          image: asia-southeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/deepdiagram/backend:latest
```

需要在 GitHub 仓库的 **Settings > Secrets** 中添加：

| Secret 名 | 说明 |
|-----------|------|
| `GCP_SA_KEY` | Google Cloud 服务账号的 JSON Key（需有 Cloud Run Admin 权限） |
| `GCP_PROJECT_ID` | Google Cloud 项目 ID |

---

## 附录：代码变更清单

以下是所有需要修改的文件汇总：

| 文件 | 变更 | 必要性 |
|------|------|--------|
| `backend/Dockerfile` | CMD 改为读取 `$PORT` 环境变量 | ✅ 必须 |
| `backend/app/core/config.py` | CORS 添加生产域名（当前有 `*` 可暂不改） | ⚠️ 生产建议 |
| `frontend/vite.config.ts` | `base` 从 `/app` 改为 `/` | ✅ 必须 |
| `frontend/src/lib/api.ts` | 新建，定义 `API_BASE_URL` | ✅ 必须 |
| `frontend/src/store/chatStore.ts` | fetch URL 添加 `API_BASE_URL` 前缀 | ✅ 必须 |
| `frontend/src/components/ChatPanel.tsx` | fetch URL 添加 `API_BASE_URL` 前缀 | ✅ 必须 |
| `frontend/src/components/common/SettingsModal.tsx` | fetch URL 添加 `API_BASE_URL` 前缀 | ✅ 必须 |
| `frontend/public/_redirects` | 新建 SPA 路由回退 | ✅ 必须 |
| `frontend/nginx.conf` | `/app` 路径改为 `/`（仅 Docker 部署需要） | ❌ 仅双栈兼容需要 |
