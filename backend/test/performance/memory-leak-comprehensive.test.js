/**
 * 综合内存泄漏测试
 * 
 * 测试场景：
 * 1. 大量房间创建/销毁后的内存状态
 * 2. 长时间游戏的定时器清理
 * 3. 频繁断线重连的资源清理
 * 4. Map/Set 数据结构的增长控制
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { io } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from '../../src/socket/handlers.js';
import { gameStore } from '../../src/store/GameStore.js';
import { MemoryMonitor } from '../../src/utils/MemoryMonitor.js';

// 测试配置
const TEST_CONFIG = {
  roomIterations: 100,
  longRunningDuration: 30000, // 30 seconds for test environment
  reconnectIterations: 50,
  mapGrowthThreshold: 20, // percent
  memoryGrowthThresholdMB: 50
};

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

describe('综合内存泄漏测试', () => {
  const monitor = new MemoryMonitor('ComprehensiveTest');
  let clients = [];

  beforeAll(async () => {
    await startTestServer();
  }, 60000);

  afterAll(async () => {
    clients.forEach(c => c.disconnect());
    clients = [];
    
    // Clean up all rooms
    for (const roomId of gameStore.rooms.keys()) {
      gameStore.destroyRoom(roomId);
    }
    
    await stopTestServer();
  }, 60000);

  beforeEach(() => {
    monitor.reset();
    clients = [];
    
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(() => {
    clients.forEach(c => c.disconnect());
    clients = [];
    
    if (global.gc) {
      global.gc();
    }
  });

  describe('场景 1: 大量房间创建/销毁后的内存状态', () => {
    it('应该在频繁创建销毁房间后正确清理内存', async () => {
      const iterations = TEST_CONFIG.roomIterations;
      
      monitor.trackMap('gameStore.rooms', gameStore.rooms);
      monitor.trackMap('gameStore.playerRooms', gameStore.playerRooms);
      monitor.takeSnapshot('initial');
      
      for (let i = 0; i < iterations; i++) {
        const client = new TestClient(serverUrl, `room_test_${i}`);
        await client.connect();
        
        // Create room
        await client.send('create_room', { name: `Player_${i}` });
        
        // Immediately leave
        await client.send('leave_room', {});
        client.disconnect();
        
        // Check progress every 20 iterations
        if (i % 20 === 0) {
          monitor.takeSnapshot(`iter_${i}`);
          monitor.updateTrackedCollections();
          console.log(`房间迭代 ${i}: 房间数=${gameStore.rooms.size}`);
        }
      }
      
      // Force GC and final check
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      monitor.updateTrackedCollections();
      
      const report = monitor.getReport();
      monitor.printReport();
      
      // Assertions
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(TEST_CONFIG.memoryGrowthThresholdMB);
      
      const roomGrowth = report.mapGrowth['gameStore.rooms'];
      if (roomGrowth) {
        expect(roomGrowth.final).toBeLessThanOrEqual(roomGrowth.initial + 5);
      }
    }, 120000);
  });

  describe('场景 2: 长时间游戏的定时器清理', () => {
    it('应该在长时间游戏后正确清理所有定时器', async () => {
      const duration = TEST_CONFIG.longRunningDuration;
      
      monitor.trackMap('gameStore.rooms', gameStore.rooms);
      monitor.takeSnapshot('initial');
      
      // Create a room with 4 players
      const clients = [];
      for (let i = 0; i < 4; i++) {
        const client = new TestClient(serverUrl, `longgame_${i}`);
        await client.connect();
        await client.send('create_room', { name: `Player_${i}` });
        clients.push(client);
      }
      
      // Start game
      await clients[0].send('start_game', { roomId: 'TEST_ROOM' });
      
      // Simulate game actions for duration
      const startTime = Date.now();
      let actionCount = 0;
      
      while (Date.now() - startTime < duration) {
        // Random player draws and discards
        const playerIdx = actionCount % 4;
        await clients[playerIdx].send('draw_tile', { roomId: 'TEST_ROOM' });
        await clients[playerIdx].send('discard_tile', { roomId: 'TEST_ROOM', tile: 'W1' });
        
        actionCount++;
        
        if (actionCount % 10 === 0) {
          monitor.takeSnapshot(`action_${actionCount}`);
          console.log(`游戏动作 ${actionCount}: 内存=${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // End game and cleanup
      await clients[0].send('leave_room', {});
      clients.forEach(c => c.disconnect());
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      
      const report = monitor.getReport();
      monitor.printReport();
      
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(30);
    }, 120000);
  });

  describe('场景 3: 频繁断线重连的资源清理', () => {
    it('应该在频繁断线重连后正确清理资源', async () => {
      const iterations = TEST_CONFIG.reconnectIterations;
      
      monitor.trackMap('gameStore.disconnectedPlayers', gameStore.disconnectedPlayers);
      monitor.trackMap('gameStore.socketSessions', gameStore.socketSessions);
      monitor.takeSnapshot('initial');
      
      for (let i = 0; i < iterations; i++) {
        const client = new TestClient(serverUrl, `reconnect_${i}`);
        await client.connect();
        await client.send('create_room', { name: `Reconnect_${i}` });
        await client.send('start_game', { roomId: 'TEST_ROOM' });
        
        // Disconnect
        client.disconnect();
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Reconnect
        await client.connect();
        await client.send('reconnect_request', { sessionId: 'test_session', roomId: 'TEST_ROOM' });
        
        // Check progress
        if (i % 10 === 0) {
          monitor.takeSnapshot(`iter_${i}`);
          monitor.updateTrackedCollections();
          console.log(`重连迭代 ${i}: 断线玩家数=${gameStore.disconnectedPlayers.size}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      monitor.updateTrackedCollections();
      
      const report = monitor.getReport();
      monitor.printReport();
      
      const disconnectedGrowth = report.mapGrowth['gameStore.disconnectedPlayers'];
      if (disconnectedGrowth) {
        expect(disconnectedGrowth.final).toBeLessThanOrEqual(5);
      }
      
      expect(report.memoryGrowth.heapUsedMB).toBeLessThan(20);
    }, 120000);
  });

  describe('场景 4: Map/Set 数据结构的增长控制', () => {
    it('应该控制所有 Map/Set 的增长在合理范围内', async () => {
      monitor.trackMap('gameStore.rooms', gameStore.rooms);
      monitor.trackMap('gameStore.playerRooms', gameStore.playerRooms);
      monitor.trackMap('gameStore.disconnectedPlayers', gameStore.disconnectedPlayers);
      monitor.trackSet('gameStore.aiControlled', gameStore.aiControlled);
      
      monitor.takeSnapshot('initial');
      
      // Simulate various operations
      for (let i = 0; i < 50; i++) {
        const client = new TestClient(serverUrl, `map_test_${i}`);
        await client.connect();
        await client.send('create_room', { name: `MapTest_${i}` });
        await client.send('leave_room', {});
        client.disconnect();
      }
      
      monitor.forceGC();
      await new Promise(resolve => setTimeout(resolve, 1000));
      monitor.takeSnapshot('final');
      monitor.updateTrackedCollections();
      
      const report = monitor.getReport();
      monitor.printReport();
      
      // Check all Map/Set growth
      for (const [name, growth] of Object.entries(report.mapGrowth)) {
        expect(growth.growthPercent).toBeLessThan(TEST_CONFIG.mapGrowthThreshold);
      }
      
      for (const [name, growth] of Object.entries(report.setGrowth)) {
        expect(growth.growthPercent).toBeLessThan(TEST_CONFIG.mapGrowthThreshold);
      }
    }, 60000);
  });
});
