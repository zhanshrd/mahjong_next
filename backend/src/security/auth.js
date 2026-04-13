/**
 * JWT 认证模块
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// JWT_SECRET 必须从环境变量加载，不允许默认值
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('警告：JWT_SECRET 未设置，将使用临时密钥（重启后 Token 将失效）');
  // 使用 crypto 生成临时密钥（仅开发环境）
  if (process.env.NODE_ENV !== 'production') {
    JWT_SECRET = crypto.randomBytes(64).toString('hex');
  }
}

const JWT_EXPIRES_IN = '15m'; // Token 有效期 15 分钟（生产环境推荐）

/**
 * 生成 JWT Token
 * @param {Object} user - 用户信息
 * @returns {string} JWT Token
 */
export function generateToken(user) {
  const payload = {
    uid: user.id,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + 900, // 15 分钟
    iat: Math.floor(Date.now() / 1000),
    jti: require('crypto').randomBytes(16).toString('hex') // 唯一 Token ID，用于黑名单
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256' // 生产环境建议升级到 RS256
  });
}

/**
 * 验证 JWT Token
 * @param {string} token - JWT Token
 * @returns {Object|null} 解码后的 payload，验证失败返回 null
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * 刷新 Token
 * @param {string} token - 旧 Token
 * @returns {string|null} 新 Token，刷新失败返回 null
 */
export function refreshToken(token) {
  const decoded = verifyToken(token);
  if (!decoded) return null;
  
  // 将旧 Token 加入黑名单（防止旧 Token 继续使用）
  const ttl = (decoded.exp * 1000) - Date.now(); // 剩余有效期
  if (ttl > 0) {
    blacklistToken(token, ttl);
  }
  
  // 生成新 Token
  return generateToken({
    id: decoded.uid,
    name: decoded.name
  });
}

/**
 * Token 黑名单（生产环境应使用 Redis）
 */
const tokenBlacklist = new Map();
const MAX_BLACKLIST_SIZE = 10000; // 黑名单最大容量

/**
 * 将 Token 加入黑名单
 * @param {string} token - JWT Token
 * @param {number} ttl - 剩余有效期（毫秒）
 */
export function blacklistToken(token, ttl) {
  const expiry = Date.now() + ttl;
  tokenBlacklist.set(token, expiry);
  
  // 防止黑名单无限增长：超过阈值时清理过期记录
  if (tokenBlacklist.size > MAX_BLACKLIST_SIZE) {
    cleanupBlacklist();
  }
}

/**
 * 清理黑名单中的过期记录
 */
export function cleanupBlacklist() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [token, expiry] of tokenBlacklist.entries()) {
    if (now > expiry) {
      tokenBlacklist.delete(token);
      cleanedCount++;
    }
  }
  
  // 如果清理后仍然超过限制，删除最旧的一半记录
  if (tokenBlacklist.size > MAX_BLACKLIST_SIZE) {
    const entries = Array.from(tokenBlacklist.entries());
    const halfSize = Math.ceil(entries.length / 2);
    
    for (let i = 0; i < halfSize; i++) {
      tokenBlacklist.delete(entries[i][0]);
    }
  }
  
  return cleanedCount;
}

/**
 * 检查 Token 是否在黑名单中
 * @param {string} token - JWT Token
 * @returns {boolean} 是否在黑名单中
 */
export function isTokenBlacklisted(token) {
  const expiry = tokenBlacklist.get(token);
  if (!expiry) return false;
  
  // 如果已过期，删除并返回 false
  if (Date.now() > expiry) {
    tokenBlacklist.delete(token);
    return false;
  }
  
  return true;
}

/**
 * Socket.IO 认证中间件
 */
export function authMiddleware(socket, next) {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    // 允许无 token 连接（用于游客模式）
    // 但会限制功能
    socket.user = null;
    return next();
  }
  
  // 检查黑名单
  if (isTokenBlacklisted(token)) {
    socket.user = null;
    return next(new Error('Token has been revoked'));
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = {
      id: decoded.uid,
      name: decoded.name
    };
    next();
  } catch (err) {
    socket.user = null;
    // Token 无效，拒绝连接
    return next(new Error('Invalid token'));
  }
}

/**
 * 检查用户是否已认证
 * @param {Object} socket - Socket 对象
 * @returns {boolean} 是否已认证
 */
export function isAuthenticated(socket) {
  return socket.user !== null;
}

/**
 * 要求认证的中间件
 * @param {Function} handler - Socket 事件处理函数
 * @returns {Function} 包装后的处理函数
 */
export function requireAuth(handler) {
  return function (socket, ...args) {
    if (!isAuthenticated(socket)) {
      socket.emit('error', {
        message: '请先登录',
        code: 'AUTH_REQUIRED'
      });
      return;
    }
    return handler(socket, ...args);
  };
}
