import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../game.js'

describe('useGameStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with default values', () => {
    const store = useGameStore()
    expect(store.roomId).toBe('')
    expect(store.playerName).toBe('')
    expect(store.playerIndex).toBe(-1)
    expect(store.players).toEqual([])
    expect(store.isCreator).toBe(false)
    expect(store.gamePhase).toBe('lobby')
    expect(store.finished).toBe(false)
    expect(store.winner).toBe(null)
  })

  it('isMyTurn returns false when playerIndex is -1', () => {
    const store = useGameStore()
    store.currentPlayer = 0
    expect(store.isMyTurn).toBe(false)
  })

  it('isMyTurn returns true when currentPlayer matches playerIndex', () => {
    const store = useGameStore()
    store.playerIndex = 2
    store.currentPlayer = 2
    expect(store.isMyTurn).toBe(true)
  })

  it('isMyTurn returns false when currentPlayer differs from playerIndex', () => {
    const store = useGameStore()
    store.playerIndex = 1
    store.currentPlayer = 3
    expect(store.isMyTurn).toBe(false)
  })

  it('reset() restores all state to defaults', () => {
    const store = useGameStore()
    store.roomId = 'ABC123'
    store.playerName = 'TestPlayer'
    store.playerIndex = 0
    store.players = [{ id: '1', name: 'P1' }]
    store.isCreator = true
    store.gamePhase = 'playing'
    store.myHand = ['W1', 'W2', 'W3']
    store.currentPlayer = 2
    store.hasDrawn = true
    store.winner = 0
    store.finished = true

    store.reset()

    expect(store.roomId).toBe('')
    expect(store.playerName).toBe('')
    expect(store.playerIndex).toBe(-1)
    expect(store.players).toEqual([])
    expect(store.isCreator).toBe(false)
    expect(store.gamePhase).toBe('lobby')
    expect(store.myHand).toEqual([])
    expect(store.currentPlayer).toBe(0)
    expect(store.hasDrawn).toBe(false)
    expect(store.winner).toBe(null)
    expect(store.finished).toBe(false)
  })

  it('updateFromServer sets state from server payload', () => {
    const store = useGameStore()
    store.updateFromServer({
      myHand: ['W1', 'T5', 'D3'],
      currentPlayer: 1,
      hasDrawn: true,
      tilesLeft: 60,
      winner: null,
      finished: false,
      players: [
        { id: 's1', name: 'Alice' },
        { id: 's2', name: 'Bob' }
      ]
    })

    expect(store.myHand).toEqual(['W1', 'T5', 'D3'])
    expect(store.currentPlayer).toBe(1)
    expect(store.hasDrawn).toBe(true)
    expect(store.tilesLeft).toBe(60)
    expect(store.winner).toBe(null)
    expect(store.finished).toBe(false)
    expect(store.players.length).toBe(2)
    expect(store.players[0].name).toBe('Alice')
  })

  it('updateFromServer only updates fields present in payload', () => {
    const store = useGameStore()
    store.myHand = ['W1']
    store.currentPlayer = 0

    store.updateFromServer({ currentPlayer: 3 })

    expect(store.myHand).toEqual(['W1']) // unchanged
    expect(store.currentPlayer).toBe(3)   // updated
  })

  it('gamePhase transitions correctly', () => {
    const store = useGameStore()
    expect(store.gamePhase).toBe('lobby')

    store.gamePhase = 'waiting'
    expect(store.gamePhase).toBe('waiting')

    store.gamePhase = 'playing'
    expect(store.gamePhase).toBe('playing')

    store.gamePhase = 'finished'
    expect(store.gamePhase).toBe('finished')
  })

  it('updateFromServer handles otherHands array', () => {
    const store = useGameStore()
    store.updateFromServer({
      otherHands: [13, 13, 13]
    })
    expect(store.otherHands).toEqual([13, 13, 13])
  })

  it('reset clears otherHands', () => {
    const store = useGameStore()
    store.otherHands = [13, 12, 14]
    store.reset()
    expect(store.otherHands).toEqual([])
  })
})
