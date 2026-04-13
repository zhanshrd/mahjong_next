/**
 * 内存泄漏修复补丁
 * 
 * 本文件包含针对麻将游戏服务器内存泄漏问题的所有修复代码
 * 
 * 修复列表:
 * 1. GameStore 定时器清理增强
 * 2. MahjongGame 销毁方法
 * 3. 审计日志定期清理
 * 4. AI 定时器引用管理
 * 5. 对象池统计信息优化
 * 6. 快照栈大小限制
 */

// ===========================================================================
// 修复 1: GameStore 定时器清理增强
// 文件：src/store/GameStore.js
// ===========================================================================

export const gameStoreFixes = {
  // 新增方法：清理房间相关的所有定时器
  cleanupRoomTimers(roomId) {
    for (const [sessionId, info] of this.disconnectedPlayers.entries()) {
      if (info.roomId === roomId) {
        this._cleanupDisconnectEntry(sessionId);
      }
    }
  },

  // 修改：在 isEmpty 检查后调用 cleanupRoomTimers
  // 在原有的 leaveRoom 方法中替换：
  /*
  if (room.isEmpty()) {
    this.cleanupRoomTimers(roomId); // 新增这行
    this.rooms.delete(roomId);
    this.aiControlled.delete(roomId);
    if (this.onRoomDestroyed) this.onRoomDestroyed(roomId);
  }
  */
};

// ===========================================================================
// 修复 2: MahjongGame 销毁方法
// 文件：src/game/MahjongGame.js
// ===========================================================================

export const mahjongGameFixes = {
  // 新增方法：销毁游戏实例，清理所有资源
  destroy() {
    // 清理定时器
    this.clearClaimTimer();
    
    // 清空快照栈
    this._snapshots = [];
    
    // 清空大型数据结构（帮助 GC 回收）
    this.hands = null;
    this.melds = null;
    this.flowerMelds = null;
    this.discardPile = null;
    this.birdTiles = null;
    this.multiWinResults = null;
    
    // 清空状态机引用
    if (this._fsm) {
      this._fsm.reset();
      this._fsm = null;
    }
    
    // 清空 TileSet 引用
    if (this.tileSet) {
      this.tileSet = null;
    }
    
    // 清空玩家引用
    this.players = null;
  },

  // 在 Room.endGame() 中调用：
  /*
  endGame() {
    this.state = 'finished';
    if (this.game) {
      this.game.destroy(); // 新增这行
      this.game.finished = true;
    }
  }
  */
};

// ===========================================================================
// 修复 3: 审计日志定期清理
// 文件：src/socket/auditLog.js
// ===========================================================================

const AUDIT_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 分钟
const AUDIT_MAX_AGE = 30 * 60 * 1000; // 30 分钟

let auditCleanupTimer = null;

export function startAuditLogCleanup() {
  if (auditCleanupTimer) {
    clearInterval(auditCleanupTimer);
  }

  auditCleanupTimer = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [roomId, log] of roomLogs.entries()) {
      // 清理超过 30 分钟未更新的日志
      const lastEntry = log.entries[log.entries.length - 1];
      if (lastEntry && now - lastEntry.ts > AUDIT_MAX_AGE) {
        roomLogs.delete(roomId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[审计日志] 清理了 ${cleanedCount} 个过期房间日志`);
    }
  }, AUDIT_CLEANUP_INTERVAL);

  return auditCleanupTimer;
}

export function stopAuditLogCleanup() {
  if (auditCleanupTimer) {
    clearInterval(auditCleanupTimer);
    auditCleanupTimer = null;
  }
}

// 在 server.js 中启动时调用：
// import { startAuditLogCleanup } from './socket/auditLog.js';
// startAuditLogCleanup();

// ===========================================================================
// 修复 4: AI 定时器引用管理
// 文件：src/socket/handlers.js
// ===========================================================================

// 在 setupSocketHandlers 函数顶部添加：
const aiTimers = new Map(); // roomId -> Set<timeoutId>

// 修改 triggerAIActions 函数，保存定时器引用：
export function triggerAIActionsWithTracking(roomId) {
  const room = gameStore.getRoom(roomId);
  if (!room || !room.game || room.game.finished) return;

  const game = room.game;
  const aiSet = gameStore.aiControlled.get(roomId);
  if (!aiSet || aiSet.size === 0) return;

  // 初始化定时器集合
  if (!aiTimers.has(roomId)) {
    aiTimers.set(roomId, new Set());
  }
  const roomTimers = aiTimers.get(roomId);

  const cp = game.currentPlayer;
  if (aiSet.has(cp)) {
    if (!game.hasDrawn[cp] && !game.claimWindow) {
      const timerId = setTimeout(() => performAIDraw(roomId, cp), 800);
      roomTimers.add(timerId);
    } else if (game.hasDrawn[cp] && !game.claimWindow) {
      const timerId = setTimeout(() => performAIDiscard(roomId, cp), 600);
      roomTimers.add(timerId);
    }
  }

  // Handle open claim window for AI players
  if (game.claimWindow && !game.claimWindow.resolved) {
    for (const playerIdx of aiSet) {
      if (game.claimWindow.requiredResponders.has(playerIdx) &&
          !game.claimWindow.claims.has(playerIdx) &&
          !game.claimWindow.passes.has(playerIdx)) {
        const timerId = setTimeout(() => performAIClaim(roomId, playerIdx), 500);
        roomTimers.add(timerId);
      }
    }
  }
}

// 在房间销毁时清理 AI 定时器
// 在 gameStore.onRoomDestroyed 回调中添加：
/*
gameStore.onRoomDestroyed = (roomId) => {
  // 清理 AI 定时器
  const timers = aiTimers.get(roomId);
  if (timers) {
    for (const timerId of timers) {
      clearTimeout(timerId);
    }
    aiTimers.delete(roomId);
  }
  
  // 原有清理代码...
  clearAuditLog(roomId);
  gameStore.aiControlled.delete(roomId);
  // ...
};
*/

// ===========================================================================
// 修复 5: 对象池统计信息优化
// 文件：src/utils/ObjectPool.js
// ===========================================================================

export const objectPoolFixes = {
  // 新增方法：重置统计信息
  resetStats() {
    this.stats = {
      created: 0,
      acquired: 0,
      released: 0
    };
  },

  // 新增方法：定期重置统计信息
  startPeriodicReset(intervalMs = 60 * 60 * 1000) { // 默认 1 小时
    return setInterval(() => {
      this.resetStats();
    }, intervalMs);
  },

  // 在 messagePool 和 tilePool 初始化后调用：
  /*
  messagePool.startPeriodicReset();
  tilePool.startPeriodicReset();
  */
};

// ===========================================================================
// 修复 6: 快照栈大小限制
// 文件：src/game/MahjongGame.js
// ===========================================================================

export const snapshotFixes = {
  // 在构造函数中设置最大快照数
  constructor_maxSnapshots: 10, // 添加到 constructor

  // 修改 getSnapshot 方法
  getSnapshotWithLimit() {
    // 限制快照数量
    if (this._snapshots.length >= this.maxSnapshots) {
      this._snapshots.shift(); // 移除最旧的快照
    }

    const snapshot = {
      id: this._snapshots.length,
      phase: this._fsm.phase,
      hands: this.hands.map(h => [...h]),
      melds: this.melds.map(m => [...m]),
      flowerMelds: this.flowerMelds.map(fm => [...fm]),
      discardPile: [...this.discardPile],
      currentPlayer: this.currentPlayer,
      winner: this.winner,
      finished: this.finished,
      lastDiscard: this.lastDiscard,
      lastDiscardPlayer: this.lastDiscardPlayer,
      hasDrawn: [...this.hasDrawn],
      birdTiles: [...this.birdTiles],
      multiWinResults: this.multiWinResults ? JSON.parse(JSON.stringify(this.multiWinResults)) : null,
      tileSetState: this.tileSet.getState()
    };
    this._snapshots.push(snapshot);
    return snapshot;
  }
};

// ===========================================================================
// 修复 7: 设备指纹缓存优化
// 文件：src/security/deviceFingerprint.js
// ===========================================================================

let deviceCleanupTimer = null;

export function startDeviceFingerprintCleanup() {
  if (deviceCleanupTimer) {
    clearInterval(deviceCleanupTimer);
  }

  deviceCleanupTimer = setInterval(() => {
    cleanupDeviceCache(24 * 60 * 60 * 1000); // 只保留 24 小时内的记录
  }, 60 * 60 * 1000); // 每小时执行一次

  return deviceCleanupTimer;
}

export function stopDeviceFingerprintCleanup() {
  if (deviceCleanupTimer) {
    clearInterval(deviceCleanupTimer);
    deviceCleanupTimer = null;
  }
}

// ===========================================================================
// 修复 8: Token 黑名单优化
// 文件：src/security/auth.js
// ===========================================================================

export const tokenBlacklistFixes = {
  // 修改 blacklistToken 方法，降低阈值并优化清理
  blacklistTokenOptimized(token, ttl) {
    tokenBlacklist.set(token, Date.now() + ttl);
    
    // 降低阈值到 5000，更早触发清理
    if (tokenBlacklist.size > 5000) {
      const now = Date.now();
      for (const [t, expiry] of tokenBlacklist.entries()) {
        if (now > expiry) {
          tokenBlacklist.delete(t);
        }
      }
    }
  },

  // 添加定期清理方法
  startPeriodicCleanup(intervalMs = 5 * 60 * 1000) { // 5 分钟
    return setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const [token, expiry] of tokenBlacklist.entries()) {
        if (now > expiry) {
          tokenBlacklist.delete(token);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`[Token 黑名单] 清理了 ${cleanedCount} 个过期 Token`);
      }
    }, intervalMs);
  }
};

// ===========================================================================
// 修复 9: 添加内存监控指标
// 文件：src/monitoring/metrics.js
// ===========================================================================

// 添加以下指标定义：

import client from 'prom-client';
import { gameStore } from '../store/GameStore.js';

// Map/Set 大小监控
export const gameStoreRooms = new client.Gauge({
  name: 'mahjong_gamestore_rooms_size',
  help: 'GameStore rooms Map 大小'
});

export const gameStoreDisconnectedPlayers = new client.Gauge({
  name: 'mahjong_gamestore_disconnected_size',
  help: 'GameStore disconnectedPlayers Map 大小'
});

export const gameStoreSocketSessions = new client.Gauge({
  name: 'mahjong_gamestore_socket_sessions_size',
  help: 'GameStore socketSessions Map 大小'
});

export const auditLogRooms = new client.Gauge({
  name: 'mahjong_auditlog_rooms_size',
  help: 'AuditLog roomLogs Map 大小'
});

export const rateLimiterBuckets = new client.Gauge({
  name: 'mahjong_ratelimiter_buckets_size',
  help: 'RateLimiter socketBuckets Map 大小'
});

// 定期收集（在 server.js 中启动）
export function startMetricsCollection() {
  return setInterval(() => {
    try {
      gameStoreRooms.set(gameStore.rooms.size);
      gameStoreDisconnectedPlayers.set(gameStore.disconnectedPlayers.size);
      gameStoreSocketSessions.set(gameStore.socketSessions.size);
      // auditLogRooms 需要导入 roomLogs
    } catch (err) {
      console.error('内存指标收集失败:', err);
    }
  }, 10000); // 每 10 秒收集一次
}

// ===========================================================================
// 修复 10: 服务器级别内存监控
// 文件：src/server.js
// ===========================================================================

// 在 server.js 中添加：

import logger from './monitoring/logger.js';

// 定期内存检查
const MEMORY_WARNING_THRESHOLD_MB = 500;
const MEMORY_CRITICAL_THRESHOLD_MB = 800;

const memoryCheckInterval = setInterval(() => {
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;
  const rssMB = usage.rss / 1024 / 1024;
  
  if (heapUsedMB > MEMORY_CRITICAL_THRESHOLD_MB) {
    logger.error({
      module: 'memory',
      heapUsedMB,
      rssMB,
      externalMB: usage.external / 1024 / 1024
    }, '内存使用达到临界值，可能存在严重泄漏!');
    
    // 强制 GC（如果可用）
    if (global.gc) {
      global.gc();
      logger.info({ module: 'memory' }, '已触发强制 GC');
    }
  } else if (heapUsedMB > MEMORY_WARNING_THRESHOLD_MB) {
    logger.warn({
      module: 'memory',
      heapUsedMB,
      rssMB
    }, '内存使用过高，建议检查');
  }
}, 60000); // 每分钟检查一次

// 在服务器关闭时清理
process.on('SIGTERM', () => {
  clearInterval(memoryCheckInterval);
});

// ===========================================================================
// 使用说明
// ===========================================================================

/**
 * 在 server.js 中集成所有修复：
 * 
 * 1. 导入修复模块：
 *    import { startAuditLogCleanup } from './socket/auditLog.js';
 *    import { startDeviceFingerprintCleanup } from './security/deviceFingerprint.js';
 *    import { startMetricsCollection } from './monitoring/metrics.js';
 * 
 * 2. 在服务器启动时调用：
 *    startAuditLogCleanup();
 *    startDeviceFingerprintCleanup();
 *    startMetricsCollection();
 * 
 * 3. 在 server.listen() 后启动内存监控：
 *    // 内存监控代码已在 server.js 中
 * 
 * 4. 修改 GameStore.js 中的 leaveRoom 方法，添加 cleanupRoomTimers 调用
 * 
 * 5. 修改 MahjongGame.js，添加 destroy 方法
 * 
 * 6. 修改 Room.js 中的 endGame 方法，调用 game.destroy()
 * 
 * 7. 修改 handlers.js，集成 AI 定时器跟踪
 */

export default {
  gameStoreFixes,
  mahjongGameFixes,
  objectPoolFixes,
  snapshotFixes,
  tokenBlacklistFixes
};
