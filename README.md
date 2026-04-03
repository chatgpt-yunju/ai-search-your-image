# AI Search Your Image

一个基于 AI 的智能图床系统，**默认使用 AI 智能搜索**，支持**以图搜图**、**中文语义搜索**、**上传密码保护**。

🌐 Demo: [demo001.opensora2.cn](https://demo001.opensora2.cn)

---

## 核心功能

### 🤖 AI 智能搜索（默认）
**无需关键词精确匹配**，用自然语言描述你想找的图片即可：

上传图片后，后台自动调用视觉大模型（llama-3.2-90b-vision-instruct）并行分析文件名、大小、标签、描述，理解用户意图：

- 搜"适合做电脑壁纸的高清山脉图片" → 返回高质量山脉、风景图
- 搜"夜晚的城市灯光" → 返回夜景、 street lights 相关图片
- 搜"小猫咪" → 返回所有猫类图片（不限于"猫"字标签）

**两种搜索模式：**
- **AI 搜索（默认）**：自然语言智能理解，跨越文件名、标签、描述的隔阂
- **普通搜索**：传统关键词匹配（标签、描述、文件名）

### 🖼️ 以图搜图
基于感知哈希（pHash）+ 汉明距离算法：
1. 图片缩放至 32×32 灰度图
2. 计算像素均值，生成 1024 位二进制哈希指纹
3. 与库中所有图片对比汉明距离（< 200 视为相似）
4. 按相似度排序返回前 20 条

### 🔒 删除密码保护
上传时可设置删除密码（SHA-256 哈希存储），删除时需验证，无密码图片可直接删除。

### ⚡ 自动压缩
上传后自动转换为 WebP 格式（质量 85），缩略图 300×300（质量 75）。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 + Vite |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 图片处理 | Sharp |
| AI 分析 | llama-3.2-90b-vision-instruct |
| 反向代理 | Nginx |
| 进程管理 | PM2 |

---

## 快速开始

### 环境要求
- Node.js 18+
- PM2

### 安装

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd backend && npm install
```

### 配置

编辑 `backend/ecosystem.config.cjs`：

```js
env: {
  PORT: "3022",
  STORAGE_PATH: "/your/storage/path",   // 图片存储目录
  BASE_URL: "https://your-domain.com",  // 公网访问地址
  INTERNAL_API_SECRET: "sk-..."         // AI API Key（必填，申请地址：https://api.yunjunet.cn/console.html）
}
```

### 启动

```bash
# 构建前端
npm run build

# 启动后端（含前端静态服务）
cd backend && pm2 start ecosystem.config.cjs
```

---

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/img/upload` | 上传图片（支持多文件，可附 `password` 字段） |
| GET | `/api/img/list` | 图片列表（`page`, `limit`, `tag` 参数） |
| GET | `/api/img/search?q=关键词` | 普通关键词搜索（标签/描述/文件名） |
| GET | `/api/img/ai-search?q=自然语言` | **AI 智能搜索（默认）** - 理解用户意图，跨越关键词隔阂 |
| POST | `/api/img/similar` | 以图搜图（上传图片文件） |
| GET | `/api/img/tags` | 获取所有标签及频次 |
| DELETE | `/api/img/:id` | 删除图片（有密码时需传 `{"password":"..."}` ） |
| GET | `/api/img/stats` | 统计（总数、总大小） |
| POST | `/api/img/reanalyze` | 重新 AI 分析无标签图片 |

---

## 目录结构

```
├── src/               # Vue 3 前端源码
│   └── App.vue
├── dist/              # 前端构建产物（nginx 直接服务）
├── backend/
│   ├── server.js      # Express 入口（含前端静态服务）
│   └── src/
│       ├── routes/image.js   # 所有图片接口
│       ├── db.js             # SQLite 初始化
│       └── storage.js        # 文件路径管理
└── ecosystem.config.cjs      # PM2 配置
```

---

## License

MIT
