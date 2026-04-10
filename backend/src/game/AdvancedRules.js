/**
 * Advanced Mahjong Rules: Flower, Wild Card (Laizi), Bird (Zhania)
 * 
 * 花牌：春夏秋冬梅兰竹菊（8 张）
 * - 摸到后自动明置并从牌墙末尾补牌
 * - 胡牌后每张花牌计 1 番
 * 
 * 赖子：万能牌
 * - 翻一张牌，+1 为赖子（如翻五万，六万为赖子）
 * - 可替代任意牌（软胡×1）
 * - 本身成胡（硬胡×2）
 * - 可单独成杠（×2）
 * 
 * 扎鸟：胡牌后抓鸟
 * - 胡牌后从牌墙摸 1-4 张牌作为鸟
 * - 按牌面数字逆时针确定位置
 * - 中鸟者支付双倍分数
 */

import { isFlowerTile, FLOWER_OWNER } from './TileSet.js';

/**
 * Check if a tile is a wild card (laizi)
 */
export function isWildCard(tile, wildCard) {
  if (!wildCard) return false;
  return tile === wildCard;
}

/**
 * Calculate flower fan (1 fan per flower tile)
 */
export function calculateFlowerFan(flowerMelds, winnerIndex) {
  let totalFan = 0;
  const flowerCount = flowerMelds[winnerIndex]?.length || 0;
  
  if (flowerCount > 0) {
    totalFan += flowerCount; // 1 fan per flower
  }
  
  return {
    fan: totalFan,
    flowerCount,
    patterns: flowerCount > 0 ? [{ name: '花牌', fan: flowerCount }] : []
  };
}

/**
 * Check if hand contains wild card and calculate hard/soft win
 * 
 * Hard win (硬胡): Hand can win without using wild as universal tile
 * Soft win (软胡): Need wild as universal tile to win
 */
export function checkWildWin(hand, wildCard) {
  if (!wildCard) return { hasWild: false, isHardWin: false };
  
  const hasWild = hand.some(tile => tile === wildCard);
  
  // If no wild in hand, it's automatically hard win
  if (!hasWild) {
    return { hasWild: false, isHardWin: true };
  }
  
  // If has wild, check if hand can still win without using wild as universal
  // For simplicity: if the wild tile itself forms a set (pong/kong) or pair, it's hard win
  // Otherwise it's soft win (using wild as substitute)
  const wildCount = hand.filter(tile => tile === wildCard).length;
  
  // If wild forms a complete set (3 or 4 cards), it's hard win
  if (wildCount >= 3) {
    return { hasWild: true, isHardWin: true };
  }
  
  // If wild forms a pair (2 cards), check if rest of hand wins
  if (wildCount === 2) {
    // Consider the wild pair as a valid pair
    return { hasWild: true, isHardWin: true };
  }
  
  // Single wild: it's being used as universal, so soft win
  return { hasWild: true, isHardWin: false };
}

/**
 * Draw bird tiles after win
 * @param {number} birdCount - Number of birds to draw (1-4 based on win type)
 * @returns {string[]} - Array of bird tiles
 */
export function drawBirdTiles(tileSet, birdCount = 1) {
  const birds = [];
  for (let i = 0; i < birdCount; i++) {
    const bird = tileSet.drawBird();
    if (bird) {
      birds.push(bird);
    }
  }
  return birds;
}

/**
 * Calculate bird hit positions
 * 
 * Bird calculation method:
 * - Start from dealer (庄家) as position 1
 * - Count counter-clockwise by tile value
 * - 1 = dealer, 2 = next player, 3 = opposite, 4 = previous player
 * 
 * For number tiles (万条筒): use the number
 * For wind tiles: E=1, S=2, W=3, N=4
 * For dragon tiles: C=1, F=2, W=3
 */
export function calculateBirdHits(birdTiles, dealerIndex, winnerIndex, isSelfDraw) {
  const hits = [];
  
  for (const bird of birdTiles) {
    const position = getBirdPosition(bird, dealerIndex);
    const isHit = position === winnerIndex;
    
    hits.push({
      bird,
      position,
      isHit,
      playerName: `Player${position}`
    });
  }
  
  return hits;
}

/**
 * Get player position from bird tile
 */
function getBirdPosition(bird, dealerIndex) {
  const prefix = bird[0];
  const value = bird.slice(1);
  
  let offset;
  
  if (prefix === 'W' || prefix === 'T' || prefix === 'D') {
    // Number tiles: use the number (1-9)
    // Map to position: (num - 1) % 4
    const num = parseInt(value, 10);
    offset = (num - 1) % 4;
  } else if (prefix === 'F') {
    // Wind tiles: E=1, S=2, W=3, N=4
    const windMap = { 'E': 0, 'S': 1, 'W': 2, 'N': 3 };
    offset = windMap[value] || 0;
  } else if (prefix === 'J') {
    // Dragon tiles: C=1, F=2, W=3
    const dragonMap = { 'C': 0, 'F': 1, 'W': 2 };
    offset = dragonMap[value] || 0;
  } else {
    // Flower or unknown: default to 0
    offset = 0;
  }
  
  // Calculate actual player index (counter-clockwise from dealer)
  return (dealerIndex + offset) % 4;
}

/**
 * Calculate bird multiplier
 * 
 * Rules:
 * - Self-draw: if bird hits winner, all losers pay 2x
 * - Ron (点炮): if bird hits winner or shooter, shooter pays 2x
 */
export function calculateBirdMultiplier(hits, winnerIndex, isSelfDraw, shooterIndex = null) {
  let multiplier = 1;
  const hitWinner = hits.some(h => h.isHit && h.position === winnerIndex);
  const hitShooter = shooterIndex !== null && hits.some(h => h.isHit && h.position === shooterIndex);
  
  if (isSelfDraw) {
    // Self-draw: if any bird hits winner, all losers pay 2x
    if (hitWinner) {
      multiplier = 2;
    }
  } else {
    // Ron: if bird hits winner or shooter, shooter pays 2x
    if (hitWinner || hitShooter) {
      multiplier = 2;
    }
  }
  
  return {
    multiplier,
    hits,
    totalBirds: hits.length,
    hitCount: hits.filter(h => h.isHit).length
  };
}

/**
 * Get bird count based on win type
 * 
 * Rules:
 * - Standard win: 1 bird
 * - Self-draw: 2 birds
 * - Big win (清一色、碰碰胡等): 4 birds
 */
export function getBirdCount(fanResult, isSelfDraw) {
  if (!fanResult || fanResult.fan === 0) return 0;
  
  // Big win patterns (fan >= 6)
  if (fanResult.fan >= 6) {
    return 4;
  }
  
  // Self-draw
  if (isSelfDraw) {
    return 2;
  }
  
  // Standard
  return 1;
}
