<template>
  <div class="skin-picker">
    <button @click="showPicker = !showPicker" class="skin-toggle">🎨</button>
    <div v-if="showPicker" class="skin-panel" @click.stop>
      <div class="skin-label">桌面</div>
      <div class="skin-options">
        <button
          v-for="skin in allSkins"
          :key="skin.id"
          @click="selectSkin(skin.id)"
          class="skin-dot"
          :class="{ active: currentSkin === skin.id }"
          :style="{ background: skin.dotColor }"
          :title="skin.name"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useTableSkin } from '@/composables/useTableSkin'

const { currentSkin, allSkins, setSkin } = useTableSkin()
const showPicker = ref(false)

function selectSkin(id) {
  setSkin(id)
  showPicker.value = false
}
</script>

<style scoped>
.skin-picker {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 30;
}
.skin-toggle {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.4);
  font-size: 16px;
  cursor: pointer;
}
.skin-panel {
  position: absolute;
  top: 36px;
  left: 0;
  background: rgba(0,0,0,0.85);
  border-radius: 10px;
  padding: 10px;
}
.skin-label {
  color: #aaa;
  font-size: 11px;
  margin-bottom: 6px;
}
.skin-options {
  display: flex;
  gap: 8px;
}
.skin-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 0.2s;
}
.skin-dot.active {
  border-color: #f0d060;
}
</style>
