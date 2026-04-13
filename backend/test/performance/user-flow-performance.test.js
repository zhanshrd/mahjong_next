/**
 * 完整用户流程性能测试
 * 
 * 测试场景：
 * - 完整游戏流程（创建房间→加入→游戏→结束→离开）
 * - 多用户并发游戏流程
 * - 长时间多局游戏性能
 * - 用户流转化的性能影响
 * 
 * 测试指标：
 * - 完整流程耗时
 * - 各阶段延迟分布
 * - 内存使用增长
 * - 系统吞吐量
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { GameStore } from '../../src/store/GameStore.js';
import { Room } from '../../src/game/Room.js';
import { MahjongGame } from '../../src/game/MahjongGame.js';
import { WinChecker } from '../../src/game/WinChecker.js';

// 测试配置
const TEST_CONFIG = {
  // 单用户完整流程测试
  singleUserFlow: {
    iterations: 50,
    turnsPerGame: 100
  },
  
  // 多用户并发流程测试
  multiUserFlow: {
    concurrentGames: 20,
    turnsPerGame: 50
  },
  
  // 长时间运行测试
  longRunning: {
    totalGames: 100,
    playersPerGame: 4,
    turnsPerGame: 80
  },
  
  // 房间流转测试
  roomFlow: {
    createJoinLeave: 500,
    quickJoin: 300
  }
};

// 性能指标收集
class PerformanceMetrics {
  constructor() {
    this.latencies = [];
    this.stageLatencies = new Map();
    this.memorySnapshots = [];
    this.throughputSamples = [];
    this.startTime = Date.now();
  }

  recordLatency(latency, stage = 'total') {
    this.latencies.push(latency);
    
    if (!this.stageLatencies.has(stage)) {
      this.stageLatencies.set(stage, []);
    }
    this.stageLatencies.get(stage).push(latency);
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

  recordThroughput(operations, duration) {
    this.throughputSamples.push({
      operations,
      duration,
      opsPerSecond: operations / (duration / 1000)
    });
  }

  getPercentile(p, latencies = this.latencies) {
    if (latencies.length === 0) return 0;
    const sorted = [...latencies].sort((a, b) => a - b);
    const index = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  getStats() {
    const avgLatency = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;

    const lastMemory = this.memorySnapshots[this.memorySnapshots.length - 1] || { rss: 0, heapUsed: 0 };
    const firstMemory = this.memorySnapshots[0] || { rss: 0, heapUsed: 0 };

    const stageStats = {};
    for (const [stage, latencies] of this.stageLatencies) {
      stageStats[stage] = {
        avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        p95: this.getPercentile(95, latencies),
        p99: this.getPercentile(99, latencies),
        count: latencies.length
      };
    }

    const avgThroughput = this.throughputSamples.length > 0
      ? this.throughputSamples.reduce((a, b) => a + b.opsPerSecond, 0) / this.throughputSamples.length
      : 0;

    return {
      latency: {
        avg: avgLatency,
        p50: this.getPercentile(50),
        p95: this.getPercentile(95),
        p99: this.getPercentile(99),
        min: Math.min(...this.latencies, 0),
        max: Math.max(...this.latencies, 0)
      },
      stageLatencies: stageStats,
      memory: {
        initial: firstMemory,
        final: lastMemory,
        growth: {
          rss: lastMemory.rss - firstMemory.rss,
          heapUsed: lastMemory.heapUsed - firstMemory.heapUsed
        }
      },
      throughput: {
        avg: avgThroughput,
        samples: this.throughputSamples.length
      },
      totalOperations: this.latencies.length
    };
  }

  reset() {
    this.latencies = [];
    this.stageLatencies.clear();
    this.memorySnapshots = [];
    this.throughputSamples = [];
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

// 辅助函数：模拟完整游戏流程
async function simulateCompleteGame(gameStore, roomId, players, turns = 50) {
  const room = gameStore.getRoom(roomId);
  if (!room) return null;
  
  // 加入玩家
  for (const player of players) {
    gameStore.joinRoom(roomId, player);
  }
  
  // 开始游戏
  if (!room.startGame()) {
    return null;
  }
  
  // 模拟游戏流程
  let turnCount = 0;
  while (turnCount < turns && room.game && !room.game.finished && room.game.tileSet.remaining > 0) {
    const currentPlayer = room.game.currentPlayer;
    const hand = room.game.hands[currentPlayer];
    
    if (hand.length > 0) {
      // 出牌
      const tileToDiscard = hand[0];
      room.game.discardTile(currentPlayer, tileToDiscard);
      
      // 下一家摸牌
      const nextPlayer = (currentPlayer + 1) % 4;
      const drawnTile = room.game.tileSet.drawOne();
      if (drawnTile) {
        room.game.hands[nextPlayer].push(drawnTile);
      }
      
      turnCount++;
    } else {
      break;
    }
  }
  
  // 结束游戏
  room.endGame();
  
  // 玩家离开
  for (const player of players) {
    gameStore.leaveRoom(player.id);
  }
  
  return { turns: turnCount, success: true };
}

describe('完整用户流程性能测试', () => {
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

  describe('单用户完整流程测试', () => {
    it(`应该能够完成 ${TEST_CONFIG.singleUserFlow.iterations} 次完整游戏流程`, async () => {
      const { iterations, turnsPerGame } = TEST_CONFIG.singleUserFlow;
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let successCount = 0;
      let totalFlowTime = 0;
      
      for (let i = 0; i < iterations; i++) {
        const flowStart = Date.now();
        
        // 创建房间
        const creator = createTestPlayer(`creator_${i}`, `Creator_${i}`);
        const room = gameStore.createRoom(creator.id);
        
        // 加入其他玩家
        const players = [creator];
        for (let j = 1; j < 4; j++) {
          const player = createTestPlayer(`player_${i}_${j}`, `Player_${i}_${j}`);
          gameStore.joinRoom(room.id, player);
          players.push(player);
        }
        
        // 开始游戏
        const gameStart = Date.now();
        room.startGame();
        metrics.recordLatency(Date.now() - gameStart, 'start_game');
        
        // 模拟游戏流程
        let turnCount = 0;
        while (turnCount < turnsPerGame && room.game && !room.game.finished && room.game.tileSet.remaining > 0) {
          const turnStart = Date.now();
          
          const currentPlayer = room.game.currentPlayer;
          const hand = room.game.hands[currentPlayer];
          
          if (hand.length > 0) {
            room.game.discardTile(currentPlayer, hand[0]);
            
            const nextPlayer = (currentPlayer + 1) % 4;
            const drawnTile = room.game.tileSet.drawOne();
            if (drawnTile) {
              room.game.hands[nextPlayer].push(drawnTile);
            }
            
            metrics.recordLatency(Date.now() - turnStart, 'turn');
            turnCount++;
          } else {
            break;
          }
        }
        
        // 结束游戏
        const endStart = Date.now();
        room.endGame();
        metrics.recordLatency(Date.now() - endStart, 'end_game');
        
        // 玩家离开
        const leaveStart = Date.now();
        for (const player of players) {
          gameStore.leaveRoom(player.id);
        }
        metrics.recordLatency(Date.now() - leaveStart, 'leave');
        
        const flowTime = Date.now() - flowStart;
        totalFlowTime += flowTime;
        metrics.recordLatency(flowTime, 'total_flow');
        
        if (room.game) {
          successCount++;
        }
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n单用户完整流程测试:`);
      console.log(`  迭代次数：${iterations}`);
      console.log(`  成功次数：${successCount}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均流程耗时：${stats.latency.avg.toFixed(2)}ms`);
      console.log(`  P95 流程耗时：${stats.latency.p95.toFixed(2)}ms`);
      console.log(`  P99 流程耗时：${stats.latency.p99.toFixed(2)}ms`);
      console.log(`  每局游戏平均耗时：${(totalFlowTime / successCount).toFixed(2)}ms`);
      console.log(`\n各阶段延迟:`);
      for (const [stage, data] of Object.entries(stats.stageLatencies)) {
        if (stage !== 'total_flow') {
          console.log(`  ${stage}: 平均=${data.avg.toFixed(3)}ms, P95=${data.p95.toFixed(3)}ms, 次数=${data.count}`);
        }
      }
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：成功率应该大于 95%
      expect(successCount / iterations).toBeGreaterThan(0.95);
      
      // 断言：平均流程时间应该合理
      expect(stats.latency.avg).toBeLessThan(500);
      
      // 断言：内存增长应该合理
      expect(stats.memory.growth.heapUsed).toBeLessThan(iterations * 1024);
    }, 120000);

    it('应该在连续游戏流程中保持性能稳定', async () => {
      const iterations = 20;
      const latencies = [];
      
      for (let i = 0; i < iterations; i++) {
        const creator = createTestPlayer(`stable_creator_${i}`, `StableCreator_${i}`);
        const room = gameStore.createRoom(creator.id);
        
        const players = [creator];
        for (let j = 1; j < 4; j++) {
          const player = createTestPlayer(`stable_player_${i}_${j}`, `StablePlayer_${i}_${j}`);
          gameStore.joinRoom(room.id, player);
          players.push(player);
        }
        
        const flowStart = Date.now();
        
        room.startGame();
        
        // 简化游戏流程
        for (let turn = 0; turn < 30 && room.game && room.game.tileSet.remaining > 0; turn++) {
          const currentPlayer = room.game.currentPlayer;
          if (room.game.hands[currentPlayer].length > 0) {
            room.game.discardTile(currentPlayer, room.game.hands[currentPlayer][0]);
            const nextPlayer = (currentPlayer + 1) % 4;
            const drawnTile = room.game.tileSet.drawOne();
            if (drawnTile) {
              room.game.hands[nextPlayer].push(drawnTile);
            }
          }
        }
        
        room.endGame();
        
        for (const player of players) {
          gameStore.leaveRoom(player.id);
        }
        
        latencies.push(Date.now() - flowStart);
      }
      
      // 计算稳定性
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const variance = latencies.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / latencies.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / avg;
      
      console.log(`\n连续游戏流程稳定性:`);
      console.log(`  平均耗时：${avg.toFixed(2)}ms`);
      console.log(`  标准差：${stdDev.toFixed(2)}ms`);
      console.log(`  变异系数：${(cv * 100).toFixed(2)}%`);
      
      // 断言：变异系数应该小于 0.3
      expect(cv).toBeLessThan(0.3);
    }, 60000);
  });

  describe('多用户并发流程测试', () => {
    it(`应该能够并发处理 ${TEST_CONFIG.multiUserFlow.concurrentGames} 个游戏`, async () => {
      const { concurrentGames, turnsPerGame } = TEST_CONFIG.multiUserFlow;
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      const games = [];
      
      // 并发创建和开始游戏
      for (let i = 0; i < concurrentGames; i++) {
        const creator = createTestPlayer(`concurrent_creator_${i}`, `ConcurrentCreator_${i}`);
        const room = gameStore.createRoom(creator.id);
        
        const players = [creator];
        for (let j = 1; j < 4; j++) {
          const player = createTestPlayer(`concurrent_player_${i}_${j}`, `ConcurrentPlayer_${i}_${j}`);
          gameStore.joinRoom(room.id, player);
          players.push(player);
        }
        
        room.startGame();
        games.push({ room, players, turns: 0 });
      }
      
      metrics.recordMemorySnapshot();
      
      // 并发执行游戏流程
      let totalTurns = 0;
      while (games.some(g => g.room.game && !g.room.game.finished && g.turns < turnsPerGame)) {
        for (const game of games) {
          if (game.room.game && !game.room.game.finished && game.turns < turnsPerGame) {
            const turnStart = Date.now();
            
            const currentPlayer = game.room.game.currentPlayer;
            const hand = game.room.game.hands[currentPlayer];
            
            if (hand.length > 0) {
              game.room.game.discardTile(currentPlayer, hand[0]);
              
              const nextPlayer = (currentPlayer + 1) % 4;
              const drawnTile = game.room.game.tileSet.drawOne();
              if (drawnTile) {
                game.room.game.hands[nextPlayer].push(drawnTile);
              }
              
              metrics.recordLatency(Date.now() - turnStart, 'concurrent_turn');
              game.turns++;
              totalTurns++;
            }
          }
        }
      }
      
      // 结束所有游戏
      for (const game of games) {
        game.room.endGame();
        
        for (const player of game.players) {
          gameStore.leaveRoom(player.id);
        }
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n多用户并发流程测试:`);
      console.log(`  并发游戏数：${concurrentGames}`);
      console.log(`  总回合数：${totalTurns}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均回合延迟：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 回合延迟：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  P99 回合延迟：${stats.latency.p99.toFixed(3)}ms`);
      console.log(`  每秒回合数：${(totalTurns / (totalTime / 1000)).toFixed(0)}`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：平均回合延迟应该小于 5ms
      expect(stats.latency.avg).toBeLessThan(5);
      
      // 断言：吞吐量应该大于 1000 turns/s
      expect(totalTurns / (totalTime / 1000)).toBeGreaterThan(1000);
    }, 120000);
  });

  describe('长时间多局游戏性能测试', () => {
    it(`应该能够处理 ${TEST_CONFIG.longRunning.totalGames} 局游戏`, async () => {
      const { totalGames, playersPerGame, turnsPerGame } = TEST_CONFIG.longRunning;
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let completedGames = 0;
      const memoryCheckpoints = [];
      
      for (let i = 0; i < totalGames; i++) {
        const creator = createTestPlayer(`longrun_creator_${i}`, `LongRunCreator_${i}`);
        const room = gameStore.createRoom(creator.id);
        
        const players = [creator];
        for (let j = 1; j < playersPerGame; j++) {
          const player = createTestPlayer(`longrun_player_${i}_${j}`, `LongRunPlayer_${i}_${j}`);
          gameStore.joinRoom(room.id, player);
          players.push(player);
        }
        
        room.startGame();
        
        // 执行游戏流程
        let turnCount = 0;
        while (turnCount < turnsPerGame && room.game && !room.game.finished && room.game.tileSet.remaining > 0) {
          const currentPlayer = room.game.currentPlayer;
          if (room.game.hands[currentPlayer].length > 0) {
            room.game.discardTile(currentPlayer, room.game.hands[currentPlayer][0]);
            const nextPlayer = (currentPlayer + 1) % 4;
            const drawnTile = room.game.tileSet.drawOne();
            if (drawnTile) {
              room.game.hands[nextPlayer].push(drawnTile);
            }
            turnCount++;
          }
        }
        
        room.endGame();
        
        for (const player of players) {
          gameStore.leaveRoom(player.id);
        }
        
        completedGames++;
        
        // 定期记录内存
        if (i % 10 === 0) {
          metrics.recordMemorySnapshot();
          memoryCheckpoints.push({
            game: i,
            rooms: gameStore.rooms.size,
            memory: process.memoryUsage().heapUsed / 1024 / 1024
          });
        }
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n长时间多局游戏测试:`);
      console.log(`  总游戏数：${totalGames}`);
      console.log(`  完成游戏数：${completedGames}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均每局游戏：${(totalTime / completedGames).toFixed(2)}ms`);
      console.log(`  每秒游戏数：${(completedGames / (totalTime / 1000)).toFixed(2)}`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      console.log(`\n内存检查点:`);
      for (const checkpoint of memoryCheckpoints) {
        console.log(`  游戏 ${checkpoint.game}: 房间数=${checkpoint.rooms}, 内存=${checkpoint.memory.toFixed(2)}MB`);
      }
      
      // 断言：所有游戏都应该完成
      expect(completedGames).toBe(totalGames);
      
      // 断言：平均游戏时间应该合理
      expect(totalTime / completedGames).toBeLessThan(200);
      
      // 断言：内存增长应该可控
      expect(stats.memory.growth.heapUsed).toBeLessThan(totalGames * 512);
    }, 180000);
  });

  describe('房间流转性能测试', () => {
    it(`应该能够处理 ${TEST_CONFIG.roomFlow.createJoinLeave} 次创建 - 加入 - 离开流程`, async () => {
      const { createJoinLeave } = TEST_CONFIG.roomFlow;
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let successCount = 0;
      
      for (let i = 0; i < createJoinLeave; i++) {
        const flowStart = Date.now();
        
        // 创建房间
        const creator = createTestPlayer(`flow_creator_${i}`, `FlowCreator_${i}`);
        const room = gameStore.createRoom(creator.id);
        metrics.recordLatency(Date.now() - flowStart, 'create');
        
        // 加入
        const joinStart = Date.now();
        const player = createTestPlayer(`flow_player_${i}`, `FlowPlayer_${i}`);
        gameStore.joinRoom(room.id, player);
        metrics.recordLatency(Date.now() - joinStart, 'join');
        
        // 离开
        const leaveStart = Date.now();
        gameStore.leaveRoom(player.id);
        metrics.recordLatency(Date.now() - leaveStart, 'leave');
        
        // 清理房间
        gameStore.leaveRoom(creator.id);
        
        successCount++;
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n创建 - 加入 - 离开流转测试:`);
      console.log(`  总流程数：${createJoinLeave}`);
      console.log(`  成功：${successCount}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均流程耗时：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  每秒流程数：${(createJoinLeave / (totalTime / 1000)).toFixed(0)}`);
      
      console.log(`\n各阶段延迟:`);
      for (const [stage, data] of Object.entries(stats.stageLatencies)) {
        console.log(`  ${stage}: 平均=${data.avg.toFixed(3)}ms, P95=${data.p95.toFixed(3)}ms`);
      }
      
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：所有流程都应该成功
      expect(successCount).toBe(createJoinLeave);
      
      // 断言：平均流程时间应该非常快
      expect(stats.latency.avg).toBeLessThan(1);
      
      // 断言：吞吐量应该很高
      expect(createJoinLeave / (totalTime / 1000)).toBeGreaterThan(10000);
    }, 60000);
  });

  describe('综合用户流程性能基准', () => {
    it('应该提供完整的用户流程性能基准', async () => {
      const benchmarkResults = {
        roomCreation: { count: 100, avg: 0 },
        playerJoin: { count: 400, avg: 0 },
        gameStart: { count: 100, avg: 0 },
        gameFlow: { turns: 3000, avg: 0 },
        gameEnd: { count: 100, avg: 0 },
        playerLeave: { count: 400, avg: 0 }
      };
      
      metrics.recordMemorySnapshot();
      
      for (let i = 0; i < 100; i++) {
          const creator = createTestPlayer(`bench_creator_${i}`, `BenchCreator_${i}`);
          
          // 创建房间
          const createStart = Date.now();
          const room = gameStore.createRoom(creator.id);
          benchmarkResults.roomCreation.avg += Date.now() - createStart;
          
          // 玩家加入
          const players = [creator];
          for (let j = 1; j < 4; j++) {
            const player = createTestPlayer(`bench_player_${i}_${j}`, `BenchPlayer_${i}_${j}`);
            const joinStart = Date.now();
            gameStore.joinRoom(room.id, player);
            benchmarkResults.playerJoin.avg += Date.now() - joinStart;
            players.push(player);
          }
          
          // 开始游戏
          const startGameStart = Date.now();
          room.startGame();
          benchmarkResults.gameStart.avg += Date.now() - startGameStart;
          
          // 游戏流程
          if (room.game) {
            for (let turn = 0; turn < 30 && room.game.tileSet.remaining > 0; turn++) {
              const turnStart = Date.now();
              const currentPlayer = room.game.currentPlayer;
              if (room.game.hands[currentPlayer].length > 0) {
                room.game.discardTile(currentPlayer, room.game.hands[currentPlayer][0]);
                const nextPlayer = (currentPlayer + 1) % 4;
                const drawnTile = room.game.tileSet.drawOne();
                if (drawnTile) {
                  room.game.hands[nextPlayer].push(drawnTile);
                }
              }
              benchmarkResults.gameFlow.avg += Date.now() - turnStart;
            }
          }
          
          // 结束游戏
          const endGameStart = Date.now();
          room.endGame();
          benchmarkResults.gameEnd.avg += Date.now() - endGameStart;
          
          // 玩家离开
          for (const player of players) {
            const leaveStart = Date.now();
            gameStore.leaveRoom(player.id);
            benchmarkResults.playerLeave.avg += Date.now() - leaveStart;
          }
        }
      
      // 计算平均值
      benchmarkResults.roomCreation.avg /= benchmarkResults.roomCreation.count;
      benchmarkResults.playerJoin.avg /= benchmarkResults.playerJoin.count;
      benchmarkResults.gameStart.avg /= benchmarkResults.gameStart.count;
      benchmarkResults.gameFlow.avg /= benchmarkResults.gameFlow.turns;
      benchmarkResults.gameEnd.avg /= benchmarkResults.gameEnd.count;
      benchmarkResults.playerLeave.avg /= benchmarkResults.playerLeave.count;
      
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n=== 综合用户流程性能基准 ===`);
      console.log('房间创建:');
      console.log(`  数量：${benchmarkResults.roomCreation.count}`);
      console.log(`  平均时间：${benchmarkResults.roomCreation.avg.toFixed(3)}ms`);
      console.log('玩家加入:');
      console.log(`  数量：${benchmarkResults.playerJoin.count}`);
      console.log(`  平均时间：${benchmarkResults.playerJoin.avg.toFixed(3)}ms`);
      console.log('游戏开始:');
      console.log(`  数量：${benchmarkResults.gameStart.count}`);
      console.log(`  平均时间：${benchmarkResults.gameStart.avg.toFixed(3)}ms`);
      console.log('游戏流程:');
      console.log(`  回合数：${benchmarkResults.gameFlow.turns}`);
      console.log(`  平均回合：${benchmarkResults.gameFlow.avg.toFixed(3)}ms`);
      console.log('游戏结束:');
      console.log(`  数量：${benchmarkResults.gameEnd.count}`);
      console.log(`  平均时间：${benchmarkResults.gameEnd.avg.toFixed(3)}ms`);
      console.log('玩家离开:');
      console.log(`  数量：${benchmarkResults.playerLeave.count}`);
      console.log(`  平均时间：${benchmarkResults.playerLeave.avg.toFixed(3)}ms`);
      console.log('内存:');
      console.log(`  增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`================================`);
      
      // 断言：各项性能指标应该在合理范围内
      expect(benchmarkResults.roomCreation.avg).toBeLessThan(1);
      expect(benchmarkResults.playerJoin.avg).toBeLessThan(1);
      expect(benchmarkResults.gameStart.avg).toBeLessThan(10);
      expect(benchmarkResults.gameFlow.avg).toBeLessThan(5);
      expect(benchmarkResults.gameEnd.avg).toBeLessThan(1);
      expect(benchmarkResults.playerLeave.avg).toBeLessThan(1);
    }, 120000);
  });
});
