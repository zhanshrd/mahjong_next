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
      name: 'simple winning hand should get at least 底番(1)',
      hand: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T1','T2','T3','T4','T4'],
      melds: [],
      winTile: 'T4',
      isSelfDraw: false
    },
    {
      name: 'all pung hand should get at least 底番(1)',
      hand: ['W1','W1','W1','W2','W2','W2','W3','W3','W3','T1','T2','T3','D1','D1'],
      melds: [],
      winTile: 'D1',
      isSelfDraw: false
    },
    {
      name: 'mixed suit winning hand should get at least 底番(1)',
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
