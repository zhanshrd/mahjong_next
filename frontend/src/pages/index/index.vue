<template>
  <div class="home">
    <div class="logo-section">
      <div class="logo-tiles">
        <span class="tile-emoji">🀄</span>
      </div>
      <h1 class="title">好友麻将</h1>
      <p class="subtitle">好友约战，随时随地来一局</p>
    </div>

    <div class="actions">
      <div class="name-input">
        <input
          v-model="playerName"
          placeholder="输入你的昵称"
          class="input"
          maxlength="10"
        />
      </div>

      <div class="action-row">
        <div class="round-select">
          <span class="round-label">局数：</span>
          <button @click="totalRounds = 4" class="round-btn" :class="{ active: totalRounds === 4 }">4局</button>
          <button @click="totalRounds = 8" class="round-btn" :class="{ active: totalRounds === 8 }">8局</button>
        </div>

        <div class="password-field">
          <input
            v-model="roomPassword"
            placeholder="口令 (默认8888)"
            class="input input-pwd"
            maxlength="10"
          />
        </div>
      </div>

      <button @click="createRoom" class="btn btn-primary">
        创建房间
      </button>

      <div class="action-row">
        <button @click="quickJoin" class="btn btn-quick" :disabled="!playerName.trim()">
          快速加入
        </button>
        <div class="join-section">
          <input
            v-model="joinRoomId"
            placeholder="房间号"
            class="input input-room"
            maxlength="6"
          />
          <button @click="joinRoom" class="btn btn-secondary" :disabled="!joinRoomId">
            加入
          </button>
        </div>
      </div>
    </div>

    <!-- Room List -->
    <div class="lobby">
      <div class="lobby-header">
        <span class="lobby-title">游戏大厅</span>
        <span class="lobby-count">{{ lobbyRooms.length }} 个房间</span>
      </div>

      <div v-if="lobbyRooms.length === 0" class="lobby-empty">
        暂无空位房间，创建一个吧
      </div>

      <div v-else class="room-list">
        <div
          v-for="room in lobbyRooms"
          :key="room.id"
          class="room-card"
          @click="joinLobbyRoom(room)"
        >
          <div class="room-card-top">
            <span class="room-card-id">{{ room.id }}</span>
            <span class="room-card-rounds">{{ room.options.totalRounds }}局</span>
            <span v-if="room.options.hasPassword" class="room-card-lock">🔒</span>
          </div>
          <div class="room-card-players">
            <span
              v-for="(_, i) in 4"
              :key="i"
              class="player-dot"
              :class="{ filled: i < room.playerCount }"
            ></span>
            <span class="room-card-count">{{ room.playerCount }}/4</span>
          </div>
          <div class="room-card-names">
            <span v-for="(p, i) in room.players" :key="i" class="room-card-name">
              {{ i > 0 ? '、' : '' }}{{ p.name }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Password modal -->
    <div v-if="showPasswordModal" class="modal-overlay" @click.self="showPasswordModal = false">
      <div class="modal-box">
        <div class="modal-title">输入房间口令</div>
        <input
          v-model="modalPassword"
          placeholder="请输入口令"
          class="input"
          maxlength="10"
          @keyup.enter="confirmPasswordJoin"
          autofocus
        />
        <div class="modal-actions">
          <button @click="showPasswordModal = false" class="btn btn-cancel">取消</button>
          <button @click="confirmPasswordJoin" class="btn btn-primary">确认加入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { connectSocket, saveSession, getSavedSession, clearSession } from '@/utils/socket'
import { useToast } from '@/composables/useToast'
import { useGameStore } from '@/store/game'

const DEFAULT_ROOM_PASSWORD = '8888'

const router = useRouter()
const toast = useToast()
const gameStore = useGameStore()
const playerName = ref('')
const joinRoomId = ref('')
const totalRounds = ref(4)
const roomPassword = ref('8888')
const socket = connectSocket()

// Lobby state
const lobbyRooms = ref([])

// Password modal state
const showPasswordModal = ref(false)
const modalPassword = ref('')
const pendingRoomId = ref(null)

function saveLobbyState(data) {
  localStorage.setItem('mahjong_player_name', playerName.value.trim())
  gameStore.roomId = data.roomId
  gameStore.players = data.players || []
  gameStore.isCreator = data.isCreator || false
  gameStore.roomPassword = data.options?.roomPassword || DEFAULT_ROOM_PASSWORD
  gameStore.playerName = playerName.value.trim()
}

function handleRoomCreated(data) {
  saveLobbyState(data)
  if (data.sessionId) saveSession(data.roomId, data.sessionId)
  router.push(`/room/${data.roomId}`)
}

function handleJoinSuccess(data) {
  saveLobbyState(data)
  if (data.sessionId) saveSession(data.roomId, data.sessionId)
  router.push(`/room/${data.roomId}`)
}

function handleJoinFailed(data) {
  toast.show(joinFailedReason(data.reason))
}

function handleLobbyUpdate(data) {
  lobbyRooms.value = data.rooms || []
}

function handleReconnectResult(data) {
  if (data.success) {
    // Reconnection successful - redirect to the appropriate page
    if (data.roomState === 'playing') {
      router.push(`/game/${data.roomId}`)
    } else {
      router.push(`/room/${data.roomId}`)
    }
  } else {
    // Reconnection failed, clear stale session and stay on lobby
    clearSession()
  }
}

onMounted(() => {
  const savedName = localStorage.getItem('mahjong_player_name')
  if (savedName) playerName.value = savedName

  socket.on('room_created', handleRoomCreated)
  socket.on('join_success', handleJoinSuccess)
  socket.on('join_failed', handleJoinFailed)
  socket.on('lobby_update', handleLobbyUpdate)
  socket.on('reconnect_success', handleReconnectResult)
  socket.on('reconnect_failed', handleReconnectResult)

  // Try to reconnect if we have a saved session
  const saved = getSavedSession()
  if (saved) {
    socket.emit('reconnect_request', {
      sessionId: saved.sessionId,
      roomId: saved.roomId
    })
  }

  // Join lobby to receive room list updates
  socket.emit('lobby_join')
})

onUnmounted(() => {
  socket.off('room_created', handleRoomCreated)
  socket.off('join_success', handleJoinSuccess)
  socket.off('join_failed', handleJoinFailed)
  socket.off('lobby_update', handleLobbyUpdate)
  socket.off('reconnect_success', handleReconnectResult)
  socket.off('reconnect_failed', handleReconnectResult)

  socket.emit('lobby_leave')
})

function createRoom() {
  if (!playerName.value.trim()) {
    toast.show('请输入昵称')
    return
  }

  socket.emit('create_room', {
    name: playerName.value.trim(),
    totalRounds: totalRounds.value,
    roomPassword: roomPassword.value.trim() || DEFAULT_ROOM_PASSWORD
  })
}

function joinRoom() {
  if (!playerName.value.trim()) {
    toast.show('请输入昵称')
    return
  }

  if (!joinRoomId.value.trim()) return

  socket.emit('join_room', {
    roomId: joinRoomId.value.trim().toUpperCase(),
    name: playerName.value.trim(),
    roomPassword: DEFAULT_ROOM_PASSWORD
  })
}

function quickJoin() {
  if (!playerName.value.trim()) {
    toast.show('请输入昵称')
    return
  }

  socket.emit('quick_join', {
    name: playerName.value.trim()
  })
}

function joinLobbyRoom(room) {
  if (!playerName.value.trim()) {
    toast.show('请输入昵称')
    return
  }

  if (room.options.hasPassword) {
    pendingRoomId.value = room.id
    modalPassword.value = ''
    showPasswordModal.value = true
  } else {
    socket.emit('join_room', {
      roomId: room.id,
      name: playerName.value.trim(),
      roomPassword: DEFAULT_ROOM_PASSWORD
    })
  }
}

function confirmPasswordJoin() {
  if (!pendingRoomId.value) return

  socket.emit('join_room', {
    roomId: pendingRoomId.value,
    name: playerName.value.trim(),
    roomPassword: modalPassword.value.trim() || DEFAULT_ROOM_PASSWORD
  })

  showPasswordModal.value = false
  pendingRoomId.value = null
}

function joinFailedReason(reason) {
  const map = {
    ROOM_NOT_FOUND: '房间不存在',
    ROOM_FULL: '房间已满',
    GAME_IN_PROGRESS: '游戏正在进行中',
    ALREADY_JOINED: '你已经在这个房间里了',
    INVALID_ROOM_PASSWORD: '房间口令错误',
    NO_AVAILABLE_ROOM: '暂无可用房间，请创建新房间'
  }

  return map[reason] || '加入失败'
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  background: linear-gradient(135deg, #1a472a 0%, #0d2818 100%);
}

.logo-section {
  text-align: center;
  margin-bottom: 24px;
}

.tile-emoji {
  font-size: 48px;
}

.title {
  font-size: 30px;
  font-weight: bold;
  color: #f0d060;
  margin: 6px 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.subtitle {
  color: #a0c0a0;
  font-size: 14px;
}

.actions {
  width: 100%;
  max-width: 420px;
}

.name-input {
  margin-bottom: 12px;
}

.input {
  width: 100%;
  padding: 12px 14px;
  border: 2px solid #3a6b3a;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: #e0e0e0;
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.input:focus {
  border-color: #5a9b5a;
}

.input::placeholder {
  color: #7a9a7a;
}

.action-row {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  align-items: center;
}

.round-select {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.round-label {
  color: #7a9a7a;
  font-size: 13px;
}

.round-btn {
  padding: 6px 14px;
  border: 2px solid #3a6b3a;
  border-radius: 8px;
  background: transparent;
  color: #a0c0a0;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.round-btn.active {
  background: #4caf50;
  color: white;
  border-color: #4caf50;
}

.password-field {
  flex: 1;
}

.input-pwd {
  padding: 6px 10px;
  font-size: 13px;
}

.btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  color: white;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
  margin-bottom: 12px;
}

.btn-primary:active {
  transform: scale(0.98);
}

.btn-quick {
  width: auto;
  padding: 12px 20px;
  background: #ff9800;
  color: white;
  font-size: 14px;
  flex-shrink: 0;
}

.btn-quick:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.join-section {
  display: flex;
  gap: 8px;
  flex: 1;
}

.input-room {
  flex: 1;
  padding: 10px 12px;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-size: 14px;
}

.btn-secondary {
  width: auto;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.12);
  color: #b0d0b0;
  border: 2px solid #3a6b3a;
  font-size: 14px;
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-cancel {
  width: auto;
  padding: 10px 20px;
  background: transparent;
  color: #a0a0a0;
  border: 1px solid #555;
  font-size: 14px;
}

/* ===== Lobby ===== */

.lobby {
  width: 100%;
  max-width: 420px;
  margin-top: 24px;
}

.lobby-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.lobby-title {
  font-size: 18px;
  font-weight: bold;
  color: #f0d060;
}

.lobby-count {
  font-size: 13px;
  color: #7a9a7a;
}

.lobby-empty {
  text-align: center;
  padding: 24px;
  color: #5a7a5a;
  font-size: 14px;
  border: 1px dashed #3a6b3a;
  border-radius: 12px;
}

.room-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-card {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid #3a6b3a;
  border-radius: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.room-card:hover {
  background: rgba(76, 175, 80, 0.1);
  border-color: #5a9b5a;
}

.room-card:active {
  transform: scale(0.99);
}

.room-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.room-card-id {
  font-family: monospace;
  font-size: 16px;
  font-weight: bold;
  color: #f0d060;
  letter-spacing: 2px;
}

.room-card-rounds {
  font-size: 12px;
  color: #a0c0a0;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}

.room-card-lock {
  font-size: 14px;
}

.room-card-players {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.player-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
}

.player-dot.filled {
  background: #4caf50;
}

.room-card-count {
  font-size: 12px;
  color: #7a9a7a;
  margin-left: 4px;
}

.room-card-names {
  font-size: 12px;
  color: #8aaa8a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== Modal ===== */

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-box {
  background: #1a3a2a;
  border: 1px solid #3a6b3a;
  border-radius: 16px;
  padding: 24px;
  width: 300px;
}

.modal-title {
  font-size: 18px;
  font-weight: bold;
  color: #f0d060;
  margin-bottom: 16px;
  text-align: center;
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.modal-actions .btn {
  flex: 1;
}

@media (orientation: landscape) and (max-height: 500px) {
  .logo-section {
    margin-bottom: 12px;
  }
  .tile-emoji {
    font-size: 32px;
  }
  .title {
    font-size: 22px;
  }
}
</style>
