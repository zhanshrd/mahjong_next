/**
 * 麻将游戏安全加固实施指南
 * 
 * 本文件包含所有安全修复的参考实现
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// ============================================================
// 1. JWT Token 安全增强
// ============================================================

/**
 * 安全配置
 */
const SECURITY_CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
  JWT_EXPIRES_IN: 900, // 15 分钟 (秒)
  REFRESH_TOKEN_EXPIRES_IN: 86400, // 24 小时 (秒)
  TOKEN_VERSION_KEY: 'token:version:',
  TOKEN_BLACKLIST_KEY: 'token:blacklist:',
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCKOUT_TIME: 900000, // 15 分钟 (毫秒)
};

/**
 * 生成安全的 JWT Token
 * @param {Object} user - 用户信息
 * @param {string} deviceFingerprint - 设备指纹
 * @returns {Object} { accessToken, refreshToken, expiresIn }
 */
export function generateSecureToken(user, deviceFingerprint) {
  const jti = crypto.randomBytes(16).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  
  const accessTokenPayload = {
    uid: user.id,
    name: user.name,
    jti,
    deviceFingerprint,
    tokenVersion: now,
    iat: now,
    exp: now + SECURITY_CONFIG.JWT_EXPIRES_IN
  };
  
  const refreshTokenPayload = {
    uid: user.id,
    jti: crypto.randomBytes(16).toString('hex'),
    accessTokenJti: jti,
    iat: now,
    exp: now + SECURITY_CONFIG.REFRESH_TOKEN_EXPIRES_IN
  };
  
  return {
    accessToken: jwt.sign(accessTokenPayload, SECURITY_CONFIG.JWT_SECRET),
    refreshToken: jwt.sign(refreshTokenPayload, SECURITY_CONFIG.JWT_SECRET),
    expiresIn: SECURITY_CONFIG.JWT_EXPIRES_IN
  };
}

/**
 * 验证 JWT Token（带黑名单检查）
 * @param {string} token - JWT Token
 * @param {Object} redisClient - Redis 客户端
 * @returns {Object|null} 解码后的 payload
 */
export async function verifyTokenWithBlacklist(token, redisClient) {
  try {
    const decoded = jwt.verify(token, SECURITY_CONFIG.JWT_SECRET);
    
    // 检查是否在黑名单中
    if (redisClient) {
      const isBlacklisted = await redisClient.get(
        `${SECURITY_CONFIG.TOKEN_BLACKLIST_KEY}${decoded.jti}`
      );
      
      if (isBlacklisted) {
        console.warn('Token 已被撤销:', decoded.jti);
        return null;
      }
      
      // 检查 token 版本
      const currentVersion = await redisClient.get(
        `${SECURITY_CONFIG.TOKEN_VERSION_KEY}${decoded.uid}`
      );
      
      if (currentVersion && decoded.tokenVersion < parseInt(currentVersion)) {
        console.warn('Token 版本已过时:', decoded.jti);
        return null;
      }
    }
    
    return decoded;
  } catch (err) {
    console.error('Token 验证失败:', err.message);
    return null;
  }
}

/**
 * 撤销单个 Token
 * @param {string} token - JWT Token
 * @param {Object} redisClient - Redis 客户端
 */
export async function revokeToken(token, redisClient) {
  try {
    const decoded = jwt.verify(token, SECURITY_CONFIG.JWT_SECRET);
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    
    if (redisClient && ttl > 0) {
      await redisClient.setex(
        `${SECURITY_CONFIG.TOKEN_BLACKLIST_KEY}${decoded.jti}`,
        ttl,
        '1'
      );
      console.log('Token 已撤销:', decoded.jti);
    }
  } catch (err) {
    console.error('撤销 Token 失败:', err.message);
  }
}

/**
 * 撤销用户所有 Token（登出所有设备）
 * @param {string} userId - 用户 ID
 * @param {Object} redisClient - Redis 客户端
 */
export async function revokeAllUserTokens(userId, redisClient) {
  if (redisClient) {
    const version = Date.now();
    await redisClient.set(
      `${SECURITY_CONFIG.TOKEN_VERSION_KEY}${userId}`,
      version.toString()
    );
    console.log('用户所有 Token 已撤销:', userId);
  }
}

/**
 * 刷新 Token
 * @param {string} refreshToken - Refresh Token
 * @param {Object} redisClient - Redis 客户端
 * @returns {Object|null} 新的 access token
 */
export async function refreshAccessToken(refreshToken, redisClient) {
  try {
    const decoded = jwt.verify(refreshToken, SECURITY_CONFIG.JWT_SECRET);
    
    // 检查 refresh token 是否在黑名单中
    if (redisClient) {
      const isBlacklisted = await redisClient.get(
        `${SECURITY_CONFIG.TOKEN_BLACKLIST_KEY}${decoded.jti}`
      );
      
      if (isBlacklisted) {
        console.warn('Refresh token 已被撤销');
        return null;
      }
    }
    
    // 生成新的 access token
    const newTokens = generateSecureToken(
      { id: decoded.uid, name: 'User' },
      decoded.deviceFingerprint
    );
    
    // 撤销旧的 refresh token（可选，实现 refresh token 轮换）
    if (redisClient) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      await redisClient.setex(
        `${SECURITY_CONFIG.TOKEN_BLACKLIST_KEY}${decoded.jti}`,
        ttl,
        '1'
      );
    }
    
    return newTokens;
  } catch (err) {
    console.error('刷新 Token 失败:', err.message);
    return null;
  }
}

// ============================================================
// 2. 输入验证与清理
// ============================================================

/**
 * 输入长度限制
 */
const INPUT_LIMITS = {
  PLAYER_NAME: { min: 1, max: 20 },
  ROOM_NAME: { min: 1, max: 30 },
  ROOM_PASSWORD: { min: 4, max: 20 },
  CHAT_MESSAGE: { min: 1, max: 100 },
  EMOJI: { min: 1, max: 10 }
};

/**
 * 安全的字符白名单
 */
const ALLOWED_PATTERNS = {
  PLAYER_NAME: /^[\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af-]{1,20}$/,
  ROOM_NAME: /^[\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\s-]{1,30}$/,
  ROOM_PASSWORD: /^[\w!@#$%^&*()_+-]{4,20}$/,
  CHAT_MESSAGE: /^[\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\s\d\p{Emoji}.,!?'"()\-]{1,100}$/u
};

/**
 * 验证并清理玩家名称
 * @param {string} name - 原始名称
 * @returns {string} 清理后的名称
 */
export function sanitizePlayerName(name) {
  if (typeof name !== 'string') {
    return 'Player';
  }
  
  // 移除 HTML 标签和脚本
  let sanitized = name.replace(/<[^>]*>/g, '');
  
  // 只允许白名单字符
  sanitized = sanitized.replace(/[^\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af-]/g, '');
  
  // 修剪并限制长度
  sanitized = sanitized.trim().slice(0, INPUT_LIMITS.PLAYER_NAME.max);
  
  // 如果为空，使用默认值
  if (sanitized.length === 0 || sanitized.length < INPUT_LIMITS.PLAYER_NAME.min) {
    return 'Player';
  }
  
  return sanitized;
}

/**
 * 验证并清理聊天消息
 * @param {string} message - 原始消息
 * @returns {string|null} 清理后的消息，无效返回 null
 */
export function sanitizeChatMessage(message) {
  if (typeof message !== 'string') {
    return null;
  }
  
  // 移除 HTML 标签
  let sanitized = message.replace(/<[^>]*>/g, '');
  
  // 限制长度
  sanitized = sanitized.slice(0, INPUT_LIMITS.CHAT_MESSAGE.max);
  
  if (sanitized.trim().length === 0) {
    return null;
  }
  
  return sanitized;
}

/**
 * 验证房间密码
 * @param {string} password - 密码
 * @returns {boolean} 是否有效
 */
export function validateRoomPassword(password) {
  if (typeof password !== 'string') {
    return false;
  }
  
  if (password.length < INPUT_LIMITS.ROOM_PASSWORD.min ||
      password.length > INPUT_LIMITS.ROOM_PASSWORD.max) {
    return false;
  }
  
  // 不允许 SQL 注入特征字符
  const sqlInjectionPatterns = [
    /'/,
    /"/,
    /--/,
    /;/,
    /\/\*/,
    /\*\//,
    /xp_/i,
    /exec/i,
    /select/i,
    /union/i,
    /drop/i,
    /delete/i,
    /insert/i,
    /update/i
  ];
  
  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(password)) {
      return false;
    }
  }
  
  return true;
}

/**
 * 验证输入长度
 * @param {string} input - 输入
 * @param {string} type - 输入类型
 * @returns {boolean} 是否有效
 */
export function validateInputLength(input, type) {
  const limit = INPUT_LIMITS[type];
  if (!limit) {
    throw new Error(`未知的输入类型：${type}`);
  }
  
  if (typeof input !== 'string') {
    return false;
  }
  
  return input.length >= limit.min && input.length <= limit.max;
}

// ============================================================
// 3. 多维度速率限制
// ============================================================

/**
 * 速率限制配置
 */
const RATE_LIMIT_CONFIG = {
  // 每个 socket 的限制
  SOCKET: {
    draw_tile: { max: 5, windowMs: 1000 },
    discard_tile: { max: 5, windowMs: 1000 },
    declare_claim: { max: 5, windowMs: 1000 },
    default: { max: 30, windowMs: 1000 }
  },
  
  // 每个 IP 的限制
  IP: {
    default: { max: 100, windowMs: 60000 }, // 每分钟 100 次
    connection: { max: 10, windowMs: 60000 } // 每分钟 10 个连接
  },
  
  // 每个用户的限制
  USER: {
    default: { max: 200, windowMs: 60000 }, // 每分钟 200 次
    game_action: { max: 60, windowMs: 60000 } // 每分钟 60 次游戏操作
  }
};

/**
 * 速率限制桶存储
 */
const rateLimitBuckets = {
  socket: new Map(),
  ip: new Map(),
  user: new Map()
};

/**
 * 检查速率限制（多维度）
 * @param {Object} socket - Socket 对象
 * @param {string} eventName - 事件名称
 * @returns {Object} { allowed: boolean, retryAfterMs?: number }
 */
export function checkMultiDimensionalRateLimit(socket, eventName) {
  const ipAddress = socket.handshake?.address || 'unknown';
  const userId = socket.user?.uid || 'anonymous';
  const socketId = socket.id;
  
  // 检查 socket 维度
  const socketResult = checkBucket(
    rateLimitBuckets.socket,
    `${socketId}:${eventName}`,
    eventName
  );
  
  if (!socketResult.allowed) {
    return socketResult;
  }
  
  // 检查 IP 维度
  const ipResult = checkBucket(
    rateLimitBuckets.ip,
    `${ipAddress}:${eventName}`,
    'default'
  );
  
  if (!ipResult.allowed) {
    return ipResult;
  }
  
  // 检查用户维度
  const userResult = checkBucket(
    rateLimitBuckets.user,
    `${userId}:${eventName}`,
    eventName.includes('draw') || eventName.includes('discard') || eventName.includes('claim')
      ? 'game_action'
      : 'default'
  );
  
  if (!userResult.allowed) {
    return userResult;
  }
  
  return { allowed: true };
}

/**
 * 检查单个桶的速率限制
 */
function checkBucket(buckets, key, limitType) {
  const limit = RATE_LIMIT_CONFIG[limitType] || RATE_LIMIT_CONFIG.SOCKET.default;
  const now = Date.now();
  
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  
  // 清理过期时间戳
  const cutoff = now - limit.windowMs;
  bucket.timestamps = bucket.timestamps.filter(t => t > cutoff);
  
  if (bucket.timestamps.length >= limit.max) {
    const oldestInWindow = bucket.timestamps[0];
    return {
      allowed: false,
      retryAfterMs: oldestInWindow + limit.windowMs - now
    };
  }
  
  bucket.timestamps.push(now);
  return { allowed: true };
}

/**
 * 清理速率限制数据
 * @param {string} socketId - Socket ID
 */
export function cleanupRateLimitData(socketId) {
  for (const bucketMap of Object.values(rateLimitBuckets)) {
    for (const key of bucketMap.keys()) {
      if (key.startsWith(socketId)) {
        bucketMap.delete(key);
      }
    }
  }
}

// ============================================================
// 4. 增强的设备指纹
// ============================================================

/**
 * 生成增强的设备指纹（包含更多特征）
 * @param {Object} handshake - Socket handshake 对象
 * @param {Object} additionalData - 额外的设备数据（来自客户端）
 * @returns {string} 设备指纹
 */
export function generateEnhancedDeviceFingerprint(handshake, additionalData = {}) {
  const components = [
    handshake.headers['user-agent'] || '',
    handshake.headers['accept-language'] || '',
    handshake.address || '',
    handshake.headers['accept-encoding'] || '',
    handshake.headers['sec-ch-ua'] || '',
    handshake.headers['sec-ch-ua-platform'] || '',
    
    // 客户端提供的额外指纹
    additionalData.canvasFingerprint || '',
    additionalData.webglFingerprint || '',
    additionalData.audioFingerprint || '',
    additionalData.screenResolution || '',
    additionalData.timezone || '',
    additionalData.language || ''
  ];
  
  const fingerprintString = components.join('|');
  return crypto
    .createHash('sha256')
    .update(fingerprintString)
    .digest('hex');
}

/**
 * 验证设备一致性
 * @param {string} storedFingerprint - 存储的指纹
 * @param {Object} currentHandshake - 当前 handshake
 * @param {Object} additionalData - 额外数据
 * @returns {Object} { match: boolean, confidence: number }
 */
export function verifyDeviceFingerprint(storedFingerprint, currentHandshake, additionalData = {}) {
  const currentFingerprint = generateEnhancedDeviceFingerprint(currentHandshake, additionalData);
  
  // 完全匹配
  if (storedFingerprint === currentFingerprint) {
    return { match: true, confidence: 1.0 };
  }
  
  // 部分匹配检查（基于 IP 和 User-Agent）
  const storedParts = storedFingerprint.substring(0, 16);
  const currentParts = currentFingerprint.substring(0, 16);
  
  if (storedParts === currentParts) {
    return { match: false, confidence: 0.5 }; // 部分相似，可能是设备更新
  }
  
  return { match: false, confidence: 0.0 };
}

// ============================================================
// 5. 安全日志与监控
// ============================================================

/**
 * 安全事件类型
 */
export const SecurityEventType = {
  AUTH_FAILURE: 'AUTH_FAILURE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_INPUT: 'INVALID_INPUT',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  DEVICE_FINGERPRINT_MISMATCH: 'DEVICE_FINGERPRINT_MISMATCH',
  SESSION_HIJACK_ATTEMPT: 'SESSION_HIJACK_ATTEMPT',
  BRUTE_FORCE_DETECTED: 'BRUTE_FORCE_DETECTED'
};

/**
 * 记录安全事件
 * @param {string} eventType - 事件类型
 * @param {Object} details - 事件详情
 * @param {Object} logger - 日志对象
 */
export function logSecurityEvent(eventType, details, logger = console) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    eventType,
    severity: getSeverity(eventType),
    details: {
      ...details,
      // 脱敏处理
      userId: details.userId ? maskUserId(details.userId) : undefined,
      ipAddress: details.ipAddress ? maskIpAddress(details.ipAddress) : undefined
    }
  };
  
  // 根据严重程度选择日志级别
  const logMethod = logEntry.severity >= 3 ? 'error' : 'warn';
  logger[logMethod]('[SECURITY]', JSON.stringify(logEntry));
  
  // 高严重程度事件需要立即告警
  if (logEntry.severity >= 4) {
    sendSecurityAlert(logEntry);
  }
}

/**
 * 获取事件严重程度
 */
function getSeverity(eventType) {
  const severityMap = {
    [SecurityEventType.AUTH_FAILURE]: 2,
    [SecurityEventType.RATE_LIMIT_EXCEEDED]: 2,
    [SecurityEventType.INVALID_INPUT]: 2,
    [SecurityEventType.SUSPICIOUS_ACTIVITY]: 3,
    [SecurityEventType.TOKEN_REVOKED]: 2,
    [SecurityEventType.DEVICE_FINGERPRINT_MISMATCH]: 3,
    [SecurityEventType.SESSION_HIJACK_ATTEMPT]: 4,
    [SecurityEventType.BRUTE_FORCE_DETECTED]: 4
  };
  
  return severityMap[eventType] || 1;
}

/**
 * 脱敏用户 ID
 */
function maskUserId(userId) {
  if (typeof userId === 'string' && userId.length > 4) {
    return userId.substring(0, 2) + '***' + userId.substring(userId.length - 2);
  }
  return userId;
}

/**
 * 脱敏 IP 地址
 */
function maskIpAddress(ip) {
  if (typeof ip === 'string') {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
  }
  return ip;
}

/**
 * 发送安全告警
 */
function sendSecurityAlert(logEntry) {
  // 实现告警逻辑（邮件、短信、Slack 等）
  console.error('🚨 安全告警:', JSON.stringify(logEntry));
  // TODO: 集成实际的告警系统
}

// ============================================================
// 6. 登录尝试限制（防暴力破解）
// ============================================================

const loginAttempts = new Map();

/**
 * 记录登录尝试
 * @param {string} identifier - 标识符（用户名/IP）
 * @returns {boolean} 是否允许尝试
 */
export function recordLoginAttempt(identifier) {
  const now = Date.now();
  let attempts = loginAttempts.get(identifier);
  
  if (!attempts) {
    attempts = { count: 0, firstAttempt: now, lockUntil: 0 };
    loginAttempts.set(identifier, attempts);
  }
  
  // 检查是否被锁定
  if (attempts.lockUntil > now) {
    const remainingTime = Math.ceil((attempts.lockUntil - now) / 1000);
    return {
      allowed: false,
      reason: 'ACCOUNT_LOCKED',
      retryAfter: remainingTime
    };
  }
  
  // 重置过期记录
  if (now - attempts.firstAttempt > SECURITY_CONFIG.LOGIN_LOCKOUT_TIME) {
    attempts.count = 0;
    attempts.firstAttempt = now;
  }
  
  attempts.count++;
  
  // 检查是否超过限制
  if (attempts.count > SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
    attempts.lockUntil = now + SECURITY_CONFIG.LOGIN_LOCKOUT_TIME;
    return {
      allowed: false,
      reason: 'TOO_MANY_ATTEMPTS',
      retryAfter: SECURITY_CONFIG.LOGIN_LOCKOUT_TIME / 1000
    };
  }
  
  return { allowed: true };
}

/**
 * 登录成功后清除尝试记录
 * @param {string} identifier - 标识符
 */
export function clearLoginAttempts(identifier) {
  loginAttempts.delete(identifier);
}

// ============================================================
// 使用示例
// ============================================================

/**
 * Socket.IO 认证中间件示例
 */
export function createSecureAuthMiddleware(redisClient) {
  return async (socket, next) => {
    const token = socket.handshake.auth.token;
    const deviceFingerprint = socket.handshake.headers['x-device-fingerprint'];
    
    if (!token) {
      socket.user = null;
      return next();
    }
    
    // 验证 token（带黑名单检查）
    const decoded = await verifyTokenWithBlacklist(token, redisClient);
    
    if (!decoded) {
      logSecurityEvent(
        SecurityEventType.AUTH_FAILURE,
        {
          reason: 'INVALID_OR_REVOKED_TOKEN',
          ipAddress: socket.handshake.address
        },
        console
      );
      socket.user = null;
      return next();
    }
    
    // 验证设备指纹（可选）
    if (decoded.deviceFingerprint && deviceFingerprint) {
      const deviceMatch = verifyDeviceFingerprint(
        decoded.deviceFingerprint,
        socket.handshake,
        { /* 客户端提供的额外指纹数据 */ }
      );
      
      if (deviceMatch.confidence < 0.5) {
        logSecurityEvent(
          SecurityEventType.DEVICE_FINGERPRINT_MISMATCH,
          {
            userId: decoded.uid,
            confidence: deviceMatch.confidence,
            ipAddress: socket.handshake.address
          },
          console
        );
        // 可以选择拒绝或标记为可疑
      }
    }
    
    socket.user = {
      id: decoded.uid,
      name: decoded.name
    };
    
    next();
  };
}

/**
 * Socket.IO 速率限制中间件示例
 */
export function createRateLimitMiddleware() {
  return (socket, next) => {
    socket.use((packet, next) => {
      const eventName = packet[0];
      const result = checkMultiDimensionalRateLimit(socket, eventName);
      
      if (!result.allowed) {
        logSecurityEvent(
          SecurityEventType.RATE_LIMIT_EXCEEDED,
          {
            eventName,
            socketId: socket.id,
            userId: socket.user?.uid,
            retryAfterMs: result.retryAfterMs
          },
          console
        );
        
        socket.emit('error', {
          message: '操作过于频繁，请稍后再试',
          code: 'RATE_LIMITED',
          retryAfterMs: result.retryAfterMs
        });
        
        return next(new Error('RATE_LIMITED'));
      }
      
      next();
    });
    next();
  };
}
