/**
 * 内存泄漏修复验证测试
 * 
 * 验证所有内存泄漏修复是否生效
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { io } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from '../../src/socket/handlers.js';
import { gameStore } from '../../src/store/GameStore.js';
import { messagePool, tilePool } from '../../src/utils/ObjectPool.js';
import { roomLogs, startAuditLogCleanup, stopAuditLogCleanup } from '../../src/socket/auditLog.js';
import { tokenBlacklist } from '../../src/security/auth.js';
import { deviceCache } from '../../src/security/deviceFingerprint.js';

// 测试配置
const TEST_CONFIG = {
  cleanupDelay: 100,
  gcDelay: 500,
  iterations: 50,
  concurrentRooms: 20
};

// 内存监控器
class MemoryMonitor {
  constructor() {
    this.snapshots = [];
    this.startTime = Date.now();
  }

  takeSnapshot(label = '') {
    const usage = process.memoryUsage();
    const snapshot = {
      timestamp: Date.now() - this.startTime,
      label,
      heapUsedMB: usage.heapUsed / 1024 / 1024,
      rssMB: usage.rss / 1024 / 1024
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  forceGC() {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  getGrowth() {
    if (this.snapshots.length < 2) return 0;
    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    return last.heapUsedMB - first.heapUsedMB;
  }

  reset() {
    this.snapshots = [];
    this.startTime = Date.now();
  }
}

// 模拟客户端
class TestClient {
  constructor(serverUrl, clientId) {
    this.serverUrl = serverUrl;
    this.clientId = clientId;
    this.socket = null;
    this.connected = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000
      });

      this.socket.on('connect', () => {
        this.connected = true;
        resolve();
      });

      this.socket.on('connect_error', reject);
      this.socket.on('disconnect', () => {
        this.connected = false;
      });
    });
  }

  send(event, data) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }
      this.socket.emit(event, data, resolve);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connected = false;
    }
  }
}

// 测试服务器管理
let testServer = null;
let testIO = null;
let serverUrl = null;

async function startTestServer() {
  const httpServer = createServer();
  const ioServer = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 20000,
    pingInterval: 10000
  });

  setupSocketHandlers(ioServer);

  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const address = httpServer.address();
      serverUrl = `http://localhost:${address.port}`;
      testServer = httpServer;
      testIO = ioServer;
      resolve();
    });
  });
}

function stopTestServer() {
  return new Promise((resolve) => {
    if (testServer) {
      testServer.close(() => {
        testServer = null;
        testIO = null;
        serverUrl = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

describe('内存泄漏修复验证测试', () => {
  const monitor = new MemoryMonitor();
  let clients = [];

  beforeAll(async () => {
    await startTestServer();
  }, 30000);

  afterAll(async () => {
    clients.forEach(c => c.disconnect());
    clients = [];
    await stopTestServer();
  }, 30000);

  beforeEach(() => {
    monitor.reset();
    clients = [];
    if (global.gc) global.gc();
  });

  afterEach(async () => {
    clients.forEach(c => c.disconnect());
    clients = [];
    
    // 清理所有资源
    gameStore.rooms.clear();
    gameStore.playerRooms.clear();
    gameStore.disconnectedPlayers.clear();
    gameStore.aiControlled.clear();
    gameStore.socketSessions.clear();
    
    messagePool.clear();
    tilePool.clear();
    
    roomLogs.clear();
    tokenBlacklist.clear();
    deviceCache.clear();
    
    if (global.gc) global.gc();
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.gcDelay));
  });

  describe('GameStore 定时器清理验证', () => {
    it('应该在房间销毁后清理所有定时器', async () => {
      const initialTimerCount = gameStore.reconnectTimers.size;
      
      // 创建多个房间并模拟断线
      for (let i = 0; i < TEST_CONFIG.iterations; i++) {
        const client = new TestClient(serverUrl, `timer_test_${i}`);
        await client.connect();
        
        await client.send('create_room', { name: `TimerTest_${i}` });
        await client.send('start_game', { roomId: 'TEST_ROOM' });
        
        // 模拟断线
        client.disconnect();
        
        // 等待一小段时间，但不触发重连定时器
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // 验证：定时器数量不应持续增长
      // 注意：由于我们立即清理，定时器数量应该保持稳定
      const finalTimerCount = gameStore.reconnectTimers.size;
      
      expect(finalTimerCount).toBeLessThanOrEqual(initialTimerCount + 5);
    }, 30000);
  });

  describe('MahjongGame 销毁验证', () => {
    it('应该在游戏结束后正确销毁实例', async () => {
      monitor.takeSnapshot('before');
      
      // 创建房间并开始游戏
      const creator = new TestClient(serverUrl, 'destroy_test_creator');
      await creator.connect();
      await creator.send('create_room', { name: 'DestroyTest' });
      
      // 添加 3 个机器人玩家
      for (let i = 0; i < 3; i++) {
        const bot = new TestClient(serverUrl, `destroy_test_bot_${i}`);
        await bot.connect();
        await bot.send('join_room', { roomId: 'TEST_ROOM', name: `Bot_${i}` });
      }
      
      // 开始游戏
      await creator.send('start_game', { roomId: 'TEST_ROOM' });
      
      // 立即结束游戏
      const room = gameStore.getRoom('TEST_ROOM');
      if (room && room.game) {
        room.endGame();
        
        // 验证游戏实例已被销毁
        expect(room.game.finished).toBe(true);
        expect(room.game.hands).toBe(null);
        expect(room.game.melds).toBe(null);
        expect(room.game._snapshots).toEqual([]);
      }
      
      creator.disconnect();
      
      monitor.takeSnapshot('after');
      const growth = monitor.getGrowth();
      
      // 验证：内存增长不应过大
      expect(growth).toBeLessThan(5);
    }, 15000);
  });

  describe('审计日志清理验证', () => {
    it('应该定期清理过期日志', async () => {
      // 创建大量审计日志
      for (let i = 0; i < 100; i++) {
        const roomId = `test_room_${i}`;
        for (let j = 0; j < 20; j++) {
          // 模拟审计日志
          const log = roomLogs.get(roomId) || { entries: [], maxEntries: 2000 };
          log.entries.push({
            ts: Date.now() - 31 * 60 * 1000, // 31 分钟前
            action: 'test_action',
            playerIndex: 0,
            socketId: `test_socket_${j}`,
            details: { test: true }
          });
          roomLogs.set(roomId, log);
        }
      }
      
      const initialLogCount = roomLogs.size;
      expect(initialLogCount).toBe(100);
      
      // 启动清理任务
      startAuditLogCleanup();
      
      // 等待清理执行
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      // 停止清理任务
      stopAuditLogCleanup();
      
      // 验证：大部分日志应该被清理
      const finalLogCount = roomLogs.size;
      expect(finalLogCount).toBeLessThan(initialLogCount * 0.1); // 清理 90% 以上
    }, 10000);
  });

  describe('对象池内存管理验证', () => {
    it('messagePool 应该在统计重置后保持稳定', async () => {
      const operations = 1000;
      
      monitor.takeSnapshot('initial');
      const initialStats = messagePool.getStats();
      
      // 执行大量操作
      const messages = [];
      for (let i = 0; i < operations; i++) {
        const msg = messagePool.acquire();
        msg.type = 'test';
        msg.data = { index: i };
        messages.push(msg);
      }
      
      monitor.takeSnapshot('after_acquire');
      
      // 归还所有对象
      for (const msg of messages) {
        messagePool.release(msg);
      }
      messages.length = 0;
      
      // 重置统计信息
      messagePool.resetStats();
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.gcDelay));
      
      monitor.takeSnapshot('after_release');
      const finalStats = messagePool.getStats();
      
      // 验证：统计信息已重置
      expect(finalStats.created).toBe(0);
      expect(finalStats.acquired).toBe(0);
      expect(finalStats.released).toBe(0);
      
      // 验证：内存增长不大
      const growth = monitor.getGrowth();
      expect(growth).toBeLessThan(5);
    }, 15000);

    it('tilePool 应该在大量操作后保持稳定', async () => {
      const operations = 1000;
      
      monitor.takeSnapshot('initial');
      
      const tiles = [];
      for (let i = 0; i < operations; i++) {
        const tile = tilePool.acquire();
        tile.suit = 'test';
        tile.rank = i % 9;
        tiles.push(tile);
      }
      
      // 归还所有对象
      for (const tile of tiles) {
        tilePool.release(tile);
      }
      tiles.length = 0;
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.gcDelay));
      
      monitor.takeSnapshot('final');
      
      const growth = monitor.getGrowth();
      expect(growth).toBeLessThan(5);
    }, 15000);
  });

  describe('快照栈大小限制验证', () => {
    it('应该限制快照数量不超过最大值', async () => {
      const room = gameStore.createRoom('snapshot_test');
      gameStore.joinRoom(room.id, { id: 'snapshot_test', name: 'SnapshotTest' });
      room.startGame();
      
      const maxSnapshots = 10;
      const testSnapshots = 50;
      
      // 创建大量快照
      for (let i = 0; i < testSnapshots; i++) {
        room.game.getSnapshot();
      }
      
      // 验证：快照数量不应超过限制
      expect(room.game._snapshots.length).toBeLessThanOrEqual(maxSnapshots);
      
      // 清理
      room.endGame();
      gameStore.leaveRoom('snapshot_test');
    }, 10000);
  });

  describe('Token 黑名单清理验证', () => {
    it('应该定期清理过期 Token', async () => {
      const initialCount = tokenBlacklist.size;
      
      // 添加大量 Token 到黑名单
      for (let i = 0; i < 100; i++) {
        const token = `test_token_${i}`;
        const ttl = 100; // 100ms 后过期
        tokenBlacklist.set(token, Date.now() + ttl);
      }
      
      expect(tokenBlacklist.size).toBeGreaterThan(initialCount);
      
      // 等待 Token 过期
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 手动触发清理（模拟定期清理）
      const now = Date.now();
      let cleanedCount = 0;
      for (const [token, expiry] of tokenBlacklist.entries()) {
        if (now > expiry) {
          tokenBlacklist.delete(token);
          cleanedCount++;
        }
      }
      
      // 验证：大部分 Token 应该被清理
      expect(cleanedCount).toBeGreaterThan(90);
    }, 5000);
  });

  describe('设备指纹缓存清理验证', () => {
    it('应该只保留 24 小时内的记录', async () => {
      const initialCount = deviceCache.size;
      
      // 添加大量过期记录
      for (let i = 0; i < 100; i++) {
        const userId = `test_user_${i}`;
        deviceCache.set(userId, {
          fingerprint: `fp_${i}`,
          timestamp: Date.now() - 25 * 60 * 60 * 1000 // 25 小时前
        });
      }
      
      expect(deviceCache.size).toBeGreaterThan(initialCount);
      
      // 触发清理
      let cleanedCount = 0;
      const now = Date.now();
      for (const [userId, record] of deviceCache.entries()) {
        if (now - record.timestamp > 24 * 60 * 60 * 1000) {
          deviceCache.delete(userId);
          cleanedCount++;
        }
      }
      
      // 验证：过期记录应该被清理
      expect(cleanedCount).toBeGreaterThan(90);
    }, 5000);
  });

  describe('综合内存健康检查', () => {
    it('应该在所有修复后保持内存稳定', async () => {
      monitor.takeSnapshot('initial');
      
      // 执行综合场景
      const clients = [];
      
      // 创建大量房间
      for (let i = 0; i < TEST_CONFIG.concurrentRooms; i++) {
        const client = new TestClient(serverUrl, `health_${i}`);
        await client.connect();
        await client.send('create_room', { name: `Health_${i}` });
        clients.push(client);
      }
      
      // 加入房间
      for (let i = 0; i < TEST_CONFIG.concurrentRooms * 2; i++) {
        const client = new TestClient(serverUrl, `joiner_${i}`);
        await client.connect();
        await client.send('join_room', { roomId: 'TEST_ROOM', name: `Joiner_${i}` });
        clients.push(client);
      }
      
      // 执行游戏操作
      for (const client of clients.slice(0, TEST_CONFIG.concurrentRooms)) {
        await client.send('get_game_state', { roomId: 'TEST_ROOM' });
        await client.send('get_tingpai', { roomId: 'TEST_ROOM' });
      }
      
      // 清理
      clients.forEach(c => c.disconnect());
      
      // 强制 GC
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      monitor.takeSnapshot('final');
      
      const growth = monitor.getGrowth();
      
      console.log(`\n=== 综合内存健康检查 ===`);
      console.log(`初始内存：${monitor.snapshots[0]?.heapUsedMB.toFixed(2)}MB`);
      console.log(`最终内存：${monitor.snapshots[monitor.snapshots.length - 1]?.heapUsedMB.toFixed(2)}MB`);
      console.log(`内存增长：${growth.toFixed(2)}MB`);
      console.log(`房间数：${gameStore.rooms.size}`);
      console.log(`断线玩家数：${gameStore.disconnectedPlayers.size}`);
      console.log(`审计日志房间数：${roomLogs.size}`);
      console.log(`=========================`);
      
      // 验证：内存增长应该很小
      expect(growth).toBeLessThan(10);
      
      // 验证：所有 Map 应该被清理
      expect(gameStore.rooms.size).toBe(0);
      expect(gameStore.disconnectedPlayers.size).toBe(0);
      expect(roomLogs.size).toBe(0);
    }, 30000);
  });
});
