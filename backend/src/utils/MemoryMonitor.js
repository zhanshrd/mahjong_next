/**
 * 内存监控工具类
 * 用于检测内存泄漏、跟踪 Map/Set 增长、监控定时器数量
 */

export class MemoryMonitor {
  constructor(label = 'MemoryMonitor') {
    this.label = label;
    this.snapshots = [];
    this.trackedMaps = new Map();
    this.trackedSets = new Map();
    this.trackedTimers = new Map();
    this.startTime = Date.now();
  }

  /**
   * 获取当前内存使用情况
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      timestamp: Date.now() - this.startTime,
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      heapUsedMB: usage.heapUsed / 1024 / 1024,
      heapTotalMB: usage.heapTotal / 1024 / 1024,
      rssMB: usage.rss / 1024 / 1024
    };
  }

  /**
   * 拍摄内存快照
   */
  takeSnapshot(label = '') {
    const snapshot = this.getMemoryUsage();
    snapshot.label = label;
    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * 跟踪 Map 对象
   */
  trackMap(name, map) {
    this.trackedMaps.set(name, {
      initial: map.size,
      history: [map.size],
      map
    });
  }

  /**
   * 跟踪 Set 对象
   */
  trackSet(name, set) {
    this.trackedSets.set(name, {
      initial: set.size,
      history: [set.size],
      set
    });
  }

  /**
   * 更新所有跟踪的集合
   */
  updateTrackedCollections() {
    for (const [name, data] of this.trackedMaps) {
      data.history.push(data.map.size);
    }
    for (const [name, data] of this.trackedSets) {
      data.history.push(data.set.size);
    }
  }

  /**
   * 强制垃圾回收（如果可用）
   */
  forceGC() {
    if (global.gc) {
      const start = Date.now();
      global.gc();
      const pause = Date.now() - start;
      return { success: true, pauseTime: pause };
    }
    return { success: false, pauseTime: 0 };
  }

  /**
   * 分析内存泄漏
   */
  analyzeLeaks(thresholds = {}) {
    const defaultThresholds = {
      memoryGrowthMB: 50,
      mapGrowthPercent: 20,
      setGrowthPercent: 20,
      ...thresholds
    };

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
    for (const [name, data] of this.trackedMaps) {
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
    for (const [name, data] of this.trackedSets) {
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

    const hasLeaks = 
      memoryGrowth.heapUsedMB > defaultThresholds.memoryGrowthMB ||
      Object.values(mapGrowth).some(m => m.growthPercent > defaultThresholds.mapGrowthPercent) ||
      Object.values(setGrowth).some(s => s.growthPercent > defaultThresholds.setGrowthPercent);

    return {
      hasLeaks,
      memoryGrowth,
      mapGrowth,
      setGrowth,
      snapshotCount: this.snapshots.length,
      duration: Date.now() - this.startTime
    };
  }

  /**
   * 生成报告
   */
  getReport() {
    const analysis = this.analyzeLeaks();
    
    return {
      label: this.label,
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

  /**
   * 打印报告到控制台
   */
  printReport() {
    const report = this.getReport();
    
    console.log(`\n=== ${this.label} 内存报告 ===`);
    console.log(`运行时长：${(report.duration / 1000).toFixed(2)}秒`);
    console.log(`快照数量：${report.snapshots}`);
    console.log(`初始内存：${report.memoryTrend[0]?.heapUsedMB.toFixed(2)}MB`);
    console.log(`最终内存：${report.memoryTrend[report.memoryTrend.length - 1]?.heapUsedMB.toFixed(2)}MB`);
    console.log(`内存增长：${report.memoryGrowth?.heapUsedMB.toFixed(2)}MB`);
    
    if (report.mapGrowth) {
      console.log('\nMap 增长情况:');
      for (const [name, growth] of Object.entries(report.mapGrowth)) {
        console.log(`  ${name}: ${growth.initial} -> ${growth.final} (${growth.growthPercent.toFixed(2)}%)`);
      }
    }
    
    if (report.setGrowth) {
      console.log('\nSet 增长情况:');
      for (const [name, growth] of Object.entries(report.setGrowth)) {
        console.log(`  ${name}: ${growth.initial} -> ${growth.final} (${growth.growthPercent.toFixed(2)}%)`);
      }
    }
    
    if (report.hasLeaks) {
      console.log('\n⚠️ 检测到潜在内存泄漏!');
    } else {
      console.log('\n✓ 内存健康状况良好');
    }
    console.log('=============================\n');
  }

  /**
   * 重置监控器
   */
  reset() {
    this.snapshots = [];
    this.trackedMaps.clear();
    this.trackedSets.clear();
    this.trackedTimers.clear();
    this.startTime = Date.now();
  }
}

export default MemoryMonitor;
