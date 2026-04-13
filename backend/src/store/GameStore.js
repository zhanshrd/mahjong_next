import { Room } from '../game/Room.js';
import { randomBytes } from 'crypto';

// Grace period before a disconnected player is fully removed (ms)
const RECONNECT_GRACE_MS = 60000;

export class GameStore {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map(); // socketId -> roomId
    // Disconnected players eligible for reconnection: sessionId -> { roomId, playerIndex, playerName, oldSocketId, timestamp }
    this.disconnectedPlayers = new Map();
    this.reconnectTimers = new Map(); // sessionId -> timeoutId
    // Map socketId -> sessionId for lookup on disconnect
    this.socketSessions = new Map(); // socketId -> sessionId
    // AI-controlled players: roomId -> Set<playerIndex>
    this.aiControlled = new Map();
    // Optional hook called when a room is destroyed
    this.onRoomDestroyed = null;
  }

  createRoom(creatorId, options = {}) {
    const roomId = this._generateRoomId();
    const room = new Room(roomId, creatorId, options);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomByPlayer(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return null;
    return this.rooms.get(roomId);
  }

  joinRoom(roomId, player, roomPassword = '8888') {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: 'ROOM_NOT_FOUND' };
    if (room.isFull()) return { success: false, reason: 'ROOM_FULL' };
    if (room.state === 'playing') return { success: false, reason: 'GAME_IN_PROGRESS' };
    if ((room.options.roomPassword || '8888') !== (roomPassword || '8888')) {
      return { success: false, reason: 'INVALID_ROOM_PASSWORD' };
    }

    if (!room.addPlayer(player)) {
      return { success: false, reason: 'ALREADY_JOINED' };
    }

    this.playerRooms.set(player.id, roomId);

    // Generate a sessionId for this player
    const sessionId = this._generateSessionId();
    this.socketSessions.set(player.id, sessionId);

    return { success: true, room, sessionId };
  }

  leaveRoom(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRooms.delete(socketId);
      return null;
    }

    const removedPlayer = room.removePlayer(socketId);
    this.playerRooms.delete(socketId);

    if (room.isEmpty()) {
      this.rooms.delete(roomId);
      this.aiControlled.delete(roomId);
      if (this.onRoomDestroyed) this.onRoomDestroyed(roomId);
    }

    return { room, removedPlayer };
  }

  // Called when a player disconnects. For in-game players, defer removal to allow reconnection.
  handleDisconnect(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) {
      // Clean up all tracking maps for this socket
      const sessionId = this.socketSessions.get(socketId);
      if (sessionId) {
        this._cleanupDisconnectEntry(sessionId);
      }
      this.playerRooms.delete(socketId);
      this.socketSessions.delete(socketId);
      return null;
    }

    const playerIndex = room.getPlayerIndex(socketId);

    // If game is in progress, defer removal to allow reconnection
    if (room.state === 'playing' && playerIndex !== -1) {
      const playerName = room.players[playerIndex].name;
      const sessionId = this.socketSessions.get(socketId);

      if (sessionId) {
        this.disconnectedPlayers.set(sessionId, {
          roomId,
          playerIndex,
          playerName,
          oldSocketId: socketId,
          timestamp: Date.now()
        });

        // Clear any existing timer for this session
        if (this.reconnectTimers.has(sessionId)) {
          clearTimeout(this.reconnectTimers.get(sessionId));
        }

        // Set a timer to fully remove the player after grace period
        const timerId = setTimeout(() => {
          this._removeDisconnectedPlayer(sessionId);
        }, RECONNECT_GRACE_MS);

        this.reconnectTimers.set(sessionId, timerId);

        this.playerRooms.delete(socketId);
        this.socketSessions.delete(socketId);

        return { room, playerIndex, playerName, sessionId, deferred: true };
      }

      // No sessionId (join never completed) -- remove immediately to avoid orphaned seat
      this.socketSessions.delete(socketId);
      const immediateResult = this.leaveRoom(socketId);
      return immediateResult ? { ...immediateResult, deferred: false } : { room, playerIndex, playerName, deferred: false };
    }

    // For waiting rooms, remove immediately
    this.socketSessions.delete(socketId);
    const result = this.leaveRoom(socketId);
    return result ? { ...result, deferred: false } : null;
  }

  // Attempt to reconnect a player using sessionId + roomId
  reconnect(newSocketId, sessionId, roomId) {
    const info = this.disconnectedPlayers.get(sessionId);
    if (!info || info.roomId !== roomId) {
      return { success: false, reason: 'NO_SESSION_FOUND' };
    }

    // Reject if the grace period has expired (defense-in-depth against timer race)
    if (Date.now() - info.timestamp > RECONNECT_GRACE_MS) {
      this._cleanupDisconnectEntry(sessionId);
      this._removeDisconnectedPlayer(sessionId);
      return { success: false, reason: 'GRACE_PERIOD_EXPIRED' };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this._cleanupDisconnectEntry(sessionId);
      return { success: false, reason: 'ROOM_NOT_FOUND' };
    }

    // Check the player is still in the room
    if (room.players.length <= info.playerIndex || room.players[info.playerIndex].id !== info.oldSocketId) {
      this._cleanupDisconnectEntry(sessionId);
      return { success: false, reason: 'PLAYER_SLOT_TAKEN' };
    }

    // Re-map the player to the new socket ID
    room.players[info.playerIndex] = { id: newSocketId, name: info.playerName };
    this.playerRooms.set(newSocketId, roomId);
    this.socketSessions.set(newSocketId, sessionId);

    // Update creatorId if this player was the creator
    if (room.creatorId === info.oldSocketId) {
      room.creatorId = newSocketId;
    }

    // Clean up disconnect entry
    this._cleanupDisconnectEntry(sessionId);

    return {
      success: true,
      room,
      playerIndex: info.playerIndex
    };
  }

  _cleanupDisconnectEntry(sessionId) {
    this.disconnectedPlayers.delete(sessionId);
    if (this.reconnectTimers.has(sessionId)) {
      clearTimeout(this.reconnectTimers.get(sessionId));
      this.reconnectTimers.delete(sessionId);
    }
  }

  _removeDisconnectedPlayer(sessionId) {
    const info = this.disconnectedPlayers.get(sessionId);
    if (!info) return;

    const room = this.rooms.get(info.roomId);
    if (room) {
      room.removePlayer(info.oldSocketId);
      if (room.isEmpty()) {
        this.rooms.delete(info.roomId);
        this.aiControlled.delete(info.roomId);
        if (this.onRoomDestroyed) this.onRoomDestroyed(info.roomId);
      }
    }

    this._cleanupDisconnectEntry(sessionId);
  }

  // Mark a player as AI-controlled (disconnected during game)
  setAIControlled(roomId, playerIndex) {
    if (!this.aiControlled.has(roomId)) {
      this.aiControlled.set(roomId, new Set());
    }
    this.aiControlled.get(roomId).add(playerIndex);
  }

  // Remove AI control (player reconnected)
  clearAIControlled(roomId, playerIndex) {
    const set = this.aiControlled.get(roomId);
    if (set) {
      set.delete(playerIndex);
    }
  }

  // Check if a player is AI-controlled
  isAIControlled(roomId, playerIndex) {
    const set = this.aiControlled.get(roomId);
    return set ? set.has(playerIndex) : false;
  }

  _generateSessionId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    const bytes = randomBytes(16);
    for (let i = 0; i < 16; i++) {
      id += chars[bytes[i] % chars.length];
    }
    return id;
  }

  _generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i++) {
      id += chars[bytes[i] % chars.length];
    }

    // Ensure uniqueness
    if (this.rooms.has(id)) {
      return this._generateRoomId();
    }
    return id;
  }

  getRoomCount() {
    return this.rooms.size;
  }

  // Get all rooms (for monitoring/admin purposes)
  getAllRooms() {
    return Array.from(this.rooms.values());
  }

  // Get all rooms visible in the lobby (waiting state with available slots)
  getLobbyRooms() {
    const lobbyRooms = [];
    for (const room of this.rooms.values()) {
      if (room.state === 'waiting' && !room.isFull()) {
        lobbyRooms.push({
          id: room.id,
          players: room.players.map(p => ({ name: p.name })),
          playerCount: room.players.length,
          maxPlayers: 4,
          options: {
            totalRounds: room.options.totalRounds,
            hasPassword: room.options.roomPassword !== '8888'
          },
          createdAt: room.createdAt
        });
      }
    }
    // Sort newest first
    lobbyRooms.sort((a, b) => b.createdAt - a.createdAt);
    return lobbyRooms;
  }

  // Quick join: find the first available room and join it
  quickJoin(player) {
    for (const room of this.rooms.values()) {
      if (room.state === 'waiting' && !room.isFull() && room.options.roomPassword === '8888') {
        if (room.addPlayer(player)) {
          this.playerRooms.set(player.id, room.id);
          const sessionId = this._generateSessionId();
          this.socketSessions.set(player.id, sessionId);
          return { success: true, room, sessionId };
        }
      }
    }
    return { success: false, reason: 'NO_AVAILABLE_ROOM' };
  }

  /**
   * Clean up all timers for a room to prevent memory leaks
   * @param {string} roomId - Room ID to clean up timers for
   */
  cleanupRoomTimers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Clear all reconnect timers for players in this room
    for (const [sessionId, info] of this.disconnectedPlayers.entries()) {
      if (info.roomId === roomId) {
        if (this.reconnectTimers.has(sessionId)) {
          clearTimeout(this.reconnectTimers.get(sessionId));
          this.reconnectTimers.delete(sessionId);
        }
        this.disconnectedPlayers.delete(sessionId);
      }
    }
  }

  /**
   * Destroy a room and clean up all associated resources
   * @param {string} roomId - Room ID to destroy
   */
  destroyRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Clean up timers first (reconnect timers, AI timers, etc.)
    this.cleanupRoomTimers(roomId);
    
    // Clean up AI controlled players
    this.aiControlled.delete(roomId);
    
    // Clean up audit log
    import('../socket/auditLog.js').then(({ clearAuditLog }) => {
      clearAuditLog(roomId);
    });
    
    // Notify destruction hook if set
    if (this.onRoomDestroyed) {
      this.onRoomDestroyed(roomId);
    }
    
    // Remove room from map
    this.rooms.delete(roomId);
    
    // Clean up player mappings
    for (const player of room.players) {
      if (player) {
        this.playerRooms.delete(player.id);
        this.socketSessions.delete(player.id);
      }
    }
    
    // Clean up any remaining disconnect entries for this room
    for (const [sessionId, info] of this.disconnectedPlayers.entries()) {
      if (info.roomId === roomId) {
        this._cleanupDisconnectEntry(sessionId);
      }
    }
  }
}

export const gameStore = new GameStore();
