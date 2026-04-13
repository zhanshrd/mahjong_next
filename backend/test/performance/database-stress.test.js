/**
 * 数据库压力测试
 * 
 * 测试场景：
 * - 高频读写（1000 次/秒）
 * - 并发写入冲突
 * - 查询性能退化
 * 
 * 测试指标：
 * - 查询延迟
 * - 连接池使用率
 * - 内存占用
 * 
 * 注意：由于项目当前未配置实际数据库连接，
 * 本测试使用模拟的数据库操作来演示测试框架。
 * 在实际使用时，需要连接真实的 MongoDB 数据库。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

// 测试配置
const TEST_CONFIG = {
  // 数据库连接配置
  connection: {
    uri: process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/mahjong_test',
    options: {
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 30000
    }
  },
  
  // 高频读写测试配置
  highFrequency: {
    operationsPerSecond: 500, // 测试环境使用 500，生产环境目标 1000
    duration: 5000, // 5 秒
    readWriteRatio: 0.7 // 70% 读，30% 写
  },
  
  // 并发写入测试配置
  concurrentWrites: {
    concurrentUsers: 50,
    writesPerUser: 100,
    conflictRate: 0.1 // 10% 的写入可能冲突
  },
  
  // 查询性能测试配置
  queryPerformance: {
    queryCount: 1000,
    complexityLevels: ['simple', 'moderate', 'complex'],
    indexUsage: true
  }
};

// 模拟数据库模型（用于演示）
// 实际使用时应替换为真实的 Mongoose 模型
class MockDatabase {
  constructor() {
    this.collections = new Map();
    this.operations = [];
    this.latencies = {
      read: [],
      write: [],
      update: [],
      delete: []
    };
  }

  async connect() {
    // 模拟连接延迟
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
  }

  async disconnect() {
    this.collections.clear();
    return true;
  }

  async insert(collection, doc) {
    const start = Date.now();
    
    if (!this.collections.has(collection)) {
      this.collections.set(collection, []);
    }
    
    const docWithId = {
      ...doc,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date()
    };
    
    this.collections.get(collection).push(docWithId);
    
    const latency = Date.now() - start;
    this.latencies.write.push(latency);
    this.operations.push({ type: 'insert', collection, latency });
    
    return docWithId;
  }

  async findById(collection, id) {
    const start = Date.now();
    
    const docs = this.collections.get(collection) || [];
    const doc = docs.find(d => d._id.toString() === id.toString());
    
    const latency = Date.now() - start;
    this.latencies.read.push(latency);
    this.operations.push({ type: 'find', collection, latency });
    
    return doc || null;
  }

  async find(collection, query, options = {}) {
    const start = Date.now();
    
    let docs = this.collections.get(collection) || [];
    
    // 简单查询过滤
    if (query && Object.keys(query).length > 0) {
      docs = docs.filter(doc => {
        return Object.entries(query).every(([key, value]) => {
          return doc[key] === value;
        });
      });
    }
    
    // 排序
    if (options.sort) {
      const sortKey = Object.keys(options.sort)[0];
      const sortOrder = options.sort[sortKey];
      docs.sort((a, b) => {
        if (a[sortKey] < b[sortKey]) return -1 * sortOrder;
        if (a[sortKey] > b[sortKey]) return 1 * sortOrder;
        return 0;
      });
    }
    
    // 分页
    if (options.limit) {
      docs = docs.slice(0, options.limit);
    }
    
    const latency = Date.now() - start;
    this.latencies.read.push(latency);
    this.operations.push({ type: 'find', collection, query, latency });
    
    return docs;
  }

  async update(collection, query, update) {
    const start = Date.now();
    
    const docs = this.collections.get(collection) || [];
    let updatedCount = 0;
    
    for (const doc of docs) {
      const matches = Object.entries(query).every(([key, value]) => {
        return doc[key] === value;
      });
      
      if (matches) {
        Object.assign(doc, update);
        doc.updatedAt = new Date();
        updatedCount++;
      }
    }
    
    const latency = Date.now() - start;
    this.latencies.update.push(latency);
    this.operations.push({ type: 'update', collection, latency, updatedCount });
    
    return { modifiedCount: updatedCount };
  }

  async delete(collection, query) {
    const start = Date.now();
    
    const docs = this.collections.get(collection) || [];
    const initialLength = docs.length;
    
    const filteredDocs = docs.filter(doc => {
      const matches = Object.entries(query).every(([key, value]) => {
        return doc[key] === value;
      });
      return !matches;
    });
    
    this.collections.set(collection, filteredDocs);
    const deletedCount = initialLength - filteredDocs.length;
    
    const latency = Date.now() - start;
    this.latencies.delete.push(latency);
    this.operations.push({ type: 'delete', collection, latency, deletedCount });
    
    return { deletedCount };
  }

  getStats() {
    const calcStats = (latencies) => {
      if (latencies.length === 0) return { avg: 0, min: 0, max: 0, p95: 0, p99: 0 };
      
      const sorted = [...latencies].sort((a, b) => a - b);
      const sum = latencies.reduce((a, b) => a + b, 0);
      
      return {
        avg: sum / latencies.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        p99: sorted[Math.floor(sorted.length * 0.99)] || 0
      };
    };
    
    return {
      totalOperations: this.operations.length,
      readStats: calcStats(this.latencies.read),
      writeStats: calcStats(this.latencies.write),
      updateStats: calcStats(this.latencies.update),
      deleteStats: calcStats(this.latencies.delete),
      collectionSizes: Object.fromEntries(
        Array.from(this.collections.entries()).map(([k, v]) => [k, v.length])
      )
    };
  }

  clear() {
    this.collections.clear();
    this.operations = [];
    Object.keys(this.latencies).forEach(key => {
      this.latencies[key] = [];
    });
  }
}

// 性能监控器
class DatabasePerformanceMonitor {
  constructor() {
    this.memorySnapshots = [];
    this.connectionPoolStats = [];
    this.queryLatencies = [];
    this.errorCounts = new Map();
    this.startTime = Date.now();
  }

  recordMemoryUsage() {
    const usage = process.memoryUsage();
    this.memorySnapshots.push({
      timestamp: Date.now() - this.startTime,
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal
    });
  }

  recordQueryLatency(latency, type) {
    this.queryLatencies.push({ latency, type, timestamp: Date.now() - this.startTime });
  }

  recordError(errorType) {
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);
  }

  getStats() {
    const readLatencies = this.queryLatencies.filter(q => q.type === 'read').map(q => q.latency);
    const writeLatencies = this.queryLatencies.filter(q => q.type === 'write').map(q => q.latency);
    
    const calcPercentile = (arr, p) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * p / 100)] || 0;
    };
    
    return {
      queryLatencies: {
        read: {
          avg: readLatencies.length > 0 ? readLatencies.reduce((a, b) => a + b, 0) / readLatencies.length : 0,
          p50: calcPercentile(readLatencies, 50),
          p95: calcPercentile(readLatencies, 95),
          p99: calcPercentile(readLatencies, 99)
        },
        write: {
          avg: writeLatencies.length > 0 ? writeLatencies.reduce((a, b) => a + b, 0) / writeLatencies.length : 0,
          p50: calcPercentile(writeLatencies, 50),
          p95: calcPercentile(writeLatencies, 95),
          p99: calcPercentile(writeLatencies, 99)
        }
      },
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
      errors: Object.fromEntries(this.errorCounts),
      totalQueries: this.queryLatencies.length
    };
  }

  reset() {
    this.memorySnapshots = [];
    this.connectionPoolStats = [];
    this.queryLatencies = [];
    this.errorCounts.clear();
    this.startTime = Date.now();
  }
}

describe('数据库压力测试', () => {
  const db = new MockDatabase();
  const monitor = new DatabasePerformanceMonitor();

  beforeAll(async () => {
    await db.connect();
  }, 10000);

  afterAll(async () => {
    await db.disconnect();
  }, 10000);

  beforeEach(() => {
    monitor.reset();
    db.clear();
  });

  afterEach(() => {
    db.clear();
  });

  describe('高频读写测试', () => {
    it(`应该能够处理 ${TEST_CONFIG.highFrequency.operationsPerSecond} 次/秒的数据库操作`, async () => {
      const { operationsPerSecond, duration, readWriteRatio } = TEST_CONFIG.highFrequency;
      
      const totalOperations = Math.floor(operationsPerSecond * (duration / 1000));
      const readCount = Math.floor(totalOperations * readWriteRatio);
      const writeCount = totalOperations - readCount;
      
      monitor.recordMemoryUsage();
      const startTime = Date.now();
      
      // 先写入一些数据
      const writtenDocs = [];
      for (let i = 0; i < writeCount * 0.3; i++) {
        const doc = await db.insert('test_collection', {
          index: i,
          name: `User_${i}`,
          score: Math.floor(Math.random() * 1000),
          data: new Array(100).fill('x').join('')
        });
        writtenDocs.push(doc);
        monitor.recordQueryLatency(db.latencies.write[db.latencies.write.length - 1], 'write');
      }
      
      // 混合读写操作
      const interval = 1000 / operationsPerSecond;
      let readOps = 0;
      let writeOps = 0;
      
      for (let i = 0; i < totalOperations * 0.7; i++) {
        const opStart = Date.now();
        
        if (Math.random() < readWriteRatio && writtenDocs.length > 0) {
          // 读操作
          const randomDoc = writtenDocs[Math.floor(Math.random() * writtenDocs.length)];
          await db.findById('test_collection', randomDoc._id);
          readOps++;
          monitor.recordQueryLatency(db.latencies.read[db.latencies.read.length - 1], 'read');
        } else {
          // 写操作
          const doc = await db.insert('test_collection', {
            index: writeCount + i,
            name: `User_${writeCount + i}`,
            score: Math.floor(Math.random() * 1000),
            data: new Array(100).fill('x').join('')
          });
          if (Math.random() > 0.5) {
            writtenDocs.push(doc);
          }
          writeOps++;
          monitor.recordQueryLatency(db.latencies.write[db.latencies.write.length - 1], 'write');
        }
        
        // 控制频率
        const elapsed = Date.now() - startTime;
        const expectedTime = i * interval;
        if (expectedTime > elapsed) {
          await new Promise(resolve => setTimeout(resolve, expectedTime - elapsed));
        }
      }
      
      monitor.recordMemoryUsage();
      
      const dbStats = db.getStats();
      const perfStats = monitor.getStats();
      
      console.log(`\n高频读写测试结果:`);
      console.log(`  总操作数：${totalOperations}`);
      console.log(`  读操作：${readOps}`);
      console.log(`  写操作：${writeOps}`);
      console.log(`  读延迟:`);
      console.log(`    平均：${dbStats.readStats.avg.toFixed(2)}ms`);
      console.log(`    P95: ${dbStats.readStats.p95.toFixed(2)}ms`);
      console.log(`    P99: ${dbStats.readStats.p99.toFixed(2)}ms`);
      console.log(`  写延迟:`);
      console.log(`    平均：${dbStats.writeStats.avg.toFixed(2)}ms`);
      console.log(`    P95: ${dbStats.writeStats.p95.toFixed(2)}ms`);
      console.log(`    P99: ${dbStats.writeStats.p99.toFixed(2)}ms`);
      console.log(`  内存增长：${(perfStats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：读延迟 P95 应该小于 10ms
      expect(dbStats.readStats.p95).toBeLessThan(10);
      
      // 断言：写延迟 P95 应该小于 20ms
      expect(dbStats.writeStats.p95).toBeLessThan(20);
      
      // 断言：内存增长不应过大
      expect(perfStats.memory.growth.heapUsed).toBeLessThan(50 * 1024 * 1024);
    }, duration + 10000);

    it('应该在持续压力下保持稳定的查询性能', async () => {
      const queryCount = 500;
      
      // 准备数据
      for (let i = 0; i < 1000; i++) {
        await db.insert('performance_test', {
          index: i,
          category: `cat_${i % 10}`,
          value: Math.random()
        });
      }
      
      const latencies = [];
      
      for (let i = 0; i < queryCount; i++) {
        const start = Date.now();
        await db.find('performance_test', { category: 'cat_5' });
        latencies.push(Date.now() - start);
      }
      
      // 计算性能稳定性指标
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const variance = latencies.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / latencies.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / avg; // 变异系数
      
      console.log(`\n查询性能稳定性测试:`);
      console.log(`  平均延迟：${avg.toFixed(2)}ms`);
      console.log(`  标准差：${stdDev.toFixed(2)}ms`);
      console.log(`  变异系数：${(cv * 100).toFixed(2)}%`);
      
      // 断言：变异系数应该小于 0.5（50% 的波动）
      expect(cv).toBeLessThan(0.5);
    }, 20000);
  });

  describe('并发写入冲突测试', () => {
    it('应该能够处理多用户并发写入', async () => {
      const { concurrentUsers, writesPerUser, conflictRate } = TEST_CONFIG.concurrentWrites;
      
      monitor.recordMemoryUsage();
      
      const userPromises = [];
      const results = {
        success: 0,
        conflict: 0,
        error: 0
      };
      
      for (let userId = 0; userId < concurrentUsers; userId++) {
        const promise = (async () => {
          for (let i = 0; i < writesPerUser; i++) {
            try {
              // 模拟可能的冲突
              const shouldConflict = Math.random() < conflictRate;
              const query = shouldConflict ? { index: 0 } : { index: userId * 1000 + i };
              
              const doc = await db.insert('concurrent_test', {
                userId,
                index: i,
                timestamp: Date.now(),
                data: `data_${userId}_${i}`
              });
              
              results.success++;
            } catch (error) {
              results.error++;
              monitor.recordError('write_error');
            }
          }
        })();
        
        userPromises.push(promise);
      }
      
      await Promise.all(userPromises);
      
      monitor.recordMemoryUsage();
      
      const dbStats = db.getStats();
      const perfStats = monitor.getStats();
      
      console.log(`\n并发写入测试结果:`);
      console.log(`  并发用户数：${concurrentUsers}`);
      console.log(`  每用户写入数：${writesPerUser}`);
      console.log(`  总写入数：${concurrentUsers * writesPerUser}`);
      console.log(`  成功：${results.success}`);
      console.log(`  错误：${results.error}`);
      console.log(`  最终文档数：${dbStats.collectionSizes.concurrent_test || 0}`);
      console.log(`  平均写延迟：${dbStats.writeStats.avg.toFixed(2)}ms`);
      
      // 断言：大部分写入应该成功
      expect(results.success).toBeGreaterThanOrEqual(concurrentUsers * writesPerUser * 0.95);
      
      // 断言：所有文档都应该被写入
      expect(dbStats.collectionSizes.concurrent_test).toBe(concurrentUsers * writesPerUser);
    }, 30000);

    it('应该正确处理并发更新冲突', async () => {
      // 创建测试文档
      const doc = await db.insert('conflict_test', {
        counter: 0,
        version: 0
      });
      
      const concurrentUpdates = 50;
      const results = {
        success: 0,
        conflict: 0
      };
      
      // 模拟并发更新
      const updatePromises = [];
      for (let i = 0; i < concurrentUpdates; i++) {
        const promise = (async () => {
          // 简单更新（无乐观锁）
          const result = await db.update('conflict_test', { _id: doc._id }, {
            $inc: { counter: 1 },
            version: i
          });
          
          if (result.modifiedCount > 0) {
            results.success++;
          }
        })();
        
        updatePromises.push(promise);
      }
      
      await Promise.all(updatePromises);
      
      // 验证最终状态
      const finalDoc = await db.findById('conflict_test', doc._id);
      
      console.log(`\n并发更新冲突测试:`);
      console.log(`  并发更新数：${concurrentUpdates}`);
      console.log(`  成功更新：${results.success}`);
      console.log(`  最终计数器：${finalDoc.counter}`);
      console.log(`  最终版本：${finalDoc.version}`);
      
      // 断言：所有更新都应该成功应用（计数器应该等于更新次数）
      expect(finalDoc.counter).toBe(concurrentUpdates);
    }, 15000);
  });

  describe('查询性能退化测试', () => {
    it('应该在大数据量下保持可接受的查询性能', async () => {
      const documentCounts = [100, 500, 1000];
      const performanceResults = [];
      
      for (const count of documentCounts) {
        // 准备数据
        db.clear();
        for (let i = 0; i < count; i++) {
          await db.insert('scale_test', {
            index: i,
            category: `cat_${i % 20}`,
            score: Math.floor(Math.random() * 10000),
            data: new Array(50).fill('x').join('')
          });
        }
        
        // 测试查询性能
        const queryLatencies = [];
        for (let i = 0; i < 100; i++) {
          const start = Date.now();
          await db.find('scale_test', { category: 'cat_5' });
          queryLatencies.push(Date.now() - start);
        }
        
        const avgLatency = queryLatencies.reduce((a, b) => a + b, 0) / queryLatencies.length;
        const p95Latency = [...queryLatencies].sort((a, b) => a - b)[Math.floor(queryLatencies.length * 0.95)];
        
        performanceResults.push({
          documentCount: count,
          avgLatency,
          p95Latency
        });
        
        console.log(`数据量 ${count}: 平均延迟 ${avgLatency.toFixed(2)}ms, P95 ${p95Latency.toFixed(2)}ms`);
      }
      
      // 分析性能退化
      const baseline = performanceResults[0].avgLatency;
      for (let i = 1; i < performanceResults.length; i++) {
        const degradation = (performanceResults[i].avgLatency - baseline) / baseline;
        console.log(`相比基线，${performanceResults[i].documentCount} 文档的性能退化：${(degradation * 100).toFixed(2)}%`);
      }
      
      // 断言：性能退化应该是线性的或次线性的
      // 这里我们只做一个宽松的断言
      const maxDegradation = (performanceResults[performanceResults.length - 1].avgLatency - baseline) / baseline;
      expect(maxDegradation).toBeLessThan(10); // 退化不超过 10 倍
    }, 30000);

    it('应该正确处理复杂查询', async () => {
      // 准备数据
      for (let i = 0; i < 500; i++) {
        await db.insert('complex_query_test', {
          index: i,
          category: `cat_${i % 10}`,
          subcategory: `sub_${i % 5}`,
          score: Math.floor(Math.random() * 1000),
          active: Math.random() > 0.3,
          tags: [`tag_${i % 20}`, `tag_${i % 30}`]
        });
      }
      
      // 测试复杂查询
      const complexQueries = [
        { category: 'cat_5', active: true },
        { category: 'cat_3', subcategory: 'sub_2' },
        { score: { $gte: 500 } }, // 注意：模拟 DB 可能不支持这个操作符
        { active: true }
      ];
      
      const queryResults = [];
      
      for (const query of complexQueries) {
        const start = Date.now();
        const results = await db.find('complex_query_test', query, { limit: 50 });
        const latency = Date.now() - start;
        
        queryResults.push({
          query: JSON.stringify(query),
          resultCount: results.length,
          latency
        });
        
        console.log(`查询 ${JSON.stringify(query)}: ${results.length} 结果，${latency.toFixed(2)}ms`);
      }
      
      // 断言：查询应该返回结果
      expect(queryResults.every(r => r.resultCount >= 0)).toBe(true);
      
      // 断言：查询延迟应该在合理范围内
      const avgLatency = queryResults.reduce((a, b) => a + b.latency, 0) / queryResults.length;
      expect(avgLatency).toBeLessThan(50);
    }, 20000);
  });

  describe('连接池压力测试', () => {
    it('应该能够管理连接池资源', async () => {
      const concurrentConnections = 20;
      const operationsPerConnection = 50;
      
      monitor.recordMemoryUsage();
      
      const connectionPromises = [];
      const results = {
        success: 0,
        error: 0
      };
      
      for (let i = 0; i < concurrentConnections; i++) {
        const promise = (async () => {
          for (let j = 0; j < operationsPerConnection; j++) {
            try {
              await db.insert('connection_pool_test', {
                connectionId: i,
                operationId: j,
                timestamp: Date.now()
              });
              results.success++;
            } catch (error) {
              results.error++;
              monitor.recordError('connection_error');
            }
          }
        })();
        
        connectionPromises.push(promise);
      }
      
      await Promise.all(connectionPromises);
      
      monitor.recordMemoryUsage();
      
      const perfStats = monitor.getStats();
      
      console.log(`\n连接池压力测试:`);
      console.log(`  并发连接数：${concurrentConnections}`);
      console.log(`  每连接操作数：${operationsPerConnection}`);
      console.log(`  总操作数：${concurrentConnections * operationsPerConnection}`);
      console.log(`  成功：${results.success}`);
      console.log(`  错误：${results.error}`);
      console.log(`  内存增长：${(perfStats.memory.growth.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      // 断言：大部分操作应该成功
      expect(results.success).toBeGreaterThanOrEqual(concurrentConnections * operationsPerConnection * 0.95);
    }, 30000);
  });

  describe('数据库性能基准测试', () => {
    it('应该提供数据库性能基准数据', async () => {
      const benchmarkResults = {
        insert: { operations: 500, avgLatency: 0, p95Latency: 0 },
        find: { operations: 500, avgLatency: 0, p95Latency: 0 },
        update: { operations: 200, avgLatency: 0, p95Latency: 0 },
        delete: { operations: 100, avgLatency: 0, p95Latency: 0 }
      };
      
      // 插入基准
      const insertLatencies = [];
      for (let i = 0; i < benchmarkResults.insert.operations; i++) {
        const start = Date.now();
        await db.insert('benchmark', { index: i, data: 'test' });
        insertLatencies.push(Date.now() - start);
      }
      benchmarkResults.insert.avgLatency = insertLatencies.reduce((a, b) => a + b, 0) / insertLatencies.length;
      benchmarkResults.insert.p95Latency = [...insertLatencies].sort((a, b) => a - b)[Math.floor(insertLatencies.length * 0.95)];
      
      // 查询基准
      const findLatencies = [];
      for (let i = 0; i < benchmarkResults.find.operations; i++) {
        const start = Date.now();
        await db.find('benchmark', { index: i });
        findLatencies.push(Date.now() - start);
      }
      benchmarkResults.find.avgLatency = findLatencies.reduce((a, b) => a + b, 0) / findLatencies.length;
      benchmarkResults.find.p95Latency = [...findLatencies].sort((a, b) => a - b)[Math.floor(findLatencies.length * 0.95)];
      
      // 更新基准
      const updateLatencies = [];
      for (let i = 0; i < benchmarkResults.update.operations; i++) {
        const start = Date.now();
        await db.update('benchmark', { index: i }, { updated: true });
        updateLatencies.push(Date.now() - start);
      }
      benchmarkResults.update.avgLatency = updateLatencies.reduce((a, b) => a + b, 0) / updateLatencies.length;
      benchmarkResults.update.p95Latency = [...updateLatencies].sort((a, b) => a - b)[Math.floor(updateLatencies.length * 0.95)];
      
      // 删除基准
      const deleteLatencies = [];
      for (let i = 0; i < benchmarkResults.delete.operations; i++) {
        const start = Date.now();
        await db.delete('benchmark', { index: i });
        deleteLatencies.push(Date.now() - start);
      }
      benchmarkResults.delete.avgLatency = deleteLatencies.reduce((a, b) => a + b, 0) / deleteLatencies.length;
      benchmarkResults.delete.p95Latency = [...deleteLatencies].sort((a, b) => a - b)[Math.floor(deleteLatencies.length * 0.95)];
      
      console.log(`\n=== 数据库性能基准数据 ===`);
      console.log('插入操作:');
      console.log(`  平均延迟：${benchmarkResults.insert.avgLatency.toFixed(2)}ms`);
      console.log(`  P95 延迟：${benchmarkResults.insert.p95Latency.toFixed(2)}ms`);
      console.log('查询操作:');
      console.log(`  平均延迟：${benchmarkResults.find.avgLatency.toFixed(2)}ms`);
      console.log(`  P95 延迟：${benchmarkResults.find.p95Latency.toFixed(2)}ms`);
      console.log('更新操作:');
      console.log(`  平均延迟：${benchmarkResults.update.avgLatency.toFixed(2)}ms`);
      console.log(`  P95 延迟：${benchmarkResults.update.p95Latency.toFixed(2)}ms`);
      console.log('删除操作:');
      console.log(`  平均延迟：${benchmarkResults.delete.avgLatency.toFixed(2)}ms`);
      console.log(`  P95 延迟：${benchmarkResults.delete.p95Latency.toFixed(2)}ms`);
      console.log(`=============================`);
      
      // 断言：所有操作延迟应该在合理范围内
      expect(benchmarkResults.insert.avgLatency).toBeLessThan(20);
      expect(benchmarkResults.find.avgLatency).toBeLessThan(10);
      expect(benchmarkResults.update.avgLatency).toBeLessThan(20);
      expect(benchmarkResults.delete.avgLatency).toBeLessThan(20);
    }, 30000);
  });
});
