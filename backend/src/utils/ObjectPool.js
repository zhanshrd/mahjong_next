/**
 * 通用对象池实现
 * 用于频繁创建/销毁的对象复用，减少 GC 压力
 */

export class ObjectPool {
  /**
   * @param {Function} createFn - 创建对象的函数
   * @param {Function} resetFn - 重置对象的函数
   * @param {number} initialSize - 初始池大小
   * @param {number} maxSize - 最大池大小
   */
  constructor(createFn, resetFn, initialSize = 100, maxSize = 500) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.pool = [];
    this.maxSize = maxSize;
    this.stats = {
      created: 0,
      acquired: 0,
      released: 0
    };
    // Limit stats history to prevent memory accumulation
    this.maxStatsHistory = 1000;
    this.statsHistory = [];

    // 预分配对象
    for (let i = 0; i < initialSize; i++) {
      const obj = createFn();
      this.pool.push(obj);
      this.stats.created++;
    }
  }

  /**
   * 从池中获取对象
   * @returns {any} 对象实例
   */
  acquire() {
    const obj = this.pool.length > 0 ? this.pool.pop() : this.createFn();
    if (this.pool.length === 0) {
      this.stats.created++;
    }
    this.stats.acquired++;
    
    // Record stats snapshot periodically (every 100 operations)
    if (this.stats.acquired % 100 === 0) {
      this._recordStats();
    }
    
    return obj;
  }

  /**
   * 归还对象到池中
   * @param {any} obj - 要归还的对象
   */
  release(obj) {
    if (this.pool.length < this.maxSize) {
      this.resetFn(obj);
      this.pool.push(obj);
      this.stats.released++;
    }
    // 如果池已满，对象将被 GC 回收
  }

  /**
   * 获取池统计信息
   */
  getStats() {
    return {
      ...this.stats,
      poolSize: this.pool.length,
      maxSize: this.maxSize
    };
  }

  /**
   * Record stats snapshot with size limiting
   */
  _recordStats() {
    const snapshot = {
      timestamp: Date.now(),
      ...this.getStats()
    };
    
    this.statsHistory.push(snapshot);
    
    // Limit history size to prevent memory accumulation
    if (this.statsHistory.length > this.maxStatsHistory) {
      this.statsHistory = this.statsHistory.slice(-this.maxStatsHistory);
    }
  }

  /**
   * Get stats history for monitoring
   */
  getStatsHistory() {
    return this.statsHistory;
  }

  /**
   * 清空池
   */
  clear() {
    this.pool.length = 0;
  }
}

/**
 * 消息对象池
 * 用于复用游戏消息对象
 */
export const messagePool = new ObjectPool(
  () => ({
    type: '',
    data: null,
    timestamp: 0,
    roomId: null,
    playerIndex: null
  }),
  (msg) => {
    msg.type = '';
    msg.data = null;
    msg.timestamp = 0;
    msg.roomId = null;
    msg.playerIndex = null;
  },
  200,
  1000
);

/**
 * 牌对象池（用于临时计算）
 */
export const tilePool = new ObjectPool(
  () => ({
    suit: '',
    rank: 0,
    value: '',
    used: false
  }),
  (tile) => {
    tile.suit = '';
    tile.rank = 0;
    tile.value = '';
    tile.used = false;
  },
  300,
  500
);

/**
 * 批处理消息队列
 * 用于消息批处理，减少发送频率
 */
export class BatchQueue {
  /**
   * @param {Function} sendFn - 实际发送函数
   * @param {number} batchSize - 批处理大小
   * @param {number} intervalMs - 发送间隔（毫秒）
   */
  constructor(sendFn, batchSize = 10, intervalMs = 50) {
    this.sendFn = sendFn;
    this.batchSize = batchSize;
    this.intervalMs = intervalMs;
    this.queue = [];
    this.timer = null;
    this.stats = {
      batches: 0,
      totalItems: 0
    };
    // Limit stats history to prevent memory accumulation
    this.maxStatsHistory = 1000;
    this.statsHistory = [];
  }

  /**
   * 添加消息到队列
   * @param {any} item - 消息项
   */
  push(item) {
    this.queue.push(item);
    this.stats.totalItems++;

    // 达到批处理大小时立即发送
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      // 启动定时器
      this.timer = setTimeout(() => this.flush(), this.intervalMs);
    }
  }

  /**
   * 刷新队列（发送所有待处理消息）
   */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length > 0) {
      const batch = [...this.queue];
      this.queue.length = 0;
      this.sendFn(batch);
      this.stats.batches++;
      
      // Record stats snapshot periodically (every 100 batches)
      if (this.stats.batches % 100 === 0) {
        this._recordStats();
      }
    }
  }

  /**
   * 清理定时器
   */
  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
  
  /**
   * 销毁批处理队列（用于清理资源）
   */
  destroy() {
    this.clear();
    this.queue.length = 0;
    this.sendFn = null;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length
    };
  }

  /**
   * Record stats snapshot with size limiting
   */
  _recordStats() {
    const snapshot = {
      timestamp: Date.now(),
      ...this.getStats()
    };
    
    this.statsHistory.push(snapshot);
    
    // Limit history size to prevent memory accumulation
    if (this.statsHistory.length > this.maxStatsHistory) {
      this.statsHistory = this.statsHistory.slice(-this.maxStatsHistory);
    }
  }

  /**
   * Get stats history for monitoring
   */
  getStatsHistory() {
    return this.statsHistory;
  }
}
