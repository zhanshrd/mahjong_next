# 麻将 Next - 现代网页版麻将游戏

基于 Vue 3 和 Node.js 的实时多人在线麻将游戏，支持花牌、赖子、扎鸟等高级规则。

## 🎮 功能特性

### 核心玩法
- **经典麻将规则**：支持 4 人麻将，完整胡牌牌型检测
- **花牌系统**：自动替换花牌，花牌计分加成
- **赖子牌**：万能牌功能，支持癞子胡牌
- **扎鸟玩法**：自摸时触发扎鸟，翻倍计分

### 技术亮点
- **实时对战**：基于 Socket.IO 的低延迟实时通信
- **PWA 支持**：可安装到桌面，离线可用
- **响应式设计**：完美适配移动端和桌面端
- **状态管理**：Pinia 实现的游戏状态管理
- **音效系统**：完整的游戏音效支持

## 🛠️ 技术栈

### 前端
- **框架**：Vue 3 + Vite
- **状态管理**：Pinia
- **路由**：Vue Router
- **构建工具**：Vite
- **PWA**：Service Worker + Web App Manifest

### 后端
- **运行时**：Node.js
- **框架**：Express
- **实时通信**：Socket.IO
- **测试框架**：Vitest
- **容器化**：Docker

## 📦 项目结构

```
mahjong_next/
├── frontend/              # 前端项目
│   ├── src/
│   │   ├── pages/        # 页面组件
│   │   │   ├── index/    # 首页
│   │   │   ├── room/     # 房间页面
│   │   │   ├── game/     # 游戏页面
│   │   │   └── scoreboard/ # 记分板
│   │   ├── components/   # 可复用组件
│   │   ├── store/        # Pinia 状态管理
│   │   ├── utils/        # 工具函数
│   │   └── composables/  # 组合式函数
│   ├── public/           # 静态资源
│   ├── package.json
│   └── vite.config.js
├── backend/              # 后端项目
│   ├── src/
│   │   ├── game/         # 游戏核心逻辑
│   │   │   ├── MahjongGame.js    # 游戏主逻辑
│   │   │   ├── AdvancedRules.js  # 高级规则
│   │   │   ├── MatchSession.js   # 比赛会话
│   │   │   ├── TileSet.js        # 牌组管理
│   │   │   ├── WinChecker.js     # 胡牌检测
│   │   │   └── Scorer.js         # 计分系统
│   │   ├── socket/       # Socket 通信
│   │   └── store/        # 数据存储
│   ├── tests/            # 单元测试
│   ├── package.json
│   └── vitest.config.js
└── README.md
```

## 🚀 快速开始

### 环境要求
- Node.js >= 18.x
- npm >= 9.x

### 安装后端

```bash
cd backend
npm install

# 开发模式
npm run dev

# 运行测试
npm test
```

后端服务将在 `http://localhost:3000` 启动

### 安装前端

```bash
cd frontend
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
```

前端服务将在 `http://localhost:5173` 启动

## 🎯 游戏规则

### 基本规则
- 4 人游戏，每人 13 张牌
- 支持吃、碰、杠、胡
- 自摸：3 家付分
- 点炮：1 家付分

### 花牌规则
- 花牌自动替换，不计入手牌
- 集齐 4 张花牌有额外加分

### 赖子规则
- 赖子可替代任意牌
- 支持癞子胡特殊牌型

### 扎鸟规则
- 自摸时触发扎鸟
- 根据扎鸟结果翻倍计分
- 最高可达 4 倍

## 🧪 测试

后端包含完整的测试套件：

```bash
cd backend
npm test
```

测试覆盖：
- 核心游戏逻辑
- 高级规则实现
- Socket 通信
- 计分系统
- 胡牌检测

## 📱 PWA 安装

前端支持 PWA，可以安装到桌面：

1. 使用 Chrome 或 Edge 浏览器访问
2. 点击地址栏的安装图标
3. 或选择菜单 > 安装应用

## 🌐 部署

### Docker 部署

```bash
# 构建镜像
docker build -t mahjong-next ./backend

# 运行容器
docker run -p 3000:3000 mahjong-next
```

### Nginx 配置

前端项目包含 `nginx.conf` 配置文件，支持：
- 静态资源缓存
- Gzip 压缩
- HTTPS 重定向
- PWA 支持

## 📊 项目统计

- **前端文件**：39 个
- **后端文件**：23 个
- **测试用例**：95+
- **代码行数**：8,000+

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 👨‍💻 作者

zhanshrd

---

**在线体验**：[GitHub](https://github.com/zhanshrd/mahjong_next)
