import { WinChecker } from './WinChecker.js';
import { calculateFlowerFan, checkWildWin } from './AdvancedRules.js';

// Simplified national mahjong scoring
// Returns { fan: number, patterns: [{name, fan}], flowerFan?: number, wildMultiplier?: number }

export function calculateFan(hand, melds, winTile, isSelfDraw, flowerMelds = null, wildCard = null) {
  const patterns = [];
  let totalFan = 0;

  const checker = new WinChecker();
  const counts = checker._countTiles(hand);
  const allTiles = [...hand];
  const isSevenPairs = checker.checkSevenPairs(hand);

  // --- Flower tiles ---
  if (flowerMelds && flowerMelds.length > 0) {
    const flowerResult = calculateFlowerFan([flowerMelds], 0);
    if (flowerResult.fan > 0) {
      totalFan += flowerResult.fan;
      patterns.push({ name: '花牌', fan: flowerResult.fan });
    }
  }

  // --- Wild card (laizi) - hard/soft win ---
  let wildMultiplier = 1;
  if (wildCard) {
    const wildResult = checkWildWin(hand, wildCard);
    if (wildResult.hasWild) {
      if (wildResult.isHardWin) {
        patterns.push({ name: '硬胡', fan: 2 });
        totalFan += 2;
        wildMultiplier = 2;
      } else {
        patterns.push({ name: '软胡', fan: 1 });
        totalFan += 1;
        wildMultiplier = 1;
      }
    }
  }

  // --- 8 fan patterns ---

  // 清一色 (full flush - one suit, no honors)
  if (_isFullFlush(hand, melds)) {
    patterns.push({ name: '清一色', fan: 8 });
    totalFan += 8;
  }

  // 字一色 (all honors)
  if (_isAllHonors(hand, melds)) {
    patterns.push({ name: '字一色', fan: 8 });
    totalFan += 8;
  }

  // 大三元 (big three dragons - pongs of all 3 dragon types)
  if (_isBigThreeDragons(hand, melds)) {
    patterns.push({ name: '大三元', fan: 8 });
    totalFan += 8;
  }

  // 十三幺 (thirteen orphans)
  if (_isThirteenOrphans(hand)) {
    patterns.push({ name: '十三幺', fan: 8 });
    totalFan += 8;
  }

  // --- 6 fan patterns ---

  // 碰碰胡 (all pungs - 4 sets of triplets + 1 pair)
  if (!isSevenPairs && _isAllPungs(hand, melds)) {
    patterns.push({ name: '碰碰胡', fan: 6 });
    totalFan += 6;
  }

  // 混一色 (mixed flush - one suit + honors)
  if (!_isFullFlush(hand, melds) && _isMixedFlush(hand, melds)) {
    patterns.push({ name: '混一色', fan: 6 });
    totalFan += 6;
  }

  // --- 4 fan patterns ---

  // 七对 (seven pairs)
  if (isSevenPairs) {
    patterns.push({ name: '七对子', fan: 4 });
    totalFan += 4;
  }

  // --- 2 fan patterns ---

  // 门前清 (concealed hand - no exposed melds)
  if (_isConcealedHand(melds)) {
    patterns.push({ name: '门前清', fan: 2 });
    totalFan += 2;
  }

  // 断幺 (no terminals 1/9 and no honors)
  if (_isNoTerminals(hand, melds)) {
    patterns.push({ name: '断幺', fan: 2 });
    totalFan += 2;
  }

  // 平和 (all sequences + non-honor pair)
  if (!isSevenPairs && _isAllSequences(hand, melds)) {
    patterns.push({ name: '平和', fan: 2 });
    totalFan += 2;
  }

  // --- 1 fan patterns ---

  // 自摸 (self draw)
  if (isSelfDraw) {
    patterns.push({ name: '自摸', fan: 1 });
    totalFan += 1;
  }

  // 边张 (edge wait - waiting for 1 or 9 to complete a sequence at the edge)
  if (_isEdgeWait(hand, melds, winTile)) {
    patterns.push({ name: '边张', fan: 1 });
    totalFan += 1;
  }

  // 嵌张 (closed wait - waiting for the middle tile of a sequence)
  if (_isClosedWait(hand, melds, winTile)) {
    patterns.push({ name: '嵌张', fan: 1 });
    totalFan += 1;
  }

  // 单钓 (single wait - waiting for the pair tile)
  if (_isSingleWait(hand, melds, winTile)) {
    patterns.push({ name: '单钓', fan: 1 });
    totalFan += 1;
  }

  // 箭刻 (dragon pong)
  const dragonCount = _countDragonPongs(hand, melds);
  if (dragonCount > 0 && !_isBigThreeDragons(hand, melds)) {
    const dragonNames = { JC: '中', JF: '發', JW: '白' };
    const dragonTiles = _getDragonPongTiles(hand, melds);
    for (const dt of dragonTiles) {
      patterns.push({ name: `箭刻(${dragonNames[dt] || dt})`, fan: 1 });
      totalFan += 1;
    }
  }

  // Minimum 1 fan
  if (totalFan === 0) {
    patterns.push({ name: '底番', fan: 1 });
    totalFan = 1;
  }

  return { fan: totalFan, patterns };
}

// --- Helper functions ---

function _isFullFlush(hand, melds) {
  const allTiles = [...hand, ...melds.flat()];
  const suits = new Set();
  for (const t of allTiles) {
    if (['W', 'T', 'D'].includes(t[0])) suits.add(t[0]);
    else return false; // honor tile present
  }
  return suits.size === 1;
}

function _isAllHonors(hand, melds) {
  const allTiles = [...hand, ...melds.flat()];
  return allTiles.every(t => t[0] === 'F' || t[0] === 'J');
}

function _isBigThreeDragons(hand, melds) {
  const allTiles = [...hand, ...melds.flat()];
  const dragons = new Set();
  for (const t of allTiles) {
    if (t[0] === 'J') dragons.add(t);
  }
  // Need pong of each dragon type
  const counts = {};
  for (const t of allTiles) {
    if (t[0] === 'J') counts[t] = (counts[t] || 0) + 1;
  }
  return counts['JC'] >= 3 && counts['JF'] >= 3 && counts['JW'] >= 3;
}

function _isThirteenOrphans(hand) {
  if (hand.length !== 14) return false;
  const required = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW'];
  const counts = {};
  for (const t of hand) counts[t] = (counts[t] || 0) + 1;
  // Must have at least 1 of each required tile
  for (const r of required) {
    if (!counts[r]) return false;
  }
  // Must have exactly one pair (one tile appears twice)
  const pairCount = Object.values(counts).filter(c => c === 2).length;
  return pairCount === 1 && Object.keys(counts).length === 13;
}

function _isAllPungs(hand, melds) {
  const counts = {};
  for (const t of hand) counts[t] = (counts[t] || 0) + 1;

  // Check melds are all pungs
  for (const meld of melds) {
    if (meld.length !== 3 || !(meld[0] === meld[1] && meld[1] === meld[2])) {
      return false;
    }
  }

  // Try to extract pungs from hand
  let pungs = 0;
  let pair = false;
  for (const tile in counts) {
    if (counts[tile] === 3) pungs++;
    else if (counts[tile] === 2) pair = true;
    else if (counts[tile] === 4) { pungs++; pair = true; }
    else return false;
  }

  return pair && (pungs + melds.length) >= 4;
}

function _isMixedFlush(hand, melds) {
  const allTiles = [...hand, ...melds.flat()];
  const suits = new Set();
  let hasHonors = false;
  for (const t of allTiles) {
    if (['W', 'T', 'D'].includes(t[0])) suits.add(t[0]);
    else hasHonors = true;
  }
  return suits.size === 1 && hasHonors;
}

function _isConcealedHand(melds) {
  return melds.length === 0;
}

function _isNoTerminals(hand, melds) {
  const allTiles = [...hand, ...melds.flat()];
  for (const t of allTiles) {
    if (['F', 'J'].includes(t[0])) return false; // honor
    const num = parseInt(t.slice(1), 10);
    if (num === 1 || num === 9) return false; // terminal
  }
  return true;
}

function _isAllSequences(hand, melds) {
  if (melds.some(m => m.length === 3 && m[0] === m[1])) return false;

  const checker = new WinChecker();
  const sets = checker._extractSets(hand);
  if (sets.length === 0) return false;

  const pungCount = sets.filter(s => s[0] === s[1]).length;
  if (pungCount > 0) return false;

  // Check pair is not honor
  const counts = checker._countTiles(hand);
  const pairTile = Object.keys(counts).find(t => counts[t] === 2);
  if (pairTile && (pairTile[0] === 'F' || pairTile[0] === 'J')) return false;

  return true;
}

function _isEdgeWait(hand, melds, winTile) {
  if (!winTile || !['W', 'T', 'D'].includes(winTile[0])) return false;
  const prefix = winTile[0];
  const num = parseInt(winTile.slice(1), 10);

  // Edge: won with 1 or 9, completing a sequence at the edge
  // e.g., have 2,3 and win with 1 (left edge) or have 7,8 and win with 9 (right edge)
  if (num === 1) {
    return hand.filter(t => t === `${prefix}2`).length > 0 &&
           hand.filter(t => t === `${prefix}3`).length > 0;
  }
  if (num === 9) {
    return hand.filter(t => t === `${prefix}7`).length > 0 &&
           hand.filter(t => t === `${prefix}8`).length > 0;
  }
  return false;
}

function _isClosedWait(hand, melds, winTile) {
  if (!winTile || !['W', 'T', 'D'].includes(winTile[0])) return false;
  const prefix = winTile[0];
  const num = parseInt(winTile.slice(1), 10);

  // Closed: won with middle tile, e.g., have 1,3 and win with 2
  if (num >= 2 && num <= 8) {
    return hand.filter(t => t === `${prefix}${num - 1}`).length > 0 &&
           hand.filter(t => t === `${prefix}${num + 1}`).length > 0;
  }
  return false;
}

function _isSingleWait(hand, melds, winTile) {
  if (!winTile) return false;
  // Single wait: the hand was waiting only for this tile to form the pair
  const counts = {};
  for (const t of hand) counts[t] = (counts[t] || 0) + 1;
  // If winTile doesn't exist in hand before winning, and we only need the pair
  return (counts[winTile] || 0) === 1;
}

function _countDragonPongs(hand, melds) {
  let count = 0;
  const allTiles = [...hand, ...melds.flat()];
  const counts = {};
  for (const t of allTiles) {
    if (t[0] === 'J') counts[t] = (counts[t] || 0) + 1;
  }
  for (const t of ['JC', 'JF', 'JW']) {
    if (counts[t] >= 3) count++;
  }
  return count;
}

function _getDragonPongTiles(hand, melds) {
  const result = [];
  const allTiles = [...hand, ...melds.flat()];
  const counts = {};
  for (const t of allTiles) {
    if (t[0] === 'J') counts[t] = (counts[t] || 0) + 1;
  }
  for (const t of ['JC', 'JF', 'JW']) {
    if (counts[t] >= 3) result.push(t);
  }
  return result;
}
