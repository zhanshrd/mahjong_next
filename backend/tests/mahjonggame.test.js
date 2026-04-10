import { describe, it, expect } from 'vitest'
import { MahjongGame } from '../src/game/MahjongGame.js'

describe('MahjongGame', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Charlie' },
    { id: 'p4', name: 'Dave' }
  ]

  it('should initialize with 4 players and deal tiles', () => {
    const game = new MahjongGame(players)
    expect(game.players).toHaveLength(4)
    expect(game.hands).toHaveLength(4)

    // Each player should have 13 tiles, dealer (player 0) has 14 due to initial draw
    expect(game.hands[0]).toHaveLength(14) // dealer drew first
    expect(game.hands[1]).toHaveLength(13)
    expect(game.hands[2]).toHaveLength(13)
    expect(game.hands[3]).toHaveLength(13)
  })

  it('should start with player 0 as current player (dealer)', () => {
    const game = new MahjongGame(players)
    expect(game.currentPlayer).toBe(0)
    expect(game.hasDrawn[0]).toBe(true) // dealer already drew
    expect(game.hasDrawn[1]).toBe(false)
  })

  it('should not be finished at start', () => {
    const game = new MahjongGame(players)
    expect(game.finished).toBe(false)
    expect(game.winner).toBeNull()
  })

  describe('drawTile', () => {
    it('should fail if not your turn', () => {
      const game = new MahjongGame(players)
      const result = game.drawTile(1) // not player 1's turn
      expect(result.success).toBe(false)
      expect(result.reason).toBe('NOT_YOUR_TURN')
    })

    it('should fail if already drawn', () => {
      const game = new MahjongGame(players)
      // Player 0 already has drawn (initial draw)
      const result = game.drawTile(0)
      expect(result.success).toBe(false)
      expect(result.reason).toBe('ALREADY_DRAWN')
    })

    it('should fail if game is finished', () => {
      const game = new MahjongGame(players)
      game.finished = true
      const result = game.drawTile(0)
      expect(result.success).toBe(false)
      expect(result.reason).toBe('GAME_FINISHED')
    })
  })

  describe('discardTile', () => {
    it('should fail if not your turn', () => {
      const game = new MahjongGame(players)
      const result = game.discardTile(1, game.hands[1][0])
      expect(result.success).toBe(false)
      expect(result.reason).toBe('NOT_YOUR_TURN')
    })

    it('should fail if tile not in hand', () => {
      const game = new MahjongGame(players)
      const result = game.discardTile(0, 'Z99')
      expect(result.success).toBe(false)
      expect(result.reason).toBe('TILE_NOT_IN_HAND')
    })

    it('should allow dealer to discard after initial draw', () => {
      const game = new MahjongGame(players)
      const tile = game.hands[0][0]
      const handBefore = game.hands[0].length
      const result = game.discardTile(0, tile)

      expect(result.success).toBe(true)
      expect(result.nextPlayer).toBe(1)
      expect(game.hands[0]).toHaveLength(handBefore - 1)
      expect(game.discardPile).toContain(tile)
      expect(game.lastDiscard).toBe(tile)
    })
  })

  describe('Full game flow (draw -> discard cycle)', () => {
    it('should cycle through players', () => {
      const game = new MahjongGame(players)
      
      // Verify initial state: player 0 (dealer) has drawn and should discard first
      expect(game.currentPlayer).toBe(0)
      expect(game.hasDrawn[0]).toBe(true)

      // Player 0: discard (already has drawn)
      const tile0 = game.hands[0][0]
      game.discardTile(0, tile0)
      expect(game.currentPlayer).toBe(1)

      // Player 1: draw then discard
      const draw1 = game.drawTile(1)
      if (!draw1.success) {
        // If draw fails, it might be due to flower replacement or empty wall
        console.log('Draw 1 failed:', draw1.reason)
      }
      expect(draw1.success).toBe(true)
      const tile1 = game.hands[1][0]
      game.discardTile(1, tile1)
      expect(game.currentPlayer).toBe(2)

      // Player 2: draw then discard
      const draw2 = game.drawTile(2)
      expect(draw2.success).toBe(true)
      const tile2 = game.hands[2][0]
      game.discardTile(2, tile2)
      expect(game.currentPlayer).toBe(3)

      // Player 3: draw then discard
      const draw3 = game.drawTile(3)
      expect(draw3.success).toBe(true)
      const tile3 = game.hands[3][0]
      game.discardTile(3, tile3)
      expect(game.currentPlayer).toBe(0) // back to dealer
    })
  })

  describe('getStateForPlayer', () => {
    it('should return player-specific state with hidden other hands', () => {
      const game = new MahjongGame(players)
      const state = game.getStateForPlayer(0)

      expect(state.myHand).toHaveLength(14) // dealer has 14
      expect(state.myMelds).toEqual([])
      expect(state.otherHands).toHaveLength(4)

      // Own hand should be array of tiles
      expect(Array.isArray(state.otherHands[0])).toBe(true)

      // Other hands should be numbers (tile counts)
      expect(typeof state.otherHands[1]).toBe('number')
      expect(state.otherHands[1]).toBe(13)
    })

    it('should include game metadata', () => {
      const game = new MahjongGame(players)
      const state = game.getStateForPlayer(0)
      expect(state).toHaveProperty('currentPlayer')
      expect(state).toHaveProperty('hasDrawn')
      expect(state).toHaveProperty('tilesLeft')
      expect(state).toHaveProperty('finished')
      expect(state).toHaveProperty('players')
    })
  })

  describe('checkClaims', () => {
    it('should detect pong opportunity', () => {
      const game = new MahjongGame(players)

      // Manually set up a scenario: player 1 has two W1 tiles
      game.hands[1] = ['W1', 'W1', 'T5', 'T6', 'T7', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9']

      // Player 0 discards W1
      game.hands[0].push('W1')
      game.hasDrawn[0] = true
      game.discardTile(0, 'W1')

      const claims = game.checkClaims(0)
      const pongClaim = claims.find(c => c.type === 'pong' && c.playerIndex === 1)
      expect(pongClaim).toBeTruthy()
    })
  })
})
