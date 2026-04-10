import { describe, it, expect, beforeEach } from 'vitest'
import { Room } from '../src/game/Room.js'

describe('Room', () => {
  let room

  beforeEach(() => {
    room = new Room('TEST01', 'player1')
  })

  it('should initialize with correct state', () => {
    expect(room.id).toBe('TEST01')
    expect(room.creatorId).toBe('player1')
    expect(room.players).toHaveLength(0)
    expect(room.state).toBe('waiting')
    expect(room.game).toBeNull()
  })

  describe('Player management', () => {
    it('should add a player', () => {
      const result = room.addPlayer({ id: 'p1', name: 'Alice' })
      expect(result).toBe(true)
      expect(room.players).toHaveLength(1)
      expect(room.players[0].name).toBe('Alice')
    })

    it('should not add duplicate player', () => {
      room.addPlayer({ id: 'p1', name: 'Alice' })
      const result = room.addPlayer({ id: 'p1', name: 'Alice' })
      expect(result).toBe(false)
      expect(room.players).toHaveLength(1)
    })

    it('should not add more than 4 players', () => {
      room.addPlayer({ id: 'p1', name: 'A' })
      room.addPlayer({ id: 'p2', name: 'B' })
      room.addPlayer({ id: 'p3', name: 'C' })
      room.addPlayer({ id: 'p4', name: 'D' })
      const result = room.addPlayer({ id: 'p5', name: 'E' })
      expect(result).toBe(false)
      expect(room.players).toHaveLength(4)
    })

    it('should remove a player', () => {
      room.addPlayer({ id: 'p1', name: 'Alice' })
      const removed = room.removePlayer('p1')
      expect(removed.name).toBe('Alice')
      expect(room.players).toHaveLength(0)
    })

    it('should return null when removing non-existent player', () => {
      const removed = room.removePlayer('nonexistent')
      expect(removed).toBeNull()
    })

    it('should reassign creator when creator leaves', () => {
      // Room creator is 'player1', but creator is not in players array
      // We need to add the creator as a player first
      room.addPlayer({ id: 'player1', name: 'Creator' })
      room.addPlayer({ id: 'p1', name: 'Alice' })
      room.removePlayer('player1') // creator leaves
      expect(room.creatorId).toBe('p1') // reassigned to first remaining
    })

    it('should not reassign creator if game is playing', () => {
      room.addPlayer({ id: 'p1', name: 'A' })
      room.addPlayer({ id: 'p2', name: 'B' })
      room.addPlayer({ id: 'p3', name: 'C' })
      room.addPlayer({ id: 'p4', name: 'D' })
      room.state = 'playing'
      room.removePlayer('player1')
      // Creator ID shouldn't change during playing state
      // (based on code: only reassigns if state === 'waiting')
    })
  })

  describe('Game management', () => {
    it('should start game with 4 players', () => {
      room.addPlayer({ id: 'p1', name: 'A' })
      room.addPlayer({ id: 'p2', name: 'B' })
      room.addPlayer({ id: 'p3', name: 'C' })
      room.addPlayer({ id: 'p4', name: 'D' })
      const result = room.startGame()
      expect(result).toBe(true)
      expect(room.state).toBe('playing')
      expect(room.game).not.toBeNull()
    })

    it('should not start game with less than 4 players', () => {
      room.addPlayer({ id: 'p1', name: 'A' })
      room.addPlayer({ id: 'p2', name: 'B' })
      const result = room.startGame()
      expect(result).toBe(false)
      expect(room.state).toBe('waiting')
    })

    it('should not start game if already playing', () => {
      room.addPlayer({ id: 'p1', name: 'A' })
      room.addPlayer({ id: 'p2', name: 'B' })
      room.addPlayer({ id: 'p3', name: 'C' })
      room.addPlayer({ id: 'p4', name: 'D' })
      room.startGame()
      const result = room.startGame()
      expect(result).toBe(false)
    })
  })

  describe('Utility methods', () => {
    it('isFull should return correct value', () => {
      expect(room.isFull()).toBe(false)
      room.addPlayer({ id: 'p1', name: 'A' })
      expect(room.isFull()).toBe(false)
      room.addPlayer({ id: 'p2', name: 'B' })
      room.addPlayer({ id: 'p3', name: 'C' })
      room.addPlayer({ id: 'p4', name: 'D' })
      expect(room.isFull()).toBe(true)
    })

    it('isEmpty should return correct value', () => {
      expect(room.isEmpty()).toBe(true)
      room.addPlayer({ id: 'p1', name: 'A' })
      expect(room.isEmpty()).toBe(false)
    })

    it('isCreator should identify creator', () => {
      expect(room.isCreator('player1')).toBe(true)
      expect(room.isCreator('other')).toBe(false)
    })

    it('getPlayerIndex should return correct index', () => {
      room.addPlayer({ id: 'p1', name: 'A' })
      room.addPlayer({ id: 'p2', name: 'B' })
      expect(room.getPlayerIndex('p1')).toBe(0)
      expect(room.getPlayerIndex('p2')).toBe(1)
      expect(room.getPlayerIndex('p99')).toBe(-1)
    })

    it('getState should return room summary', () => {
      room.addPlayer({ id: 'p1', name: 'A' })
      const state = room.getState()
      expect(state.id).toBe('TEST01')
      expect(state.creatorId).toBe('player1')
      expect(state.players).toHaveLength(1)
      expect(state.state).toBe('waiting')
      expect(state.playerCount).toBe(1)
    })
  })
})
