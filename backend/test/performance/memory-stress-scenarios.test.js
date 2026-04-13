/**
 * 内存压力场景测试
 * 
 * 极端场景下的内存泄漏检测：
 * 1. 并发 50 个房间同时游戏
 * 2. 快速创建销毁 200 个房间
 * 3. 长时间运行（1 分钟加速版 24 小时）
 * 4. 高频率断线重连
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { io } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from '../../src/socket/handlers.js';
import { gameStore } from '../../src/store/GameStore.js';
import { MemoryMonitor } from '../../src/utils/MemoryMonitor.js';

const STRESS_CONFIG = {
  concurrentRooms: 50, // Reduced for test environment
  rapidIterations: 200,
  longRunningDuration: 60000, // 1 minute
  memoryThresholdMB: 100
};

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
    });
  }

  send(event, data) {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve();
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

describe('内存压力场景测试', () => {
  const monitor = new MemoryMonitor('StressTest');

  beforeAll(async () => {
    await startTestServer();
  }, 30000);

  afterAll(async () => {
    for (const roomId of gameStore.rooms.keys()) {
      gameStore.destroyRoom(roomId);
    }
    await stopTestServer();
  }, 30000);

  beforeEach(() => {
    monitor.reset();
    if (global.gc) {
      global.gc();
    }
  });

  describe('压力场景 1: 并发 50 个房间同时游戏', () => {
    it('应该在并发房间下保持内存稳定', async () => {
      const roomCount = STRESS_CONFIG.concurrentRooms;
      const allClients = [];
      
      monitor.trackMap('gameStore.rooms', gameStore.rooms);
      monitor.takeSnapshot('initial');
      
      console.log(`\n开始创建 ${roomCount} 个并发房间...`);
      
      // Create rooms concurrently
      const createPromises = [];
      for (let i = 0; i < roomCount; i++) {
        const promise = (async () => {
          const client = new TestClient(serverUrl, `stress_room_${i}`);
          await client.connect();
          await client.send('create_room', { name: `StressRoom_${i}` });
          allClients.push(client);
        })();
        createPromises.push(promise);
        
        // Batch creation to avoid overwhelming the server
        if (i % 10 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      await Promise.all(createPromises);
      
      console.log(`已创建 ${gameStore.rooms.size} 个房间`);
      monitor.takeSnapshot('after_create');
      
      // Keep rooms alive for a while
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      monitor.takeSnapshot('after_wait');
      
      // Cleanup all rooms
      for (const client of allClients) {
        await client.send('leave_room', {});
        client.disconnect();
      }
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      
      const report = monitor.getReport();
      monitor.printReport();
      
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(STRESS_CONFIG.memoryThresholdMB);
    }, 120000);
  });

  describe('压力场景 2: 快速创建销毁 200 个房间', () => {
    it('应该在快速创建销毁下正确清理', async () => {
      const iterations = STRESS_CONFIG.rapidIterations;
      
      monitor.trackMap('gameStore.rooms', gameStore.rooms);
      monitor.trackMap('gameStore.playerRooms', gameStore.playerRooms);
      monitor.takeSnapshot('initial');
      
      console.log(`\n开始快速创建销毁 ${iterations} 个房间...`);
      
      for (let i = 0; i < iterations; i++) {
        const client = new TestClient(serverUrl, `rapid_${i}`);
        await client.connect();
        await client.send('create_room', { name: `Rapid_${i}` });
        await client.send('leave_room', {});
        client.disconnect();
        
        if (i % 50 === 0) {
          monitor.takeSnapshot(`iter_${i}`);
          monitor.updateTrackedCollections();
          console.log(`快速迭代 ${i}: 房间数=${gameStore.rooms.size}, 内存=${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
        }
      }
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      monitor.updateTrackedCollections();
      
      const report = monitor.getReport();
      monitor.printReport();
      
      const roomGrowth = report.mapGrowth['gameStore.rooms'];
      if (roomGrowth) {
        expect(roomGrowth.final).toBeLessThanOrEqual(roomGrowth.initial + 10);
      }
      
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(50);
    }, 120000);
  });

  describe('压力场景 3: 长时间运行（1 分钟加速版）', () => {
    it('应该在长时间运行下保持内存稳定', async () => {
      const duration = STRESS_CONFIG.longRunningDuration;
      
      monitor.trackMap('gameStore.rooms', gameStore.rooms);
      monitor.trackMap('gameStore.disconnectedPlayers', gameStore.disconnectedPlayers);
      monitor.takeSnapshot('initial');
      
      console.log(`\n开始长时间运行测试 (${duration / 1000}秒)...`);
      
      const startTime = Date.now();
      let activityCount = 0;
      const activeClients = [];
      
      while (Date.now() - startTime < duration) {
        const elapsed = Date.now() - startTime;
        
        // Create some activity
        if (activityCount % 5 === 0) {
          const client = new TestClient(serverUrl, `longrun_${activityCount}`);
          await client.connect();
          await client.send('create_room', { name: `LongRun_${activityCount}` });
          activeClients.push(client);
        }
        
        // Remove some clients
        if (activeClients.length > 20) {
          const toRemove = activeClients.splice(0, 10);
          for (const c of toRemove) {
            await c.send('leave_room', {});
            c.disconnect();
          }
        }
        
        activityCount++;
        
        // Monitor every 10 seconds
        if (elapsed % 10000 < 1000) {
          monitor.takeSnapshot(`time_${(elapsed / 1000).toFixed(0)}s`);
          monitor.updateTrackedCollections();
          console.log(`[${(elapsed / 1000).toFixed(0)}s] 内存：${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB, 房间数：${gameStore.rooms.size}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Cleanup
      for (const client of activeClients) {
        await client.send('leave_room', {});
        client.disconnect();
      }
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      
      const report = monitor.getReport();
      monitor.printReport();
      
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(80);
    }, 90000);
  });

  describe('压力场景 4: 高频率断线重连', () => {
    it('应该在高频率断线重连下保持内存稳定', async () => {
      const iterations = 100;
      
      monitor.trackMap('gameStore.disconnectedPlayers', gameStore.disconnectedPlayers);
      monitor.trackMap('gameStore.socketSessions', gameStore.socketSessions);
      monitor.takeSnapshot('initial');
      
      console.log(`\n开始高频率断线重连测试 (${iterations}次)...`);
      
      for (let i = 0; i < iterations; i++) {
        const client = new TestClient(serverUrl, `stress_reconnect_${i}`);
        await client.connect();
        await client.send('create_room', { name: `StressReconnect_${i}` });
        await client.send('start_game', { roomId: 'TEST_ROOM' });
        
        // Disconnect immediately
        client.disconnect();
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 20));
        
        // Reconnect
        await client.connect();
        await client.send('reconnect_request', { sessionId: 'test_session', roomId: 'TEST_ROOM' });
        
        // Check progress
        if (i % 20 === 0) {
          monitor.takeSnapshot(`iter_${i}`);
          monitor.updateTrackedCollections();
          console.log(`高频重连 ${i}: 断线玩家数=${gameStore.disconnectedPlayers.size}, 内存=${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      monitor.updateTrackedCollections();
      
      const report = monitor.getReport();
      monitor.printReport();
      
      const disconnectedGrowth = report.mapGrowth['gameStore.disconnectedPlayers'];
      if (disconnectedGrowth) {
        expect(disconnectedGrowth.final).toBeLessThanOrEqual(10);
      }
      
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(30);
    }, 60000);
  });
});
