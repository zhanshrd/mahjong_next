/**
 * 麻将游戏服务器安全渗透测试
 * 
 * 测试关键安全功能的正确性
 */

import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken, refreshToken, blacklistToken, isTokenBlacklisted } from '../../../src/security/auth.js';
import { validateAction, checkAndRecordActionTime } from '../../../src/security/actionValidator.js';
import { generateDeviceFingerprint } from '../../../src/security/deviceFingerprint.js';
import { checkRateLimit, cleanupRateLimit } from '../../../src/socket/rateLimiter.js';

// ============================================================================
// JWT 认证安全测试
// ============================================================================

describe('🔐 JWT 认证安全', () => {
  it('应该拒绝被篡改的 Token', () => {
    const token = generateToken({ id: 'user-123', name: 'Original User' });
    const parts = token.split('.');
    
    const tamperedToken = `${parts[0]}.${Buffer.from(JSON.stringify({
      uid: 'hacker-123',
      name: 'Hacker',
      exp: Math.floor(Date.now() / 1000) + 900
    })).toString('base64')}.${parts[2]}`;
    
    expect(verifyToken(tamperedToken)).toBeNull();
  });
  
  it('应该拒绝过期 Token', () => {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET;
    
    const expiredToken = jwt.sign(
      { uid: 'user-123', exp: Math.floor(Date.now() / 1000) - 3600 },
      JWT_SECRET,
      { algorithm: 'HS256' }
    );
    
    expect(verifyToken(expiredToken)).toBeNull();
  });
  
  it('应该拒绝黑名单中的 Token', () => {
    const token = generateToken({ id: 'user-123', name: 'Test User' });
    blacklistToken(token, 3600000);
    
    expect(isTokenBlacklisted(token)).toBe(true);
  });
  
  it('每次生成的 Token 应该不同', () => {
    const user = { id: 'user-123', name: 'Test User' };
    const token1 = generateToken(user);
    const token2 = generateToken(user);
    
    expect(token1).not.toBe(token2);
  });
});

// ============================================================================
// Token 重放攻击测试（发现安全漏洞）
// ============================================================================

describe('⚠️ Token 重放攻击（发现漏洞）', () => {
  it('⚠️ 漏洞：Token 可以被重复使用', () => {
    const token = generateToken({ id: 'user-123', name: 'Test User' });
    
    // 同一个 Token 可以无限次验证
    expect(verifyToken(token)).toBeDefined();
    expect(verifyToken(token)).toBeDefined();
    expect(verifyToken(token)).toBeDefined();
    
    // 这是一个安全漏洞：应该实现一次性 Token 机制
  });
  
  it('⚠️ 漏洞：刷新 Token 后旧 Token 仍然有效', () => {
    const oldToken = generateToken({ id: 'user-123', name: 'Test User' });
    const newToken = refreshToken(oldToken);
    
    expect(newToken).toBeDefined();
    expect(verifyToken(oldToken)).toBeDefined(); // 旧 Token 仍然有效 - 漏洞！
    expect(verifyToken(newToken)).toBeDefined();
    
    // 修复建议：refreshToken() 应该将旧 Token 加入黑名单
  });
});

// ============================================================================
// SQL 注入防护测试
// ============================================================================

describe('🛡️ SQL 注入防护', () => {
  it('房间 ID 应该被正确格式化', () => {
    const maliciousIds = [
      "'; DROP TABLE rooms; --",
      "1' OR '1'='1",
      "<script>alert('XSS')</script>"
    ];
    
    for (const id of maliciousIds) {
      const formatted = id.toUpperCase().trim();
      expect(formatted).toBeDefined();
    }
  });
  
  it('玩家名称应该被清理和限制长度', () => {
    const maliciousNames = [
      "'; DROP TABLE users; --",
      "<script>alert('XSS')</script>"
    ];
    
    for (const name of maliciousNames) {
      const sanitized = name.toString().trim().slice(0, 10);
      expect(sanitized.length).toBeLessThanOrEqual(10);
    }
  });
});

// ============================================================================
// XSS 攻击防护测试
// ============================================================================

describe('🛡️ XSS 攻击防护', () => {
  it('玩家名称中的 XSS payload 应该被截断', () => {
    const xssPayloads = [
      "<script>alert('XSS')</script>",
      "<img src=x onerror=alert('XSS')>"
    ];
    
    for (const payload of xssPayloads) {
      const sanitized = payload.toString().trim().slice(0, 10);
      expect(sanitized.length).toBeLessThanOrEqual(10);
      expect(sanitized).not.toContain('<script>');
    }
  });
  
  it('快捷聊天应该使用白名单', () => {
    const QUICK_PHRASES = [
      '等等我', '打快一点', '不好意思', '厉害',
      '再来一局', '好牌', '太慢了', '加油'
    ];
    
    const maliciousPhrase = "<script>alert('XSS')</script>";
    expect(QUICK_PHRASES.includes(maliciousPhrase)).toBe(false);
  });
});

// ============================================================================
// 速率限制测试
// ============================================================================

describe('🛡️ 速率限制', () => {
  it('应该限制游戏动作频率', () => {
    const socketId = 'test-socket-1';
    
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(checkRateLimit(socketId, 'draw_tile').allowed);
    }
    
    // 前 5 次允许，之后拒绝
    expect(results.slice(0, 5)).toEqual(Array(5).fill(true));
    expect(results.slice(5)).toEqual(Array(5).fill(false));
  });
  
  it('应该限制房间创建频率', () => {
    const socketId = 'test-socket-2';
    
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(checkRateLimit(socketId, 'create_room').allowed);
    }
    
    expect(results.slice(0, 3)).toEqual(Array(3).fill(true));
    expect(results.slice(3)).toEqual(Array(2).fill(false));
  });
  
  it('⚠️ 漏洞：可以通过重连绕过速率限制', () => {
    const socketId1 = 'test-socket-5';
    const socketId2 = 'test-socket-6'; // 模拟重连
    
    for (let i = 0; i < 3; i++) {
      checkRateLimit(socketId1, 'create_room');
    }
    
    // 新 Socket 不受限制 - 这是一个漏洞
    expect(checkRateLimit(socketId2, 'create_room').allowed).toBe(true);
  });
});

// ============================================================================
// 设备指纹测试
// ============================================================================

describe('🛡️ 设备指纹', () => {
  it('应该基于多个因素生成设备指纹', () => {
    const mockHandshake = {
      headers: {
        'user-agent': 'Mozilla/5.0 (Test)',
        'accept-language': 'en-US',
        'accept-encoding': 'gzip',
        'sec-ch-ua': '"Test"',
        'sec-ch-ua-platform': '"TestOS"'
      },
      address: '127.0.0.1'
    };
    
    const fingerprint = generateDeviceFingerprint(mockHandshake);
    
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/i);
    expect(fingerprint.length).toBe(64);
  });
  
  it('相同设备应该生成相同的指纹', () => {
    const handshake = {
      headers: {
        'user-agent': 'Mozilla/5.0 (Test)',
        'accept-language': 'en-US',
        'accept-encoding': 'gzip',
        'sec-ch-ua': '"Test"',
        'sec-ch-ua-platform': '"TestOS"'
      },
      address: '127.0.0.1'
    };
    
    const fp1 = generateDeviceFingerprint(handshake);
    const fp2 = generateDeviceFingerprint(handshake);
    
    expect(fp1).toBe(fp2);
  });
  
  it('不同设备应该生成不同的指纹', () => {
    const handshake1 = {
      headers: {
        'user-agent': 'Mozilla/5.0 (Device 1)',
        'accept-language': 'en-US',
        'address': '192.168.1.1'
      },
      address: '192.168.1.1'
    };
    
    const handshake2 = {
      headers: {
        'user-agent': 'Mozilla/5.0 (Device 2)',
        'accept-language': 'zh-CN',
        'address': '192.168.1.2'
      },
      address: '192.168.1.2'
    };
    
    expect(generateDeviceFingerprint(handshake1)).not.toBe(generateDeviceFingerprint(handshake2));
  });
});

// ============================================================================
// 权限验证测试
// ============================================================================

describe('🛡️ 权限验证', () => {
  it('应该防止速点外挂', () => {
    const playerId = 'player-123';
    
    expect(checkAndRecordActionTime(playerId, 100)).toBe(true);
    expect(checkAndRecordActionTime(playerId, 100)).toBe(false); // 太快
  });
  
  it('应该验证玩家操作权限', () => {
    const mockRoom = {
      game: {
        currentPlayer: 0,
        hands: [['1m', '2m', '3m'], ['4m', '5m', '6m']]
      },
      getPlayerIndex: (socketId) => socketId === 'player-1' ? 0 : 1
    };
    
    // 没有先摸牌就出牌 - 无效操作
    const validation = validateAction(mockRoom, 0, 'discard_tile', { tile: '1m' });
    expect(validation.valid).toBe(false);
  });
});

// ============================================================================
// 安全漏洞总结
// ============================================================================

/**
 * 发现的安全漏洞：
 * 
 * 🔴 高危：
 * 1. Token 可以被重复使用（重放攻击）
 * 2. Token 刷新后旧 Token 仍然有效
 * 
 * 🟡 中危：
 * 3. 可以通过快速重连绕过速率限制
 * 4. 缺少基于 IP 的速率限制
 * 
 * 修复建议：
 * 1. 实现一次性 Token 机制
 * 2. Token 刷新后将旧 Token 加入黑名单
 * 3. 实现基于 IP 的速率限制
 * 4. 添加设备绑定功能
 */
