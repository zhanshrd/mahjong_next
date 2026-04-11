import { io } from 'socket.io-client'

let socket = null

const DEFAULT_SERVER_URL =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'

const SERVER_URL = import.meta.env.VITE_SOCKET_URL || DEFAULT_SERVER_URL

// Session persistence keys
const SESSION_KEY_ROOM = 'mahjong_session_room'
const SESSION_KEY_ID = 'mahjong_session_id'

export function saveSession(roomId, sessionId) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY_ROOM, roomId)
  localStorage.setItem(SESSION_KEY_ID, sessionId)
}

export function clearSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY_ROOM)
  localStorage.removeItem(SESSION_KEY_ID)
}

export function getSavedSession() {
  if (typeof window === 'undefined') return null
  const roomId = localStorage.getItem(SESSION_KEY_ROOM)
  const sessionId = localStorage.getItem(SESSION_KEY_ID)
  if (roomId && sessionId) {
    return { roomId, sessionId }
  }
  return null
}

export function connectSocket() {
  if (socket && socket.connected) {
    return socket
  }

  socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    timeout: 10000
  })

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id)
  })

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason)
  })

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message)
  })

  return socket
}

export function getSocket() {
  if (!socket) {
    return connectSocket()
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
