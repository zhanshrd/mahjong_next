/**
 * 设备指纹模块
 * 用于识别和追踪设备
 */

import crypto from 'crypto';

/**
 * 生成设备指纹
 * @param {Object} handshake - Socket.IO handshake 对象
 * @returns {string} 设备指纹哈希
 */
export function generateDeviceFingerprint(handshake) {
  // 使用更稳定的设备特征组合
  const components = [
    // 稳定的浏览器特征
    handshake.headers['user-agent'] || '',
    handshake.headers['accept-language'] || '',
    handshake.headers['accept-encoding'] || '',
    
    // 网络特征
    handshake.address || '',
    
    // 客户端特征（如果可用）
    handshake.headers['sec-ch-ua'] || '',
    handshake.headers['sec-ch-ua-platform'] || '',
    handshake.headers['sec-ch-ua-mobile'] || '',
    
    // 连接特征
    handshake.headers['connection'] || '',
    handshake.headers['host'] || ''
  ];
  
  // 组合所有组件并生成 SHA256 哈希
  const fingerprintString = components.join('|');
  const hash = crypto
    .createHash('sha256')
    .update(fingerprintString)
    .digest('hex');
  
  return hash;
}

/**
 * 生成简化版设备指纹（用于快速比对）
 * @param {Object} handshake - Socket.IO handshake 对象
 * @returns {string} 简化版设备指纹（前 16 位）
 */
export function generateSimpleFingerprint(handshake) {
  const fullFingerprint = generateDeviceFingerprint(handshake);
  return fullFingerprint.substring(0, 16);
}

/**
 * 设备指纹存储（内存缓存）
 * 生产环境应使用 Redis
 */
const deviceCache = new Map();
const MAX_CACHE_SIZE = 10000; // 最大缓存数量

/**
 * 验证设备一致性
 * @param {Object} socket - Socket 对象
 * @param {string} storedFingerprint - 存储的指纹
 * @returns {boolean} 设备是否一致
 */
import { logger } from '../monitoring/logger.js';

export function validateDevice(socket, storedFingerprint) {
  const currentFingerprint = generateDeviceFingerprint(socket.handshake);
  
  if (currentFingerprint !== storedFingerprint) {
    // 设备不匹配，记录安全事件
    logger.warn({
      event: 'device_mismatch',
      userId: socket.user?.uid,
      stored: storedFingerprint,
      current: currentFingerprint,
      timestamp: Date.now()
    }, '设备指纹不匹配');
    return false;
  }
  
  return true;
}

/**
 * 存储设备指纹
 * @param {string} userId - 用户 ID
 * @param {string} fingerprint - 设备指纹
 */
export function storeDeviceFingerprint(userId, fingerprint) {
  // 防止缓存无限增长：超过阈值时清理最旧的 50%
  if (deviceCache.size >= MAX_CACHE_SIZE) {
    cleanupDeviceCache(24 * 60 * 60 * 1000); // 只保留 24 小时内的记录
  }
  
  deviceCache.set(userId, {
    fingerprint,
    timestamp: Date.now()
  });
}

/**
 * 获取设备指纹
 * @param {string} userId - 用户 ID
 * @returns {string|null} 设备指纹
 */
export function getDeviceFingerprint(userId) {
  const record = deviceCache.get(userId);
  return record ? record.fingerprint : null;
}

/**
 * 检查设备是否可信
 * @param {string} userId - 用户 ID
 * @param {Object} socket - Socket 对象
 * @returns {boolean} 设备是否可信
 */
export function isTrustedDevice(userId, socket) {
  const storedFingerprint = getDeviceFingerprint(userId);
  if (!storedFingerprint) {
    // 首次登录，存储指纹
    const fingerprint = generateDeviceFingerprint(socket.handshake);
    storeDeviceFingerprint(userId, fingerprint);
    return true;
  }
  
  return validateDevice(socket, storedFingerprint);
}

/**
 * 清理过期设备记录（简单实现，生产环境应使用定时任务）
 * @param {number} maxAge - 最大保留时间（毫秒），默认 7 天
 */
export function cleanupDeviceCache(maxAge = 7 * 24 * 60 * 60 * 1000) {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [userId, record] of deviceCache.entries()) {
    if (now - record.timestamp > maxAge) {
      deviceCache.delete(userId);
      cleanedCount++;
    }
  }
  
  // 记录清理结果
  if (cleanedCount > 0) {
    console.log(`[设备指纹] 清理了 ${cleanedCount} 条过期记录，当前缓存大小：${deviceCache.size}`);
  }
  
  return cleanedCount;
}

/**
 * 启动定期清理任务（每 1 小时执行一次）
 */
export function startPeriodicCleanup() {
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 小时
  
  // 立即执行一次
  cleanupDeviceCache();
  
  // 定期执行
  const timer = setInterval(() => {
    cleanupDeviceCache();
  }, CLEANUP_INTERVAL);
  
  // 允许取消定时器
  return timer;
}
