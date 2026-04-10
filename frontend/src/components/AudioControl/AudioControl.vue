<template>
  <div class="audio-control">
    <button @click="togglePanel" class="audio-toggle">
      {{ bgmEnabled ? '🎵' : '🔇' }}
    </button>
    <div v-if="showPanel" class="audio-panel">
      <div class="audio-row">
        <span class="audio-label">音乐</span>
        <button @click="toggleBGM" class="audio-btn">{{ bgmEnabled ? 'ON' : 'OFF' }}</button>
        <input type="range" min="0" max="1" step="0.1" :value="bgmVolume"
          @input="setBGMVolume($event.target.value)" class="audio-slider" />
      </div>
      <div class="audio-row">
        <span class="audio-label">音效</span>
        <button @click="toggleSFX" class="audio-btn">{{ sfxEnabled ? 'ON' : 'OFF' }}</button>
        <input type="range" min="0" max="1" step="0.1" :value="sfxVolume"
          @input="setSFXVolume($event.target.value)" class="audio-slider" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAudio } from '@/composables/useAudio'

const showPanel = ref(false)
const { bgmVolume, sfxVolume, bgmEnabled, sfxEnabled, toggleBGM, toggleSFX, setBGMVolume, setSFXVolume } = useAudio()

function togglePanel() { showPanel.value = !showPanel.value }
</script>

<style scoped>
.audio-control {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 30;
}
.audio-toggle {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.4);
  font-size: 16px;
  cursor: pointer;
}
.audio-panel {
  position: absolute;
  top: 36px;
  right: 0;
  background: rgba(0,0,0,0.85);
  border-radius: 10px;
  padding: 10px;
  min-width: 180px;
}
.audio-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.audio-row:last-child { margin-bottom: 0; }
.audio-label {
  color: #aaa;
  font-size: 12px;
  width: 28px;
}
.audio-btn {
  padding: 2px 8px;
  border: 1px solid #555;
  border-radius: 6px;
  background: transparent;
  color: #e0e0e0;
  font-size: 11px;
  cursor: pointer;
  width: 36px;
}
.audio-slider {
  flex: 1;
  height: 4px;
  accent-color: #4CAF50;
}
</style>
