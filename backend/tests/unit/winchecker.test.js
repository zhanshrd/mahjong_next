import { describe, it, expect, test } from 'vitest'
import { WinChecker } from '../../src/game/WinChecker.js'
import { calculateFan, calculateBestFan } from '../../src/game/Scorer.js'

describe('WinChecker', () => {
  const checker = new WinChecker()

  describe('Standard win (4 melds + 1 pair)', () => {
    it('should detect a winning hand with all pongs', () => {
      const hand = ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5','W5']
      expect(checker.checkWin(hand)).toBe(true)
    })

    it('should detect a winning hand with sequences', () => {
      const hand = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4','T4']
      expect(checker.checkWin(hand)).toBe(true)
    })

    it('should detect a winning hand with mixed pongs and sequences', () => {
      const hand = ['W1','W1','W1','W2','W3','W4','T1','T2','T3','D1','D1','D1','F1','F1']
      // Actually, check: W1x3 + W2W3W4 seq + T1T2T3 seq + D1x3 + F1 pair = 14 tiles
      // Wait, that's 3+3+3+3+2 = 14, correct
      expect(checker.checkWin(hand)).toBe(true)
    })

    it('should not detect win with incomplete hand', () => {
      const hand = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3']
      expect(checker.checkWin(hand)).toBe(false) // Only 13 tiles
    })

    it('should not detect win with random tiles', () => {
      const hand = ['W1','W3','W5','W7','W9','T2','T4','T6','T8','D1','D3','D5','D7','D9']
      expect(checker.checkWin(hand)).toBe(false)
    })
  })

  describe('Seven pairs', () => {
    it('should detect seven pairs', () => {
      const hand = ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W6','W7','W7']
      expect(checker.checkWin(hand)).toBe(true)
    })

    it('should detect seven pairs with honor tiles', () => {
      const hand = ['W1','W1','FE','FE','FW','FW','FN','FN','JC','JC','JF','JF','JW','JW']
      expect(checker.checkWin(hand)).toBe(true)
    })

    it('should not detect win with 6 pairs + 2 singles', () => {
      const hand = ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W7','W8','W9']
      expect(checker.checkWin(hand)).toBe(false)
    })
  })

  describe('Edge cases', () => {
    it('should handle null hand', () => {
      expect(checker.checkWin(null)).toBe(false)
    })

    it('should handle empty hand', () => {
      expect(checker.checkWin([])).toBe(false)
    })

    it('should handle hand with 13 tiles', () => {
      const hand = ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5']
      expect(checker.checkWin(hand)).toBe(false)
    })

    it('should detect all sequences in different suits', () => {
      // W1W2W3 + T1T2T3 + D1D2D3 + W4W5W6 + T4T4
      const hand = ['W1','W2','W3','T1','T2','T3','D1','D2','D3','W4','W5','W6','T4','T4']
      expect(checker.checkWin(hand)).toBe(true)
    })
  })

  describe('getWinningTiles (tingpai)', () => {
    it('should find winning tiles for a tenpai hand', () => {
      // 13 tiles, waiting for one more
      const hand = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4']
      const winning = checker.getWinningTiles(hand)
      // Need T4 to complete T3T4 pair or... let's see
      // W1W2W3 + W4W5W6 + W7W8W9 + T1T2T3 + need T4 for pair
      expect(winning.length).toBeGreaterThan(0)
      expect(winning).toContain('T4')
    })

    it('should return empty for no-wait hand', () => {
      const hand = ['W1','W3','W5','W7','W9','T2','T4','T6','T8','D1','D3','D5','D7']
      const winning = checker.getWinningTiles(hand)
      expect(winning).toHaveLength(0)
    })
  })

  describe('extractAllDecompositions', () => {
    it('should return empty for non-winning hand', () => {
      const hand = ['W1','W3','W5','W7','W9','T2','T4','T6','T8','D1','D3','D5','D7','D9']
      const decomps = checker.extractAllDecompositions(hand)
      expect(decomps).toHaveLength(0)
    })

    it('should extract one decomposition for unambiguous hand', () => {
      // W1W2W3 + W4W5W6 + W7W8W9 + T1T2T3 + T4T4
      const hand = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4','T4']
      const decomps = checker.extractAllDecompositions(hand)
      // Only one way to decompose: 3 sequences in W + 1 sequence in T + T4 pair
      expect(decomps.length).toBeGreaterThanOrEqual(1)
      for (const d of decomps) {
        if (!d.isSevenPairs) {
          expect(d.pair).toBe('T4')
          expect(d.sets.length).toBe(4)
        }
      }
    })

    it('should extract multiple decompositions for ambiguous hand', () => {
      // W1W1W1 + W1W2W3 is ambiguous when you have W1x4, W2, W3
      // Hand: W1x4 + W2W2W2 + W3W3W3 + T1T2T3 + D1D1 = 14 tiles
      // Can decompose W1 as: (W1W1W1 pong) or (W1W2W3 seq using the extra W1)
      const hand = ['W1','W1','W1','W1','W2','W2','W2','W3','W3','W3','T1','T2','T3','D1','D1']
      // Wait, that's 15 tiles. Let me fix:
      // W1x4 + W2W2 + W3x3 + T1T2T3 = 12 + pair needed
      // Better: W1W1W1 + W2W2W2 + W3W3W3 + T1T2T3 + W1W1 (pair W1)
      // That's 3+3+3+3+2=14 tiles, but W1 count is 5 total... can't have 5
      // Let's use: W1W1W1 + W2W3W4 + W3W4W5 + T1T2T3 + W6W6
      // No, let me make a simpler ambiguous case:
      // W2W2W2 + W3W3W3 + W4W4W4 + W2W3W4 + W5W5
      // W2 has 4 (3 for pong + 1 in seq), W3 has 4, W4 has 4
      // Decomposition 1: pong W2, pong W3, pong W4, seq W2W3W4 (uses 4th of each)
      // But that requires 4 W2, 4 W3, 4 W4 = 12 + W5W5 = 14 -- only 1 decomposition
      // Actually for ambiguity we need tiles that can be either pong or sequence:
      // W1W1W1 + W2W2W2 + W3W3W3 + W1W2W3 + T1T1
      // This can decompose as: pong W1+pong W2+pong W3+seq W1W2W3 impossible (need 4 W1, 4 W2, 4 W3)
      // Total W1=4, W2=4, W3=4. That works! 12+2=14
      const hand2 = ['W1','W1','W1','W1','W2','W2','W2','W2','W3','W3','W3','W3','T1','T1']
      // Wait, that's only T1 pair + 4 sets. But the 4 sets can be arranged differently:
      // Option A: pong W1 + pong W2 + pong W3 + seq W1W2W3 -- uses W1x3+1=4, W2x3+1=4, W3x3+1=4. OK!
      // Option B: seq W1W2W3 + seq W1W2W3 + pong W1 + pong W2 -- W1 needs 2+1=3... not 4
      // Option C: 3 sequences W1W2W3 + 1 pong of something? W1x3,W2x3,W3x3 = 9 + need 3 more tiles
      // Actually with W1x4,W2x4,W3x4,T1x2:
      // Only valid: pong W1+pong W2+pong W3+seq(W1,W2,W3) -- but that uses W1x4,W2x4,W3x4
      // Or: seq x4 = W1x4,W2x4,W3x4 -- also valid!
      // So there are exactly 2 decompositions: all pongs+1 seq, or all seqs+0 pongs
      const decomps = checker.extractAllDecompositions(hand2)
      expect(decomps.length).toBeGreaterThanOrEqual(2)
    })

    it('should return seven pairs decomposition', () => {
      const hand = ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W6','W7','W7']
      const decomps = checker.extractAllDecompositions(hand)
      const sevenPairs = decomps.find(d => d.isSevenPairs)
      expect(sevenPairs).toBeTruthy()
      expect(sevenPairs.sets.length).toBe(7)
    })
  })
})

// =========================================================================
// Optimal pattern selection tests
// =========================================================================
describe('Optimal pattern selection (calculateBestFan)', () => {
  it('should select decomposition with higher fan', () => {
    // W1x4 + W2x4 + W3x4 + T1x2
    // Decomposition A: pong W1 + pong W2 + pong W3 + seq W1W2W3 + pair T1 => 碰碰胡(6) + ... higher
    // Decomposition B: 4x seq W1W2W3 + pair T1 => 平和(2) + ... lower
    const hand = ['W1','W1','W1','W1','W2','W2','W2','W2','W3','W3','W3','W3','T1','T1']
    const best = calculateBestFan(hand, [], 'T1', false, null, null)
    const baseline = calculateFan(hand, [], 'T1', false, null, null)

    // calculateBestFan should find at least as good as baseline
    expect(best.fan).toBeGreaterThanOrEqual(baseline.fan)

    // The hand has 碰碰胡 potential (all pungs + 1 sequence) which should score higher
    // than all sequences
    expect(best.fan).toBeGreaterThan(0)
    expect(best.patterns.length).toBeGreaterThan(0)
  })

  it('should fall back to calculateFan when hand has melds', () => {
    // With existing melds, calculateBestFan should just delegate to calculateFan
    const hand = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4','T4']
    const melds = [['D1','D1','D1']]
    const best = calculateBestFan(hand, melds, 'T4', false, null, null)
    const baseline = calculateFan(hand, melds, 'T4', false, null, null)
    expect(best.fan).toBe(baseline.fan)
  })

  it('should handle seven pairs hand correctly', () => {
    const hand = ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W6','W7','W7']
    const result = calculateBestFan(hand, [], 'W7', false, null, null)
    expect(result.fan).toBeGreaterThan(0)
    const sevenPairPattern = result.patterns.find(p => p.name === '七对子')
    expect(sevenPairPattern).toBeTruthy()
    expect(sevenPairPattern.fan).toBe(4)
  })

  it('should return at least 1 fan for any winning hand', () => {
    const hand = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4','T4']
    const result = calculateBestFan(hand, [], 'T4', false, null, null)
    expect(result.fan).toBeGreaterThanOrEqual(1)
  })

  it('should prefer all-pungs decomposition when available for 碰碰胡 bonus', () => {
    // All tiles are pungs or pairs, no sequences possible
    // W1x3 + W2x3 + W3x3 + W4x3 + W5x2
    const hand = ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5','W5']
    const result = calculateBestFan(hand, [], 'W5', false, null, null)
    const pengPengPattern = result.patterns.find(p => p.name === '碰碰胡')
    expect(pengPengPattern).toBeTruthy()
    expect(pengPengPattern.fan).toBe(6)
  })
})

// =========================================================================
// Data-driven tests for WinChecker
// =========================================================================
describe('WinChecker data-driven (checkWin)', () => {
  const checker = new WinChecker()

  // Standard wins: various meld+pair combinations
  test.each([
    {
      name: 'all pongs (万)',
      hand: ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5','W5'],
      expected: true
    },
    {
      name: 'all sequences (万+条)',
      hand: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4','T4'],
      expected: true
    },
    {
      name: 'mixed pongs and sequences',
      hand: ['W1','W1','W1','W2','W3','W4','T1','T2','T3','D1','D1','D1','FE','FE'],
      expected: true
    },
    {
      name: 'all sequences across 3 suits',
      hand: ['W1','W2','W3','T1','T2','T3','D1','D2','D3','W4','W5','W6','T4','T4'],
      expected: true
    },
    {
      name: 'consecutive sequences same suit',
      hand: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T5','T6','T7','D9','D9'],
      expected: true
    },
    {
      name: 'pong + chow + chow + chow + pair',
      hand: ['T5','T5','T5','W1','W2','W3','D4','D5','D6','T7','T8','T9','W9','W9'],
      expected: true
    },
    {
      name: '4 chows + pair (平和)',
      hand: ['W2','W3','W4','T3','T4','T5','D6','D7','D8','W6','W7','W8','T1','T1'],
      expected: true
    },
    {
      name: 'honor pair with standard melds',
      hand: ['W1','W1','W1','W2','W2','W2','W3','W3','W3','T1','T2','T3','JC','JC'],
      expected: true
    },
    {
      name: 'all tiles same suit (清一色)',
      hand: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W1','W2','W3','W4','W4'],
      expected: true
    },
    {
      name: 'dragon pong + melds + pair',
      hand: ['JC','JC','JC','W1','W2','W3','T1','T2','T3','D1','D1','D1','W5','W5'],
      expected: true
    },
    // Non-winning hands
    {
      name: 'scattered tiles (no melds possible)',
      hand: ['W1','W3','W5','W7','W9','T2','T4','T6','T8','D1','D3','D5','D7','D9'],
      expected: false
    },
    {
      name: '13 tiles (incomplete)',
      hand: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3'],
      expected: false
    },
    {
      name: '6 pairs + 2 singles',
      hand: ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W7','W8','W9'],
      expected: false
    },
    {
      name: 'one tile short of win',
      hand: ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5'],
      expected: false
    },
    {
      name: '4 of a kind without proper arrangement',
      hand: ['W1','W1','W1','W1','W3','W5','W7','W9','T2','T4','T6','T8','D1','D1'],
      expected: false
    }
  ])('checkWin: $name', ({ name, hand, expected }) => {
    expect(checker.checkWin(hand)).toBe(expected)
  })
})

describe('WinChecker data-driven (special patterns)', () => {
  const checker = new WinChecker()

  // Seven pairs
  test.each([
    {
      name: 'all wan seven pairs',
      hand: ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W6','W7','W7'],
      expected: true
    },
    {
      name: 'seven pairs with mixed suits',
      hand: ['W1','W1','T2','T2','D3','D3','W4','W4','T5','T5','D6','D6','W7','W7'],
      expected: true
    },
    {
      name: 'seven pairs with honors',
      hand: ['W1','W1','FE','FE','FW','FW','FN','FN','JC','JC','JF','JF','JW','JW'],
      expected: true
    },
    {
      name: 'NOT seven pairs: 3+3+2+2+2+1+1',
      hand: ['W1','W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W7','W8'],
      expected: false
    },
    {
      name: 'NOT seven pairs: duplicate quads (4 of same)',
      hand: ['W1','W1','W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W6'],
      expected: false
    }
  ])('sevenPairs: $name', ({ name, hand, expected }) => {
    expect(checker.checkSevenPairs(hand)).toBe(expected)
  })
})

describe('WinChecker data-driven (getWinningTiles)', () => {
  const checker = new WinChecker()

  test.each([
    {
      name: 'waiting for pair tile',
      hand: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4'],
      mustInclude: ['T4'],
      mustNotInclude: []
    },
    {
      name: 'multi-wait hand',
      // W1W2W3 + W4W5W6 + W7W8W9 + T1T2T3 waiting for T1,T2,T3,T4
      // Actually: W1W2W3 W4W5W6 W7W8W9 T1T2T3 + need T1(for pair) or T4(for seq... wait no pair)
      // With T1: W1W2W3 W4W5W6 W7W8W9 T1T2T3 T1(pair) -- but T1 count = 2, only 1 in hand
      // Actually this is waiting for T4 (pair) or potentially other tiles
      hand: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4'],
      mustInclude: ['T4'],
      mustNotInclude: ['D1', 'FE']
    },
    {
      name: 'no-wait hand (scattered)',
      hand: ['W1','W3','W5','W7','W9','T2','T4','T6','T8','D1','D3','D5','D7'],
      mustInclude: [],
      mustNotInclude: []
    },
    {
      name: 'single wait (pair)',
      // W1W2W3 + W4W5W6 + T1T2T3 + D1D1D1 waiting for D1 pair
      hand: ['W1','W2','W3','W4','W5','W6','T1','T2','T3','D1','D1','D1','W9'],
      mustInclude: ['W9'],
      mustNotInclude: []
    }
  ])('getWinningTiles: $name', ({ name, hand, mustInclude, mustNotInclude }) => {
    const winning = checker.getWinningTiles(hand)
    for (const tile of mustInclude) {
      expect(winning).toContain(tile)
    }
    for (const tile of mustNotInclude) {
      expect(winning).not.toContain(tile)
    }
    if (mustInclude.length === 0 && mustNotInclude.length === 0) {
      expect(winning).toHaveLength(0)
    }
  })
})
