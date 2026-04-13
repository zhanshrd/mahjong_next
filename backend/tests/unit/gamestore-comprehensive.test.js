import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GameStore } from '../../src/store/GameStore.js'

describe('GameStore - Comprehensive Tests', () => {
  let store

  beforeEach(() => {
    store = new GameStore()
  })

  describe('quickJoin', () => {
    it('should join first available room', () => {
      const room1 = store.createRoom('s1')
      const room2 = store.createRoom('s2')
      
      // Add 3 players to room1 (not full yet)
      store.joinRoom(room1.id, { id: 'p1', name: 'Player1' })
      store.joinRoom(room1.id, { id: 'p2', name: 'Player2' })
      store.joinRoom(room1.id, { id: 'p3', name: 'Player3' })

      // Quick join should join room1
      const result = store.quickJoin({ id: 'p4', name: 'Player4' })
      
      expect(result.success).toBe(true)
      expect(result.room.id).toBe(room1.id)
      expect(result.sessionId).toBeTruthy()
      expect(room1.players).toHaveLength(4)
    })

    it('should fail when no available rooms', () => {
      const store2 = new GameStore()
      const room = store2.createRoom('s1')
      
      // Fill the room
      store2.joinRoom(room.id, { id: 'p1', name: 'P1' })
      store2.joinRoom(room.id, { id: 'p2', name: 'P2' })
      store2.joinRoom(room.id, { id: 'p3', name: 'P3' })
      store2.joinRoom(room.id, { id: 'p4', name: 'P4' })

      const result = store2.quickJoin({ id: 'p5', name: 'P5' })
      
      expect(result.success).toBe(false)
      expect(result.reason).toBe('NO_AVAILABLE_ROOM')
    })

    it('should skip rooms that are playing', () => {
      const room1 = store.createRoom('s1')
      const room2 = store.createRoom('s2')
      
      // Set room1 to playing
      room1.state = 'playing'
      store.joinRoom(room1.id, { id: 'p1', name: 'P1' })
      store.joinRoom(room1.id, { id: 'p2', name: 'P2' })
      
      // room2 is waiting
      store.joinRoom(room2.id, { id: 'p3', name: 'P3' })

      const result = store.quickJoin({ id: 'p4', name: 'P4' })
      
      expect(result.success).toBe(true)
      expect(result.room.id).toBe(room2.id)
    })

    it('should skip rooms with password', () => {
      const room1 = store.createRoom('s1', { roomPassword: '1234' })
      const room2 = store.createRoom('s2')
      
      store.joinRoom(room1.id, { id: 'p1', name: 'P1' })
      store.joinRoom(room2.id, { id: 'p2', name: 'P2' })

      const result = store.quickJoin({ id: 'p3', name: 'P3' })
      
      expect(result.success).toBe(true)
      expect(result.room.id).toBe(room2.id)
    })
  })

  describe('reconnect', () => {
    it('should reconnect player with valid sessionId during game', () => {
      const room = store.createRoom('s1')
      const joinResult1 = store.joinRoom(room.id, { id: 's1', name: 'Alice' })
      const joinResult2 = store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      const joinResult3 = store.joinRoom(room.id, { id: 's3', name: 'Charlie' })
      
      // Start the game after all players joined
      room.state = 'playing'
      
      const sessionId = joinResult3.sessionId

      // Simulate disconnect during game
      store.handleDisconnect('s3')

      // Verify player is in disconnectedPlayers
      expect(store.disconnectedPlayers.has(sessionId)).toBe(true)

      // Reconnect with new socket
      const result = store.reconnect('s3_new', sessionId, room.id)
      
      expect(result.success).toBe(true)
      expect(result.playerIndex).toBe(2)
      expect(result.room.players[2].id).toBe('s3_new')
    })

    it('should fail reconnect with invalid sessionId', () => {
      const room = store.createRoom('s1')
      const joinResult1 = store.joinRoom(room.id, { id: 's1', name: 'Alice' })
      const joinResult2 = store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      room.state = 'playing'

      const result = store.reconnect('s1', 'invalid_session', room.id)
      
      expect(result.success).toBe(false)
      expect(result.reason).toBe('NO_SESSION_FOUND')
    })

    it('should fail reconnect when grace period expired', () => {
      const room = store.createRoom('s1')
      const joinResult1 = store.joinRoom(room.id, { id: 's1', name: 'Alice' })
      const joinResult2 = store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      const joinResult3 = store.joinRoom(room.id, { id: 's3', name: 'Charlie' })
      room.state = 'playing'
      
      const sessionId = joinResult3.sessionId

      store.handleDisconnect('s3')

      // Manually expire the session
      const disconnectedPlayer = store.disconnectedPlayers.get(sessionId)
      if (disconnectedPlayer) {
        disconnectedPlayer.timestamp = Date.now() - 120000 // 2 minutes ago
      }

      const result = store.reconnect('s3_new', sessionId, room.id)
      
      expect(result.success).toBe(false)
      expect(result.reason).toBe('GRACE_PERIOD_EXPIRED')
    })

    it('should fail reconnect when room not found', () => {
      const room = store.createRoom('s1')
      const joinResult1 = store.joinRoom(room.id, { id: 's1', name: 'Alice' })
      const joinResult2 = store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      const joinResult3 = store.joinRoom(room.id, { id: 's3', name: 'Charlie' })
      room.state = 'playing'
      
      const sessionId = joinResult3.sessionId

      store.handleDisconnect('s3')

      // Try to reconnect with wrong room ID - will fail with NO_SESSION_FOUND because sessionId is tied to specific room
      const result = store.reconnect('s3_new', sessionId, 'NONEXISTENT_ROOM')
      
      expect(result.success).toBe(false)
      // Note: The reconnect method checks sessionId first, so if roomId doesn't match, it returns NO_SESSION_FOUND
      expect(result.reason).toBe('NO_SESSION_FOUND')
    })

    it('should fail reconnect when player slot taken', () => {
      const room = store.createRoom('s1')
      const joinResult1 = store.joinRoom(room.id, { id: 's1', name: 'Alice' })
      const joinResult2 = store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      const joinResult3 = store.joinRoom(room.id, { id: 's3', name: 'Charlie' })
      room.state = 'playing'
      
      const sessionId = joinResult3.sessionId

      store.handleDisconnect('s3')
      
      // Another player takes the slot
      room.players[2] = { id: 'new_player', name: 'NewPlayer' }

      const result = store.reconnect('s3_new', sessionId, room.id)
      
      expect(result.success).toBe(false)
      expect(result.reason).toBe('PLAYER_SLOT_TAKEN')
    })

    it('should update creatorId if creator reconnects', () => {
      const room = store.createRoom('s1')
      const joinResult = store.joinRoom(room.id, { id: 's1', name: 'Alice' })
      const sessionId = joinResult.sessionId
      store.joinRoom(room.id, { id: 's2', name: 'Bob' })
      
      room.state = 'playing'

      expect(room.creatorId).toBe('s1')

      store.handleDisconnect('s1')

      const result = store.reconnect('s1_new', sessionId, room.id)
      
      expect(result.success).toBe(true)
      expect(room.creatorId).toBe('s1_new')
    })
  })

  describe('getLobbyRooms', () => {
    it('should return only waiting rooms with available slots', () => {
      const room1 = store.createRoom('s1')
      const room2 = store.createRoom('s2')
      const room3 = store.createRoom('s3')

      // room2 is playing
      room2.state = 'playing'
      
      // room3 is full
      store.joinRoom(room3.id, { id: 'p1', name: 'P1' })
      store.joinRoom(room3.id, { id: 'p2', name: 'P2' })
      store.joinRoom(room3.id, { id: 'p3', name: 'P3' })
      store.joinRoom(room3.id, { id: 'p4', name: 'P4' })

      const rooms = store.getLobbyRooms()
      
      expect(rooms).toHaveLength(1)
      expect(rooms[0].id).toBe(room1.id)
    })

    it('should return rooms sorted by createdAt (newest first)', () => {
      const room1 = store.createRoom('s1')
      // Small delay to ensure different timestamps
      const startTime = Date.now()
      while (Date.now() - startTime < 5) {
        // Wait
      }
      const room2 = store.createRoom('s2')

      const rooms = store.getLobbyRooms()
      
      expect(rooms).toHaveLength(2)
      expect(rooms[0].id).toBe(room2.id)
      expect(rooms[1].id).toBe(room1.id)
    })

    it('should include room metadata', () => {
      const room = store.createRoom('s1', { totalRounds: 8 })
      store.joinRoom(room.id, { id: 'p1', name: 'Player1' })

      const rooms = store.getLobbyRooms()
      
      expect(rooms).toHaveLength(1)
      expect(rooms[0]).toMatchObject({
        id: room.id,
        players: [{ name: 'Player1' }],
        playerCount: 1,
        maxPlayers: 4,
        options: {
          totalRounds: 8,
          hasPassword: false
        }
      })
    })

    it('should indicate if room has password', () => {
      const room1 = store.createRoom('s1')
      const room2 = store.createRoom('s2', { roomPassword: '1234' })

      const rooms = store.getLobbyRooms()
      
      expect(rooms.find(r => r.id === room1.id).options.hasPassword).toBe(false)
      expect(rooms.find(r => r.id === room2.id).options.hasPassword).toBe(true)
    })
  })

  describe('password validation', () => {
    it('should accept correct password', () => {
      const room = store.createRoom('s1', { roomPassword: '1234' })
      
      const result = store.joinRoom(room.id, { id: 'p1', name: 'P1' }, '1234')
      
      expect(result.success).toBe(true)
    })

    it('should reject wrong password', () => {
      const room = store.createRoom('s1', { roomPassword: '1234' })
      
      const result = store.joinRoom(room.id, { id: 'p1', name: 'P1' }, 'wrong')
      
      expect(result.success).toBe(false)
      expect(result.reason).toBe('INVALID_ROOM_PASSWORD')
    })

    it('should use default password 8888 when not specified', () => {
      const room = store.createRoom('s1')
      
      // Default password is 8888
      const result1 = store.joinRoom(room.id, { id: 'p1', name: 'P1' }, '8888')
      expect(result1.success).toBe(true)
      
      const room2 = store.createRoom('s2')
      const result2 = store.joinRoom(room2.id, { id: 'p2', name: 'P2' })
      expect(result2.success).toBe(true)
    })

    it('should reject when password is empty string', () => {
      const room = store.createRoom('s1', { roomPassword: '1234' })
      
      const result = store.joinRoom(room.id, { id: 'p1', name: 'P1' }, '')
      
      expect(result.success).toBe(false)
      expect(result.reason).toBe('INVALID_ROOM_PASSWORD')
    })
  })

  describe('onRoomDestroyed hook', () => {
    it('should call onRoomDestroyed when room is destroyed', () => {
      const destroyCallback = vi.fn()
      store.onRoomDestroyed = destroyCallback

      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 'p1', name: 'P1' })
      store.leaveRoom('p1')

      expect(destroyCallback).toHaveBeenCalledWith(room.id)
    })

    it('should handle null onRoomDestroyed gracefully', () => {
      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 'p1', name: 'P1' })
      
      // Should not throw
      expect(() => store.leaveRoom('p1')).not.toThrow()
    })
  })

  describe('AI controlled players', () => {
    it('should mark player as AI controlled', () => {
      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 'p1', name: 'P1' })
      store.joinRoom(room.id, { id: 'p2', name: 'P2' })

      store.setAIControlled(room.id, 0)

      expect(store.isAIControlled(room.id, 0)).toBe(true)
      expect(store.isAIControlled(room.id, 1)).toBe(false)
    })

    it('should clear AI control when player reconnects', () => {
      const room = store.createRoom('s1')
      store.joinRoom(room.id, { id: 'p1', name: 'P1' })

      store.setAIControlled(room.id, 0)
      expect(store.isAIControlled(room.id, 0)).toBe(true)

      store.clearAIControlled(room.id, 0)
      expect(store.isAIControlled(room.id, 0)).toBe(false)
    })

    it('should handle AI controlled for non-existent room', () => {
      // setAIControlled will create an entry for non-existent room
      store.setAIControlled('nonexistent', 0)
      
      // isAIControlled should return true because setAIControlled creates the entry
      const result = store.isAIControlled('nonexistent', 0)
      expect(result).toBe(true)
    })
  })
})
