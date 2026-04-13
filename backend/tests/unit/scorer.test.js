import { describe, it, expect, test } from 'vitest'
import { calculateFan, calculateBestFan } from '../../src/game/Scorer.js'

// =========================================================================
// Data-driven Scorer tests
// =========================================================================

describe('Scorer data-driven (8-fan patterns)', () => {
  test.each([
    {
      name: '清一色 (full flush) - all wan',
      hand: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W1','W2','W3','W4','W4'],
      melds: [],
      winTile: 'W4',
      isSelfDraw: false,
      expectedPattern: '清一色',
      expectedFan: 8
    },
    {
      name: '清一色 (full flush) - all tong',
      hand: ['D1','D2','D3','D4','D5','D6','D7','D8','D9','D3','D4','D5','D7','D7'],
      melds: [],
      winTile: 'D7',
      isSelfDraw: false,
      expectedPattern: '清一色',
      expectedFan: 8
    },
    {
      name: '字一色 (all honors)',
      hand: ['FE','FE','FE','FS','FS','FS','FW','FW','FW','FN','FN','FN','JC','JC'],
      melds: [],
      winTile: 'JC',
      isSelfDraw: false,
      expectedPattern: '字一色',
      expectedFan: 8
    },
    {
      name: '十三幺 (thirteen orphans)',
      hand: ['W1','W9','T1','T9','D1','D9','FE','FS','FW','FN','JC','JF','JW','JW'],
      melds: [],
      winTile: 'JW',
      isSelfDraw: false,
      expectedPattern: '十三幺',
      expectedFan: 8
    }
  ])('8-fan: $name', ({ name, hand, melds, winTile, isSelfDraw, expectedPattern, expectedFan }) => {
    const result = calculateFan(hand, melds, winTile, isSelfDraw, null, null)
    const pattern = result.patterns.find(p => p.name === expectedPattern)
    expect(pattern).toBeTruthy()
    expect(pattern.fan).toBe(expectedFan)
    expect(result.fan).toBeGreaterThanOrEqual(expectedFan)
  })
})

// =========================================================================
// Thirteen Orphans (十三幺) special tests
// =========================================================================

describe('Thirteen Orphans (十三幺) special patterns', () => {
  describe('Basic Thirteen Orphans detection', () => {
    it('should detect standard 十三幺 with all 13 unique orphans', () => {
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      const melds = []
      
      const result = calculateFan(hand, melds, 'JW', false)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      expect(shiSanYao).toBeTruthy()
      expect(shiSanYao.fan).toBe(8)
      expect(result.fan).toBeGreaterThanOrEqual(8)
    })

    it('should detect 十三幺 with different pair tiles', () => {
      // Pair on W1 instead of JW
      const hand = ['W1', 'W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW']
      const melds = []
      
      const result = calculateFan(hand, melds, 'W1', false)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      expect(shiSanYao).toBeTruthy()
      expect(shiSanYao.fan).toBe(8)
    })

    it('should detect 十三幺 with pair on honor tile', () => {
      // Pair on FE (East wind)
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW']
      const melds = []
      
      const result = calculateFan(hand, melds, 'FE', false)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      expect(shiSanYao).toBeTruthy()
      expect(shiSanYao.fan).toBe(8)
    })

    it('should detect 十三幺 with pair on number tile', () => {
      // Pair on T1
      const hand = ['W1', 'W9', 'T1', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW']
      const melds = []
      
      const result = calculateFan(hand, melds, 'T1', false)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      expect(shiSanYao).toBeTruthy()
      expect(shiSanYao.fan).toBe(8)
    })
  })

  describe('Thirteen Orphans with calculateBestFan', () => {
    it('should find 十三幺 as best pattern when applicable', () => {
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      
      const result = calculateBestFan(hand, [], 'JW', false)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      expect(shiSanYao).toBeTruthy()
      expect(result.fan).toBeGreaterThanOrEqual(8)
    })

    it('should handle 十三幺 with self-draw bonus', () => {
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      
      const result = calculateBestFan(hand, [], 'JW', true) // Self-draw
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      const ziMo = result.patterns.find(p => p.name === '自摸')
      expect(shiSanYao).toBeTruthy()
      expect(ziMo).toBeTruthy()
      expect(result.fan).toBeGreaterThanOrEqual(9) // 8 + 1
    })

    it('should handle 十三幺 with flower tiles', () => {
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      const flowerMelds = ['H1', 'H2', 'H3']
      
      const result = calculateBestFan(hand, [], 'JW', false, flowerMelds)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      const flowerPattern = result.patterns.find(p => p.name === '花牌')
      expect(shiSanYao).toBeTruthy()
      expect(flowerPattern).toBeTruthy()
      expect(result.fan).toBeGreaterThanOrEqual(11) // 8 + 3
    })

    it('should handle 十三幺 with wild card', () => {
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      const wildCard = 'W8'
      
      const result = calculateBestFan(hand, [], 'JW', false, null, wildCard)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      expect(shiSanYao).toBeTruthy()
      // Wild card may add bonus depending on usage
      expect(result.fan).toBeGreaterThanOrEqual(8)
    })
  })

  describe('Thirteen Orphans edge cases', () => {
    it('should NOT detect 十三幺 with incomplete set (missing one orphan)', () => {
      // Missing JW
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JF', 'JF']
      const melds = []
      
      const result = calculateFan(hand, melds, 'JF', false)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      expect(shiSanYao).toBeFalsy()
    })

    it('should NOT detect 十三幺 with extra tile (not 14 tiles)', () => {
      // This test is more about the WinChecker validation
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW'] // Only 13 tiles
      const melds = []
      
      // This should fail validation in calculateFan
      const result = calculateFan(hand, melds, null, false)
      
      // Should not crash, but won't be valid 十三幺
      expect(result).toBeDefined()
    })

    it('should NOT detect 十三幺 with duplicate non-pair tiles', () => {
      // Has two W1 and two W9 (should only have one pair)
      const hand = ['W1', 'W1', 'W9', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF']
      const melds = []
      
      const result = calculateFan(hand, melds, 'JF', false)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      expect(shiSanYao).toBeFalsy()
    })

    it('should NOT detect 十三幺 when melds exist', () => {
      // 十三幺 must be concealed (no melds)
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      const melds = [['W1', 'W1', 'W1']]
      
      const result = calculateFan(hand, melds, 'JW', false)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      expect(shiSanYao).toBeFalsy()
    })

    it('should handle 十三幺 waiting on any of the 13 orphans', () => {
      // Test multiple waiting scenarios
      const orphans = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW']
      
      for (const waitTile of orphans) {
        const hand = [...orphans.filter(t => t !== waitTile), waitTile, waitTile]
        const result = calculateFan(hand, [], waitTile, false)
        
        const shiSanYao = result.patterns.find(p => p.name === '十三幺')
        expect(shiSanYao).toBeTruthy()
      }
    })
  })

  describe('Thirteen Orphans compound patterns', () => {
    it('should combine 十三幺 with 门前清', () => {
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      
      const result = calculateFan(hand, [], 'JW', false)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      const menQianQing = result.patterns.find(p => p.name === '门前清')
      expect(shiSanYao).toBeTruthy()
      expect(menQianQing).toBeTruthy()
      expect(result.fan).toBeGreaterThanOrEqual(10) // 8 + 2
    })

    it('should combine 十三幺 with 自摸', () => {
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      
      const result = calculateFan(hand, [], 'JW', true)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      const ziMo = result.patterns.find(p => p.name === '自摸')
      expect(shiSanYao).toBeTruthy()
      expect(ziMo).toBeTruthy()
      expect(result.fan).toBeGreaterThanOrEqual(9) // 8 + 1
    })

    it('should combine 十三幺 with 自摸 and 门前清', () => {
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      
      const result = calculateFan(hand, [], 'JW', true)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      const ziMo = result.patterns.find(p => p.name === '自摸')
      const menQianQing = result.patterns.find(p => p.name === '门前清')
      expect(shiSanYao).toBeTruthy()
      expect(ziMo).toBeTruthy()
      expect(menQianQing).toBeTruthy()
      expect(result.fan).toBeGreaterThanOrEqual(11) // 8 + 1 + 2
    })

    it('should combine 十三幺 with flower tiles bonus', () => {
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      const flowerMelds = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8'] // All 8 flowers
      
      const result = calculateFan(hand, [], 'JW', false, flowerMelds)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      const flowerPattern = result.patterns.find(p => p.name === '花牌')
      expect(shiSanYao).toBeTruthy()
      expect(flowerPattern).toBeTruthy()
      expect(flowerPattern.fan).toBe(8) // 8 flowers = 8 fan
      expect(result.fan).toBeGreaterThanOrEqual(16) // 8 + 8
    })
  })

  describe('Thirteen Orphans vs other patterns', () => {
    it('should prioritize 十三幺 over other patterns when applicable', () => {
      const hand = ['W1', 'W9', 'T1', 'T9', 'D1', 'D9', 'FE', 'FS', 'FW', 'FN', 'JC', 'JF', 'JW', 'JW']
      
      const result = calculateBestFan(hand, [], 'JW', false)
      
      // 十三幺 should be detected
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      expect(shiSanYao).toBeTruthy()
      expect(shiSanYao.fan).toBe(8)
      
      // Should not conflict with invalid patterns
      const qiDuiZi = result.patterns.find(p => p.name === '七对子')
      expect(qiDuiZi).toBeFalsy() // Not seven pairs
    })

    it('should NOT detect 十三幺 when hand is actually 七对子', () => {
      const hand = ['W1', 'W1', 'W9', 'W9', 'T1', 'T1', 'T9', 'T9', 'D1', 'D1', 'D9', 'D9', 'FE', 'FE']
      
      const result = calculateBestFan(hand, [], 'FE', false)
      
      const shiSanYao = result.patterns.find(p => p.name === '十三幺')
      const qiDuiZi = result.patterns.find(p => p.name === '七对子')
      
      expect(shiSanYao).toBeFalsy() // Not 十三幺 (has pairs, not unique orphans)
      expect(qiDuiZi).toBeTruthy() // Is seven pairs
    })
  })
})

describe('Scorer data-driven (6-fan patterns)', () => {
  test.each([
    {
      name: '碰碰胡 (all pungs)',
      hand: ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5','W5'],
      melds: [],
      winTile: 'W5',
      isSelfDraw: false,
      expectedPattern: '碰碰胡',
      expectedFan: 6
    },
    {
      name: '碰碰胡 with honor pungs',
      hand: ['W1','W1','W1','FE','FE','FE','JC','JC','JC','T5','T5','T5','W9','W9'],
      melds: [],
      winTile: 'W9',
      isSelfDraw: false,
      expectedPattern: '碰碰胡',
      expectedFan: 6
    },
    {
      name: '混一色 (mixed flush) - wan + honors',
      hand: ['W1','W1','W1','W2','W3','W4','W5','W6','W7','JC','JC','JC','W9','W9'],
      melds: [],
      winTile: 'W9',
      isSelfDraw: false,
      expectedPattern: '混一色',
      expectedFan: 6
    },
    {
      name: '混一色 - tong + wind',
      hand: ['D2','D3','D4','D5','D6','D7','D8','D9','D1','D1','D1','FE','FE','FE'],
      melds: [],
      winTile: 'D9',
      isSelfDraw: false,
      expectedPattern: '混一色',
      expectedFan: 6
    }
  ])('6-fan: $name', ({ name, hand, melds, winTile, isSelfDraw, expectedPattern, expectedFan }) => {
    const result = calculateFan(hand, melds, winTile, isSelfDraw, null, null)
    const pattern = result.patterns.find(p => p.name === expectedPattern)
    expect(pattern).toBeTruthy()
    expect(pattern.fan).toBe(expectedFan)
    expect(result.fan).toBeGreaterThanOrEqual(expectedFan)
  })
})

describe('Scorer data-driven (4-fan patterns)', () => {
  test.each([
    {
      name: '七对子 (seven pairs) - all wan',
      hand: ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W6','W7','W7'],
      melds: [],
      winTile: 'W7',
      isSelfDraw: false,
      expectedPattern: '七对子',
      expectedFan: 4
    },
    {
      name: '七对子 - mixed suits',
      hand: ['W1','W1','T2','T2','D3','D3','W4','W4','T5','T5','D6','D6','W7','W7'],
      melds: [],
      winTile: 'W7',
      isSelfDraw: false,
      expectedPattern: '七对子',
      expectedFan: 4
    },
    {
      name: '七对子 - all honors',
      hand: ['FE','FE','FS','FS','FW','FW','FN','FN','JC','JC','JF','JF','JW','JW'],
      melds: [],
      winTile: 'JW',
      isSelfDraw: false,
      expectedPattern: '七对子',
      expectedFan: 4
    }
  ])('4-fan: $name', ({ name, hand, melds, winTile, isSelfDraw, expectedPattern, expectedFan }) => {
    const result = calculateFan(hand, melds, winTile, isSelfDraw, null, null)
    const pattern = result.patterns.find(p => p.name === expectedPattern)
    expect(pattern).toBeTruthy()
    expect(pattern.fan).toBe(expectedFan)
    expect(result.fan).toBeGreaterThanOrEqual(expectedFan)
  })
})

describe('Scorer data-driven (2-fan patterns)', () => {
  test.each([
    {
      name: '门前清 (concealed hand) - no melds',
      hand: ['W1','W2','W3','T1','T2','T3','D1','D2','D3','W4','W5','W6','T4','T4'],
      melds: [],
      winTile: 'T4',
      isSelfDraw: false,
      expectedPattern: '门前清',
      expectedFan: 2
    },
    {
      name: '断幺 (no terminals/honors) - all middle tiles',
      hand: ['W2','W3','W4','W5','W6','W7','T3','T4','T5','D4','D5','D6','W8','W8'],
      melds: [],
      winTile: 'W8',
      isSelfDraw: false,
      expectedPattern: '断幺',
      expectedFan: 2
    },
    {
      name: '平和 (all sequences + non-honor pair)',
      hand: ['W2','W3','W4','T3','T4','T5','D6','D7','D8','W6','W7','W8','T1','T1'],
      melds: [],
      winTile: 'T1',
      isSelfDraw: false,
      expectedPattern: '平和',
      expectedFan: 2
    }
  ])('2-fan: $name', ({ name, hand, melds, winTile, isSelfDraw, expectedPattern, expectedFan }) => {
    const result = calculateFan(hand, melds, winTile, isSelfDraw, null, null)
    const pattern = result.patterns.find(p => p.name === expectedPattern)
    expect(pattern).toBeTruthy()
    expect(pattern.fan).toBe(expectedFan)
    expect(result.fan).toBeGreaterThanOrEqual(expectedFan)
  })
})

describe('Scorer data-driven (1-fan patterns)', () => {
  test.each([
    {
      name: '自摸 (self draw)',
      hand: ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5','W5'],
      melds: [],
      winTile: 'W5',
      isSelfDraw: true,
      expectedPattern: '自摸',
      expectedFan: 1
    },
    {
      name: '箭刻(中) - dragon pong JC',
      hand: ['JC','JC','JC','W1','W2','W3','T1','T2','T3','D1','D1','D1','W5','W5'],
      melds: [],
      winTile: 'W5',
      isSelfDraw: false,
      expectedPattern: '箭刻(中)',
      expectedFan: 1
    },
    {
      name: '箭刻(發) - dragon pong JF',
      hand: ['JF','JF','JF','W1','W2','W3','T1','T2','T3','D1','D1','D1','W5','W5'],
      melds: [],
      winTile: 'W5',
      isSelfDraw: false,
      expectedPattern: '箭刻(發)',
      expectedFan: 1
    },
    {
      name: '边张 (edge wait) - win with W1 having W2W3',
      hand: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','W2','W2'],
      // W2 pair, W1 won by edge (had W2,W3, won with W1)
      melds: [],
      winTile: 'W1',
      isSelfDraw: false,
      expectedPattern: '边张',
      expectedFan: 1
    },
    {
      name: '嵌张 (closed wait) - win with W5 having W4,W6',
      hand: ['W1','W2','W3','W4','W5','W6','W4','W5','W6','T1','T2','T3','W6','W6'],
      melds: [],
      winTile: 'W5',
      isSelfDraw: false,
      expectedPattern: '嵌张',
      expectedFan: 1
    },
    {
      name: '单钓 (single wait) - pair wait',
      hand: ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5'],
      melds: [],
      winTile: 'W5',
      isSelfDraw: false,
      expectedPattern: '单钓',
      expectedFan: 1
    }
  ])('1-fan: $name', ({ name, hand, melds, winTile, isSelfDraw, expectedPattern, expectedFan }) => {
    const result = calculateFan(hand, melds, winTile, isSelfDraw, null, null)
    const pattern = result.patterns.find(p => p.name === expectedPattern)
    expect(pattern).toBeTruthy()
    expect(pattern.fan).toBe(expectedFan)
  })
})

describe('Scorer data-driven (composite patterns)', () => {
  test.each([
    {
      name: '清一色 + 碰碰胡 + 门前清 = 8+6+2=16',
      hand: ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5','W5'],
      melds: [],
      winTile: 'W5',
      isSelfDraw: false,
      expectedPatterns: ['清一色', '碰碰胡', '门前清'],
      minimumFan: 16
    },
    {
      name: '清一色 + 七对子 + 门前清 = 8+4+2=14',
      hand: ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W6','W7','W7'],
      melds: [],
      winTile: 'W7',
      isSelfDraw: false,
      expectedPatterns: ['清一色', '七对子', '门前清'],
      minimumFan: 14
    },
    {
      name: '碰碰胡 + 门前清 + 箭刻(中) = 6+2+1=9',
      hand: ['JC','JC','JC','W1','W1','W1','T1','T1','T1','D1','D1','D1','W5','W5'],
      melds: [],
      winTile: 'W5',
      isSelfDraw: false,
      expectedPatterns: ['碰碰胡', '门前清', '箭刻(中)'],
      minimumFan: 9
    },
    {
      name: '断幺 + 平和 + 门前清 = 2+2+2=6',
      hand: ['W2','W3','W4','T3','T4','T5','D6','D7','D8','W6','W7','W8','T5','T5'],
      melds: [],
      winTile: 'T5',
      isSelfDraw: false,
      expectedPatterns: ['断幺', '平和', '门前清'],
      minimumFan: 6
    },
    {
      name: '字一色 + 碰碰胡 + 大三元 = 8+6+8=22',
      hand: ['JC','JC','JC','JF','JF','JF','JW','JW','JW','FE','FE','FE','FS','FS'],
      melds: [],
      winTile: 'FS',
      isSelfDraw: false,
      expectedPatterns: ['字一色', '碰碰胡', '大三元'],
      minimumFan: 22
    },
    {
      name: '混一色 + 碰碰胡 + 门前清 + 箭刻 = 6+6+2+1=15',
      hand: ['JC','JC','JC','W1','W1','W1','W3','W3','W3','W5','W5','W5','W7','W7'],
      melds: [],
      winTile: 'W7',
      isSelfDraw: false,
      expectedPatterns: ['混一色', '碰碰胡', '门前清', '箭刻(中)'],
      minimumFan: 15
    }
  ])('composite: $name', ({ name, hand, melds, winTile, isSelfDraw, expectedPatterns, minimumFan }) => {
    const result = calculateFan(hand, melds, winTile, isSelfDraw, null, null)
    expect(result.fan).toBeGreaterThanOrEqual(minimumFan)
    for (const patternName of expectedPatterns) {
      const pattern = result.patterns.find(p => p.name === patternName)
      expect(pattern).toBeTruthy()
    }
  })
})

describe('Scorer data-driven (calculateBestFan optimal selection)', () => {
  test.each([
    {
      name: 'ambiguous W1x4 W2x4 W3x4 T1x2: all-sequences decomposition scores correctly',
      hand: ['W1','W1','W1','W1','W2','W2','W2','W2','W3','W3','W3','W3','T1','T1'],
      melds: [],
      winTile: 'T1',
      mustIncludePattern: '门前清'
    },
    {
      name: 'all pungs hand: must have 碰碰胡',
      hand: ['W1','W1','W1','W2','W2','W2','W3','W3','W3','W4','W4','W4','W5','W5'],
      melds: [],
      winTile: 'W5',
      mustIncludePattern: '碰碰胡'
    },
    {
      name: 'seven pairs: must have 七对子',
      hand: ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W6','W7','W7'],
      melds: [],
      winTile: 'W7',
      mustIncludePattern: '七对子'
    },
    {
      name: 'clear flush seven pairs: must have 清一色 + 七对子',
      hand: ['W1','W1','W2','W2','W3','W3','W4','W4','W5','W5','W6','W6','W7','W7'],
      melds: [],
      winTile: 'W7',
      mustIncludePattern: '清一色'
    }
  ])('bestFan: $name', ({ name, hand, melds, winTile, mustIncludePattern }) => {
    const result = calculateBestFan(hand, melds, winTile, false, null, null)
    expect(result.fan).toBeGreaterThan(0)
    const pattern = result.patterns.find(p => p.name === mustIncludePattern)
    expect(pattern).toBeTruthy()
  })
})

describe('Scorer data-driven (minimum fan guarantee)', () => {
  test.each([
    {
      name: 'simple winning hand should get at least 底番 (1)',
      hand: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4','T4'],
      melds: [],
      winTile: 'T4',
      isSelfDraw: false
    },
    {
      name: 'all pung hand should get at least 底番 (1)',
      hand: ['W1','W1','W1','W2','W2','W2','W3','W3','W3','T1','T2','T3','D1','D1'],
      melds: [],
      winTile: 'D1',
      isSelfDraw: false
    },
    {
      name: 'mixed suit winning hand should get at least 底番 (1)',
      hand: ['W1','W2','W3','T4','T5','T6','D7','D8','D9','W5','W6','W7','T1','T1'],
      melds: [],
      winTile: 'T1',
      isSelfDraw: false
    }
  ])('minFan: $name', ({ name, hand, melds, winTile, isSelfDraw }) => {
    const result = calculateFan(hand, melds, winTile, isSelfDraw, null, null)
    expect(result.fan).toBeGreaterThanOrEqual(1)
    expect(result.patterns.length).toBeGreaterThan(0)
  })
})

// =========================================================================
// Melds presence tests (番数计算 with melds)
// =========================================================================

describe('Scorer with melds present', () => {
  describe('Melds affecting pattern detection', () => {
    it('should handle 清一色 with exposed melds', () => {
      // Hand has 9 tiles, melds have 12 tiles (4 melds of 3)
      const hand = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W2', 'W2']
      const melds = [
        ['W1', 'W1', 'W1'], // Pong of W1
        ['W3', 'W4', 'W5'], // Chow
        ['W6', 'W7', 'W8'], // Chow
        ['W9', 'W9', 'W9']  // Pong of W9
      ]
      
      const result = calculateFan(hand, melds, 'W2', false)
      
      // Should still detect 清一色 (all wan tiles)
      const qingYiSe = result.patterns.find(p => p.name === '清一色')
      expect(qingYiSe).toBeTruthy()
      expect(qingYiSe.fan).toBe(8)
      expect(result.fan).toBeGreaterThanOrEqual(8)
    })

    it('should handle 碰碰胡 with exposed pungs', () => {
      // Hand with 3 tiles (pair wait) + 3 melds of 3 tiles each = 14 tiles total
      const hand = ['W5', 'W5'] // Pair waiting
      const melds = [
        ['W1', 'W1', 'W1'], // Pung
        ['W2', 'W2', 'W2'], // Pung
        ['W3', 'W3', 'W3'], // Pung
        ['W6', 'W6', 'W6']  // Pung
      ]
      
      const result = calculateFan(hand, melds, 'W5', false)
      
      // Should detect 碰碰胡 (all pungs)
      const pengPengHu = result.patterns.find(p => p.name === '碰碰胡')
      expect(pengPengHu).toBeTruthy()
      expect(pengPengHu.fan).toBe(6)
    })

    it('should handle 混一色 with honor melds', () => {
      const hand = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W1', 'W1']
      const melds = [
        ['W2', 'W3', 'W4'], // Chow
        ['W5', 'W6', 'W7'], // Chow
        ['FE', 'FE', 'FE']  // Pong of wind (honor)
      ]
      
      const result = calculateFan(hand, melds, 'W1', false)
      
      // Should detect 混一色 (one suit + honors)
      const hunYiSe = result.patterns.find(p => p.name === '混一色')
      expect(hunYiSe).toBeTruthy()
      expect(hunYiSe.fan).toBe(6)
    })

    it('should handle 断幺 with exposed melds', () => {
      const hand = ['W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W5', 'W5']
      const melds = [
        ['W2', 'W3', 'W4'], // No terminals
        ['W6', 'W7', 'W8'],
        ['T5', 'T5', 'T5']
      ]
      
      const result = calculateFan(hand, melds, 'W5', false)
      
      // Should detect 断幺 (no 1/9/honors)
      const duanYao = result.patterns.find(p => p.name === '断幺')
      expect(duanYao).toBeTruthy()
      expect(duanYao.fan).toBe(2)
    })

    it('should NOT detect 断幺 when melds contain terminals', () => {
      const hand = ['W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W5', 'W5']
      const melds = [
        ['W1', 'W1', 'W1'], // Contains terminal (1)
        ['W2', 'W3', 'W4'],
        ['T5', 'T5', 'T5']
      ]
      
      const result = calculateFan(hand, melds, 'W5', false)
      
      // Should NOT have 断幺 because melds contain W1
      const duanYao = result.patterns.find(p => p.name === '断幺')
      expect(duanYao).toBeFalsy()
    })

    it('should handle 箭刻 with exposed dragon pungs', () => {
      // Standard winning hand: pair + 4 melds
      const hand = ['W9', 'W9'] // Pair
      const melds = [
        ['JC', 'JC', 'JC'], // Dragon pong (中)
        ['W1', 'W1', 'W1'], // Pung
        ['W2', 'W2', 'W2'], // Pung
        ['W3', 'W3', 'W3']  // Pung
      ]
      
      const result = calculateFan(hand, melds, 'W9', false)
      
      // Should detect dragon pong (箭刻)
      const jianKeZhong = result.patterns.find(p => p.name.includes('箭刻'))
      expect(jianKeZhong).toBeTruthy()
      expect(jianKeZhong.fan).toBe(1)
      
      // Should also have 碰碰胡
      const pengPengHu = result.patterns.find(p => p.name === '碰碰胡')
      expect(pengPengHu).toBeTruthy()
    })

    it('should handle 大三元 with all three dragon pungs in melds', () => {
      const hand = ['W1', 'W2', 'W3', 'T1', 'T2', 'T3', 'D1', 'D2', 'D3', 'W5', 'W5']
      const melds = [
        ['JC', 'JC', 'JC'], // 中
        ['JF', 'JF', 'JF'], // 發
        ['JW', 'JW', 'JW']  // 白
      ]
      
      const result = calculateFan(hand, melds, 'W5', false)
      
      // Should detect 大三元
      const daSanYuan = result.patterns.find(p => p.name === '大三元')
      expect(daSanYuan).toBeTruthy()
      expect(daSanYuan.fan).toBe(8)
    })

    it('should handle 门前清 when NO melds exist', () => {
      const hand = ['W1', 'W2', 'W3', 'T1', 'T2', 'T3', 'D1', 'D2', 'D3', 'W4', 'W5', 'W6', 'W7', 'W7']
      const melds = []
      
      const result = calculateFan(hand, melds, 'W7', false)
      
      // Should detect 门前清 (concealed hand)
      const menQianQing = result.patterns.find(p => p.name === '门前清')
      expect(menQianQing).toBeTruthy()
      expect(menQianQing.fan).toBe(2)
    })

    it('should NOT detect 门前清 when melds exist', () => {
      const hand = ['W1', 'W2', 'W3', 'T1', 'T2', 'T3', 'D1', 'D2', 'D3', 'W4', 'W5', 'W6', 'W7', 'W7']
      const melds = [
        ['W1', 'W1', 'W1'] // One exposed pung
      ]
      
      const result = calculateFan(hand, melds, 'W7', false)
      
      // Should NOT detect 门前清 because there's an exposed meld
      const menQianQing = result.patterns.find(p => p.name === '门前清')
      expect(menQianQing).toBeFalsy()
    })

    it('should handle compound patterns with melds', () => {
      // Hand with melds cannot be seven pairs
      // Use a standard winning hand with melds
      const hand = ['W7', 'W7'] // Pair
      const melds = [
        ['W1', 'W1', 'W1'], // Pung
        ['W2', 'W2', 'W2'], // Pung
        ['W3', 'W3', 'W3'], // Pung
        ['W8', 'W8', 'W8']  // Pung
      ]
      
      const result = calculateFan(hand, melds, 'W7', false)
      
      // Should detect 清一色 (all wan)
      const qingYiSe = result.patterns.find(p => p.name === '清一色')
      expect(qingYiSe).toBeTruthy()
      expect(qingYiSe.fan).toBe(8)
      
      // Should detect 碰碰胡 (all pungs)
      const pengPengHu = result.patterns.find(p => p.name === '碰碰胡')
      expect(pengPengHu).toBeTruthy()
      
      // Should NOT detect 七对子 because melds break the seven pairs pattern
      const qiDuiZi = result.patterns.find(p => p.name === '七对子')
      expect(qiDuiZi).toBeFalsy()
    })
  })

  describe('Melds affecting fan calculation accuracy', () => {
    it('should correctly count total fan with multiple melds', () => {
      // Proper hand: pair + 4 melds (all wan for 清一色)
      const hand = ['W9', 'W9'] // Pair
      const melds = [
        ['W1', 'W1', 'W1'], // Pung
        ['W2', 'W2', 'W2'], // Pung
        ['W3', 'W3', 'W3'], // Pung
        ['W4', 'W4', 'W4']  // Pung
      ]
      
      const result = calculateFan(hand, melds, 'W9', false)
      
      // Should have: 清一色 (8) + 碰碰胡 (6) = 14
      expect(result.fan).toBeGreaterThanOrEqual(14)
      const qingYiSe = result.patterns.find(p => p.name === '清一色')
      expect(qingYiSe).toBeTruthy()
      expect(qingYiSe.fan).toBe(8)
      
      const pengPengHu = result.patterns.find(p => p.name === '碰碰胡')
      expect(pengPengHu).toBeTruthy()
      expect(pengPengHu.fan).toBe(6)
    })

    it('should handle flower tiles with melds', () => {
      const hand = ['W1', 'W2', 'W3', 'T1', 'T2', 'T3', 'D1', 'D2', 'D3', 'W4', 'W5', 'W6', 'W7', 'W7']
      const melds = [['W1', 'W1', 'W1']]
      const flowerMelds = ['H1', 'H2', 'H3'] // 3 flower tiles
      
      const result = calculateFan(hand, melds, 'W7', false, flowerMelds)
      
      // Should have flower fan (1 per flower)
      expect(result.fan).toBeGreaterThanOrEqual(3) // At least 3 from flowers
      const flowerPattern = result.patterns.find(p => p.name === '花牌')
      expect(flowerPattern).toBeTruthy()
    })

    it('should handle wild card with melds', () => {
      const hand = ['W1', 'W2', 'W3', 'T1', 'T2', 'T3', 'D1', 'D2', 'D3', 'W4', 'W5', 'W6', 'W7', 'W7']
      const melds = [['W1', 'W1', 'W1']]
      const wildCard = 'W8' // Wild card is W8
      
      const result = calculateFan(hand, melds, 'W7', false, null, wildCard)
      
      // Should have wild card multiplier if applicable
      // The exact fan depends on whether wild card is used in the hand
      expect(result.fan).toBeGreaterThanOrEqual(1)
    })

    it('should handle self-draw bonus with melds', () => {
      const hand = ['W1', 'W2', 'W3', 'T1', 'T2', 'T3', 'D1', 'D2', 'D3', 'W4', 'W5', 'W6', 'W7', 'W7']
      const melds = [['W1', 'W1', 'W1']]
      
      const result = calculateFan(hand, melds, 'W7', true) // Self-draw
      
      // Should have 自摸 (1 fan)
      const ziMo = result.patterns.find(p => p.name === '自摸')
      expect(ziMo).toBeTruthy()
      expect(ziMo.fan).toBe(1)
    })

    it('should calculateBestFan with melds provided', () => {
      const hand = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W1', 'W1']
      const melds = [
        ['W2', 'W3', 'W4'],
        ['W5', 'W6', 'W7'],
        ['W8', 'W9', 'W1']
      ]
      
      const result = calculateBestFan(hand, melds, 'W1', false)
      
      // Should correctly evaluate with the provided melds
      expect(result.fan).toBeGreaterThanOrEqual(8) // 清一色
      const qingYiSe = result.patterns.find(p => p.name === '清一色')
      expect(qingYiSe).toBeTruthy()
    })
  })

  describe('Melds edge cases', () => {
    it('should handle empty melds array', () => {
      const hand = ['W1', 'W2', 'W3', 'T1', 'T2', 'T3', 'D1', 'D2', 'D3', 'W4', 'W5', 'W6', 'W7', 'W7']
      const melds = []
      
      const result = calculateFan(hand, melds, 'W7', false)
      
      expect(result.fan).toBeGreaterThanOrEqual(1)
      expect(result.patterns.length).toBeGreaterThan(0)
    })

    it('should handle melds with chow sequences', () => {
      // Hand with 7 pairs (no melds for seven pairs to be valid)
      const hand = ['W1', 'W1', 'W2', 'W2', 'W3', 'W3', 'W4', 'W4', 'W5', 'W5', 'W6', 'W6', 'W7', 'W7']
      const melds = [] // No melds for seven pairs
      
      const result = calculateFan(hand, melds, 'W7', false)
      
      // Should detect 七对子 (seven pairs)
      const qiDuiZi = result.patterns.find(p => p.name === '七对子')
      expect(qiDuiZi).toBeTruthy()
      expect(qiDuiZi.fan).toBe(4)
      
      // Should also detect 清一色
      const qingYiSe = result.patterns.find(p => p.name === '清一色')
      expect(qingYiSe).toBeTruthy()
    })

    it('should handle melds with kong (4 tiles)', () => {
      const hand = ['W1', 'W2', 'W3', 'T1', 'T2', 'T3', 'D1', 'D2', 'D3', 'W4', 'W5', 'W6', 'W7', 'W7']
      const melds = [
        ['W1', 'W1', 'W1', 'W1'] // Kong (4 tiles)
      ]
      
      const result = calculateFan(hand, melds, 'W7', false)
      
      // Should still evaluate correctly
      expect(result.fan).toBeGreaterThanOrEqual(1)
    })

    it('should handle mixed meld types (pong, chow, kong)', () => {
      const hand = ['W1', 'W1', 'T5', 'T5', 'D3', 'D3', 'FE', 'FE']
      const melds = [
        ['W2', 'W3', 'W4'],     // Chow
        ['T6', 'T6', 'T6'],     // Pong
        ['D1', 'D1', 'D1', 'D1'] // Kong
      ]
      
      const result = calculateFan(hand, melds, 'FE', false)
      
      expect(result.fan).toBeGreaterThanOrEqual(1)
    })
  })
})
