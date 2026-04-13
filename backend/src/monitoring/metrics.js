/**
 * 性能监控模块
 * 使用 prom-client 收集性能指标
 */

import client from 'prom-client';

// 创建注册表
const register = new client.Registry();

// 添加默认指标（Node.js 运行时指标）
client.collectDefaultMetrics({
  register,
  prefix: 'mahjong_',
  gcDurationMetric: true,
  memoryMetric: true,
  cpuMetric: true,
  handlesMetric: true
});

// =========================================================================
// 自定义指标
// =========================================================================

// --- 基础游戏指标 ---

// 活跃游戏数量
export const activeGames = new client.Gauge({
  name: 'mahjong_active_games',
  help: '当前进行中的游戏数量'
});
register.registerMetric(activeGames);

// 在线玩家数量
export const onlinePlayers = new client.Gauge({
  name: 'mahjong_online_players',
  help: '当前在线玩家数量'
});
register.registerMetric(onlinePlayers);

// WebSocket 连接数
export const websocketConnections = new client.Gauge({
  name: 'mahjong_websocket_connections',
  help: '当前 WebSocket 连接数量'
});
register.registerMetric(websocketConnections);

// 房间数量
export const totalRooms = new client.Gauge({
  name: 'mahjong_total_rooms',
  help: '总房间数量'
});
register.registerMetric(totalRooms);

// --- 游戏动作指标 ---

// 游戏动作计数器
export const gameActions = new client.Counter({
  name: 'mahjong_game_actions_total',
  help: '游戏动作总数',
  labelNames: ['action_type'] // 'draw', 'discard', 'pong', 'chow', 'kong', 'win'
});
register.registerMetric(gameActions);

// 游戏动作耗时
export const actionDuration = new client.Histogram({
  name: 'mahjong_action_duration_seconds',
  help: '游戏动作耗时（秒）',
  labelNames: ['action_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});
register.registerMetric(actionDuration);

// 游戏动作成功率
export const actionSuccessRate = new client.Counter({
  name: 'mahjong_action_results_total',
  help: '游戏动作结果统计',
  labelNames: ['action_type', 'result'] // result: 'success', 'failure'
});
register.registerMetric(actionSuccessRate);

// --- 消息处理指标 ---

// 消息批处理指标
export const messageBatches = new client.Counter({
  name: 'mahjong_message_batches_total',
  help: '消息批处理次数'
});
register.registerMetric(messageBatches);

export const messageBatchSize = new client.Histogram({
  name: 'mahjong_message_batch_size',
  help: '消息批处理大小分布',
  buckets: [1, 5, 10, 20, 50, 100]
});
register.registerMetric(messageBatchSize);

// 消息处理延迟
export const messageLatency = new client.Histogram({
  name: 'mahjong_message_latency_seconds',
  help: '消息处理延迟（秒）',
  labelNames: ['message_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});
register.registerMetric(messageLatency);

// --- 安全与限流指标 ---

// 速率限制指标
export const rateLimitHits = new client.Counter({
  name: 'mahjong_rate_limit_hits_total',
  help: '速率限制触发次数',
  labelNames: ['event_type'] // 'socket', 'api', 'action'
});
register.registerMetric(rateLimitHits);

// 认证失败指标
export const authFailures = new client.Counter({
  name: 'mahjong_auth_failures_total',
  help: '认证失败次数',
  labelNames: ['reason'] // 'invalid_token', 'expired_token', 'invalid_signature'
});
register.registerMetric(authFailures);

// 设备指纹验证失败
export const deviceFingerprintFailures = new client.Counter({
  name: 'mahjong_device_fingerprint_failures_total',
  help: '设备指纹验证失败次数',
  labelNames: ['reason']
});
register.registerMetric(deviceFingerprintFailures);

// --- 连接与重连指标 ---

// 断线重连指标
export const reconnectAttempts = new client.Counter({
  name: 'mahjong_reconnect_attempts_total',
  help: '断线重连尝试次数'
});
register.registerMetric(reconnectAttempts);

export const reconnectSuccesses = new client.Counter({
  name: 'mahjong_reconnect_successes_total',
  help: '断线重连成功次数'
});
register.registerMetric(reconnectSuccesses);

export const reconnectDuration = new client.Histogram({
  name: 'mahjong_reconnect_duration_seconds',
  help: '断线重连耗时（秒）',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});
register.registerMetric(reconnectDuration);

// --- 胡牌统计指标 ---

// 胡牌统计
export const winActions = new client.Counter({
  name: 'mahjong_wins_total',
  help: '胡牌次数',
  labelNames: ['win_type'] // 'self_draw', 'discard', 'multi_win'
});
register.registerMetric(winActions);

// 胡牌番数分布
export const winFanDistribution = new client.Histogram({
  name: 'mahjong_win_fan_distribution',
  help: '胡牌番数分布',
  labelNames: ['win_type'],
  buckets: [1, 2, 4, 6, 8, 10, 12, 16, 20, 24]
});
register.registerMetric(winFanDistribution);

// 特殊牌型统计
export const specialPatterns = new client.Counter({
  name: 'mahjong_special_patterns_total',
  help: '特殊牌型出现次数',
  labelNames: ['pattern_name'] // '十三幺', '七对子', '清一色', '字一色', '大三元'
});
register.registerMetric(specialPatterns);

// --- 游戏时长与流局指标 ---

// 游戏时长统计
export const gameDuration = new client.Histogram({
  name: 'mahjong_game_duration_seconds',
  help: '游戏时长分布（秒）',
  labelNames: ['player_count', 'result'], // result: 'win', 'draw'
  buckets: [60, 300, 600, 1200, 1800, 3600]
});
register.registerMetric(gameDuration);

// 流局统计
export const drawGames = new client.Counter({
  name: 'mahjong_draw_games_total',
  help: '流局次数'
});
register.registerMetric(drawGames);

// --- 牌墙与摸牌指标 ---

// 牌墙剩余分布
export const tileWallRemaining = new client.Histogram({
  name: 'mahjong_tile_wall_remaining',
  help: '牌墙剩余牌数分布',
  buckets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
});
register.registerMetric(tileWallRemaining);

// 摸牌速度
export const drawTileSpeed = new client.Histogram({
  name: 'mahjong_draw_tile_speed_seconds',
  help: '摸牌耗时（秒）',
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2]
});
register.registerMetric(drawTileSpeed);

// --- 声明窗口指标 ---

// 声明窗口处理时间
export const claimWindowDuration = new client.Histogram({
  name: 'mahjong_claim_window_duration_seconds',
  help: '声明窗口处理耗时（秒）',
  labelNames: ['claim_type'], // 'win', 'pong', 'kong', 'chow'
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});
register.registerMetric(claimWindowDuration);

// 声明超时统计
export const claimTimeouts = new client.Counter({
  name: 'mahjong_claim_timeouts_total',
  help: '声明超时次数'
});
register.registerMetric(claimTimeouts);

// 声明优先级冲突
export const claimPriorityConflicts = new client.Counter({
  name: 'mahjong_claim_priority_conflicts_total',
  help: '声明优先级冲突次数'
});
register.registerMetric(claimPriorityConflicts);

// --- 杠牌统计指标 ---

// 杠牌统计
export const kongActions = new client.Counter({
  name: 'mahjong_kong_actions_total',
  help: '杠牌次数',
  labelNames: ['kong_type'] // 'self_kong', 'exposed_kong', 'added_kong'
});
register.registerMetric(kongActions);

// 杠上开花统计
export const kongSelfDrawWins = new client.Counter({
  name: 'mahjong_kong_self_draw_wins_total',
  help: '杠上开花次数'
});
register.registerMetric(kongSelfDrawWins);

// --- 花牌与鸟牌指标 ---

// 花牌统计
export const flowerTiles = new client.Counter({
  name: 'mahjong_flower_tiles_total',
  help: '花牌出现次数',
  labelNames: ['flower_number'] // 'H1' to 'H8'
});
register.registerMetric(flowerTiles);

// 鸟牌命中统计
export const birdTileHits = new client.Counter({
  name: 'mahjong_bird_tile_hits_total',
  help: '鸟牌命中次数',
  labelNames: ['hit_type'] // 'hit', 'miss'
});
register.registerMetric(birdTileHits);

// --- 听牌提示指标 ---

// 听牌提示使用
export const tingpaiHints = new client.Counter({
  name: 'mahjong_tingpai_hints_total',
  help: '听牌提示使用次数'
});
register.registerMetric(tingpaiHints);

// 听牌成功率
export const tingpaiSuccessRate = new client.Counter({
  name: 'mahjong_tingpai_success_total',
  help: '听牌成功统计',
  labelNames: ['result'] // 'win', 'miss'
});
register.registerMetric(tingpaiSuccessRate);

// --- 性能与资源指标 ---

// 内存使用情况
export const memoryUsage = new client.Gauge({
  name: 'mahjong_memory_usage_bytes',
  help: '内存使用量（字节）',
  labelNames: ['type'] // 'heap', 'rss', 'external'
});
register.registerMetric(memoryUsage);

// 事件循环延迟
export const eventLoopLag = new client.Histogram({
  name: 'mahjong_event_loop_lag_seconds',
  help: '事件循环延迟（秒）',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});
register.registerMetric(eventLoopLag);

// 并发游戏数
export const concurrentGames = new client.Gauge({
  name: 'mahjong_concurrent_games',
  help: '并发进行的游戏数量'
});
register.registerMetric(concurrentGames);

// 每秒请求数
export const requestsPerSecond = new client.Counter({
  name: 'mahjong_requests_total',
  help: '每秒请求数',
  labelNames: ['endpoint']
});
register.registerMetric(requestsPerSecond);

// --- 错误与异常指标 ---

// 游戏错误统计
export const gameErrors = new client.Counter({
  name: 'mahjong_game_errors_total',
  help: '游戏错误次数',
  labelNames: ['error_type', 'severity'] // severity: 'warning', 'error', 'critical'
});
register.registerMetric(gameErrors);

// 状态机异常
export const stateMachineExceptions = new client.Counter({
  name: 'mahjong_state_machine_exceptions_total',
  help: '状态机异常次数'
});
register.registerMetric(stateMachineExceptions);

// 回滚操作统计
export const rollbackOperations = new client.Counter({
  name: 'mahjong_rollback_operations_total',
  help: '状态回滚操作次数'
});
register.registerMetric(rollbackOperations);

/**
 * 获取所有指标
 */
export async function getMetrics() {
  return await register.metrics();
}

/**
 * 重置所有指标（用于测试）
 */
export function resetMetrics() {
  register.clear();
}

/**
 * 监控中间件工厂
 * @param {Function} fn - 要监控的函数
 * @param {string} actionType - 动作类型标签
 * @returns {Function} 包装后的函数
 */
export function monitorAction(fn, actionType) {
  return async function (...args) {
    const endTimer = actionDuration.startTimer({ action_type: actionType });
    try {
      gameActions.inc({ action_type: actionType });
      const result = await fn(...args);
      actionSuccessRate.inc({ action_type: actionType, result: result.success ? 'success' : 'failure' });
      return result;
    } catch (error) {
      actionSuccessRate.inc({ action_type: actionType, result: 'failure' });
      gameErrors.inc({ error_type: error.name, severity: 'error' });
      throw error;
    } finally {
      endTimer();
    }
  };
}

/**
 * 监控游戏时长的辅助函数
 * @param {string} playerId - 玩家 ID
 * @returns {Function} 结束计时的函数
 */
export function startGameTimer(playerCount) {
  const startTime = Date.now();
  
  return function endGameTimer(result) {
    const duration = (Date.now() - startTime) / 1000;
    gameDuration.observe({ 
      player_count: playerCount.toString(),
      result: result || 'win'
    }, duration);
  };
}

/**
 * 记录特殊牌型
 * @param {string} patternName - 牌型名称
 */
export function recordSpecialPattern(patternName) {
  specialPatterns.inc({ pattern_name: patternName });
}

/**
 * 监控声明窗口处理
 * @param {string} claimType - 声明类型
 * @returns {Function} 结束计时的函数
 */
export function startClaimWindowTimer(claimType) {
  const endTimer = claimWindowDuration.startTimer({ claim_type: claimType });
  return function endClaimWindowTimer() {
    endTimer();
  };
}

/**
 * 记录断线重连
 * @param {boolean} success - 是否成功
 * @param {number} duration - 重连耗时（秒）
 */
export function recordReconnect(success, duration) {
  reconnectAttempts.inc();
  if (success) {
    reconnectSuccesses.inc();
  }
  reconnectDuration.observe(duration);
}

/**
 * 记录胡牌事件
 * @param {string} winType - 胡牌类型
 * @param {number} fan - 番数
 */
export function recordWin(winType, fan) {
  winActions.inc({ win_type: winType });
  winFanDistribution.observe({ win_type: winType }, fan);
}

/**
 * 记录杠牌事件
 * @param {string} kongType - 杠牌类型
 */
export function recordKong(kongType) {
  kongActions.inc({ kong_type: kongType });
}

/**
 * 监控消息处理延迟
 * @param {string} messageType - 消息类型
 * @returns {Function} 结束计时的函数
 */
export function startMessageLatencyTimer(messageType) {
  const endTimer = messageLatency.startTimer({ message_type: messageType });
  return function endMessageLatencyTimer() {
    endTimer();
  };
}
