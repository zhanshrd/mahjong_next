/**
 * Socket.IO 性能压力测试
 * 
 * 测试场景：
 * - 高并发连接（1000+ 客户端）
 * - 高频消息（100 条/秒/客户端）
 * - 长时间运行（30 分钟持续压力）
 * - 断线重连风暴
 * 
 * 测试指标：
 * - 内存使用增长曲线
 * - CPU 使用率
 * - 消息延迟分布（P50/P95/P99）
 * - GC 频率和停顿时间
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { io } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from '../../src/socket/handlers.js';
import { gameStore } from '../../src/store/GameStore.js';

// 测试配置
const TEST_CONFIG = {
  // 高并发测试配置
  concurrentConnections: {
    target: 100, // 测试环境使用 100，生产环境目标 1000+
    rampUpTime: 5000, // 5 秒内逐步建立连接
    connectionDelay: 50 // 连接间隔（毫秒）
  },
  
  // 高频消息测试配置
  highFrequencyMessages: {
    messagesPerSecond: 50, // 测试环境使用 50，生产环境目标 100
    duration: 10000, // 10 秒
    messageTypes: ['get_game_state', 'get_tingpai', 'quick_chat']
  },
  
  // 长时间运行测试配置
  longRunning: {
    duration: 60000, // 测试环境 1 分钟，生产环境 30 分钟
    checkInterval: 5000, // 每 5 秒检查一次
    minConnections: 50 // 保持最少连接数
  },
  
  // 断线重连风暴配置
  reconnectStorm: {
    disconnectPercentage: 0.5, // 50% 客户端同时断开
    reconnectDelay: 100, // 重连延迟（毫秒）
    maxReconnectAttempts: 3
  }
};

// 性能指标收集
class PerformanceMetrics {
  constructor() {
    this.latencies = [];
    this.memoryUsage = [];
    this.connectionTimes = [];
    this.errorCounts = new Map();
    this.messageCounts = new Map();
    this.gcPauses = [];
    this.startTime = Date.now();
  }

  recordLatency(latency) {
    this.latencies.push(latency);
  }

  recordMemoryUsage() {
    const usage = process.memoryUsage();
    this.memoryUsage.push({
      timestamp: Date.now() - this.startTime,
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external
    });
  }

  recordConnectionTime(time) {
    this.connectionTimes.push(time);
  }

  recordError(errorType) {
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);
  }

  recordMessage(messageType) {
    this.messageCounts.set(messageType, (this.messageCounts.get(messageType) || 0) + 1);
  }

  getPercentile(p) {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  getStats() {
    const avgLatency = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;

    const avgConnectionTime = this.connectionTimes.length > 0
      ? this.connectionTimes.reduce((a, b) => a + b, 0) / this.connectionTimes.length
      : 0;

    const lastMemory = this.memoryUsage[this.memoryUsage.length - 1] || { rss: 0, heapUsed: 0 };
    const firstMemory = this.memoryUsage[0] || { rss: 0, heapUsed: 0 };

    return {
      latency: {
        avg: avgLatency,
        p50: this.getPercentile(50),
        p95: this.getPercentile(95),
        p99: this.getPercentile(99),
        min: Math.min(...this.latencies, 0),
        max: Math.max(...this.latencies, 0)
      },
      connectionTime: {
        avg: avgConnectionTime,
        min: Math.min(...this.connectionTimes, 0),
        max: Math.max(...this.connectionTimes, 0)
      },
      memory: {
        initial: firstMemory,
        current: lastMemory,
        growth: {
          rss: lastMemory.rss - firstMemory.rss,
          heapUsed: lastMemory.heapUsed - firstMemory.heapUsed
        }
      },
      errors: Object.fromEntries(this.errorCounts),
      messageCounts: Object.fromEntries(this.messageCounts),
      totalMessages: Array.from(this.messageCounts.values()).reduce((a, b) => a + b, 0)
    };
  }

  reset() {
    this.latencies = [];
    this.memoryUsage = [];
    this.connectionTimes = [];
    this.errorCounts.clear();
    this.messageCounts.clear();
    this.startTime = Date.now();
  }
}

// 模拟客户端类
class SimulatedClient {
  constructor(serverUrl, clientId) {
    this.serverUrl = serverUrl;
    this.clientId = clientId;
    this.socket = null;
    this.connected = false;
    this.connectTime = 0;
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.lastLatency = 0;
  }

  async connect() {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000
      });

      this.socket.on('connect', () => {
        this.connected = true;
        this.connectTime = Date.now() - startTime;
        resolve(this.connectTime);
      });

      this.socket.on('connect_error', (error) => {
        reject(error);
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
      });

      // 监听各种消息
      this.socket.on('room_created', () => this.messagesReceived++);
      this.socket.on('join_success', () => this.messagesReceived++);
      this.socket.on('game_started', () => this.messagesReceived++);
      this.socket.on('tile_drawn', () => this.messagesReceived++);
      this.socket.on('tile_discarded', () => this.messagesReceived++);
      this.socket.on('game_state_update', () => this.messagesReceived++);
      this.socket.on('error', () => this.messagesReceived++);
    });
  }

  send(event, data = {}) {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('Not connected'));
    }

    const startTime = Date.now();
    this.messagesSent++;
    
    return new Promise((resolve) => {
      this.socket.emit(event, data, (response) => {
        this.lastLatency = Date.now() - startTime;
        resolve(response);
      });
    });
  }

  async createRoom(name = `Player_${this.clientId}`) {
    const startTime = Date.now();
    await this.send('create_room', { name });
    const latency = Date.now() - startTime;
    return latency;
  }

  async joinRoom(roomId, name = `Player_${this.clientId}`) {
    const startTime = Date.now();
    await this.send('join_room', { roomId, name });
    const latency = Date.now() - startTime;
    return latency;
  }

  async quickJoin(name = `Player_${this.clientId}`) {
    const startTime = Date.now();
    await this.send('quick_join', { name });
    const latency = Date.now() - startTime;
    return latency;
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
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 20000,
    pingInterval: 10000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000
    }
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

describe('Socket.IO 性能压力测试', () => {
  const metrics = new PerformanceMetrics();
  let clients = [];

  beforeAll(async () => {
    await startTestServer();
  }, 30000);

  afterAll(async () => {
    // 清理所有客户端
    clients.forEach(client => client.disconnect());
    clients = [];
    
    // 清理游戏状态
    gameStore.rooms.clear();
    gameStore.playerRooms.clear();
    gameStore.disconnectedPlayers.clear();
    gameStore.aiControlled.clear();
    
    await stopTestServer();
  }, 30000);

  beforeEach(() => {
    metrics.reset();
    clients = [];
  });

  afterEach(() => {
    // 清理客户端
    clients.forEach(client => client.disconnect());
    clients = [];
    
    // 清理游戏状态
    gameStore.rooms.clear();
    gameStore.playerRooms.clear();
    gameStore.disconnectedPlayers.clear();
    gameStore.aiControlled.clear();
  });

  describe('高并发连接测试', () => {
    it(`应该能够处理 ${TEST_CONFIG.concurrentConnections.target} 个并发连接`, async () => {
      const { target, rampUpTime, connectionDelay } = TEST_CONFIG.concurrentConnections;
      const connectionResults = [];
      
      // 记录初始内存
      metrics.recordMemoryUsage();
      
      // 逐步建立连接（ramp-up）
      const startTime = Date.now();
      const delayBetweenBatches = rampUpTime / target;
      
      for (let i = 0; i < target; i++) {
        const client = new SimulatedClient(serverUrl, i);
        clients.push(client);
        
        const connectStart = Date.now();
        try {
          const connectTime = await client.connect();
          connectionResults.push({ success: true, time: connectTime });
          metrics.recordConnectionTime(connectTime);
          metrics.recordMessage('connection');
        } catch (error) {
          connectionResults.push({ success: false, error: error.message });
          metrics.recordError('connection_error');
        }
        
        // 小延迟避免瞬间冲击
        if (delayBetweenBatches > 0 && i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, connectionDelay));
        }
      }
      
      // 记录最终内存
      metrics.recordMemoryUsage();
      
      const successCount = connectionResults.filter(r => r.success).length;
      const failCount = connectionResults.filter(r => !r.success).length;
      
      console.log(`\n高并发连接测试结果:`);
      console.log(`  总连接数：${target}`);
      console.log(`  成功：${successCount}`);
      console.log(`  失败：${failCount}`);
      console.log(`  平均连接时间：${metrics.getStats().connectionTime.avg.toFixed(2)}ms`);
      console.log(`  内存增长：${(metrics.getStats().memory.growth.rss / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：至少 90% 的连接成功
      expect(successCount).toBeGreaterThanOrEqual(target * 0.9);
      
      // 断言：平均连接时间不超过 500ms
      expect(metrics.getStats().connectionTime.avg).toBeLessThan(500);
    }, 60000);

    it('应该在连接风暴期间保持稳定的内存使用', async () => {
      const target = 50;
      const iterations = 3;
      const memoryGrowth = [];
      
      for (let iter = 0; iter < iterations; iter++) {
        const iterClients = [];
        
        // 创建连接
        for (let i = 0; i < target; i++) {
          const client = new SimulatedClient(serverUrl, `iter_${iter}_client_${i}`);
          iterClients.push(client);
          await client.connect();
        }
        
        metrics.recordMemoryUsage();
        
        // 断开连接
        iterClients.forEach(client => client.disconnect());
        
        // 等待 GC
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (global.gc) {
          global.gc();
        }
        
        metrics.recordMemoryUsage();
        
        const currentGrowth = metrics.memoryUsage[metrics.memoryUsage.length - 1].rss - 
                             metrics.memoryUsage[metrics.memoryUsage.length - 2].rss;
        memoryGrowth.push(currentGrowth);
      }
      
      console.log(`\n内存稳定性测试:`);
      console.log(`  平均内存增长：${(memoryGrowth.reduce((a, b) => a + b, 0) / memoryGrowth.length / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：内存增长应该趋于稳定（最后一次增长不超过第一次的 2 倍）
      if (memoryGrowth.length >= 2) {
        expect(memoryGrowth[memoryGrowth.length - 1]).toBeLessThanOrEqual(memoryGrowth[0] * 2);
      }
    }, 30000);
  });

  describe('高频消息测试', () => {
    it(`应该能够处理 ${TEST_CONFIG.highFrequencyMessages.messagesPerSecond} 条/秒的消息频率`, async () => {
      const { messagesPerSecond, duration, messageTypes } = TEST_CONFIG.highFrequencyMessages;
      
      // 创建测试客户端
      const client = new SimulatedClient(serverUrl, 'stress_test_client');
      await client.connect();
      clients.push(client);
      
      // 创建房间
      await client.createRoom('StressTestPlayer');
      
      const messageResults = [];
      const totalMessages = Math.floor(messagesPerSecond * (duration / 1000));
      const interval = 1000 / messagesPerSecond;
      
      metrics.recordMemoryUsage();
      const startTime = Date.now();
      
      // 发送消息
      for (let i = 0; i < totalMessages; i++) {
        const messageType = messageTypes[i % messageTypes.length];
        const sendStart = Date.now();
        
        try {
          await client.send(messageType, { roomId: 'test' });
          const latency = Date.now() - sendStart;
          messageResults.push({ success: true, latency, type: messageType });
          metrics.recordLatency(latency);
          metrics.recordMessage(messageType);
        } catch (error) {
          messageResults.push({ success: false, error: error.message, type: messageType });
          metrics.recordError('message_error');
        }
        
        // 控制发送频率
        const elapsed = Date.now() - startTime;
        const expectedTime = i * interval;
        if (expectedTime > elapsed) {
          await new Promise(resolve => setTimeout(resolve, expectedTime - elapsed));
        }
      }
      
      metrics.recordMemoryUsage();
      
      const successCount = messageResults.filter(r => r.success).length;
      const stats = metrics.getStats();
      
      console.log(`\n高频消息测试结果:`);
      console.log(`  总消息数：${totalMessages}`);
      console.log(`  成功：${successCount}`);
      console.log(`  平均延迟：${stats.latency.avg.toFixed(2)}ms`);
      console.log(`  P95 延迟：${stats.latency.p95.toFixed(2)}ms`);
      console.log(`  P99 延迟：${stats.latency.p99.toFixed(2)}ms`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：至少 95% 的消息成功
      expect(successCount).toBeGreaterThanOrEqual(totalMessages * 0.95);
      
      // 断言：P95 延迟不超过 100ms
      expect(stats.latency.p95).toBeLessThan(100);
      
      // 断言：P99 延迟不超过 200ms
      expect(stats.latency.p99).toBeLessThan(200);
    }, 30000);

    it('应该在持续消息压力下保持稳定的延迟', async () => {
      const client = new SimulatedClient(serverUrl, 'latency_test_client');
      await client.connect();
      await client.createRoom('LatencyTestPlayer');
      clients.push(client);
      
      const latencies = [];
      const messageCount = 100;
      
      for (let i = 0; i < messageCount; i++) {
        const start = Date.now();
        await client.send('get_game_state', { roomId: 'test' });
        latencies.push(Date.now() - start);
        
        // 小延迟模拟真实用户
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // 计算延迟标准差
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const variance = latencies.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / latencies.length;
      const stdDev = Math.sqrt(variance);
      
      console.log(`\n延迟稳定性测试:`);
      console.log(`  平均延迟：${avg.toFixed(2)}ms`);
      console.log(`  标准差：${stdDev.toFixed(2)}ms`);
      console.log(`  变异系数：${(stdDev / avg * 100).toFixed(2)}%`);
      
      // 断言：延迟标准差不应超过平均值的 50%
      expect(stdDev).toBeLessThan(avg * 0.5);
    }, 20000);
  });

  describe('长时间运行测试', () => {
    it(`应该能够在 ${TEST_CONFIG.longRunning.duration / 1000} 秒的持续压力下稳定运行`, async () => {
      const { duration, checkInterval, minConnections } = TEST_CONFIG.longRunning;
      
      // 创建初始连接
      const targetClients = minConnections + 20;
      for (let i = 0; i < targetClients; i++) {
        const client = new SimulatedClient(serverUrl, `longrun_${i}`);
        await client.connect();
        clients.push(client);
      }
      
      metrics.recordMemoryUsage();
      
      const checkPoints = [];
      const startTime = Date.now();
      
      // 持续压力测试
      while (Date.now() - startTime < duration) {
        const elapsed = Date.now() - startTime;
        
        // 随机发送一些消息
        const randomClient = clients[Math.floor(Math.random() * clients.length)];
        if (randomClient && randomClient.connected) {
          try {
            await randomClient.send('get_game_state', { roomId: 'test' });
            metrics.recordMessage('longrun_message');
          } catch (error) {
            // 忽略错误
          }
        }
        
        // 定期检查
        if (elapsed % checkInterval < 1000) {
          metrics.recordMemoryUsage();
          const connectedCount = clients.filter(c => c.connected).length;
          
          checkPoints.push({
            timestamp: elapsed,
            connectedClients: connectedCount,
            memoryRss: process.memoryUsage().rss
          });
          
          console.log(`[${(elapsed / 1000).toFixed(0)}s] 连接数：${connectedCount}, 内存：${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)}MB`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const finalStats = metrics.getStats();
      
      console.log(`\n长时间运行测试结果:`);
      console.log(`  运行时长：${duration / 1000}秒`);
      console.log(`  检查点数量：${checkPoints.length}`);
      console.log(`  初始内存：${(checkPoints[0]?.memoryRss / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  最终内存：${(checkPoints[checkPoints.length - 1]?.memoryRss / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  总消息数：${finalStats.totalMessages}`);
      
      // 断言：内存增长不超过 100MB
      const memoryGrowth = finalStats.memory.growth.rss;
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024);
      
      // 断言：大部分连接保持活跃
      const finalConnectedCount = clients.filter(c => c.connected).length;
      expect(finalConnectedCount).toBeGreaterThanOrEqual(minConnections);
    }, TEST_CONFIG.longRunning.duration + 30000);
  });

  describe('断线重连风暴测试', () => {
    it('应该能够处理大规模断线重连', async () => {
      const { disconnectPercentage, reconnectDelay, maxReconnectAttempts } = TEST_CONFIG.reconnectStorm;
      
      // 创建客户端
      const target = 50;
      for (let i = 0; i < target; i++) {
        const client = new SimulatedClient(serverUrl, `reconnect_${i}`);
        await client.connect();
        clients.push(client);
      }
      
      console.log(`\n断线重连风暴测试:`);
      console.log(`  初始连接数：${clients.filter(c => c.connected).length}`);
      
      // 模拟断线
      const disconnectCount = Math.floor(target * disconnectPercentage);
      const disconnectedClients = clients.slice(0, disconnectCount);
      
      disconnectedClients.forEach(client => {
        client.disconnect();
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log(`  断开后连接数：${clients.filter(c => c.connected).length}`);
      
      // 模拟重连风暴
      const reconnectResults = [];
      for (let attempt = 0; attempt < maxReconnectAttempts; attempt++) {
        for (const client of disconnectedClients) {
          try {
            await client.connect();
            reconnectResults.push({ success: true, attempt: attempt + 1 });
            metrics.recordMessage('reconnect_success');
          } catch (error) {
            reconnectResults.push({ success: false, attempt: attempt + 1, error: error.message });
            metrics.recordError('reconnect_error');
          }
          
          await new Promise(resolve => setTimeout(resolve, reconnectDelay));
        }
        
        const connectedNow = clients.filter(c => c.connected).length;
        console.log(`  重连尝试 ${attempt + 1} 后连接数：${connectedNow}`);
        
        // 如果大部分已重连，提前结束
        if (connectedNow >= target * 0.9) {
          break;
        }
      }
      
      const successCount = reconnectResults.filter(r => r.success).length;
      const finalConnectedCount = clients.filter(c => c.connected).length;
      
      console.log(`  最终连接数：${finalConnectedCount}`);
      console.log(`  重连成功数：${successCount}`);
      
      // 断言：最终大部分客户端应该重连成功
      expect(finalConnectedCount).toBeGreaterThanOrEqual(target * 0.8);
    }, 30000);

    it('应该在重连期间保持数据一致性', async () => {
      // 创建客户端并加入房间
      const client1 = new SimulatedClient(serverUrl, 'room_creator');
      const client2 = new SimulatedClient(serverUrl, 'room_joiner');
      
      await client1.connect();
      await client2.connect();
      
      await client1.createRoom('TestDataConsistency');
      
      // client2 加入房间
      const joinLatency = await client2.joinRoom('TEST_ROOM');
      
      clients.push(client1, client2);
      
      // 断开 client2
      client2.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 重连
      await client2.connect();
      
      // 验证房间状态
      const roomState = await client2.send('get_room_state', { roomId: 'TEST_ROOM' });
      
      console.log(`\n重连数据一致性测试:`);
      console.log(`  重连后房间状态：${roomState ? '存在' : '不存在'}`);
      
      // 断言：重连后应该能够获取到房间状态
      expect(roomState).toBeDefined();
    }, 20000);
  });

  describe('综合性能基准测试', () => {
    it('应该提供性能基准数据', async () => {
      const benchmarkResults = {
        connection: {
          target: 50,
          successRate: 0,
          avgTime: 0
        },
        messaging: {
          totalMessages: 100,
          successRate: 0,
          avgLatency: 0,
          p95Latency: 0,
          p99Latency: 0
        },
        memory: {
          initialRSS: 0,
          finalRSS: 0,
          growth: 0
        }
      };
      
      // 连接基准
      benchmarkResults.memory.initialRSS = process.memoryUsage().rss;
      
      const connectStart = Date.now();
      let successConnections = 0;
      
      for (let i = 0; i < benchmarkResults.connection.target; i++) {
        const client = new SimulatedClient(serverUrl, `bench_${i}`);
        try {
          await client.connect();
          clients.push(client);
          successConnections++;
        } catch (error) {
          // 忽略失败
        }
      }
      
      benchmarkResults.connection.successRate = successConnections / benchmarkResults.connection.target;
      benchmarkResults.connection.avgTime = (Date.now() - connectStart) / successConnections;
      
      // 消息基准
      const testClient = clients[0];
      const messageLatencies = [];
      
      for (let i = 0; i < benchmarkResults.messaging.totalMessages; i++) {
        const start = Date.now();
        try {
          await testClient.send('get_game_state', { roomId: 'test' });
          messageLatencies.push(Date.now() - start);
        } catch (error) {
          // 忽略失败
        }
      }
      
      const sortedLatencies = [...messageLatencies].sort((a, b) => a - b);
      benchmarkResults.messaging.successRate = messageLatencies.length / benchmarkResults.messaging.totalMessages;
      benchmarkResults.messaging.avgLatency = messageLatencies.reduce((a, b) => a + b, 0) / messageLatencies.length || 0;
      benchmarkResults.messaging.p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
      benchmarkResults.messaging.p99Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;
      
      // 内存基准
      benchmarkResults.memory.finalRSS = process.memoryUsage().rss;
      benchmarkResults.memory.growth = benchmarkResults.memory.finalRSS - benchmarkResults.memory.initialRSS;
      
      console.log(`\n=== 性能基准数据 ===`);
      console.log('连接性能:');
      console.log(`  目标连接数：${benchmarkResults.connection.target}`);
      console.log(`  成功率：${(benchmarkResults.connection.successRate * 100).toFixed(2)}%`);
      console.log(`  平均连接时间：${benchmarkResults.connection.avgTime.toFixed(2)}ms`);
      console.log('\n消息性能:');
      console.log(`  总消息数：${benchmarkResults.messaging.totalMessages}`);
      console.log(`  成功率：${(benchmarkResults.messaging.successRate * 100).toFixed(2)}%`);
      console.log(`  平均延迟：${benchmarkResults.messaging.avgLatency.toFixed(2)}ms`);
      console.log(`  P95 延迟：${benchmarkResults.messaging.p95Latency.toFixed(2)}ms`);
      console.log(`  P99 延迟：${benchmarkResults.messaging.p99Latency.toFixed(2)}ms`);
      console.log('\n内存使用:');
      console.log(`  初始 RSS: ${(benchmarkResults.memory.initialRSS / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  最终 RSS: ${(benchmarkResults.memory.finalRSS / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  增长：${(benchmarkResults.memory.growth / 1024 / 1024).toFixed(2)}MB`);
      console.log(`========================`);
      
      // 保存基准数据到文件（可选）
      // fs.writeFileSync('benchmark-results.json', JSON.stringify(benchmarkResults, null, 2));
      
      // 断言：基准数据应该在合理范围内
      expect(benchmarkResults.connection.successRate).toBeGreaterThanOrEqual(0.9);
      expect(benchmarkResults.messaging.successRate).toBeGreaterThanOrEqual(0.95);
      expect(benchmarkResults.messaging.p95Latency).toBeLessThan(100);
    }, 60000);
  });
});
