<template>
  <div class="quick-chat">
    <button @click="showPanel = !showPanel" class="chat-toggle">💬</button>
    <div v-if="showPanel" class="chat-panel">
      <div class="phrase-grid">
        <button
          v-for="phrase in QUICK_PHRASES"
          :key="phrase"
          @click="sendPhrase(phrase)"
          class="phrase-btn"
        >
          {{ phrase }}
        </button>
      </div>
      <div class="emoji-bar">
        <button
          v-for="emoji in ALLOWED_EMOJIS"
          :key="emoji"
          @click="sendEmoji(emoji)"
          class="emoji-btn"
        >
          {{ emoji }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { getSocket } from '@/utils/socket'
import { QUICK_PHRASES, ALLOWED_EMOJIS } from '@/utils/chatConstants'

const props = defineProps({ roomId: { type: String, required: true } })
const showPanel = ref(false)
const socket = getSocket()

function sendPhrase(phrase) {
  socket.emit('quick_chat', { roomId: props.roomId, phrase })
  showPanel.value = false
}

function sendEmoji(emoji) {
  socket.emit('quick_chat', { roomId: props.roomId, emoji })
  showPanel.value = false
}
</script>

<style scoped>
.quick-chat {
  position: absolute;
  bottom: 120px;
  right: 8px;
  z-index: 25;
}
.chat-toggle {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.4);
  font-size: 18px;
  cursor: pointer;
}
.chat-panel {
  position: absolute;
  bottom: 40px;
  right: 0;
  background: rgba(0,0,0,0.9);
  border-radius: 12px;
  padding: 10px;
  min-width: 200px;
}
.phrase-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 8px;
}
.phrase-btn {
  padding: 6px 8px;
  border: 1px solid #444;
  border-radius: 8px;
  background: transparent;
  color: #e0e0e0;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.phrase-btn:active {
  background: rgba(255,255,255,0.1);
}
.emoji-bar {
  display: flex;
  gap: 4px;
  justify-content: center;
}
.emoji-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
}
.emoji-btn:active {
  background: rgba(255,255,255,0.1);
}
</style>
