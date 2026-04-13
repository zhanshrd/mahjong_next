/**
 * 结构化日志模块
 * 使用 Pino 高性能日志库
 */

import pino from 'pino';

// 创建日志实例
const logger = pino({
  // 日志级别
  level: process.env.LOG_LEVEL || 'info',
  
  // 格式化器
  formatters: {
    // 日志级别格式化
    level: (label) => ({ level: label }),
    
    // 绑定信息格式化
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.host
    })
  },
  
  // 基础字段
  base: {
    service: 'mahjong-game',
    env: process.env.NODE_ENV || 'development'
  },
  
  // 时间戳格式化
  timestamp: () => `,"time":"${new Date().toISOString()}"`
});

/**
 * 日志级别枚举
 */
export const LogLevel = {
  FATAL: 'fatal',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace'
};

/**
 * 游戏事件日志
 * @param {string} roomId - 房间 ID
 * @param {string} event - 事件类型
 * @param {Object} data - 事件数据
 */
export function logGameEvent(roomId, event, data) {
  logger.info({
    module: 'game',
    roomId,
    event,
    ...data
  }, `游戏事件：${event}`);
}

/**
 * 玩家行为日志
 * @param {string} playerId - 玩家 ID
 * @param {string} action - 行为类型
 * @param {Object} data - 行为数据
 */
export function logPlayerAction(playerId, action, data) {
  logger.info({
    module: 'player',
    playerId,
    action,
    ...data
  }, `玩家行为：${action}`);
}

/**
 * 房间管理日志
 * @param {string} roomId - 房间 ID
 * @param {string} action - 操作类型
 * @param {Object} data - 操作数据
 */
export function logRoomAction(roomId, action, data) {
  logger.info({
    module: 'room',
    roomId,
    action,
    ...data
  }, `房间操作：${action}`);
}

/**
 * 错误日志
 * @param {Error} error - 错误对象
 * @param {string} context - 错误上下文
 * @param {Object} data - 附加数据
 */
export function logError(error, context, data = {}) {
  // 处理循环引用：使用 safe-stable-stringify 或手动处理
  const safeError = {
    message: error.message,
    name: error.name,
    stack: error.stack
  };
  
  // 移除可能的循环引用
  const safeData = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null) {
      try {
        JSON.stringify(value);
        safeData[key] = value;
      } catch (e) {
        // 跳过循环引用
        safeData[key] = '[Circular Reference]';
      }
    } else {
      safeData[key] = value;
    }
  }
  
  logger.error({
    module: 'error',
    context,
    error: safeError,
    ...safeData
  }, `错误：${context}`);
}

/**
 * 安全事件日志
 * @param {string} eventType - 事件类型
 * @param {Object} data - 事件数据
 */
export function logSecurityEvent(eventType, data) {
  logger.warn({
    module: 'security',
    eventType,
    ...data
  }, `安全事件：${eventType}`);
}

/**
 * 性能日志
 * @param {string} operation - 操作名称
 * @param {number} duration - 耗时（毫秒）
 * @param {Object} data - 附加数据
 */
export function logPerformance(operation, duration, data = {}) {
  if (duration > 100) {
    logger.warn({
      module: 'performance',
      operation,
      duration,
      ...data
    }, `性能警告：${operation} 耗时 ${duration}ms`);
  } else {
    logger.debug({
      module: 'performance',
      operation,
      duration,
      ...data
    }, `性能：${operation} 耗时 ${duration}ms`);
  }
}

/**
 * 断线重连日志
 * @param {string} playerId - 玩家 ID
 * @param {string} roomId - 房间 ID
 * @param {Object} data - 重连数据
 */
export function logReconnect(playerId, roomId, data) {
  logger.info({
    module: 'reconnect',
    playerId,
    roomId,
    ...data
  }, '玩家重连');
}

/**
 * 速率限制日志
 * @param {string} playerId - 玩家 ID
 * @param {string} event - 事件类型
 * @param {Object} data - 限制数据
 */
export function logRateLimit(playerId, event, data) {
  logger.warn({
    module: 'ratelimit',
    playerId,
    event,
    ...data
  }, '速率限制触发');
}

export default logger;
