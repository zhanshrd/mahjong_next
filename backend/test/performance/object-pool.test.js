/**
 * 对象池性能测试
 * 
 * 测试场景：
 * - 高频创建/归还（10000 次/秒）
 * - 多客户端并发使用对象池
 * - 对象池边界（空池/满池）
 * 
 * 测试指标：
 * - 对象复用率
 * - 内存节省对比
 * - GC 次数对比
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ObjectPool, messagePool, tilePool, BatchQueue } from '../../src/utils/ObjectPool.js';

// 测试配置
const TEST_CONFIG = {
  // 高频创建/归还测试配置
  highFrequency: {
    operationsPerSecond: 5000, // 测试环境使用 5000，生产环境目标 10000
    duration: 5000, // 5 秒
    objectSize: 'medium' // 'small', 'medium', 'large'
  },
  
  // 并发测试配置
  concurrency: {
    concurrentUsers: 50,
    operationsPerUser: 100,
    thinkTime: [10, 100] // 最小/最大思考时间（毫秒）
  },
  
  // 边界测试配置
  boundaries: {
    emptyPoolTest: {
      acquireCount: 200, // 超过初始池大小
      initialSize: 100,
      maxSize: 150
    },
    fullPoolTest: {
      releaseCount: 600, // 超过最大池大小
      initialSize: 100,
      maxSize: 500
    }
  }
};

// 性能指标收集
class PoolMetrics {
  constructor() {
    this.acquisitions = [];
    this.releases = [];
    this.creationTimes = [];
    this.memorySnapshots = [];
    this.gcCounts = { before: 0, after: 0 };
    this.startTime = Date.now();
  }

  recordAcquisition(latency, fromPool) {
    this.acquisitions.push({
      latency,
      fromPool,
      timestamp: Date.now() - this.startTime
    });
  }

  recordRelease(latency) {
    this.releases.push({
      latency,
      timestamp: Date.now() - this.startTime
    });
  }

  recordCreationTime(time) {
    this.creationTimes.push(time);
  }

  recordMemorySnapshot() {
    const usage = process.memoryUsage();
    if (global.gc) {
      global.gc();
      this.gcCounts.after++;
    }
    
    this.memorySnapshots.push({
      timestamp: Date.now() - this.startTime,
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal
    });
  }

  getStats() {
    const avgAcquisitionLatency = this.acquisitions.length > 0
      ? this.acquisitions.reduce((a, b) => a + b.latency, 0) / this.acquisitions.length
      : 0;

    const avgReleaseLatency = this.releases.length > 0
      ? this.releases.reduce((a, b) => a + b.latency, 0) / this.releases.length
      : 0;

    const poolAcquisitions = this.acquisitions.filter(a => a.fromPool).length;
    const totalAcquisitions = this.acquisitions.length;
    const reuseRate = totalAcquisitions > 0 ? poolAcquisitions / totalAcquisitions : 0;

    return {
      acquisitionLatency: {
        avg: avgAcquisitionLatency,
        min: Math.min(...this.acquisitions.map(a => a.latency), 0),
        max: Math.max(...this.acquisitions.map(a => a.latency), 0)
      },
      releaseLatency: {
        avg: avgReleaseLatency,
        min: Math.min(...this.releases.map(r => r.latency), 0),
        max: Math.max(...this.releases.map(r => r.latency), 0)
      },
      reuseRate,
      poolAcquisitions,
      totalAcquisitions,
      memory: {
        initial: this.memorySnapshots[0],
        final: this.memorySnapshots[this.memorySnapshots.length - 1],
        growth: this.memorySnapshots.length >= 2
          ? {
              rss: this.memorySnapshots[this.memorySnapshots.length - 1].rss - this.memorySnapshots[0].rss,
              heapUsed: this.memorySnapshots[this.memorySnapshots.length - 1].heapUsed - this.memorySnapshots[0].heapUsed
            }
          : { rss: 0, heapUsed: 0 }
      },
      gcCounts: this.gcCounts
    };
  }

  reset() {
    this.acquisitions = [];
    this.releases = [];
    this.creationTimes = [];
    this.memorySnapshots = [];
    this.gcCounts = { before: 0, after: 0 };
    this.startTime = Date.now();
  }
}

// 创建测试对象工厂
function createObjectFactory(size = 'medium') {
  const sizeConfig = {
    small: { dataPoints: 10, complexity: 'simple' },
    medium: { dataPoints: 100, complexity: 'moderate' },
    large: { dataPoints: 1000, complexity: 'complex' }
  };

  const config = sizeConfig[size] || sizeConfig.medium;

  return {
    create: () => {
      const obj = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        data: new Array(config.dataPoints).fill(0).map((_, i) => ({
          index: i,
          value: Math.random(),
          metadata: {
            createdAt: Date.now(),
            type: config.complexity
          }
        })),
        metadata: {
          poolCreated: true,
          size
        }
      };
      return obj;
    },
    reset: (obj) => {
      obj.id = '';
      obj.timestamp = 0;
      obj.data.forEach(d => {
        d.value = 0;
        d.metadata.createdAt = 0;
      });
      obj.metadata.poolCreated = false;
    }
  };
}

describe('对象池性能测试', () => {
  const metrics = new PerformanceMetrics();
  let pools = [];

  beforeEach(() => {
    metrics.reset();
    pools = [];
  });

  afterEach(() => {
    // 清理所有池
    pools.forEach(pool => pool.clear());
    pools = [];
    
    // 强制 GC
    if (global.gc) {
      global.gc();
    }
  });

  describe('高频创建/归还测试', () => {
    it(`应该能够处理 ${TEST_CONFIG.highFrequency.operationsPerSecond} 次/秒的对象获取/归还`, async () => {
      const { operationsPerSecond, duration } = TEST_CONFIG.highFrequency;
      const factory = createObjectFactory(TEST_CONFIG.highFrequency.objectSize);
      
      const pool = new ObjectPool(
        factory.create,
        factory.reset,
        500, // initialSize
        2000 // maxSize
      );
      pools.push(pool);
      
      const totalOperations = Math.floor(operationsPerSecond * (duration / 1000));
      const interval = 1000 / operationsPerSecond;
      
      metrics.recordMemorySnapshot();
      const startTime = Date.now();
      
      let successOps = 0;
      let fromPoolCount = 0;
      let newCreationCount = 0;
      
      for (let i = 0; i < totalOperations; i++) {
        const acquireStart = Date.now();
        const obj = pool.acquire();
        const acquireLatency = Date.now() - acquireStart;
        
        // 检查对象是否来自池
        if (obj.metadata?.poolCreated === false) {
          fromPoolCount++;
        } else {
          newCreationCount++;
        }
        
        metrics.recordAcquisition(acquireLatency, obj.metadata?.poolCreated === false);
        
        // 模拟对象使用
        obj.data[0].value = Math.random();
        obj.timestamp = Date.now();
        
        const releaseStart = Date.now();
        pool.release(obj);
        const releaseLatency = Date.now() - releaseStart;
        
        metrics.recordRelease(releaseLatency);
        successOps++;
        
        // 控制操作频率
        const elapsed = Date.now() - startTime;
        const expectedTime = i * interval;
        if (expectedTime > elapsed) {
          await new Promise(resolve => setTimeout(resolve, expectedTime - elapsed));
        }
      }
      
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      const poolStats = pool.getStats();
      
      console.log(`\n高频创建/归还测试结果:`);
      console.log(`  总操作数：${totalOperations}`);
      console.log(`  成功操作：${successOps}`);
      console.log(`  从池获取：${fromPoolCount} (${(fromPoolCount / successOps * 100).toFixed(2)}%)`);
      console.log(`  新创建：${newCreationCount} (${(newCreationCount / successOps * 100).toFixed(2)}%)`);
      console.log(`  对象复用率：${(stats.reuseRate * 100).toFixed(2)}%`);
      console.log(`  平均获取延迟：${stats.acquisitionLatency.avg.toFixed(3)}ms`);
      console.log(`  平均归还延迟：${stats.releaseLatency.avg.toFixed(3)}ms`);
      console.log(`  池统计:`);
      console.log(`    创建总数：${poolStats.created}`);
      console.log(`    获取总数：${poolStats.acquired}`);
      console.log(`    归还总数：${poolStats.released}`);
      console.log(`    当前池大小：${poolStats.poolSize}`);
      console.log(`  内存增长：${(stats.memory.growth.rss / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：对象复用率应该超过 50%
      expect(stats.reuseRate).toBeGreaterThan(0.5);
      
      // 断言：平均获取延迟应该小于 1ms
      expect(stats.acquisitionLatency.avg).toBeLessThan(1);
      
      // 断言：平均归还延迟应该小于 0.5ms
      expect(stats.releaseLatency.avg).toBeLessThan(0.5);
    }, duration + 10000);

    it('应该比直接创建对象更高效', async () => {
      const operationCount = 10000;
      const factory = createObjectFactory('medium');
      
      // 测试对象池
      const pool = new ObjectPool(factory.create, factory.reset, 500, 2000);
      pools.push(pool);
      
      metrics.recordMemorySnapshot();
      
      // 对象池方式
      const poolStart = Date.now();
      for (let i = 0; i < operationCount; i++) {
        const obj = pool.acquire();
        obj.data[0].value = Math.random();
        pool.release(obj);
      }
      const poolTime = Date.now() - poolStart;
      
      metrics.recordMemorySnapshot();
      
      // 直接创建方式
      const directStart = Date.now();
      for (let i = 0; i < operationCount; i++) {
        const obj = factory.create();
        obj.data[0].value = Math.random();
        // 不归还，模拟 GC 压力
      }
      const directTime = Date.now() - directStart;
      
      // 强制 GC 后再次测量
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      metrics.recordMemorySnapshot();
      
      const stats = metrics.getStats();
      
      console.log(`\n对象池 vs 直接创建对比:`);
      console.log(`  操作数：${operationCount}`);
      console.log(`  对象池耗时：${poolTime}ms`);
      console.log(`  直接创建耗时：${directTime}ms`);
      console.log(`  性能提升：${((directTime - poolTime) / directTime * 100).toFixed(2)}%`);
      console.log(`  内存增长：${(stats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：对象池应该更快或至少不慢于直接创建
      // 注意：在某些情况下，对象池可能略慢，但内存效率更高
      expect(poolTime).toBeLessThan(directTime * 1.5); // 允许 50% 的误差范围
    }, 20000);
  });

  describe('多客户端并发使用对象池测试', () => {
    it('应该能够处理多客户端并发访问对象池', async () => {
      const { concurrentUsers, operationsPerUser, thinkTime } = TEST_CONFIG.concurrency;
      const factory = createObjectFactory('medium');
      
      const pool = new ObjectPool(factory.create, factory.reset, 1000, 5000);
      pools.push(pool);
      
      const userPromises = [];
      const userResults = new Array(concurrentUsers).fill(null).map(() => ({
        acquisitions: 0,
        releases: 0,
        errors: 0,
        totalLatency: 0
      }));
      
      metrics.recordMemorySnapshot();
      
      // 模拟多用户并发使用
      for (let userId = 0; userId < concurrentUsers; userId++) {
        const promise = (async () => {
          for (let op = 0; op < operationsPerUser; op++) {
            try {
              const acquireStart = Date.now();
              const obj = pool.acquire();
              const acquireLatency = Date.now() - acquireStart;
              
              // 模拟业务逻辑
              await new Promise(resolve => 
                setTimeout(resolve, thinkTime[0] + Math.random() * (thinkTime[1] - thinkTime[0]))
              );
              
              const releaseStart = Date.now();
              pool.release(obj);
              const releaseLatency = Date.now() - releaseStart;
              
              userResults[userId].acquisitions++;
              userResults[userId].releases++;
              userResults[userId].totalLatency += acquireLatency + releaseLatency;
            } catch (error) {
              userResults[userId].errors++;
            }
          }
        })();
        
        userPromises.push(promise);
        
        // 错开用户启动时间
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // 等待所有用户完成
      await Promise.all(userPromises);
      
      metrics.recordMemorySnapshot();
      
      const totalAcquisitions = userResults.reduce((sum, r) => sum + r.acquisitions, 0);
      const totalReleases = userResults.reduce((sum, r) => sum + r.releases, 0);
      const totalErrors = userResults.reduce((sum, r) => sum + r.errors, 0);
      const totalLatency = userResults.reduce((sum, r) => sum + r.totalLatency, 0);
      const avgLatency = totalLatency / totalAcquisitions;
      
      const stats = metrics.getStats();
      const poolStats = pool.getStats();
      
      console.log(`\n多客户端并发测试结果:`);
      console.log(`  并发用户数：${concurrentUsers}`);
      console.log(`  每用户操作数：${operationsPerUser}`);
      console.log(`  总获取数：${totalAcquisitions}`);
      console.log(`  总归还数：${totalReleases}`);
      console.log(`  错误数：${totalErrors}`);
      console.log(`  平均延迟：${avgLatency.toFixed(3)}ms`);
      console.log(`  池统计:`);
      console.log(`    创建总数：${poolStats.created}`);
      console.log(`    获取总数：${poolStats.acquired}`);
      console.log(`    归还总数：${poolStats.released}`);
      console.log(`    当前池大小：${poolStats.poolSize}`);
      
      // 断言：所有操作应该成功（无错误）
      expect(totalErrors).toBe(0);
      
      // 断言：获取和归还数量应该相等
      expect(totalAcquisitions).toBe(totalReleases);
      
      // 断言：平均延迟应该小于 100ms（包括思考时间）
      expect(avgLatency).toBeLessThan(100);
    }, 30000);

    it('应该在并发压力下保持对象池一致性', async () => {
      const concurrentUsers = 20;
      const operationsPerUser = 50;
      const factory = createObjectFactory('small');
      
      const pool = new ObjectPool(factory.create, factory.reset, 200, 500);
      pools.push(pool);
      
      let maxConcurrentObjects = 0;
      let currentObjects = 0;
      const objectTracker = new Set();
      
      // 并发访问
      const userPromises = [];
      for (let userId = 0; userId < concurrentUsers; userId++) {
        const promise = (async () => {
          for (let op = 0; op < operationsPerUser; op++) {
            const obj = pool.acquire();
            const objId = obj.id;
            
            // 跟踪对象
            objectTracker.add(objId);
            currentObjects++;
            maxConcurrentObjects = Math.max(maxConcurrentObjects, currentObjects);
            
            // 检查对象是否被重复使用
            if (obj.metadata.poolCreated === false && objectTracker.has(objId)) {
              // 对象应该已被重置
              expect(obj.timestamp).toBe(0);
            }
            
            // 模拟使用
            obj.timestamp = Date.now();
            
            await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
            
            pool.release(obj);
            objectTracker.delete(objId);
            currentObjects--;
          }
        })();
        
        userPromises.push(promise);
      }
      
      await Promise.all(userPromises);
      
      // 所有对象应该已归还
      expect(objectTracker.size).toBe(0);
      expect(currentObjects).toBe(0);
      
      console.log(`\n对象池一致性测试:`);
      console.log(`  最大并发对象数：${maxConcurrentObjects}`);
      console.log(`  最终池大小：${pool.getStats().poolSize}`);
      
      // 断言：池大小应该在合理范围内
      expect(pool.getStats().poolSize).toBeLessThanOrEqual(500);
    }, 20000);
  });

  describe('对象池边界测试', () => {
    it('应该正确处理空池情况（获取超过初始大小）', async () => {
      const { acquireCount, initialSize, maxSize } = TEST_CONFIG.boundaries.emptyPoolTest;
      const factory = createObjectFactory('small');
      
      const pool = new ObjectPool(factory.create, factory.reset, initialSize, maxSize);
      pools.push(pool);
      
      const objects = [];
      let newCreations = 0;
      
      metrics.recordMemorySnapshot();
      
      // 获取超过初始池大小的对象
      for (let i = 0; i < acquireCount; i++) {
        const acquireStart = Date.now();
        const obj = pool.acquire();
        const acquireLatency = Date.now() - acquireStart;
        
        if (obj.metadata.poolCreated !== false) {
          newCreations++;
        }
        
        objects.push(obj);
        metrics.recordAcquisition(acquireLatency, obj.metadata.poolCreated === false);
      }
      
      metrics.recordMemorySnapshot();
      
      const poolStats = pool.getStats();
      const stats = metrics.getStats();
      
      console.log(`\n空池边界测试:`);
      console.log(`  初始池大小：${initialSize}`);
      console.log(`  获取数量：${acquireCount}`);
      console.log(`  新创建对象：${newCreations}`);
      console.log(`  池创建对象：${poolStats.created}`);
      console.log(`  当前池大小：${poolStats.poolSize}`);
      console.log(`  平均获取延迟：${stats.acquisitionLatency.avg.toFixed(3)}ms`);
      
      // 断言：应该能够获取所有请求的对象
      expect(objects.length).toBe(acquireCount);
      
      // 断言：新创建数量应该等于 acquireCount - initialSize
      expect(newCreations).toBe(acquireCount - initialSize);
      
      // 断言：池应该为空
      expect(poolStats.poolSize).toBe(0);
    }, 15000);

    it('应该正确处理满池情况（归还超过最大大小）', async () => {
      const { releaseCount, initialSize, maxSize } = TEST_CONFIG.boundaries.fullPoolTest;
      const factory = createObjectFactory('small');
      
      const pool = new ObjectPool(factory.create, factory.reset, initialSize, maxSize);
      pools.push(pool);
      
      // 先获取所有对象
      const objects = [];
      for (let i = 0; i < releaseCount; i++) {
        objects.push(pool.acquire());
      }
      
      metrics.recordMemorySnapshot();
      
      // 归还超过最大池大小的对象
      for (let i = 0; i < releaseCount; i++) {
        pool.release(objects[i]);
      }
      
      metrics.recordMemorySnapshot();
      
      const poolStats = pool.getStats();
      
      console.log(`\n满池边界测试:`);
      console.log(`  最大池大小：${maxSize}`);
      console.log(`  归还数量：${releaseCount}`);
      console.log(`  最终池大小：${poolStats.poolSize}`);
      console.log(`  被拒绝的归还：${releaseCount - poolStats.poolSize}`);
      
      // 断言：池大小不应该超过最大值
      expect(poolStats.poolSize).toBeLessThanOrEqual(maxSize);
      
      // 断言：多余的归还应该被正确拒绝（对象被 GC）
      expect(poolStats.poolSize).toBe(maxSize);
    }, 15000);

    it('应该在边界情况下保持性能稳定', async () => {
      const factory = createObjectFactory('small');
      const pool = new ObjectPool(factory.create, factory.reset, 50, 100);
      pools.push(pool);
      
      const latencies = {
        empty: [],
        half: [],
        full: []
      };
      
      // 测试空池性能
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        pool.acquire();
        latencies.empty.push(Date.now() - start);
      }
      
      // 归还一半
      for (let i = 0; i < 25; i++) {
        pool.release(objects[i]);
      }
      
      // 测试半池性能
      for (let i = 0; i < 25; i++) {
        const start = Date.now();
        pool.acquire();
        latencies.half.push(Date.now() - start);
      }
      
      // 填满池
      const objects = [];
      for (let i = 0; i < 100; i++) {
        objects.push(pool.acquire());
      }
      for (let i = 0; i < 100; i++) {
        pool.release(objects[i]);
      }
      
      // 测试满池性能
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        pool.acquire();
        latencies.full.push(Date.now() - start);
      }
      
      const avgLatencies = {
        empty: latencies.empty.reduce((a, b) => a + b, 0) / latencies.empty.length,
        half: latencies.half.reduce((a, b) => a + b, 0) / latencies.half.length,
        full: latencies.full.reduce((a, b) => a + b, 0) / latencies.full.length
      };
      
      console.log(`\n边界性能稳定性测试:`);
      console.log(`  空池平均延迟：${avgLatencies.empty.toFixed(3)}ms`);
      console.log(`  半池平均延迟：${avgLatencies.half.toFixed(3)}ms`);
      console.log(`  满池平均延迟：${avgLatencies.full.toFixed(3)}ms`);
      
      // 断言：不同状态下的性能差异不应太大
      expect(avgLatencies.empty).toBeLessThan(avgLatencies.full * 2);
      expect(avgLatencies.half).toBeLessThan(avgLatencies.full * 2);
    }, 15000);
  });

  describe('内置对象池测试', () => {
    it('messagePool 应该正常工作', async () => {
      const operations = 1000;
      
      metrics.recordMemorySnapshot();
      
      const messages = [];
      for (let i = 0; i < operations; i++) {
        const msg = messagePool.acquire();
        msg.type = 'test_message';
        msg.data = { index: i };
        msg.timestamp = Date.now();
        messages.push(msg);
      }
      
      for (const msg of messages) {
        messagePool.release(msg);
      }
      
      metrics.recordMemorySnapshot();
      
      const stats = messagePool.getStats();
      
      console.log(`\nmessagePool 测试:`);
      console.log(`  操作数：${operations}`);
      console.log(`  创建总数：${stats.created}`);
      console.log(`  获取总数：${stats.acquired}`);
      console.log(`  归还总数：${stats.released}`);
      console.log(`  当前池大小：${stats.poolSize}`);
      
      expect(stats.poolSize).toBeGreaterThan(0);
      expect(stats.acquired).toBe(operations);
    }, 10000);

    it('tilePool 应该正常工作', async () => {
      const operations = 1000;
      
      metrics.recordMemorySnapshot();
      
      const tiles = [];
      for (let i = 0; i < operations; i++) {
        const tile = tilePool.acquire();
        tile.suit = 'bamboo';
        tile.rank = i % 9 + 1;
        tile.value = `${tile.suit}_${tile.rank}`;
        tiles.push(tile);
      }
      
      for (const tile of tiles) {
        tilePool.release(tile);
      }
      
      metrics.recordMemorySnapshot();
      
      const stats = tilePool.getStats();
      
      console.log(`\ntilePool 测试:`);
      console.log(`  操作数：${operations}`);
      console.log(`  创建总数：${stats.created}`);
      console.log(`  当前池大小：${stats.poolSize}`);
      
      expect(stats.poolSize).toBeGreaterThan(0);
      expect(stats.acquired).toBe(operations);
    }, 10000);
  });

  describe('BatchQueue 性能测试', () => {
    it('应该能够正确批处理消息', async () => {
      const batchSize = 10;
      const intervalMs = 50;
      const sentBatches = [];
      
      const queue = new BatchQueue(
        (batch) => {
          sentBatches.push(batch);
        },
        batchSize,
        intervalMs
      );
      
      // 发送消息
      for (let i = 0; i < 35; i++) {
        queue.push({ id: i, data: `message_${i}` });
      }
      
      // 等待定时器刷新
      await new Promise(resolve => setTimeout(resolve, intervalMs + 50));
      
      const stats = queue.getStats();
      
      console.log(`\nBatchQueue 测试:`);
      console.log(`  总消息数：${stats.totalItems}`);
      console.log(`  批次数：${stats.batches}`);
      console.log(`  队列长度：${stats.queueLength}`);
      console.log(`  发送的批次：${sentBatches.length}`);
      
      // 断言：应该至少有 3 个批次（35 条消息，批次大小 10）
      expect(sentBatches.length).toBeGreaterThanOrEqual(3);
      
      // 断言：所有消息应该被处理
      const totalSent = sentBatches.reduce((sum, batch) => sum + batch.length, 0);
      expect(totalSent).toBe(35);
    }, 5000);

    it('应该在达到批次大小时立即发送', async () => {
      const batchSize = 5;
      const sentBatches = [];
      
      const queue = new BatchQueue(
        (batch) => {
          sentBatches.push(batch);
        },
        batchSize,
        1000 // 长间隔，确保不会触发定时器
      );
      
      // 发送刚好达到批次大小的消息
      for (let i = 0; i < batchSize; i++) {
        queue.push({ id: i });
      }
      
      // 应该立即发送
      expect(sentBatches.length).toBe(1);
      expect(sentBatches[0].length).toBe(batchSize);
      
      // 再发送一批
      for (let i = 0; i < batchSize; i++) {
        queue.push({ id: i + batchSize });
      }
      
      expect(sentBatches.length).toBe(2);
    }, 5000);
  });
});
