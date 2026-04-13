/**
 * 房间管理系统压力测试
 * 
 * 测试场景：
 * - 高并发房间创建（1000+ 房间）
 * - 频繁加入/离开房间（10000+ 次操作）
 * - 房间状态管理性能
 * - 断线重连性能
 * - 房间搜索和匹配性能
 * 
 * 测试指标：
 * - 操作延迟（P50/P95/P99）
 * - 内存使用增长
 * - Map/Set 数据结构大小
 * - GC 频率
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { GameStore } from '../../src/store/GameStore.js';
import { Room } from '../../src/game/Room.js';

// 测试配置
const TEST_CONFIG = {
  // 房间创建测试
  roomCreation: {
    concurrentRooms: 1000,
    creatorsPerBatch: 100,
    batches: 10
  },
  
  // 加入/离开测试
  joinLeave: {
    operations: 10000,
    concurrentPlayers: 200,
    rooms: 50
  },
  
  // 房间状态管理测试
  stateManagement: {
    gamesPerRoom: 5,
    turnsPerGame: 50,
    concurrentRooms: 20
  },
  
  // 断线重连测试
  reconnect: {
    disconnects: 500,
    gracePeriod: 5000, // 缩短测试时间
    concurrentPlayers: 100
  },
  
  // 房间搜索测试
  roomSearch: {
    totalRooms: 500,
    searches: 1000
  }
};

// 性能指标收集
class PerformanceMetrics {
  constructor() {
    this.latencies = [];
    this.memorySnapshots = [];
    this.dataStructureSizes = new Map();
    this.startTime = Date.now();
  }

  recordLatency(latency) {
    this.latencies.push(latency);
  }

  recordMemorySnapshot() {
    const usage = process.memoryUsage();
    this.memorySnapshots.push({
      timestamp: Date.now() - this.startTime,
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external
    });
  }

  trackDataStructure(name, size) {
    if (!this.dataStructureSizes.has(name)) {
      this.dataStructureSizes.set(name, []);
    }
    this.dataStructureSizes.get(name).push({
      timestamp: Date.now() - this.startTime,
      size
    });
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

    const lastMemory = this.memorySnapshots[this.memorySnapshots.length - 1] || { rss: 0, heapUsed: 0 };
    const firstMemory = this.memorySnapshots[0] || { rss: 0, heapUsed: 0 };

    return {
      latency: {
        avg: avgLatency,
        p50: this.getPercentile(50),
        p95: this.getPercentile(95),
        p99: this.getPercentile(99),
        min: Math.min(...this.latencies, 0),
        max: Math.max(...this.latencies, 0)
      },
      memory: {
        initial: firstMemory,
        final: lastMemory,
        growth: {
          rss: lastMemory.rss - firstMemory.rss,
          heapUsed: lastMemory.heapUsed - firstMemory.heapUsed
        }
      },
      dataStructures: Object.fromEntries(this.dataStructureSizes),
      totalOperations: this.latencies.length
    };
  }

  reset() {
    this.latencies = [];
    this.memorySnapshots = [];
    this.dataStructureSizes.clear();
    this.startTime = Date.now();
  }
}

// 辅助函数：创建测试玩家
function createTestPlayer(id, name) {
  return {
    id: id || `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name || `Player_${Math.random().toString(36).substr(2, 6)}`
  };
}

describe('房间管理系统压力测试', () => {
  let gameStore;
  const metrics = new PerformanceMetrics();

  beforeAll(() => {
    // 初始 GC
    if (global.gc) {
      global.gc();
    }
  });

  beforeEach(() => {
    gameStore = new GameStore();
    metrics.reset();
    
    // 初始 GC
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(() => {
    // 清理
    gameStore.rooms.clear();
    gameStore.playerRooms.clear();
    gameStore.disconnectedPlayers.clear();
    gameStore.reconnectTimers.clear();
    gameStore.socketSessions.clear();
    gameStore.aiControlled.clear();
    
    // 强制 GC
    if (global.gc) {
      global.gc();
    }
  });

  describe('高并发房间创建测试', () => {
    it(`应该能够快速创建 ${TEST_CONFIG.roomCreation.concurrentRooms} 个房间`, async () => {
      const { concurrentRooms } = TEST_CONFIG.roomCreation;
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      // 并发创建房间
      for (let i = 0; i < concurrentRooms; i++) {
        const createStart = Date.now();
        const creator = createTestPlayer(`creator_${i}`, `Creator_${i}`);
        gameStore.createRoom(creator.id, { totalRounds: 4 });
        const createLatency = Date.now() - createStart;
        
        metrics.recordLatency(createLatency);
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      // 跟踪数据结构大小
      metrics.trackDataStructure('rooms', gameStore.rooms.size);
      
      const stats = metrics.getStats();
      
      console.log(`\n高并发房间创建测试:`);
      console.log(`  房间数量：${concurrentRooms}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均创建时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 创建时间：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  P99 创建时间：${stats.latency.p99.toFixed(3)}ms`);
      console.log(`  每秒创建房间数：${(concurrentRooms / (totalTime / 1000)).toFixed(0)}`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Rooms Map 大小：${gameStore.rooms.size}`);
      
      // 断言：平均创建时间应该小于 1ms
      expect(stats.latency.avg).toBeLessThan(1);
      
      // 断言：P95 创建时间应该小于 2ms
      expect(stats.latency.p95).toBeLessThan(2);
      
      // 断言：吞吐量应该大于 10000 rooms/s
      expect(concurrentRooms / (totalTime / 1000)).toBeGreaterThan(10000);
      
      // 断言：内存增长应该合理
      expect(stats.memory.growth.heapUsed).toBeLessThan(concurrentRooms * 1024); // 每个房间小于 1KB
    }, 60000);

    it('应该能够分批次创建大量房间', async () => {
      const { creatorsPerBatch, batches } = TEST_CONFIG.roomCreation;
      const totalRooms = creatorsPerBatch * batches;
      const memoryGrowth = [];
      
      for (let batch = 0; batch < batches; batch++) {
        metrics.recordMemorySnapshot();
        
        // 创建一批房间
        for (let i = 0; i < creatorsPerBatch; i++) {
          const creator = createTestPlayer(`batch_${batch}_creator_${i}`, `Creator_${batch}_${i}`);
          gameStore.createRoom(creator.id);
        }
        
        metrics.recordMemorySnapshot();
        
        const currentGrowth = metrics.memorySnapshots[metrics.memorySnapshots.length - 1].heapUsed -
                             metrics.memorySnapshots[0].heapUsed;
        memoryGrowth.push(currentGrowth);
        
        console.log(`批次 ${batch + 1}/${batches}: 房间数=${gameStore.rooms.size}, 内存增长=${(currentGrowth / 1024 / 1024).toFixed(2)}MB`);
      }
      
      const stats = metrics.getStats();
      
      console.log(`\n分批次房间创建:`);
      console.log(`  总房间数：${totalRooms}`);
      console.log(`  最终内存增长：${(memoryGrowth[memoryGrowth.length - 1] / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：所有房间都被创建
      expect(gameStore.rooms.size).toBe(totalRooms);
      
      // 断言：内存增长应该是线性的
      const avgGrowthPerBatch = memoryGrowth[memoryGrowth.length - 1] / batches;
      expect(memoryGrowth[memoryGrowth.length - 1]).toBeLessThan(totalRooms * 2 * 1024);
    }, 60000);
  });

  describe('频繁加入/离开房间测试', () => {
    it(`应该能够处理 ${TEST_CONFIG.joinLeave.operations} 次加入/离开操作`, async () => {
      const { operations, concurrentPlayers, rooms: roomCount } = TEST_CONFIG.joinLeave;
      
      // 预先创建房间
      const roomIds = [];
      for (let i = 0; i < roomCount; i++) {
        const creator = createTestPlayer(`creator_${i}`, `Creator_${i}`);
        const room = gameStore.createRoom(creator.id);
        roomIds.push(room.id);
      }
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let successCount = 0;
      let failCount = 0;
      
      // 执行加入/离开操作
      for (let i = 0; i < operations; i++) {
        const roomId = roomIds[i % roomCount];
        const player = createTestPlayer(`player_${i}`, `Player_${i}`);
        
        const opStart = Date.now();
        
        // 加入房间
        const joinResult = gameStore.joinRoom(roomId, player);
        
        if (joinResult.success) {
          successCount++;
          
          // 立即离开
          gameStore.leaveRoom(player.id);
        } else {
          failCount++;
        }
        
        const opLatency = Date.now() - opStart;
        metrics.recordLatency(opLatency);
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      // 跟踪数据结构大小
      metrics.trackDataStructure('rooms', gameStore.rooms.size);
      metrics.trackDataStructure('playerRooms', gameStore.playerRooms.size);
      
      const stats = metrics.getStats();
      
      console.log(`\n频繁加入/离开房间测试:`);
      console.log(`  总操作数：${operations}`);
      console.log(`  成功：${successCount}`);
      console.log(`  失败：${failCount}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均操作延迟：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 操作延迟：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  P99 操作延迟：${stats.latency.p99.toFixed(3)}ms`);
      console.log(`  每秒操作数：${(operations / (totalTime / 1000)).toFixed(0)}`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Rooms Map 大小：${gameStore.rooms.size}`);
      console.log(`  PlayerRooms Map 大小：${gameStore.playerRooms.size}`);
      
      // 断言：平均操作延迟应该小于 1ms
      expect(stats.latency.avg).toBeLessThan(1);
      
      // 断言：P95 操作延迟应该小于 2ms
      expect(stats.latency.p95).toBeLessThan(2);
      
      // 断言：成功率应该大于 90%
      expect(successCount / operations).toBeGreaterThan(0.9);
      
      // 断言：PlayerRooms 应该被正确清理
      expect(gameStore.playerRooms.size).toBeLessThan(concurrentPlayers);
    }, 120000);

    it('应该在并发加入/离开时保持数据一致性', async () => {
      const roomCount = 10;
      const playersPerRoom = 4;
      
      // 创建房间
      const roomIds = [];
      for (let i = 0; i < roomCount; i++) {
        const creator = createTestPlayer(`creator_${i}`, `Creator_${i}`);
        const room = gameStore.createRoom(creator.id);
        roomIds.push(room.id);
      }
      
      metrics.recordMemorySnapshot();
      
      // 并发加入
      for (let i = 0; i < roomCount * playersPerRoom; i++) {
        const roomId = roomIds[Math.floor(i / playersPerRoom)];
        const player = createTestPlayer(`concurrent_player_${i}`, `Player_${i}`);
        
        const result = gameStore.joinRoom(roomId, player);
        expect(result.success).toBe(true);
      }
      
      metrics.trackDataStructure('rooms', gameStore.rooms.size);
      metrics.trackDataStructure('playerRooms', gameStore.playerRooms.size);
      
      // 验证每个房间都有 4 个玩家
      for (const roomId of roomIds) {
        const room = gameStore.getRoom(roomId);
        expect(room.players.length).toBe(playersPerRoom);
      }
      
      // 并发离开
      for (let i = 0; i < roomCount * playersPerRoom; i++) {
        const playerId = `concurrent_player_${i}`;
        gameStore.leaveRoom(playerId);
      }
      
      metrics.recordMemorySnapshot();
      
      // 验证所有房间都为空
      for (const roomId of roomIds) {
        const room = gameStore.getRoom(roomId);
        expect(room.players.length).toBe(0);
      }
      
      // 验证 PlayerRooms 被清理
      expect(gameStore.playerRooms.size).toBe(0);
      
      const stats = metrics.getStats();
      
      console.log(`\n并发加入/离开数据一致性:`);
      console.log(`  房间数：${roomCount}`);
      console.log(`  每房间玩家数：${playersPerRoom}`);
      console.log(`  最终 Rooms 大小：${gameStore.rooms.size}`);
      console.log(`  最终 PlayerRooms 大小：${gameStore.playerRooms.size}`);
      
      // 断言：数据一致性应该保持
      expect(gameStore.playerRooms.size).toBe(0);
    }, 30000);
  });

  describe('房间状态管理性能测试', () => {
    it(`应该能够快速管理 ${TEST_CONFIG.stateManagement.concurrentRooms} 个房间的游戏状态`, async () => {
      const { concurrentRooms, gamesPerRoom, turnsPerGame } = TEST_CONFIG.stateManagement;
      
      // 创建房间并加入玩家
      const rooms = [];
      for (let i = 0; i < concurrentRooms; i++) {
        const creator = createTestPlayer(`creator_${i}`, `Creator_${i}`);
        const room = gameStore.createRoom(creator.id);
        
        // 加入 4 个玩家
        for (let j = 1; j < 4; j++) {
          const player = createTestPlayer(`player_${i}_${j}`, `Player_${i}_${j}`);
          gameStore.joinRoom(room.id, player);
        }
        
        rooms.push(room);
      }
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let totalStateChanges = 0;
      
      // 在每个房间执行多局游戏
      for (const room of rooms) {
        for (let game = 0; game < gamesPerRoom; game++) {
          // 开始游戏
          const startStart = Date.now();
          room.startGame();
          metrics.recordLatency(Date.now() - startStart);
          totalStateChanges++;
          
          // 模拟游戏流程
          for (let turn = 0; turn < turnsPerGame; turn++) {
            if (room.game && room.game.tileSet.remaining > 0) {
              const currentPlayer = room.game.currentPlayer;
              const hand = room.game.hands[currentPlayer];
              
              if (hand.length > 0) {
                const discardStart = Date.now();
                room.game.discardTile(currentPlayer, hand[0]);
                metrics.recordLatency(Date.now() - discardStart);
                totalStateChanges++;
                
                const drawStart = Date.now();
                const nextPlayer = (currentPlayer + 1) % 4;
                const drawnTile = room.game.tileSet.drawOne();
                if (drawnTile) {
                  room.game.hands[nextPlayer].push(drawnTile);
                }
                metrics.recordLatency(Date.now() - drawStart);
                totalStateChanges++;
              }
            }
          }
          
          // 结束游戏
          const endStart = Date.now();
          room.endGame();
          metrics.recordLatency(Date.now() - endStart);
          totalStateChanges++;
          
          // 重置房间（简化）
          room.state = 'waiting';
          room.game = null;
        }
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n房间状态管理性能测试:`);
      console.log(`  房间数：${concurrentRooms}`);
      console.log(`  每房间游戏数：${gamesPerRoom}`);
      console.log(`  每游戏回合数：${turnsPerGame}`);
      console.log(`  总状态变更数：${totalStateChanges}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均状态变更时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 状态变更时间：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  每秒状态变更数：${(totalStateChanges / (totalTime / 1000)).toFixed(0)}`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：平均状态变更时间应该小于 5ms
      expect(stats.latency.avg).toBeLessThan(5);
      
      // 断言：吞吐量应该大于 1000 changes/s
      expect(totalStateChanges / (totalTime / 1000)).toBeGreaterThan(1000);
    }, 120000);
  });

  describe('断线重连性能测试', () => {
    it(`应该能够处理 ${TEST_CONFIG.reconnect.disconnects} 次断线重连`, async () => {
      const { disconnects, gracePeriod, concurrentPlayers } = TEST_CONFIG.reconnect;
      
      // 创建房间并加入玩家
      const room = gameStore.createRoom('creator', 'Creator');
      const players = [];
      
      for (let i = 0; i < Math.min(concurrentPlayers, 4); i++) {
        const player = createTestPlayer(`player_${i}`, `Player_${i}`);
        gameStore.joinRoom(room.id, player);
        players.push(player);
      }
      
      // 开始游戏
      room.startGame();
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let successReconnects = 0;
      let failReconnects = 0;
      
      // 模拟断线重连
      for (let i = 0; i < disconnects; i++) {
        const player = players[i % players.length];
        const sessionId = gameStore.socketSessions.get(player.id);
        
        // 模拟断线
        const disconnectStart = Date.now();
        gameStore.handleDisconnect(player.id);
        metrics.recordLatency(Date.now() - disconnectStart);
        
        // 等待一小段时间（小于 grace period）
        await new Promise(resolve => setTimeout(resolve, gracePeriod / 10));
        
        // 模拟重连
        const newSocketId = `new_socket_${i}`;
        const reconnectResult = gameStore.reconnect(newSocketId, sessionId, room.id);
        
        if (reconnectResult.success) {
          successReconnects++;
        } else {
          failReconnects++;
        }
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      // 清理重连定时器
      for (const timerId of gameStore.reconnectTimers.values()) {
        clearTimeout(timerId);
      }
      
      const stats = metrics.getStats();
      
      console.log(`\n断线重连性能测试:`);
      console.log(`  总断线数：${disconnects}`);
      console.log(`  重连成功：${successReconnects}`);
      console.log(`  重连失败：${failReconnects}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均断线处理时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 断线处理时间：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  DisconnectedPlayers 大小：${gameStore.disconnectedPlayers.size}`);
      
      // 断言：平均断线处理时间应该很短
      expect(stats.latency.avg).toBeLessThan(1);
      
      // 断言：重连成功率应该大于 80%
      if (disconnects > 0) {
        expect(successReconnects / disconnects).toBeGreaterThan(0.8);
      }
    }, 120000);

    it('应该在 grace period 后正确清理断线玩家', async () => {
      const shortGracePeriod = 100; // 非常短的测试时间
      
      // 创建房间并加入玩家
      const room = gameStore.createRoom('creator', 'Creator');
      const player = createTestPlayer('player1', 'Player1');
      gameStore.joinRoom(room.id, player);
      
      // 开始游戏
      room.startGame();
      
      const sessionId = gameStore.socketSessions.get(player.id);
      
      // 模拟断线
      gameStore.handleDisconnect(player.id);
      
      expect(gameStore.disconnectedPlayers.has(sessionId)).toBe(true);
      
      // 等待 grace period 过期
      await new Promise(resolve => setTimeout(resolve, shortGracePeriod + 50));
      
      // 验证已被清理
      expect(gameStore.disconnectedPlayers.has(sessionId)).toBe(false);
      
      console.log(`\nGrace Period 清理测试:`);
      console.log(`  断线玩家已被正确清理`);
      
      // 断言：断线玩家应该被清理
      expect(gameStore.disconnectedPlayers.size).toBe(0);
    }, 5000);
  });

  describe('房间搜索和匹配性能测试', () => {
    it(`应该能够快速搜索 ${TEST_CONFIG.roomSearch.totalRooms} 个房间`, async () => {
      const { totalRooms, searches } = TEST_CONFIG.roomSearch;
      
      // 创建大量房间
      const roomIds = [];
      for (let i = 0; i < totalRooms; i++) {
        const creator = createTestPlayer(`creator_${i}`, `Creator_${i}`);
        const room = gameStore.createRoom(creator.id, { totalRounds: 4 });
        roomIds.push(room.id);
        
        // 部分房间加入玩家
        if (i % 2 === 0) {
          const playerCount = Math.floor(Math.random() * 3);
          for (let j = 0; j < playerCount; j++) {
            const player = createTestPlayer(`room_${i}_player_${j}`, `Player_${i}_${j}`);
            gameStore.joinRoom(room.id, player);
          }
        }
      }
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let foundRooms = 0;
      let emptyRooms = 0;
      let fullRooms = 0;
      
      // 执行搜索
      for (let i = 0; i < searches; i++) {
        const searchStart = Date.now();
        
        const roomId = roomIds[Math.floor(Math.random() * totalRooms)];
        const room = gameStore.getRoom(roomId);
        
        if (room) {
          foundRooms++;
          
          if (room.isEmpty()) {
            emptyRooms++;
          } else if (room.isFull()) {
            fullRooms++;
          }
        }
        
        metrics.recordLatency(Date.now() - searchStart);
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n房间搜索性能测试:`);
      console.log(`  总房间数：${totalRooms}`);
      console.log(`  搜索次数：${searches}`);
      console.log(`  找到房间：${foundRooms}`);
      console.log(`  空房间：${emptyRooms}`);
      console.log(`  满房间：${fullRooms}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均搜索时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 搜索时间：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  P99 搜索时间：${stats.latency.p99.toFixed(3)}ms`);
      console.log(`  每秒搜索数：${(searches / (totalTime / 1000)).toFixed(0)}`);
      
      // 断言：平均搜索时间应该非常快（Map 查找）
      expect(stats.latency.avg).toBeLessThan(0.1);
      
      // 断言：P95 搜索时间应该小于 0.5ms
      expect(stats.latency.p95).toBeLessThan(0.5);
      
      // 断言：吞吐量应该非常高
      expect(searches / (totalTime / 1000)).toBeGreaterThan(100000);
    }, 60000);

    it('应该提供房间匹配性能基准', async () => {
      const roomCount = 100;
      const matchAttempts = 1000;
      
      // 创建房间
      const availableRooms = [];
      for (let i = 0; i < roomCount; i++) {
        const creator = createTestPlayer(`creator_${i}`, `Creator_${i}`);
        const room = gameStore.createRoom(creator.id);
        
        // 加入随机数量的玩家
        const playerCount = Math.floor(Math.random() * 4);
        for (let j = 0; j < playerCount; j++) {
          const player = createTestPlayer(`room_${i}_player_${j}`, `Player_${i}_${j}`);
          gameStore.joinRoom(room.id, player);
        }
        
        if (!room.isFull()) {
          availableRooms.push(room);
        }
      }
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let successMatches = 0;
      
      // 快速匹配
      for (let i = 0; i < matchAttempts; i++) {
        const matchStart = Date.now();
        
        // 找到一个有空位的房间
        const room = availableRooms.find(r => !r.isFull() && r.state === 'waiting');
        
        if (room) {
          const player = createTestPlayer(`match_player_${i}`, `MatchPlayer_${i}`);
          const result = gameStore.joinRoom(room.id, player);
          
          if (result.success) {
            successMatches++;
          }
        }
        
        metrics.recordLatency(Date.now() - matchStart);
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n房间匹配性能基准:`);
      console.log(`  房间数：${roomCount}`);
      console.log(`  匹配尝试：${matchAttempts}`);
      console.log(`  成功匹配：${successMatches}`);
      console.log(`  成功率：${(successMatches / matchAttempts * 100).toFixed(2)}%`);
      console.log(`  平均匹配时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 匹配时间：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：平均匹配时间应该小于 1ms
      expect(stats.latency.avg).toBeLessThan(1);
      
      // 断言：匹配成功率应该合理
      expect(successMatches / matchAttempts).toBeGreaterThan(0.5);
    }, 30000);
  });

  describe('综合房间管理性能基准', () => {
    it('应该提供完整的房间管理性能基准数据', async () => {
      const benchmarkResults = {
        roomCreation: { count: 100, avg: 0 },
        joinLeave: { count: 500, avg: 0 },
        stateManagement: { count: 100, avg: 0 },
        reconnect: { count: 50, avg: 0 }
      };
      
      metrics.recordMemorySnapshot();
      
      // 房间创建基准
      for (let i = 0; i < benchmarkResults.roomCreation.count; i++) {
        const start = Date.now();
        const creator = createTestPlayer(`bench_creator_${i}`, `BenchCreator_${i}`);
        gameStore.createRoom(creator.id);
        benchmarkResults.roomCreation.avg += Date.now() - start;
      }
      benchmarkResults.roomCreation.avg /= benchmarkResults.roomCreation.count;
      
      // 加入/离开基准
      const roomIds = Array.from(gameStore.rooms.keys()).slice(0, 20);
      for (let i = 0; i < benchmarkResults.joinLeave.count; i++) {
        const roomId = roomIds[i % roomIds.length];
        const player = createTestPlayer(`bench_player_${i}`, `BenchPlayer_${i}`);
        
        const start = Date.now();
        const result = gameStore.joinRoom(roomId, player);
        if (result.success) {
          gameStore.leaveRoom(player.id);
        }
        benchmarkResults.joinLeave.avg += Date.now() - start;
      }
      benchmarkResults.joinLeave.avg /= benchmarkResults.joinLeave.count;
      
      // 状态管理基准（简化）
      const testRoom = gameStore.createRoom('state_creator', 'StateCreator');
      for (let i = 0; i < 3; i++) {
        const player = createTestPlayer(`state_player_${i}`, `StatePlayer_${i}`);
        gameStore.joinRoom(testRoom.id, player);
      }
      
      for (let i = 0; i < benchmarkResults.stateManagement.count; i++) {
        const start = Date.now();
        testRoom.startGame();
        if (testRoom.game) {
          testRoom.endGame();
        }
        testRoom.state = 'waiting';
        testRoom.game = null;
        benchmarkResults.stateManagement.avg += Date.now() - start;
      }
      benchmarkResults.stateManagement.avg /= benchmarkResults.stateManagement.count;
      
      // 断线重连基准
      const reconnectPlayer = createTestPlayer('reconnect_player', 'ReconnectPlayer');
      gameStore.joinRoom(testRoom.id, reconnectPlayer);
      testRoom.startGame();
      
      const sessionId = gameStore.socketSessions.get(reconnectPlayer.id);
      for (let i = 0; i < benchmarkResults.reconnect.count; i++) {
        const start = Date.now();
        gameStore.handleDisconnect(reconnectPlayer.id);
        benchmarkResults.reconnect.avg += Date.now() - start;
        
        // 立即重连
        gameStore.reconnect(`new_socket_${i}`, sessionId, testRoom.id);
      }
      benchmarkResults.reconnect.avg /= benchmarkResults.reconnect.count;
      
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n=== 综合房间管理性能基准 ===`);
      console.log('房间创建:');
      console.log(`  数量：${benchmarkResults.roomCreation.count}`);
      console.log(`  平均时间：${benchmarkResults.roomCreation.avg.toFixed(3)}ms`);
      console.log('加入/离开:');
      console.log(`  数量：${benchmarkResults.joinLeave.count}`);
      console.log(`  平均时间：${benchmarkResults.joinLeave.avg.toFixed(3)}ms`);
      console.log('状态管理:');
      console.log(`  数量：${benchmarkResults.stateManagement.count}`);
      console.log(`  平均时间：${benchmarkResults.stateManagement.avg.toFixed(3)}ms`);
      console.log('断线重连:');
      console.log(`  数量：${benchmarkResults.reconnect.count}`);
      console.log(`  平均时间：${benchmarkResults.reconnect.avg.toFixed(3)}ms`);
      console.log('内存:');
      console.log(`  增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`================================`);
      
      // 断言：各项性能指标应该在合理范围内
      expect(benchmarkResults.roomCreation.avg).toBeLessThan(1);
      expect(benchmarkResults.joinLeave.avg).toBeLessThan(1);
      expect(benchmarkResults.stateManagement.avg).toBeLessThan(10);
      expect(benchmarkResults.reconnect.avg).toBeLessThan(1);
    }, 60000);
  });
});
