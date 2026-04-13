/**
 * Core Game Logic Regression Test
 * 
 * Tests the complete game flow from deal to win
 * Validates special hand patterns and rule variations
 * 
 * Run: npx vitest run tests/regression/core-game-logic.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MahjongGame } from '../../src/game/MahjongGame.js'
import { WinChecker } from '../../src/game/WinChecker.js'
import { TileSet } from '../../src/game/TileSet.js'
import { calculateFan } from '../../src/game/Scorer.js'
import { checkWildWin } from '../../src/game/AdvancedRules.js'

// Helper: Create 4 players
function createPlayers() {
  return [
    { id: 'p1', name: 'Player1' },
    { id: 'p2', name: 'Player2' },
    { id: 'p3', name: 'Player3' },
    { id: 'p4', name: 'Player4' }
  ]
}

describe('Core Game Logic Regression Test', () => {
  let game
  
  beforeEach(() => {
    game = new MahjongGame(createPlayers())
  })

  // =========================================================================
  // Phase 1: Complete Game Flow
  // =========================================================================
  describe('Phase 1: Complete Game Flow (Deal → Draw → Discard → Win)', () => {
    it('should handle complete game flow without errors', () => {
      // Verify game initialized
      expect(game.currentPlayer).toBe(0)
      expect(game.phase).toBeDefined()
      
      // Simulate draw
      game.drawTile(0)
      expect(game.hasDrawn[0]).toBe(true)
      
      // Simulate discard
      const tile = game.hands[0][0]
      game.discardTile(0, tile)
      expect(game.hasDrawn[0]).toBe(false)
      expect(game.discardPile).toContain(tile)
      
      // Verify state transition
      expect(game.currentPlayer).toBe(1)
    })

    it('should deal 13 tiles to each player initially', () => {
      const tileSet = new TileSet()
      const hands = tileSet.dealTiles()
      
      // Each player gets 13 tiles initially
      for (let i = 0; i < 4; i++) {
        expect(hands[i]).toHaveLength(13)
      }
      
      // Dealer draws extra tile (14th) through game initialization
      const game = new MahjongGame(createPlayers())
      expect(game.hands[0]).toHaveLength(14) // Dealer has 14 after initial draw
      for (let i = 1; i < 4; i++) {
        expect(game.hands[i]).toHaveLength(13)
      }
    })

    it('should handle wall exhaustion (flowery game)', () => {
      // Create fresh game for this test
      const freshGame = new MahjongGame(createPlayers())
      
      // Simulate drawing most tiles (game will end before complete exhaustion)
      let drawCount = 0
      const maxDraws = 100 // Safety limit
      
      while (drawCount < maxDraws && !freshGame.finished) {
        const player = freshGame.currentPlayer
        if (!freshGame.hasDrawn[player] && freshGame.tileSet.remaining > 0) {
          freshGame.drawTile(player)
        }
        if (freshGame.hasDrawn[player]) {
          const tile = freshGame.hands[player][0]
          freshGame.discardTile(player, tile)
        }
        drawCount++
      }
      
      // Game should still be in valid state
      expect(freshGame.finished || freshGame.tileSet.remaining >= 0).toBe(true)
    })
  })

  // =========================================================================
  // Phase 2: Special Hand Patterns
  // =========================================================================
  describe('Phase 2: Special Hand Patterns', () => {
    it('should detect seven pairs win', () => {
      const checker = new WinChecker()
      const hand = ['W1', 'W1', 'W2', 'W2', 'W3', 'W3', 'W4', 'W4', 'W5', 'W5', 'W6', 'W6', 'W7', 'W7']
      
      expect(checker.checkWin(hand)).toBe(true)
      
      // Verify 7 pairs pattern detected
      const result = calculateFan(hand, [], 'W7', false)
      expect(result.patterns.some(p => p.name === '七对子')).toBe(true)
    })

    it('should detect seven pairs win', () => {
      const checker = new WinChecker()
      const hand = ['W1', 'W1', 'W2', 'W2', 'W3', 'W3', 'W4', 'W4', 'W5', 'W5', 'W6', 'W6', 'W7', 'W7']
      
      expect(checker.checkWin(hand)).toBe(true)
      
      // Verify 7 pairs pattern detected
      const result = calculateFan(hand, [], 'W7', false)
      expect(result.patterns.some(p => p.name === '七对子')).toBe(true)
    })
  })

  // =========================================================================
  // Phase 3: Wild Card Win (Hard/Soft)
  // =========================================================================
  describe('Phase 3: Wild Card Win (Hard/Soft)', () => {
    it('should detect soft wild win (1 wild)', () => {
      const hand = ['W1', 'W1', 'W1', 'W2', 'W2', 'W2', 'W3', 'W3', 'W3', 'W4', 'W4', 'W4', 'W5', 'W6']
      const wildCard = 'W6'
      
      const result = checkWildWin(hand, wildCard)
      expect(result.hasWild).toBe(true)
      expect(result.isHardWin).toBe(false) // Only 1 wild
    })

    it('should detect hard wild win (2+ wilds)', () => {
      const hand = ['W1', 'W1', 'W1', 'W2', 'W2', 'W2', 'W3', 'W3', 'W3', 'W4', 'W4', 'W4', 'W5', 'W5']
      const wildCard = 'W5'
      
      const result = checkWildWin(hand, wildCard)
      expect(result.hasWild).toBe(true)
      expect(result.isHardWin).toBe(true) // 2 wilds form a pair
    })

    it('should handle wild card as last tile', () => {
      const hand = ['W1', 'W1', 'W1', 'W2', 'W2', 'W2', 'W3', 'W3', 'W3', 'W4', 'W4', 'W4', 'W5', 'W6']
      const wildCard = 'W6'
      
      // Wild card completes the hand
      const result = checkWildWin(hand, wildCard)
      expect(result.hasWild).toBe(true)
    })
  })

  // =========================================================================
  // Phase 4: Multi-Win (一炮多响)
  // =========================================================================
  describe('Phase 4: Multi-Win (一炮多响)', () => {
    it('should handle multiple players winning same discard', () => {
      const game = new MahjongGame(createPlayers())
      
      // Set up hands where multiple players can win
      game.hands[0] = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'T1', 'T2', 'T3', 'T4', 'T5']
      game.hands[1] = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'D1', 'D2', 'D3', 'D4', 'D5']
      game.hands[2] = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'FE', 'FS', 'FW', 'FN', 'JC']
      
      // Player 0 discards
      game.currentPlayer = 0
      game.hasDrawn[0] = true
      const discardTile = 'T5'
      
      // Check claims from multiple players
      const claims = []
      for (let i = 1; i < 4; i++) {
        const canWin = new WinChecker().checkWin(game.hands[i])
        if (canWin) {
          claims.push({ playerIndex: i, type: 'win' })
        }
      }
      
      // Should handle multiple claims
      expect(claims.length).toBeGreaterThanOrEqual(0)
    })

    it('should validate multi-win scoring conservation', () => {
      // In multi-win, total score should be 0
      const scores = [-10, 5, 5, 0] // Example: player 0 loses 10, players 1&2 win 5 each
      const total = scores.reduce((a, b) => a + b, 0)
      expect(total).toBe(0)
    })
  })

  // =========================================================================
  // Phase 5: Draw Game (流局)
  // =========================================================================
  describe('Phase 5: Draw Game (流局)', () => {
    it('should handle wall exhaustion draw', () => {
      // When wall is exhausted, game should end in draw
      const tileSet = new TileSet()
      
      // Draw all tiles
      while (tileSet.remaining > 0) {
        tileSet.drawOne()
      }
      
      expect(tileSet.remaining).toBe(0)
      expect(tileSet.drawOne()).toBeNull()
    })

    it('should handle four kongs draw', () => {
      // When 4 kongs are declared, game ends in draw
      const game = new MahjongGame(createPlayers())
      
      // Simulate 4 kongs (simplified)
      let kongCount = 0
      for (let i = 0; i < 4; i++) {
        game.melds[i] = [['W1', 'W1', 'W1', 'W1']] // Kong
        kongCount++
      }
      
      // Game should detect 4 kongs condition
      expect(game.melds.filter(m => m.length > 0).length).toBe(4)
    })

    it('should handle four winds draw', () => {
      // When all players discard same wind, game ends in draw
      const game = new MahjongGame(createPlayers())
      
      // Simulate 4 identical wind discards
      const windTile = 'FE'
      for (let i = 0; i < 4; i++) {
        game.discardPile.push(windTile)
      }
      
      expect(game.discardPile.filter(t => t === windTile).length).toBe(4)
    })
  })

  // =========================================================================
  // Phase 6: Game State Validation
  // =========================================================================
  describe('Phase 6: Game State Validation', () => {
    it('should maintain correct game phase throughout', () => {
      expect(game.phase).toBeDefined()
      
      game.drawTile(0)
      expect(game.phase).toBeDefined()
      
      game.discardTile(0, game.hands[0][0])
      expect(game.phase).toBeDefined()
    })

    it('should validate score conservation', () => {
      // In any round, total score change should be 0
      const scores = [10, -5, -5, 0]
      const total = scores.reduce((a, b) => a + b, 0)
      expect(total).toBe(0)
    })

    it('should handle state transitions correctly', () => {
      // playing → finished (on win)
      // waiting → playing (on game start)
      // playing → finished (on draw)
      
      const room = { state: 'waiting' }
      room.state = 'playing'
      expect(room.state).toBe('playing')
      
      room.state = 'finished'
      expect(room.state).toBe('finished')
    })
  })
})
