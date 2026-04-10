import { describe, it, expect } from 'vitest'
import { WinChecker } from '../src/game/WinChecker.js'

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
})
