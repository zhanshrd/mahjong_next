/**
 * 服务器权威验证模块
 * 验证客户端操作的合法性
 */

/**
 * 验证玩家操作
 * @param {Object} room - 房间对象
 * @param {number} playerIndex - 玩家索引
 * @param {string} action - 操作类型
 * @param {Object} data - 操作数据
 * @returns {Object} { valid: boolean, reason?: string }
 */
export function validateAction(room, playerIndex, action, data) {
  if (!room || !room.game) {
    return { valid: false, reason: 'GAME_NOT_FOUND' };
  }
  
  const game = room.game;
  
  // 1. 游戏状态验证
  if (game.finished) {
    return { valid: false, reason: 'GAME_ALREADY_FINISHED' };
  }
  
  if (room.state !== 'playing') {
    return { valid: false, reason: 'GAME_NOT_STARTED' };
  }
  
  // 2. 玩家身份验证
  if (playerIndex < 0 || playerIndex >= room.players.length) {
    return { valid: false, reason: 'INVALID_PLAYER' };
  }
  
  // 3. 回合验证
  if (action !== 'pass_claim' && action !== 'declare_claim') {
    if (game.currentPlayer !== playerIndex) {
      return { valid: false, reason: 'NOT_YOUR_TURN' };
    }
  }
  
  // 4. 操作类型验证
  switch (action) {
    case 'draw_tile':
      return validateDrawTile(game, playerIndex);
    
    case 'discard_tile':
      return validateDiscardTile(game, playerIndex, data);
    
    case 'declare_claim':
      return validateClaim(game, playerIndex, data);
    
    case 'self_kong':
      return validateSelfKong(game, playerIndex, data);
    
    case 'pass_claim':
      return validatePassClaim(game, playerIndex);
    
    default:
      return { valid: false, reason: 'UNKNOWN_ACTION' };
  }
}

/**
 * 验证摸牌操作
 */
function validateDrawTile(game, playerIndex) {
  // 必须是当前玩家的回合
  if (game.currentPlayer !== playerIndex) {
    return { valid: false, reason: 'NOT_YOUR_TURN' };
  }
  
  // 不能重复摸牌
  if (game.hasDrawn[playerIndex]) {
    return { valid: false, reason: 'ALREADY_DREW' };
  }
  
  // 牌堆必须有牌
  if (game.tileSet.remaining <= 0) {
    return { valid: false, reason: 'NO_TILES_LEFT' };
  }
  
  return { valid: true };
}

/**
 * 验证出牌操作
 */
function validateDiscardTile(game, playerIndex, data) {
  // 必须已经摸牌
  if (!game.hasDrawn[playerIndex]) {
    return { valid: false, reason: 'MUST_DRAW_FIRST' };
  }
  
  // 验证数据存在
  if (!data) {
    return { valid: false, reason: 'MISSING_DATA' };
  }
  
  // 验证牌是否在手牌中
  const tile = data.tile;
  if (!tile) {
    return { valid: false, reason: 'MISSING_TILE' };
  }
  
  // 检查玩家是否有这张牌
  const playerHand = game.hands[playerIndex];
  if (!playerHand || !playerHand.includes(tile)) {
    return { valid: false, reason: 'TILE_NOT_IN_HAND' };
  }
  
  return { valid: true };
}

/**
 * 验证声明操作
 */
function validateClaim(game, playerIndex, data) {
  const claimType = data?.claimType;
  
  if (!claimType) {
    return { valid: false, reason: 'MISSING_CLAIM_TYPE' };
  }
  
  // 验证声明类型
  if (!['pong', 'chow', 'kong', 'win'].includes(claimType)) {
    return { valid: false, reason: 'INVALID_CLAIM_TYPE' };
  }
  
  // 必须有声明窗口
  if (!game.claimWindow || game.claimWindow.resolved) {
    return { valid: false, reason: 'NO_CLAIM_WINDOW' };
  }
  
  // 玩家必须是声明者之一
  if (!game.claimWindow.requiredResponders.has(playerIndex)) {
    return { valid: false, reason: 'NOT_ALLOWED_TO_CLAIM' };
  }
  
  // 吃牌验证
  if (claimType === 'chow') {
    const chowOptions = data?.chowOptions;
    if (!chowOptions || !Array.isArray(chowOptions) || chowOptions.length === 0) {
      return { valid: false, reason: 'MISSING_CHOW_OPTIONS' };
    }
  }
  
  return { valid: true };
}

/**
 * 验证暗杠操作
 */
function validateSelfKong(game, playerIndex, data) {
  // 必须是当前玩家的回合
  if (game.currentPlayer !== playerIndex) {
    return { valid: false, reason: 'NOT_YOUR_TURN' };
  }
  
  // 必须已经摸牌
  if (!game.hasDrawn[playerIndex]) {
    return { valid: false, reason: 'MUST_DRAW_FIRST' };
  }
  
  // 验证牌
  const tile = data?.tile;
  if (!tile) {
    return { valid: false, reason: 'MISSING_TILE' };
  }
  
  return { valid: true };
}

/**
 * 验证过声明操作
 */
function validatePassClaim(game, playerIndex) {
  // 必须有声明窗口
  if (!game.claimWindow || game.claimWindow.resolved) {
    return { valid: false, reason: 'NO_CLAIM_WINDOW' };
  }
  
  // 玩家必须是声明者之一
  if (!game.claimWindow.requiredResponders.has(playerIndex)) {
    return { valid: false, reason: 'NOT_ALLOWED_TO_PASS' };
  }
  
  return { valid: true };
}

/**
 * 操作时间验证（防速点外挂）
 * @param {number} lastActionTime - 上次操作时间
 * @param {number} minInterval - 最小间隔（毫秒）
 * @returns {boolean} 是否合法
 */
export function validateActionTiming(lastActionTime, minInterval = 100) {
  const now = Date.now();
  return now - lastActionTime >= minInterval;
}

/**
 * 记录玩家操作时间
 * 使用 LRU 缓存防止内存泄漏
 */
const playerActionTimes = new Map();
const MAX_ACTION_TIMES_SIZE = 1000; // 最大记录数量

/**
 * 检查并记录操作时间
 * @param {string} playerId - 玩家 ID
 * @param {number} minInterval - 最小间隔
 * @returns {boolean} 是否合法
 */
export function checkAndRecordActionTime(playerId, minInterval = 100) {
  const now = Date.now();
  const lastTime = playerActionTimes.get(playerId);
  
  if (lastTime && now - lastTime < minInterval) {
    return false;
  }
  
  // 防止 Map 无限增长：超过阈值时清理最旧的 50%
  if (playerActionTimes.size >= MAX_ACTION_TIMES_SIZE) {
    const entries = Array.from(playerActionTimes.entries());
    const halfSize = Math.ceil(entries.length / 2);
    
    // 删除最旧的 50%
    for (let i = 0; i < halfSize; i++) {
      playerActionTimes.delete(entries[i][0]);
    }
  }
  
  playerActionTimes.set(playerId, now);
  return true;
}

/**
 * 清理玩家操作时间记录
 */
export function cleanupActionTimes() {
  playerActionTimes.clear();
}

/**
 * 清理过期操作记录（超过 5 分钟）
 */
export function cleanupExpiredActionTimes(expiryTime = 5 * 60 * 1000) {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [playerId, timestamp] of playerActionTimes.entries()) {
    if (now - timestamp > expiryTime) {
      playerActionTimes.delete(playerId);
      cleanedCount++;
    }
  }
  
  return cleanedCount;
}
