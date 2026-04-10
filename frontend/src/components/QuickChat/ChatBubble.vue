<template>
  <div class="chat-bubble" :class="positionClass">
    <span class="bubble-name">{{ playerName }}</span>
    <span class="bubble-content">{{ phrase || emoji }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  playerIndex: { type: Number, required: true },
  playerName: { type: String, required: true },
  phrase: { type: String, default: null },
  emoji: { type: String, default: null },
  myIndex: { type: Number, required: true }
})

const positionClass = computed(() => {
  const rel = (props.playerIndex - props.myIndex + 4) % 4
  return ['pos-bottom', 'pos-right', 'pos-top', 'pos-left'][rel]
})
</script>

<style scoped>
.chat-bubble {
  position: absolute;
  background: rgba(0,0,0,0.8);
  border-radius: 12px;
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: bubble-float 2.5s ease-out forwards;
  pointer-events: none;
  z-index: 40;
}
.bubble-name {
  font-size: 10px;
  color: #aaa;
}
.bubble-content {
  font-size: 14px;
  color: #f0d060;
  font-weight: bold;
}
.pos-bottom {
  bottom: 30%;
  left: 50%;
  transform: translateX(-50%);
}
.pos-top {
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
}
.pos-left {
  top: 45%;
  left: 15%;
}
.pos-right {
  top: 45%;
  right: 15%;
}

@keyframes bubble-float {
  0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
  15% { opacity: 1; transform: translateX(-50%) translateY(0); }
  70% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
}
</style>
