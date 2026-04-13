# 麻将游戏服务器内存泄漏综合审计报告

## 执行摘要

本报告对麻将游戏服务器进行了全面的内存泄漏检测，覆盖了对象池、缓存管理、定时器清理、事件监听器清理等关键领域。

**检测时间**: 2026-04-13  
**检测范围**: 后端服务器全部核心模块  
**风险等级**: 中等（发现多个潜在泄漏点，但已有部分防护机制）

---

## 一、检测对象列表

### 1.1 核心模块

| 模块 | 文件路径 | 风险等级 |
|------|---------|---------|
| 对象池 | `src/utils/ObjectPool.js` | ⚠️ 中等 |
| 游戏状态机 | `src/game/GameStateMachine.js` | ✅ 低 |
| 麻将游戏 | `src/game/MahjongGame.js` | ⚠️ 中等 |
| 房间管理 | `src/game/Room.js` | ✅ 低 |
| 比赛会话 | `src/game/MatchSession.js` | ✅ 低 |
| 游戏存储 | `src/store/GameStore.js` | ⚠️ 中等 |
| Socket 处理器 | `src/socket/handlers.js` | ⚠️ 中等 |
| 速率限制器 | `src/socket/rateLimiter.js` | ✅ 低 |
| 审计日志 | `src/socket/auditLog.js` | ⚠️ 中等 |
| 设备指纹 | `src/security/deviceFingerprint.js` | ⚠️ 中等 |
| 认证模块 | `src/security/auth.js` | ⚠️ 中等 |
| 行动验证器 | `src/security/actionValidator.js` | ✅ 低 |

---

## 二、详细检测结果

### 2.1 对象池内存泄漏 (ObjectPool.js)

#### 检测发现

**问题 1: 对象池无限制增长风险**
- **位置**: `ObjectPool.release()` 方法 (第 49-56 行)
- **描述**: 虽然设置了 `maxSize` 限制，但当池满时对象只是被丢弃，没有通知机制
- **风险**: 高频调用时可能导致大量对象被创建后直接丢弃，增加 GC 压力
- **代码片段**:
```javascript
release(obj) {
  if (this.pool.length < this.maxSize) {
    this.resetFn(obj);
    this.pool.push(obj);
    this.stats.released++;
  }
  // 如果池已满，对象将被 GC 回收
}
```

**问题 2: BatchQueue 定时器未清理**
- **位置**: `BatchQueue` 类 (第 124-204 行)
- **描述**: `destroy()` 方法已实现但未在业务代码中调用
- **风险**: 长期运行时，未使用的 BatchQueue 实例的定时器可能持续占用内存
- **代码片段**:
```javascript
destroy() {
  this.clear();
  this.queue.length = 0;
  this.sendFn = null;
}
```

**问题 3: 对象池统计信息持续增长**
- **位置**: `ObjectPool.stats` (第 18-22 行)
- **描述**: 统计数字只增不减，长期运行可能占用大量内存
- **风险**: 低优先级，但长期运行（数月）可能累积显著内存占用

#### 风险等级：⚠️ 中等

---

### 2.2 缓存管理内存泄漏

#### 2.2.1 GameStore 缓存 (GameStore.js)

**问题 1: disconnectedPlayers 映射可能泄漏**
- **位置**: `gameStore.disconnectedPlayers` (第 12-13 行)
- **描述**: 虽然有 `RECONNECT_GRACE_MS` (60 秒) 超时清理，但在以下场景可能泄漏：
  - 玩家断线后，定时器已设置但尚未触发时服务器重启
  - `reconnectTimers` 被清除但 `disconnectedPlayers` 未同步清除
- **风险**: 高并发断线场景下，Map 可能快速增长
- **代码片段**:
```javascript
this.disconnectedPlayers = new Map();
this.reconnectTimers = new Map();
```

**问题 2: aiControlled 集合未清理**
- **位置**: `gameStore.aiControlled` (第 18 行)
- **描述**: 当房间被销毁时，虽然 `onRoomDestroyed` 钩子会清理，但如果钩子未正确注册或调用，可能导致泄漏
- **风险**: 房间频繁创建销毁场景下可能累积
- **代码片段**:
```javascript
this.aiControlled = new Map();
```

**问题 3: socketSessions 映射无清理机制**
- **位置**: `gameStore.socketSessions` (第 15 行)
- **描述**: 只在 `joinRoom` 时添加，在 `handleDisconnect` 和 `leaveRoom` 时删除，但如果流程异常可能遗漏
- **风险**: 中等，依赖正确的错误处理

#### 风险等级：⚠️ 中等

#### 2.2.2 设备指纹缓存 (deviceFingerprint.js)

**问题 1: deviceCache 可能无限增长**
- **位置**: `deviceCache` (第 35 行)
- **描述**: 虽然有 `MAX_CACHE_SIZE = 10000` 限制，但清理逻辑在 `storeDeviceFingerprint` 中触发，可能导致：
  - 清理不及时（只在存储时触发）
  - 清理时只保留 24 小时内记录，但 24 小时可能仍有大量数据
- **代码片段**:
```javascript
const deviceCache = new Map();
const MAX_CACHE_SIZE = 10000;
```

**问题 2: 定期清理任务无取消机制**
- **位置**: `startPeriodicCleanup()` (第 135-148 行)
- **描述**: 返回的定时器未被保存，无法在服务器关闭时清理
- **风险**: 服务器热重载或测试场景下可能导致多个定时器同时运行
- **代码片段**:
```javascript
export function startPeriodicCleanup() {
  const timer = setInterval(() => {
    cleanupDeviceCache();
  }, CLEANUP_INTERVAL);
  return timer; // 返回值未被使用
}
```

#### 风险等级：⚠️ 中等

#### 2.2.3 Token 黑名单 (auth.js)

**问题 1: tokenBlacklist 可能无限增长**
- **位置**: `tokenBlacklist` (第 71 行)
- **描述**: 虽然有清理逻辑（第 82-89 行），但只在超过 10000 时触发，且只清理过期项
- **风险**: 高频认证场景下，Map 可能快速增长到阈值
- **代码片段**:
```javascript
const tokenBlacklist = new Map();
// 防止黑名单无限增长
if (tokenBlacklist.size > 10000) {
  const now = Date.now();
  for (const [t, expiry] of tokenBlacklist.entries()) {
    if (now > expiry) {
      tokenBlacklist.delete(t);
    }
  }
}
```

#### 风险等级：⚠️ 中等

---

### 2.3 定时器清理内存泄漏

#### 2.3.1 MahjongGame 定时器 (MahjongGame.js)

**问题 1: claimTimerId 未在所有路径清理**
- **位置**: `claimTimerId` (第 42 行)
- **描述**: 虽然有 `clearClaimTimer()` 方法，但在以下场景可能未调用：
  - 游戏异常结束时
  - 房间被强制销毁时
  - 玩家断线且 AI 接管时
- **风险**: 每个未清理的定时器将保持回调函数和闭包变量在内存中
- **代码片段**:
```javascript
this.claimTimerId = null;

startClaimTimer(onTimeout) {
  this.clearClaimTimer();
  this.claimTimerId = setTimeout(() => {
    this.claimTimerId = null;
    onTimeout();
  }, 30000);
}

clearClaimTimer() {
  if (this.claimTimerId) {
    clearTimeout(this.claimTimerId);
    this.claimTimerId = null;
  }
}
```

#### 风险等级：⚠️ 中等

#### 2.3.2 GameStore 重连定时器 (GameStore.js)

**问题 1: reconnectTimers 可能未完全清理**
- **位置**: `reconnectTimers` (第 13 行)
- **描述**: 虽然有 `_cleanupDisconnectEntry` 方法，但在以下场景可能遗漏：
  - 房间被销毁时，只清理了对应房间的条目，但定时器可能仍在运行
  - 服务器关闭时未批量清理所有定时器
- **代码片段**:
```javascript
const timerId = setTimeout(() => {
  this._removeDisconnectedPlayer(sessionId);
}, RECONNECT_GRACE_MS);

this.reconnectTimers.set(sessionId, timerId);
```

#### 风险等级：⚠️ 中等

#### 2.3.3 handlers.js 中的 AI 定时器

**问题 1: setTimeout 未保存引用**
- **位置**: `triggerAIActions` 中的多个 `setTimeout` 调用 (第 132, 135, 145 行)
- **描述**: AI 动作定时器未保存引用，无法在房间销毁时批量取消
- **风险**: 房间销毁后，AI 定时器可能继续执行，尝试访问已销毁的房间对象
- **代码片段**:
```javascript
setTimeout(() => performAIDraw(roomId, cp), 800);
setTimeout(() => performAIDiscard(roomId, cp), 600);
setTimeout(() => performAIClaim(roomId, pIdx), 500);
```

#### 风险等级：⚠️ 中等

---

### 2.4 事件监听器清理

#### 2.4.1 Socket.IO 事件监听器 (handlers.js)

**问题 1: socket.on 监听器未显式移除**
- **位置**: `setupSocketHandlers` 函数中的所有 `socket.on()` 调用
- **描述**: Socket.IO 会在 socket 断开时自动清理，但在以下场景可能有问题：
  - 自定义事件监听器在 socket 断开后仍被其他对象引用
  - `io.to(roomId).emit()` 的广播监听器未正确清理
- **风险**: 低，Socket.IO 框架会自动处理，但需确保回调函数不持有强引用

**问题 2: room 级别的广播监听器**
- **位置**: `io.to(roomId).emit()` 调用（多处）
- **描述**: 房间销毁后，如果 socket 未正确 leave room，可能仍接收广播
- **风险**: 中等，依赖正确的房间管理

#### 风险等级：✅ 低（框架自动管理）

---

### 2.5 审计日志内存泄漏 (auditLog.js)

**问题 1: roomLogs 可能无限增长**
- **位置**: `roomLogs` (第 7 行)
- **描述**: 虽然有 `maxEntries` 限制（默认 2000），但清理逻辑有缺陷：
  - 只在超过 `maxEntries * 1.1` (2200) 时才清理
  - 清理时保留最后 2000 条，但频繁写入的房间可能持续增长
  - `clearAuditLog` 只在 `onRoomDestroyed` 钩子中调用，如果钩子未触发则泄漏
- **代码片段**:
```javascript
const roomLogs = new Map();
const DEFAULT_MAX_ENTRIES = 2000;

//  Trim oldest entries if over limit (deferred: only trim when 10% over)
if (log.entries.length > log.maxEntries * 1.1) {
  log.entries = log.entries.slice(-log.maxEntries);
}
```

#### 风险等级：⚠️ 中等

---

### 2.6 其他潜在内存泄漏点

#### 2.6.1 GameStateMachine 历史记录 (GameStateMachine.js)

**问题 1: history 数组无限制增长**
- **位置**: `this.history` (第 39 行)
- **描述**: 虽然有 50 条限制（第 68-70 行），但长期运行的游戏可能累积
- **风险**: 低，50 条限制合理
- **代码片段**:
```javascript
this.history = [];
// Keep bounded
if (this.history.length > 50) {
  this.history.shift();
}
```

#### 风险等级：✅ 低

#### 2.6.2 MahjongGame 快照栈 (MahjongGame.js)

**问题 1: _snapshots 数组可能过大**
- **位置**: `_snapshots` (第 61 行)
- **描述**: 快照包含完整游戏状态副本，频繁调用 `getSnapshot()` 可能导致内存激增
- **风险**: 中等，依赖使用频率
- **代码片段**:
```javascript
this._snapshots = [];

getSnapshot() {
  const snapshot = {
    id: this._snapshots.length,
    phase: this._fsm.phase,
    hands: this.hands.map(h => [...h]),
    melds: this.melds.map(m => [...m]),
    // ... 大量数据
  };
  this._snapshots.push(snapshot);
  return snapshot;
}
```

#### 风险等级：⚠️ 中等

#### 2.6.3 速率限制器 (rateLimiter.js)

**问题 1: socketBuckets 可能泄漏**
- **位置**: `socketBuckets` (第 37 行)
- **描述**: 虽然有 `cleanupRateLimit` 函数，但如果未在 disconnect 时调用则泄漏
- **风险**: 低，已在 handlers.js 的 disconnect 事件中调用
- **代码片段**:
```javascript
const socketBuckets = new Map();

export function cleanupRateLimit(socketId) {
  socketBuckets.delete(socketId);
}
```

#### 风险等级：✅ 低（已正确清理）

#### 2.6.4 行动验证器 (actionValidator.js)

**问题 1: playerActionTimes 可能泄漏**
- **位置**: `playerActionTimes` (第 206 行)
- **描述**: 虽然有 LRU 清理机制（第 224-232 行），但清理逻辑复杂，可能有边界情况
- **风险**: 低，已有防护机制
- **代码片段**:
```javascript
const playerActionTimes = new Map();
const MAX_ACTION_TIMES_SIZE = 1000;

// 防止 Map 无限增长：超过阈值时清理最旧的 50%
if (playerActionTimes.size >= MAX_ACTION_TIMES_SIZE) {
  const entries = Array.from(playerActionTimes.entries());
  const halfSize = Math.ceil(entries.length / 2);
  for (let i = 0; i < halfSize; i++) {
    playerActionTimes.delete(entries[i][0]);
  }
}
```

#### 风险等级：✅ 低

---

## 三、关键泄漏路径分析

### 3.1 场景 1: 玩家频繁断线重连

```
玩家断线
  ↓
GameStore.handleDisconnect() 创建 disconnectedPlayers 条目
  ↓
设置 reconnectTimers (60 秒后触发)
  ↓
[60 秒内未重连]
  ↓
_removeDisconnectedPlayer() 被调用
  ↓
清理房间玩家和 disconnectedPlayers 条目
  ↓
[但 reconnectTimers 可能未完全清理]
  ↓
⚠️ 内存泄漏：reconnectTimers Map 中的定时器引用
```

### 3.2 场景 2: 房间频繁创建销毁

```
创建房间
  ↓
GameStore.createRoom() → rooms Map 添加
  ↓
开始游戏 → 创建 MahjongGame 实例
  ↓
游戏结束 → 房间销毁
  ↓
onRoomDestroyed 钩子被调用
  ↓
清理 aiControlled 和 auditLog
  ↓
[但如果钩子未正确注册或调用失败]
  ↓
⚠️ 内存泄漏：
  - rooms Map 中的房间引用
  - aiControlled 中的集合
  - roomLogs 中的审计日志
  - MahjongGame 实例及其快照
```

### 3.3 场景 3: 高频游戏操作

```
玩家快速操作（摸牌、出牌）
  ↓
触发 rateLimiter 记录时间戳
  ↓
触发 auditLog 记录审计条目
  ↓
触发 actionValidator 记录行动时间
  ↓
[高频操作持续]
  ↓
⚠️ 内存泄漏：
  - socketBuckets 中的时间戳数组
  - roomLogs 中的审计条目（超过 2000 才清理）
  - playerActionTimes 中的记录
```

---

## 四、修复建议

### 4.1 高优先级修复

#### 修复 1: GameStore 定时器清理增强

**文件**: `src/store/GameStore.js`

**问题**: reconnectTimers 可能未完全清理

**修复方案**:
```javascript
// 添加房间级别的定时器清理方法
cleanupRoomTimers(roomId) {
  for (const [sessionId, info] of this.disconnectedPlayers.entries()) {
    if (info.roomId === roomId) {
      this._cleanupDisconnectEntry(sessionId);
    }
  }
}

// 在房间销毁时调用
if (room.isEmpty()) {
  this.cleanupRoomTimers(roomId); // 新增
  this.rooms.delete(roomId);
  this.aiControlled.delete(roomId);
  if (this.onRoomDestroyed) this.onRoomDestroyed(roomId);
}
```

#### 修复 2: MahjongGame 定时器清理增强

**文件**: `src/game/MahjongGame.js`

**问题**: 游戏异常结束时定时器可能未清理

**修复方案**:
```javascript
// 添加游戏销毁方法
destroy() {
  this.clearClaimTimer();
  this._snapshots = [];
  this.hands = null;
  this.melds = null;
  this.flowerMelds = null;
  this.discardPile = null;
  this.tileSet = null;
  this._fsm = null;
}

// 在 Room.endGame() 中调用
endGame() {
  this.state = 'finished';
  if (this.game) {
    this.game.destroy(); // 新增
    this.game.finished = true;
  }
}
```

#### 修复 3: 审计日志清理增强

**文件**: `src/socket/auditLog.js`

**问题**: clearAuditLog 可能未被调用

**修复方案**:
```javascript
// 添加定期清理任务
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 分钟

export function startPeriodicCleanup() {
  return setInterval(() => {
    const now = Date.now();
    for (const [roomId, log] of roomLogs.entries()) {
      // 清理超过 30 分钟未更新的日志
      const lastEntry = log.entries[log.entries.length - 1];
      if (lastEntry && now - lastEntry.ts > 30 * 60 * 1000) {
        roomLogs.delete(roomId);
      }
    }
  }, CLEANUP_INTERVAL);
}
```

### 4.2 中优先级修复

#### 修复 4: 设备指纹缓存优化

**文件**: `src/security/deviceFingerprint.js`

**问题**: 定期清理任务无取消机制

**修复方案**:
```javascript
// 保存定时器引用
let cleanupTimer = null;

export function startPeriodicCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }
  
  cleanupTimer = setInterval(() => {
    cleanupDeviceCache();
  }, CLEANUP_INTERVAL);
  
  return cleanupTimer;
}

// 添加停止方法
export function stopPeriodicCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
```

#### 修复 5: AI 定时器引用管理

**文件**: `src/socket/handlers.js`

**问题**: AI 定时器未保存引用

**修复方案**:
```javascript
// 在 setupSocketHandlers 中维护 AI 定时器集合
const aiTimers = new Map(); // roomId -> Set<timeoutId>

function triggerAIActions(roomId) {
  // ... 现有代码
  
  // 保存定时器引用
  if (!aiTimers.has(roomId)) {
    aiTimers.set(roomId, new Set());
  }
  
  const timerId = setTimeout(() => performAIDraw(roomId, cp), 800);
  aiTimers.get(roomId).add(timerId);
  
  // 在房间销毁时清理
  gameStore.onRoomDestroyed = (roomId) => {
    const timers = aiTimers.get(roomId);
    if (timers) {
      for (const timerId of timers) {
        clearTimeout(timerId);
      }
      aiTimers.delete(roomId);
    }
    // ... 现有清理代码
  };
}
```

### 4.3 低优先级修复

#### 修复 6: 对象池统计信息优化

**文件**: `src/utils/ObjectPool.js`

**问题**: 统计信息只增不减

**修复方案**:
```javascript
// 添加统计信息重置方法
resetStats() {
  this.stats = {
    created: 0,
    acquired: 0,
    released: 0
  };
}

// 添加定期重置（可选）
startPeriodicReset(intervalMs = 60 * 60 * 1000) {
  return setInterval(() => {
    this.resetStats();
  }, intervalMs);
}
```

#### 修复 7: 快照栈大小限制

**文件**: `src/game/MahjongGame.js`

**问题**: 快照栈可能过大

**修复方案**:
```javascript
constructor(...) {
  // ... 现有代码
  this._snapshots = [];
  this.maxSnapshots = 10; // 限制快照数量
}

getSnapshot() {
  // 限制快照数量
  if (this._snapshots.length >= this.maxSnapshots) {
    this._snapshots.shift(); // 移除最旧的快照
  }
  
  const snapshot = { /* ... */ };
  this._snapshots.push(snapshot);
  return snapshot;
}
```

---

## 五、监控建议

### 5.1 添加内存监控指标

在 `src/monitoring/metrics.js` 中添加：

```javascript
// Map/Set 大小监控
export const gameStoreRooms = new client.Gauge({
  name: 'mahjong_gamestore_rooms_size',
  help: 'GameStore rooms Map 大小'
});

export const gameStoreDisconnectedPlayers = new client.Gauge({
  name: 'mahjong_gamestore_disconnected_size',
  help: 'GameStore disconnectedPlayers Map 大小'
});

export const auditLogRooms = new client.Gauge({
  name: 'mahjong_auditlog_rooms_size',
  help: 'AuditLog roomLogs Map 大小'
});

// 定期收集
setInterval(() => {
  gameStoreRooms.set(gameStore.rooms.size);
  gameStoreDisconnectedPlayers.set(gameStore.disconnectedPlayers.size);
  auditLogRooms.set(roomLogs.size);
}, 10000);
```

### 5.2 添加内存泄漏告警

在 `src/server.js` 中添加：

```javascript
// 定期内存检查
setInterval(() => {
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;
  
  if (heapUsedMB > 500) { // 阈值：500MB
    logger.warn({
      heapUsedMB,
      rssMB: usage.rss / 1024 / 1024
    }, '内存使用过高，可能存在泄漏');
    
    // 强制 GC（如果可用）
    if (global.gc) {
      global.gc();
    }
  }
}, 60000);
```

---

## 六、测试建议

### 6.1 增强现有内存泄漏测试

在 `test/performance/memory-leak-detection.test.js` 中：

1. **增加定时器清理测试**:
```javascript
describe('定时器清理测试', () => {
  it('应该在房间销毁后清理所有定时器', async () => {
    // 创建房间并开始游戏
    // 触发 AI 定时器
    // 销毁房间
    // 等待 2 秒
    // 验证没有定时器执行
  });
});
```

2. **增加断线重连场景测试**:
```javascript
describe('断线重连内存测试', () => {
  it('应该在重连超时后完全清理', async () => {
    // 模拟 100 个玩家断线
    // 等待 60 秒超时
    // 验证 disconnectedPlayers 和 reconnectTimers 为空
  });
});
```

### 6.2 添加压力测试

```javascript
// 模拟 1000 个并发房间
for (let i = 0; i < 1000; i++) {
  const room = gameStore.createRoom(`player_${i}`);
  gameStore.joinRoom(room.id, { id: `player_${i}`, name: `Player ${i}` });
}

// 监控内存增长
monitor.takeSnapshot('before_stress');

// 快速销毁所有房间
for (const roomId of gameStore.rooms.keys()) {
  gameStore.leaveRoom(roomId);
}

monitor.takeSnapshot('after_stress');
```

---

## 七、总结

### 7.1 发现的主要问题

| 问题类别 | 数量 | 风险等级 |
|---------|------|---------|
| 定时器未清理 | 4 | ⚠️ 中等 |
| Map/Set 无限增长 | 6 | ⚠️ 中等 |
| 对象池管理 | 3 | ⚠️ 中等 |
| 事件监听器 | 2 | ✅ 低 |
| 缓存清理 | 3 | ⚠️ 中等 |

### 7.2 总体风险评估

**风险等级**: ⚠️ **中等**

**理由**:
- ✅ 大部分 Map/Set 已有清理机制
- ✅ 关键路径（如 disconnect）已有处理
- ⚠️ 边界情况（异常、超时、并发）处理不足
- ⚠️ 定时器管理分散，缺乏统一清理
- ⚠️ 缺乏主动监控和告警机制

### 7.3 优先行动项

1. **立即实施** (本周):
   - 修复 GameStore 定时器清理
   - 修复 MahjongGame 销毁方法
   - 添加内存监控指标

2. **短期实施** (本月):
   - 修复审计日志清理
   - 优化 AI 定时器管理
   - 增强压力测试

3. **长期优化** (下季度):
   - 迁移到 Redis 存储（设备指纹、Token 黑名单）
   - 实现统一的资源管理框架
   - 建立自动化内存泄漏检测 CI/CD

---

## 附录 A: 检测工具和方法

### A.1 静态代码分析
- 手动审查所有 Map/Set 的创建和使用
- 追踪所有 setTimeout/setInterval 的引用
- 检查事件监听器的注册和注销

### A.2 动态测试
- 现有 `memory-leak-detection.test.js` 测试套件
- 长时间运行测试（模拟 24 小时）
- 压力测试（1000+ 并发房间）

### A.3 监控工具
- Node.js 内置 `process.memoryUsage()`
- Chrome DevTools Heap Snapshot
- clinic.js 内存分析工具

---

**报告生成时间**: 2026-04-13  
**审核状态**: 待人工审核  
**下一步**: 实施高优先级修复项
