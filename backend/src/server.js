import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupSocketHandlers } from './socket/handlers.js';
import { getMetrics, activeGames, onlinePlayers, websocketConnections, totalRooms } from './monitoring/metrics.js';
import logger from './monitoring/logger.js';
import { authMiddleware } from './security/auth.js';
import { generateDeviceFingerprint } from './security/deviceFingerprint.js';
import { startAuditLogCleanup } from './socket/auditLog.js';

dotenv.config();

const app = express();
const server = createServer(app);
// Setup Socket.IO with authentication middleware
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  // 心跳机制优化：10 秒 ping, 20 秒 timeout（更快检测断线）
  pingTimeout: 20000,
  pingInterval: 10000,
  // 断线重连配置
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000
  },
  // 消息压缩优化
  perMessageDeflate: {
    threshold: 1024,
    zlibDeflateOptions: {
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    }
  },
  // 传输优化
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  httpCompression: {
    threshold: 1024
  }
});

// 应用认证中间件
io.use(authMiddleware);

// Middleware
app.use(express.json());

// 健康检查端点（兼容旧标准）
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

// Kubernetes 标准健康检查端点
// 存活探针 - 检查服务是否存活
app.get('/livez', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: Date.now() });
});

// 就绪探针 - 检查服务是否就绪（依赖健康）
app.get('/readyz', async (req, res) => {
  // 检查数据库连接（如果有）
  // 检查 Redis 连接（如果有）
  // 检查 WebSocket 连接数
  const clientCount = io.engine.clientsCount;
  const maxClients = 10000;
  
  if (clientCount >= maxClients) {
    res.status(503).json({ 
      status: 'not ready', 
      reason: 'MAX_CLIENTS_REACHED' 
    });
    return;
  }
  
  res.status(200).json({ 
    status: 'ready',
    checks: {
      websocket: clientCount < maxClients
    }
  });
});

// 性能指标端点
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(await getMetrics());
});

// 游戏统计端点
app.get('/api/stats', (req, res) => {
  res.json({
    activeGames: activeGames.value,
    onlinePlayers: onlinePlayers.value,
    websocketConnections: websocketConnections.value,
    totalRooms: totalRooms.value,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: Date.now()
  });
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, '../../frontend-dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

if (existsSync(frontendIndexPath)) {
  app.use(express.static(frontendDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }

    res.sendFile(frontendIndexPath);
  });
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Mahjong server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Start audit log cleanup to prevent memory leaks
startAuditLogCleanup();
console.log('[Server] Audit log cleanup started (interval: 5 minutes, max age: 30 minutes)');

export { app, io, server };
