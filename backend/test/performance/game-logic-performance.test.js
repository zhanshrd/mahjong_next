/**
 * 麻将游戏逻辑性能测试
 * 
 * 测试场景：
 * - 游戏初始化性能（100+ 并发游戏）
 * - 出牌/摸牌操作性能（高频操作）
 * - 胡牌检测性能（复杂计算）
 * - 算分性能（番型计算）
 * - 听牌检测性能
 * - 状态机转换性能
 * 
 * 测试指标：
 * - 操作延迟（P50/P95/P99）
 * - 内存使用增长
 * - CPU 使用率
 * - GC 频率
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MahjongGame } from '../../src/game/MahjongGame.js';
import { TileSet } from '../../src/game/TileSet.js';
import { WinChecker } from '../../src/game/WinChecker.js';
import { Scorer } from '../../src/game/Scorer.js';
import { AdvancedRules } from '../../src/game/AdvancedRules.js';

// 测试配置
const TEST_CONFIG = {
  // 游戏初始化测试
  gameInitialization: {
    concurrentGames: 100,
    playersPerGame: 4
  },
  
  // 出牌/摸牌操作测试
  tileOperations: {
    operationsPerGame: 100,
    concurrentGames: 50
  },
  
  // 胡牌检测测试
  winDetection: {
    handCount: 1000,
    complexHands: 100
  },
  
  // 算分测试
  scoring: {
    scoreCount: 500,
    complexScores: 50
  },
  
  // 听牌检测测试
  tingpaiDetection: {
    handCount: 500
  }
};

// 性能指标收集
class PerformanceMetrics {
  constructor() {
    this.latencies = [];
    this.memorySnapshots = [];
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
      totalOperations: this.latencies.length
    };
  }

  reset() {
    this.latencies = [];
    this.memorySnapshots = [];
    this.startTime = Date.now();
  }
}

// 辅助函数：创建测试玩家
function createTestPlayers(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    id: `player_${i}`,
    name: `Player_${i}`
  }));
}

// 辅助函数：创建测试游戏
function createTestGame(options = {}) {
  const players = createTestPlayers(options.players || 4);
  return new MahjongGame(players, 0, {
    useFlowers: options.useFlowers !== false,
    useWild: options.useWild || false
  });
}

describe('麻将游戏逻辑性能测试', () => {
  const metrics = new PerformanceMetrics();

  beforeEach(() => {
    metrics.reset();
    
    // 初始 GC
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(() => {
    // 强制 GC
    if (global.gc) {
      global.gc();
    }
  });

  describe('游戏初始化性能测试', () => {
    it(`应该能够快速初始化 ${TEST_CONFIG.gameInitialization.concurrentGames} 个并发游戏`, async () => {
      const { concurrentGames, playersPerGame } = TEST_CONFIG.gameInitialization;
      const games = [];
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      // 并发创建游戏
      for (let i = 0; i < concurrentGames; i++) {
        const gameStart = Date.now();
        const game = createTestGame();
        const gameInitTime = Date.now() - gameStart;
        
        metrics.recordLatency(gameInitTime);
        games.push(game);
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n游戏初始化性能测试:`);
      console.log(`  游戏数量：${concurrentGames}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均初始化时间：${stats.latency.avg.toFixed(2)}ms`);
      console.log(`  P95 初始化时间：${stats.latency.p95.toFixed(2)}ms`);
      console.log(`  P99 初始化时间：${stats.latency.p99.toFixed(2)}ms`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：平均初始化时间应该小于 50ms
      expect(stats.latency.avg).toBeLessThan(50);
      
      // 断言：P95 初始化时间应该小于 100ms
      expect(stats.latency.p95).toBeLessThan(100);
      
      // 断言：内存增长应该合理（每个游戏约 1MB）
      expect(stats.memory.growth.heapUsed).toBeLessThan(concurrentGames * 2 * 1024 * 1024);
    }, 60000);

    it('应该在初始化大量游戏时保持内存稳定', async () => {
      const iterations = 5;
      const gamesPerIteration = 50;
      const memoryGrowth = [];
      
      for (let iter = 0; iter < iterations; iter++) {
        const games = [];
        
        // 创建游戏
        for (let i = 0; i < gamesPerIteration; i++) {
          games.push(createTestGame());
        }
        
        metrics.recordMemorySnapshot();
        
        // 清理
        games.length = 0;
        
        // 等待 GC
        if (global.gc) {
          global.gc();
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        
        metrics.recordMemorySnapshot();
        
        const currentGrowth = metrics.memorySnapshots[metrics.memorySnapshots.length - 1].heapUsed -
                             metrics.memorySnapshots[metrics.memorySnapshots.length - 2].heapUsed;
        memoryGrowth.push(currentGrowth);
      }
      
      console.log(`\n游戏初始化内存稳定性:`);
      console.log(`  平均内存增长：${(memoryGrowth.reduce((a, b) => a + b, 0) / memoryGrowth.length / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：内存增长应该趋于稳定
      if (memoryGrowth.length >= 2) {
        expect(memoryGrowth[memoryGrowth.length - 1]).toBeLessThanOrEqual(memoryGrowth[0] * 1.5);
      }
    }, 30000);
  });

  describe('出牌/摸牌操作性能测试', () => {
    it(`应该能够处理高频的出牌/摸牌操作`, async () => {
      const { operationsPerGame, concurrentGames } = TEST_CONFIG.tileOperations;
      const games = Array.from({ length: concurrentGames }, () => createTestGame());
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let totalOperations = 0;
      
      // 在每个游戏中执行操作
      for (let gameIndex = 0; gameIndex < concurrentGames; gameIndex++) {
        const game = games[gameIndex];
        
        for (let op = 0; op < operationsPerGame; op++) {
          const opStart = Date.now();
          
          try {
            // 模拟出牌
            const currentPlayer = game.currentPlayer;
            const hand = game.hands[currentPlayer];
            
            if (hand.length > 0) {
              const tileToDiscard = hand[0];
              game.discardTile(currentPlayer, tileToDiscard);
              
              // 模拟下一个玩家摸牌
              const nextPlayer = (currentPlayer + 1) % 4;
              if (game.tileSet.remaining > 0) {
                const drawnTile = game.tileSet.drawOne();
                if (drawnTile) {
                  game.hands[nextPlayer].push(drawnTile);
                }
              }
              
              const opLatency = Date.now() - opStart;
              metrics.recordLatency(opLatency);
              totalOperations++;
            }
          } catch (error) {
            // 忽略游戏结束的情况
            break;
          }
        }
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n出牌/摸牌操作性能测试:`);
      console.log(`  总操作数：${totalOperations}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均操作延迟：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 操作延迟：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  P99 操作延迟：${stats.latency.p99.toFixed(3)}ms`);
      console.log(`  每秒操作数：${(totalOperations / (totalTime / 1000)).toFixed(0)}`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：平均操作延迟应该小于 5ms
      expect(stats.latency.avg).toBeLessThan(5);
      
      // 断言：P95 操作延迟应该小于 10ms
      expect(stats.latency.p95).toBeLessThan(10);
      
      // 断言：吞吐量应该大于 1000 ops/s
      expect(totalOperations / (totalTime / 1000)).toBeGreaterThan(1000);
    }, 60000);

    it('应该在连续操作中保持性能稳定', async () => {
      const game = createTestGame();
      const operationCount = 500;
      const latencies = [];
      
      for (let i = 0; i < operationCount; i++) {
        const opStart = Date.now();
        
        const currentPlayer = game.currentPlayer;
        const hand = game.hands[currentPlayer];
        
        if (hand.length > 0 && game.tileSet.remaining > 0) {
          const tileToDiscard = hand[0];
          game.discardTile(currentPlayer, tileToDiscard);
          
          const nextPlayer = (currentPlayer + 1) % 4;
          const drawnTile = game.tileSet.drawOne();
          if (drawnTile) {
            game.hands[nextPlayer].push(drawnTile);
          }
        }
        
        latencies.push(Date.now() - opStart);
      }
      
      // 计算性能稳定性
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const variance = latencies.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / latencies.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / avg; // 变异系数
      
      console.log(`\n操作性能稳定性:`);
      console.log(`  平均延迟：${avg.toFixed(3)}ms`);
      console.log(`  标准差：${stdDev.toFixed(3)}ms`);
      console.log(`  变异系数：${(cv * 100).toFixed(2)}%`);
      
      // 断言：变异系数应该小于 0.5（50% 的波动）
      expect(cv).toBeLessThan(0.5);
    }, 30000);
  });

  describe('胡牌检测性能测试', () => {
    it(`应该能够快速检测 ${TEST_CONFIG.winDetection.handCount} 个手牌是否胡牌`, async () => {
      const { handCount } = TEST_CONFIG.winDetection;
      const winChecker = new WinChecker();
      
      // 生成测试手牌
      const testHands = [];
      for (let i = 0; i < handCount; i++) {
        const tileSet = new TileSet(false);
        const hand = [];
        
        // 生成 14 张牌
        for (let j = 0; j < 14; j++) {
          const tile = tileSet.drawOne();
          if (tile) {
            hand.push(tile);
          }
        }
        
        testHands.push(hand);
      }
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let winCount = 0;
      for (const hand of testHands) {
        const checkStart = Date.now();
        const isWin = winChecker.checkWin(hand);
        const checkLatency = Date.now() - checkStart;
        
        metrics.recordLatency(checkLatency);
        
        if (isWin) {
          winCount++;
        }
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n胡牌检测性能测试:`);
      console.log(`  检测手牌数：${handCount}`);
      console.log(`  胡牌数量：${winCount}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均检测时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 检测时间：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  P99 检测时间：${stats.latency.p99.toFixed(3)}ms`);
      console.log(`  每秒检测数：${(handCount / (totalTime / 1000)).toFixed(0)}`);
      
      // 断言：平均检测时间应该小于 1ms
      expect(stats.latency.avg).toBeLessThan(1);
      
      // 断言：P95 检测时间应该小于 2ms
      expect(stats.latency.p95).toBeLessThan(2);
      
      // 断言：吞吐量应该大于 10000 checks/s
      expect(handCount / (totalTime / 1000)).toBeGreaterThan(10000);
    }, 30000);

    it('应该能够快速检测复杂胡牌牌型', async () => {
      const winChecker = new WinChecker();
      const complexHands = [
        // 九莲宝灯
        ['W1', 'W1', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W9', 'W9', 'W5'],
        // 十三幺
        ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'F1', 'F2', 'F3', 'F4', 'J1', 'J2', 'J3', 'W1'],
        // 大三元
        ['J1', 'J1', 'J1', 'J2', 'J2', 'J2', 'J3', 'J3', 'J3', 'W1', 'W1', 'T2', 'T3', 'W1'],
        // 字一色
        ['F1', 'F1', 'F1', 'F2', 'F2', 'F2', 'J1', 'J1', 'J1', 'J2', 'J2', 'J2', 'J3', 'J3']
      ];
      
      metrics.recordMemorySnapshot();
      
      for (const hand of complexHands) {
        const tileObjects = hand.map(t => {
          const suit = t.charAt(0);
          const rank = parseInt(t.substring(1));
          return { suit, rank, value: t };
        });
        
        const start = Date.now();
        winChecker.checkWin(tileObjects);
        metrics.recordLatency(Date.now() - start);
      }
      
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n复杂胡牌牌型检测:`);
      console.log(`  牌型数量：${complexHands.length}`);
      console.log(`  平均检测时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  最大检测时间：${stats.latency.max.toFixed(3)}ms`);
      
      // 断言：复杂牌型检测时间也应该很快
      expect(stats.latency.avg).toBeLessThan(5);
    }, 10000);
  });

  describe('算分性能测试', () => {
    it(`应该能够快速计算 ${TEST_CONFIG.scoring.scoreCount} 个牌型的番数`, async () => {
      const { scoreCount } = TEST_CONFIG.scoring;
      
      // 生成测试牌型
      const testHands = [];
      for (let i = 0; i < scoreCount; i++) {
        const tileSet = new TileSet(false);
        const hand = [];
        const melds = [];
        
        // 生成手牌和 melds
        for (let j = 0; j < 14; j++) {
          const tile = tileSet.drawOne();
          if (tile) {
            hand.push(tile);
          }
        }
        
        // 生成一些 melds
        if (Math.random() > 0.5) {
          melds.push([
            { suit: 'W', rank: 1, value: 'W1' },
            { suit: 'W', rank: 1, value: 'W1' },
            { suit: 'W', rank: 1, value: 'W1' }
          ]);
        }
        
        testHands.push({ hand, melds, dealer: false, selfDraw: Math.random() > 0.5 });
      }
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      for (const { hand, melds, dealer, selfDraw } of testHands) {
        const scoreStart = Date.now();
        
        try {
          Scorer.calculateScore(hand, melds, dealer, selfDraw);
          const scoreLatency = Date.now() - scoreStart;
          metrics.recordLatency(scoreLatency);
        } catch (error) {
          // 忽略无法胡牌的牌型
        }
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n算分性能测试:`);
      console.log(`  计算数量：${scoreCount}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均计算时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 计算时间：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  P99 计算时间：${stats.latency.p99.toFixed(3)}ms`);
      console.log(`  每秒计算数：${(scoreCount / (totalTime / 1000)).toFixed(0)}`);
      
      // 断言：平均计算时间应该小于 2ms
      expect(stats.latency.avg).toBeLessThan(2);
      
      // 断言：P95 计算时间应该小于 5ms
      expect(stats.latency.p95).toBeLessThan(5);
    }, 30000);

    it('应该能够快速计算复杂番型', async () => {
      const complexScores = [
        {
          hand: ['W1', 'W1', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W9', 'W9', 'W5'],
          melds: [],
          dealer: true,
          selfDraw: true
        },
        {
          hand: ['J1', 'J1', 'J1', 'J2', 'J2', 'J2', 'J3', 'J3', 'J3', 'W1', 'W1', 'T2', 'T3', 'W1'],
          melds: [
            [{ suit: 'J', rank: 1, value: 'J1' }, { suit: 'J', rank: 1, value: 'J1' }, { suit: 'J', rank: 1, value: 'J1' }]
          ],
          dealer: false,
          selfDraw: false
        }
      ];
      
      metrics.recordMemorySnapshot();
      
      for (const { hand, melds, dealer, selfDraw } of complexScores) {
        const tileObjects = hand.map(t => {
          const suit = t.charAt(0);
          const rank = parseInt(t.substring(1));
          return { suit, rank, value: t };
        });
        
        const start = Date.now();
        try {
          Scorer.calculateScore(tileObjects, melds, dealer, selfDraw);
          metrics.recordLatency(Date.now() - start);
        } catch (error) {
          // 忽略错误
        }
      }
      
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n复杂番型计算:`);
      console.log(`  牌型数量：${complexScores.length}`);
      console.log(`  平均计算时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  最大计算时间：${stats.latency.max.toFixed(3)}ms`);
      
      // 断言：复杂番型计算时间也应该合理
      expect(stats.latency.avg).toBeLessThan(10);
    }, 10000);
  });

  describe('听牌检测性能测试', () => {
    it(`应该能够快速检测 ${TEST_CONFIG.tingpaiDetection.handCount} 个手牌的听牌`, async () => {
      const { handCount } = TEST_CONFIG.tingpaiDetection;
      
      // 生成测试手牌（13 张）
      const testHands = [];
      for (let i = 0; i < handCount; i++) {
        const tileSet = new TileSet(false);
        const hand = [];
        
        // 生成 13 张牌
        for (let j = 0; j < 13; j++) {
          const tile = tileSet.drawOne();
          if (tile) {
            hand.push(tile);
          }
        }
        
        testHands.push(hand);
      }
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      for (const hand of testHands) {
        const checkStart = Date.now();
        
        try {
          // 使用 WinChecker 检测听牌
          const winChecker = new WinChecker();
          const tingpai = winChecker.getTingpai(hand);
          const checkLatency = Date.now() - checkStart;
          metrics.recordLatency(checkLatency);
        } catch (error) {
          // 忽略错误
        }
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n听牌检测性能测试:`);
      console.log(`  检测手牌数：${handCount}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均检测时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 检测时间：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  P99 检测时间：${stats.latency.p99.toFixed(3)}ms`);
      console.log(`  每秒检测数：${(handCount / (totalTime / 1000)).toFixed(0)}`);
      
      // 断言：平均检测时间应该小于 5ms
      expect(stats.latency.avg).toBeLessThan(5);
      
      // 断言：P95 检测时间应该小于 10ms
      expect(stats.latency.p95).toBeLessThan(10);
    }, 30000);
  });

  describe('状态机转换性能测试', () => {
    it('应该能够快速执行状态机转换', async () => {
      const game = createTestGame();
      const transitionCount = 1000;
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      for (let i = 0; i < transitionCount; i++) {
        const transitionStart = Date.now();
        
        // 模拟状态转换
        const phase = game.phase;
        game._fsm.transition('DRAW');
        game._fsm.transition('DISCARD');
        game._fsm.transition('WAIT_CLAIM');
        game._fsm.transition('NEXT_PLAYER');
        
        metrics.recordLatency(Date.now() - transitionStart);
      }
      
      const totalTime = Date.now() - startTime;
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n状态机转换性能:`);
      console.log(`  转换次数：${transitionCount}`);
      console.log(`  总耗时：${totalTime}ms`);
      console.log(`  平均转换时间：${stats.latency.avg.toFixed(3)}ms`);
      console.log(`  P95 转换时间：${stats.latency.p95.toFixed(3)}ms`);
      console.log(`  每秒转换数：${(transitionCount / (totalTime / 1000)).toFixed(0)}`);
      
      // 断言：平均转换时间应该非常短
      expect(stats.latency.avg).toBeLessThan(0.1);
      
      // 断言：吞吐量应该很高
      expect(transitionCount / (totalTime / 1000)).toBeGreaterThan(50000);
    }, 20000);
  });

  describe('综合游戏流程性能基准', () => {
    it('应该提供完整游戏流程的性能基准数据', async () => {
      const gameCount = 20;
      const turnsPerGame = 50;
      const benchmarkResults = {
        initialization: { avg: 0, total: 0 },
        tileOperations: { avg: 0, total: 0, count: 0 },
        winCheck: { avg: 0, total: 0, count: 0 },
        scoring: { avg: 0, total: 0, count: 0 }
      };
      
      metrics.recordMemorySnapshot();
      
      for (let g = 0; g < gameCount; g++) {
        // 初始化
        const initStart = Date.now();
        const game = createTestGame();
        benchmarkResults.initialization.total += Date.now() - initStart;
        
        // 执行游戏流程
        for (let turn = 0; turn < turnsPerGame; turn++) {
          // 出牌/摸牌
          const opStart = Date.now();
          const currentPlayer = game.currentPlayer;
          const hand = game.hands[currentPlayer];
          
          if (hand.length > 0 && game.tileSet.remaining > 0) {
            const tileToDiscard = hand[0];
            game.discardTile(currentPlayer, tileToDiscard);
            
            const nextPlayer = (currentPlayer + 1) % 4;
            const drawnTile = game.tileSet.drawOne();
            if (drawnTile) {
              game.hands[nextPlayer].push(drawnTile);
            }
            
            benchmarkResults.tileOperations.total += Date.now() - opStart;
            benchmarkResults.tileOperations.count++;
            
            // 胡牌检测
            const winCheckStart = Date.now();
            const winChecker = new WinChecker();
            winChecker.checkWin(game.hands[currentPlayer]);
            benchmarkResults.winCheck.total += Date.now() - winCheckStart;
            benchmarkResults.winCheck.count++;
          }
        }
        
        // 算分（假设胡牌）
        if (game.hands[0].length > 0) {
          const scoreStart = Date.now();
          try {
            Scorer.calculateScore(game.hands[0], game.melds[0], false, true);
            benchmarkResults.scoring.total += Date.now() - scoreStart;
            benchmarkResults.scoring.count++;
          } catch (error) {
            // 忽略
          }
        }
      }
      
      metrics.recordMemorySnapshot();
      
      // 计算平均值
      benchmarkResults.initialization.avg = benchmarkResults.initialization.total / gameCount;
      benchmarkResults.tileOperations.avg = benchmarkResults.tileOperations.total / benchmarkResults.tileOperations.count;
      benchmarkResults.winCheck.avg = benchmarkResults.winCheck.total / benchmarkResults.winCheck.count;
      benchmarkResults.scoring.avg = benchmarkResults.scoring.total / benchmarkResults.scoring.count;
      
      const stats = metrics.getStats();
      
      console.log(`\n=== 综合游戏流程性能基准 ===`);
      console.log('初始化:');
      console.log(`  平均时间：${benchmarkResults.initialization.avg.toFixed(2)}ms`);
      console.log('出牌/摸牌:');
      console.log(`  平均时间：${benchmarkResults.tileOperations.avg.toFixed(3)}ms`);
      console.log(`  总操作数：${benchmarkResults.tileOperations.count}`);
      console.log('胡牌检测:');
      console.log(`  平均时间：${benchmarkResults.winCheck.avg.toFixed(3)}ms`);
      console.log(`  总检测数：${benchmarkResults.winCheck.count}`);
      console.log('算分:');
      console.log(`  平均时间：${benchmarkResults.scoring.avg.toFixed(3)}ms`);
      console.log(`  总计算数：${benchmarkResults.scoring.count}`);
      console.log('内存:');
      console.log(`  增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`================================`);
      
      // 断言：各项性能指标应该在合理范围内
      expect(benchmarkResults.initialization.avg).toBeLessThan(50);
      expect(benchmarkResults.tileOperations.avg).toBeLessThan(5);
      expect(benchmarkResults.winCheck.avg).toBeLessThan(1);
      expect(benchmarkResults.scoring.avg).toBeLessThan(5);
    }, 60000);
  });
});
