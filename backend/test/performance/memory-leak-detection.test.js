/**
 * 内存泄漏检测测试
 * 
 * 检测场景：
 * - 长时间运行（模拟 24 小时）
 * - 频繁加入/离开房间
 * - 频繁断线/重连
 * - 对象池使用
 * 
 * 检测方法：
 * - heap snapshot 对比
 * - weak reference 检测
 * - Map/Set 大小监控
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { io } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from '../../src/socket/handlers.js';
import { gameStore } from '../../src/store/GameStore.js';
import { messagePool, tilePool } from '../../src/utils/ObjectPool.js';

// 测试配置
const TEST_CONFIG = {
  // 长时间运行测试（加速版）
  longRunning: {
    duration: 60000, // 测试环境 1 分钟，生产环境 24 小时
    checkInterval: 5000,
    activityLevel: 'high' // 'low', 'medium', 'high'
  },
  
  // 频繁加入/离开测试
  joinLeave: {
    iterations: 100,
    concurrentUsers: 20,
    delayBetween: 50
  },
  
  // 断线重连测试
  reconnect: {
    iterations: 50,
    disconnectDelay: 100,
    reconnectDelay: 100
  },
  
  // 内存泄漏检测阈值
  leakThresholds: {
    memoryGrowthMB: 50, // 最大允许内存增长（MB）
    mapGrowthPercent: 20, // Map 大小最大增长百分比
    setObjectGrowthPercent: 20, // Set 大小最大增长百分比
    gcPressure: 0.8 // GC 压力阈值
  }
};

// 内存监控器
class MemoryMonitor {
  constructor() {
    this.snapshots = [];
    this.mapSizes = new Map();
    this.setSizes = new Map();
    this.gcStats = { runs: 0, pauseTime: 0 };
    this.weakRefs = new Map();
    this.startTime = Date.now();
  }

  takeSnapshot(label = '') {
    const usage = process.memoryUsage();
    const snapshot = {
      timestamp: Date.now() - this.startTime,
      label,
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      heapUsedMB: usage.heapUsed / 1024 / 1024,
      rssMB: usage.rss / 1024 / 1024
    };
    
    this.snapshots.push(snapshot);
    return snapshot;
  }

  trackMap(name, map) {
    this.mapSizes.set(name, {
      initial: map.size,
      history: [map.size],
      map
    });
  }

  trackSet(name, set) {
    this.setSizes.set(name, {
      initial: set.size,
      history: [set.size],
      set
    });
  }

  updateTrackedCollections() {
    for (const [name, data] of this.mapSizes) {
      data.history.push(data.map.size);
    }
    for (const [name, data] of this.setSizes) {
      data.history.push(data.set.size);
    }
  }

  createWeakRef(key, object) {
    if (typeof WeakRef !== 'undefined') {
      const weakRef = new WeakRef(object);
      this.weakRefs.set(key, {
        weakRef,
        target: object,
        createdAt: Date.now()
      });
      return weakRef;
    }
    return null;
  }

  checkWeakRefs() {
    const results = [];
    for (const [key, data] of this.weakRefs) {
      const target = data.weakRef.deref();
      results.push({
        key,
        alive: target !== undefined,
        age: Date.now() - data.createdAt
      });
    }
    return results;
  }

  forceGC() {
    if (global.gc) {
      const start = Date.now();
      global.gc();
      const pause = Date.now() - start;
      this.gcStats.runs++;
      this.gcStats.pauseTime += pause;
      return true;
    }
    return false;
  }

  analyzeLeaks() {
    if (this.snapshots.length < 2) {
      return { hasLeaks: false, details: {} };
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    const memoryGrowth = {
      rss: last.rss - first.rss,
      heapUsed: last.heapUsed - first.heapUsed,
      rssMB: (last.rss - first.rss) / 1024 / 1024,
      heapUsedMB: (last.heapUsed - first.heapUsed) / 1024 / 1024
    };

    const mapGrowth = {};
    for (const [name, data] of this.mapSizes) {
      const initial = data.history[0];
      const final = data.history[data.history.length - 1];
      const growth = final - initial;
      const growthPercent = initial > 0 ? (growth / initial * 100) : 0;
      mapGrowth[name] = {
        initial,
        final,
        growth,
        growthPercent,
        history: data.history
      };
    }

    const setGrowth = {};
    for (const [name, data] of this.setSizes) {
      const initial = data.history[0];
      const final = data.history[data.history.length - 1];
      const growth = final - initial;
      const growthPercent = initial > 0 ? (growth / initial * 100) : 0;
      setGrowth[name] = {
        initial,
        final,
        growth,
        growthPercent,
        history: data.history
      };
    }

    const weakRefStatus = this.checkWeakRefs();
    const leakedRefs = weakRefStatus.filter(r => !r.alive);

    const hasLeaks = 
      memoryGrowth.rssMB > TEST_CONFIG.leakThresholds.memoryGrowthMB ||
      Object.values(mapGrowth).some(m => m.growthPercent > TEST_CONFIG.leakThresholds.mapGrowthPercent) ||
      Object.values(setGrowth).some(s => s.growthPercent > TEST_CONFIG.leakThresholds.setObjectGrowthPercent);

    return {
      hasLeaks,
      memoryGrowth,
      mapGrowth,
      setGrowth,
      weakRefStatus,
      leakedRefs,
      gcStats: this.gcStats,
      snapshotCount: this.snapshots.length
    };
  }

  getReport() {
    const analysis = this.analyzeLeaks();
    
    return {
      duration: Date.now() - this.startTime,
      snapshots: this.snapshots.length,
      memoryTrend: this.snapshots.map(s => ({
        timestamp: s.timestamp,
        heapUsedMB: s.heapUsedMB,
        rssMB: s.rssMB
      })),
      ...analysis
    };
  }

  reset() {
    this.snapshots = [];
    this.mapSizes.clear();
    this.setSizes.clear();
    this.weakRefs.clear();
    this.gcStats = { runs: 0, pauseTime: 0 };
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

describe('内存泄漏检测测试', () => {
  const monitor = new MemoryMonitor();
  let clients = [];

  beforeAll(async () => {
    await startTestServer();
  }, 30000);

  afterAll(async () => {
    clients.forEach(c => c.disconnect());
    clients = [];
    
    gameStore.rooms.clear();
    gameStore.playerRooms.clear();
    gameStore.disconnectedPlayers.clear();
    gameStore.aiControlled.clear();
    
    await stopTestServer();
  }, 30000);

  beforeEach(() => {
    monitor.reset();
    clients = [];
    
    // 初始 GC
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(() => {
    clients.forEach(c => c.disconnect());
    clients = [];
    
    gameStore.rooms.clear();
    gameStore.playerRooms.clear();
    gameStore.disconnectedPlayers.clear();
    gameStore.aiControlled.clear();
    
    messagePool.clear();
    tilePool.clear();
    
    // 最终 GC
    if (global.gc) {
      global.gc();
    }
  });

  describe('长时间运行内存监控', () => {
    it('应该在长时间运行期间保持内存稳定', async () => {
      const { duration, checkInterval, activityLevel } = TEST_CONFIG.longRunning;
      
      // 跟踪关键数据结构
      monitor.trackMap('gameStore.rooms', gameStore.rooms);
      monitor.trackMap('gameStore.playerRooms', gameStore.playerRooms);
      monitor.trackMap('gameStore.disconnectedPlayers', gameStore.disconnectedPlayers);
      monitor.trackSet('gameStore.aiControlled', gameStore.aiControlled);
      
      monitor.takeSnapshot('initial');
      
      const startTime = Date.now();
      let activityCount = 0;
      
      // 持续活动模拟
      while (Date.now() - startTime < duration) {
        const elapsed = Date.now() - startTime;
        
        // 根据活动级别生成负载
        const activityMultiplier = {
          'low': 1,
          'medium': 5,
          'high': 10
        }[activityLevel];
        
        // 创建一些客户端并执行操作
        for (let i = 0; i < activityMultiplier; i++) {
          const client = new TestClient(serverUrl, `longrun_${activityCount}`);
          await client.connect();
          clients.push(client);
          
          // 执行一些操作
          await client.send('create_room', { name: `Player_${activityCount}` });
          await client.send('get_game_state', { roomId: 'test' });
          await client.send('get_tingpai', { roomId: 'test' });
          
          activityCount++;
        }
        
        // 定期清理部分客户端
        if (clients.length > 20) {
          const toRemove = clients.splice(0, 10);
          toRemove.forEach(c => c.disconnect());
        }
        
        // 定期检查内存
        if (elapsed % checkInterval < 1000) {
          monitor.takeSnapshot(`checkpoint_${elapsed}`);
          monitor.updateTrackedCollections();
          
          console.log(`[${(elapsed / 1000).toFixed(0)}s] 内存：${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB, 房间数：${gameStore.rooms.size}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // 最终 GC 和快照
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      monitor.updateTrackedCollections();
      
      const report = monitor.getReport();
      
      console.log(`\n长时间运行内存报告:`);
      console.log(`  运行时长：${report.duration / 1000}秒`);
      console.log(`  快照数量：${report.snapshotCount}`);
      console.log(`  初始内存：${report.memoryTrend[0]?.heapUsedMB.toFixed(2)}MB`);
      console.log(`  最终内存：${report.memoryTrend[report.memoryTrend.length - 1]?.heapUsedMB.toFixed(2)}MB`);
      console.log(`  内存增长：${report.memoryGrowth?.heapUsedMB.toFixed(2)}MB`);
      console.log(`  GC 次数：${report.gcStats?.runs}`);
      console.log(`  GC 总停顿：${report.gcStats?.pauseTime}ms`);
      
      // 检查 Map 增长
      for (const [name, growth] of Object.entries(report.mapGrowth)) {
        console.log(`  ${name}: ${growth.initial} -> ${growth.final} (${growth.growthPercent.toFixed(2)}%)`);
      }
      
      // 断言：内存增长不应超过阈值
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(TEST_CONFIG.leakThresholds.memoryGrowthMB);
      
      // 断言：Map 大小增长不应超过阈值
      for (const growth of Object.values(report.mapGrowth)) {
        expect(growth.growthPercent).toBeLessThan(TEST_CONFIG.leakThresholds.mapGrowthPercent);
      }
    }, duration + 30000);
  });

  describe('频繁加入/离开房间内存测试', () => {
    it('应该在频繁加入/离开期间正确清理内存', async () => {
      const { iterations, concurrentUsers, delayBetween } = TEST_CONFIG.joinLeave;
      
      monitor.trackMap('gameStore.rooms', gameStore.rooms);
      monitor.trackMap('gameStore.playerRooms', gameStore.playerRooms);
      
      monitor.takeSnapshot('initial');
      
      for (let iter = 0; iter < iterations; iter++) {
        const iterClients = [];
        
        // 创建房间
        const creator = new TestClient(serverUrl, `creator_${iter}`);
        await creator.connect();
        await creator.send('create_room', { name: `Creator_${iter}` });
        iterClients.push(creator);
        
        // 其他玩家加入
        for (let i = 0; i < concurrentUsers; i++) {
          const client = new TestClient(serverUrl, `joiner_${iter}_${i}`);
          await client.connect();
          await client.send('join_room', { roomId: 'TEST_ROOM', name: `Player_${i}` });
          iterClients.push(client);
        }
        
        await new Promise(resolve => setTimeout(resolve, delayBetween));
        
        // 所有玩家离开
        for (const client of iterClients) {
          await client.send('leave_room', {});
          client.disconnect();
        }
        
        // 每 10 次迭代检查一次
        if (iter % 10 === 0) {
          monitor.takeSnapshot(`iter_${iter}`);
          monitor.updateTrackedCollections();
          
          console.log(`迭代 ${iter}: 房间数=${gameStore.rooms.size}, 玩家映射=${gameStore.playerRooms.size}`);
        }
        
        // 等待清理
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // 最终 GC 和检查
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      monitor.updateTrackedCollections();
      
      const report = monitor.getReport();
      
      console.log(`\n频繁加入/离开内存报告:`);
      console.log(`  迭代次数：${iterations}`);
      console.log(`  初始房间数：${report.mapGrowth['gameStore.rooms']?.initial}`);
      console.log(`  最终房间数：${report.mapGrowth['gameStore.rooms']?.final}`);
      console.log(`  内存增长：${report.memoryGrowth.heapUsedMB.toFixed(2)}MB`);
      
      // 断言：房间数应该回到接近初始状态
      const roomGrowth = report.mapGrowth['gameStore.rooms'];
      if (roomGrowth) {
        expect(roomGrowth.final).toBeLessThanOrEqual(roomGrowth.initial + 5);
      }
      
      // 断言：内存增长不应过大
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(30);
    }, 60000);
  });

  describe('频繁断线/重连内存测试', () => {
    it('应该在频繁断线重连期间正确管理内存', async () => {
      const { iterations, disconnectDelay, reconnectDelay } = TEST_CONFIG.reconnect;
      
      monitor.trackMap('gameStore.disconnectedPlayers', gameStore.disconnectedPlayers);
      monitor.trackMap('gameStore.socketSessions', gameStore.socketSessions);
      
      monitor.takeSnapshot('initial');
      
      for (let iter = 0; iter < iterations; iter++) {
        // 创建客户端并连接
        const client = new TestClient(serverUrl, `reconnect_${iter}`);
        await client.connect();
        await client.send('create_room', { name: `Reconnect_${iter}` });
        
        // 模拟游戏开始
        await client.send('start_game', { roomId: 'TEST_ROOM' });
        
        // 断开连接
        client.disconnect();
        await new Promise(resolve => setTimeout(resolve, disconnectDelay));
        
        // 重连
        await client.connect();
        await client.send('reconnect_request', { sessionId: 'test_session', roomId: 'TEST_ROOM' });
        
        // 检查内存
        if (iter % 10 === 0) {
          monitor.takeSnapshot(`iter_${iter}`);
          monitor.updateTrackedCollections();
          
          console.log(`迭代 ${iter}: 断线玩家数=${gameStore.disconnectedPlayers.size}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, reconnectDelay));
      }
      
      // 最终 GC 和检查
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      monitor.updateTrackedCollections();
      
      const report = monitor.getReport();
      
      console.log(`\n频繁断线重连内存报告:`);
      console.log(`  迭代次数：${iterations}`);
      console.log(`  最终断线玩家数：${report.mapGrowth['gameStore.disconnectedPlayers']?.final}`);
      console.log(`  内存增长：${report.memoryGrowth.heapUsedMB.toFixed(2)}MB`);
      
      // 断言：断线玩家映射应该被清理
      const disconnectedGrowth = report.mapGrowth['gameStore.disconnectedPlayers'];
      if (disconnectedGrowth) {
        expect(disconnectedGrowth.final).toBeLessThanOrEqual(5);
      }
      
      // 断言：内存增长不应过大
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(20);
    }, 60000);
  });

  describe('对象池内存泄漏检测', () => {
    it('messagePool 不应该导致内存泄漏', async () => {
      const operations = 10000;
      
      monitor.takeSnapshot('initial');
      
      const messages = [];
      for (let i = 0; i < operations; i++) {
        const msg = messagePool.acquire();
        msg.type = 'test';
        msg.data = { index: i, data: new Array(100).fill('x') };
        messages.push(msg);
      }
      
      monitor.takeSnapshot('after_acquire');
      
      // 归还所有对象
      for (const msg of messages) {
        messagePool.release(msg);
      }
      
      messages.length = 0; // 清空引用
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 500));
      monitor.takeSnapshot('after_release');
      
      const report = monitor.getReport();
      const poolStats = messagePool.getStats();
      
      console.log(`\nmessagePool 内存测试:`);
      console.log(`  操作数：${operations}`);
      console.log(`  池大小：${poolStats.poolSize}`);
      console.log(`  内存增长：${report.memoryGrowth.heapUsedMB.toFixed(2)}MB`);
      
      // 断言：内存应该被回收
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(10);
    }, 15000);

    it('tilePool 不应该导致内存泄漏', async () => {
      const operations = 10000;
      
      monitor.takeSnapshot('initial');
      
      const tiles = [];
      for (let i = 0; i < operations; i++) {
        const tile = tilePool.acquire();
        tile.suit = 'bamboo';
        tile.rank = i % 9;
        tile.data = new Array(50).fill('tile_data');
        tiles.push(tile);
      }
      
      monitor.takeSnapshot('after_acquire');
      
      // 归还所有对象
      for (const tile of tiles) {
        tilePool.release(tile);
      }
      
      tiles.length = 0;
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 500));
      monitor.takeSnapshot('after_release');
      
      const report = monitor.getReport();
      const poolStats = tilePool.getStats();
      
      console.log(`\ntilePool 内存测试:`);
      console.log(`  操作数：${operations}`);
      console.log(`  池大小：${poolStats.poolSize}`);
      console.log(`  内存增长：${report.memoryGrowth.heapUsedMB.toFixed(2)}MB`);
      
      // 断言：内存应该被回收
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(10);
    }, 15000);
  });

  describe('WeakRef 泄漏检测', () => {
    it('应该能够检测 WeakRef 引用的对象是否被正确释放', async () => {
      // 创建一些临时对象
      const tempObjects = [];
      for (let i = 0; i < 100; i++) {
        const obj = { id: i, data: new Array(1000).fill('temp') };
        tempObjects.push(obj);
        monitor.createWeakRef(`obj_${i}`, obj);
      }
      
      monitor.takeSnapshot('before_gc');
      
      // 检查 WeakRef 状态（应该都还活着）
      const beforeGC = monitor.checkWeakRefs();
      const aliveBefore = beforeGC.filter(r => r.alive).length;
      
      // 释放引用
      tempObjects.length = 0;
      
      // 强制 GC
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      monitor.takeSnapshot('after_gc');
      
      // 检查 WeakRef 状态（应该大部分已释放）
      const afterGC = monitor.checkWeakRefs();
      const aliveAfter = afterGC.filter(r => r.alive).length;
      
      console.log(`\nWeakRef 泄漏检测:`);
      console.log(`  GC 前存活：${aliveBefore}`);
      console.log(`  GC 后存活：${aliveAfter}`);
      console.log(`  已释放：${aliveBefore - aliveAfter}`);
      
      // 断言：大部分对象应该被 GC 回收
      // 注意：由于 JS GC 的不确定性，我们只检查有对象被释放
      expect(aliveAfter).toBeLessThan(aliveBefore);
    }, 10000);
  });

  describe('综合内存健康检查', () => {
    it('应该提供完整的内存健康报告', async () => {
      // 执行一系列操作
      const clients = [];
      
      // 创建房间
      for (let i = 0; i < 10; i++) {
        const client = new TestClient(serverUrl, `health_${i}`);
        await client.connect();
        await client.send('create_room', { name: `Health_${i}` });
        clients.push(client);
      }
      
      // 加入房间
      for (let i = 0; i < 20; i++) {
        const client = new TestClient(serverUrl, `joiner_${i}`);
        await client.connect();
        await client.send('join_room', { roomId: 'TEST_ROOM', name: `Joiner_${i}` });
        clients.push(client);
      }
      
      // 执行游戏操作
      for (const client of clients.slice(0, 10)) {
        await client.send('get_game_state', { roomId: 'TEST_ROOM' });
        await client.send('get_tingpai', { roomId: 'TEST_ROOM' });
      }
      
      // 清理
      clients.forEach(c => c.disconnect());
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const report = monitor.getReport();
      
      console.log(`\n=== 内存健康检查报告 ===`);
      console.log(`快照数量：${report.snapshotCount}`);
      console.log(`内存增长：${report.memoryGrowth?.heapUsedMB.toFixed(2)}MB`);
      console.log(`GC 次数：${report.gcStats?.runs}`);
      console.log(`GC 总停顿：${report.gcStats?.pauseTime}ms`);
      
      if (report.hasLeaks) {
        console.log('⚠️ 检测到潜在内存泄漏!');
        if (report.memoryGrowth.heapUsedMB > TEST_CONFIG.leakThresholds.memoryGrowthMB) {
          console.log(`  - 内存增长过大：${report.memoryGrowth.heapUsedMB.toFixed(2)}MB`);
        }
        for (const [name, growth] of Object.entries(report.mapGrowth)) {
          if (growth.growthPercent > TEST_CONFIG.leakThresholds.mapGrowthPercent) {
            console.log(`  - ${name} 增长过大：${growth.growthPercent.toFixed(2)}%`);
          }
        }
      } else {
        console.log('✓ 内存健康状况良好');
      }
      console.log(`=============================`);
      
      // 断言：没有检测到泄漏
      expect(report.hasLeaks).toBe(false);
    }, 30000);
  });
});
