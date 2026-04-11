import { describe, it, expect, beforeEach } from 'vitest'
import { GameStore } from '../../src/store/GameStore.js'

describe('GameStore', () => {
  let store

  beforeEach(() => {
    store = new GameStore()
  })

  describe('Room creation', () => {
    it('should create a room and return it', () => {
      const room = store.createRoom('socket1')
      expect(room).toBeTruthy()
      expect(room.id).toBeTruthy()
      expect(room.id).toHaveLength(6)
      expect(room.creatorId).toBe('socket1')
    })

    it('should generate unique room IDs', () => {
      const room1 = store.createRoom('s1')
      const room2 = store.createRoom('s2')
      expect(room1.id).not.toBe(room2.id)
    })

    it('should track room count', () => {
      expect(store.getRoomCount()).toBe(0)
      store.createRoom('s1')
      expect(store.getRoomCount()).toBe(1)
    })
  })

  describe('Joining rooms', () => {
    it('should allow a player to join a room', () => {
      const room = store.createRoom('s1')
      const result = store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      expect(result.success).toBe(true)
      expect(result.room.players).toHaveLength(1)
    })

    it('should fail to join non-existent room', () => {
      const result = store.joinRoom('NOEXIST', { id: 's1', name: 'Alice' })
      expect(result.success).toBe(false)
      expect(result.reason).toBe('ROOM_NOT_FOUND')
    })

    it('should fail to join full room', () => {
      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 's2', name: 'B' })
      store.joinRoom(room.id, { id: 's3', name: 'C' })
      store.joinRoom(room.id, { id: 's4', name: 'D' })
      store.joinRoom(room.id, { id: 's5', name: 'E' })
      const result = store.joinRoom(room.id, { id: 's6', name: 'F' })
      expect(result.success).toBe(false)
      expect(result.reason).toBe('ROOM_FULL')
    })

    it('should fail to join room with game in progress', () => {
      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 's1', name: 'A' })
      store.joinRoom(room.id, { id: 's2', name: 'B' })
      room.state = 'playing'
      // Try to join a room that is playing but not full
      const result = store.joinRoom(room.id, { id: 's5', name: 'E' })
      expect(result.success).toBe(false)
      expect(result.reason).toBe('GAME_IN_PROGRESS')
    })

    it('should fail if player already joined', () => {
      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      const result = store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      expect(result.success).toBe(false)
      expect(result.reason).toBe('ALREADY_JOINED')
    })
  })

  describe('Leaving rooms', () => {
    it('should allow player to leave room', () => {
      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      const result = store.leaveRoom('s2')
      expect(result).toBeTruthy()
      expect(result.removedPlayer.name).toBe('Bob')
      expect(room.players).toHaveLength(0)
    })

    it('should delete room when empty', () => {
      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      store.leaveRoom('s2')
      expect(store.getRoom(room.id)).toBeUndefined()
    })

    it('should return null if player not in room', () => {
      const result = store.leaveRoom('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('getRoomByPlayer', () => {
    it('should find room by player socket ID', () => {
      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      const found = store.getRoomByPlayer('s2')
      expect(found).toBeTruthy()
      expect(found.id).toBe(room.id)
    })

    it('should return null if player not in any room', () => {
      expect(store.getRoomByPlayer('nobody')).toBeNull()
    })
  })

  describe('handleDisconnect during game (BUG-3)', () => {
    it('should immediately remove player when sessionId is undefined during game', () => {
      // Set up a room with players
      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 's1', name: 'Alice' })
      store.joinRoom(room.id, { id: 's2', name: 'Bob' })

      // Manually add a player to simulate partial join (no sessionId)
      room.players.push({ id: 's3', name: 'Charlie' })
      store.playerRooms.set('s3', room.id)
      // Note: NOT setting socketSessions for s3 -- simulates failed joinRoom

      // Simulate game in progress
      room.state = 'playing'

      // Disconnect player s3
      const result = store.handleDisconnect('s3')

      // Should NOT be deferred -- should be immediate removal
      expect(result).toBeTruthy()
      expect(result.deferred).toBe(false)
    })

    it('should defer removal when sessionId exists during game', () => {
      const room = store.createRoom('s1')
      const joinResult = store.joinRoom(room.id, { id: 's1', name: 'Alice' })
      store.joinRoom(room.id, { id: 's2', name: 'Bob' })

      // sessionId is set by joinRoom
      expect(joinResult.sessionId).toBeTruthy()

      // Simulate game in progress
      room.state = 'playing'

      const result = store.handleDisconnect('s1')
      expect(result).toBeTruthy()
      expect(result.deferred).toBe(true)
      expect(result.sessionId).toBe(joinResult.sessionId)
    })
  })
})
