<template>
  <div
    class="tile-card"
    :class="{
      selected,
      'back-side': backSide,
      small,
      mini,
      selectable
    }"
    @click="handleClick"
  >
    <template v-if="mini">
      <div class="tile-mini">
        <span class="mini-count">{{ miniCount }}</span>
      </div>
    </template>
    <template v-else-if="backSide">
      <div class="tile-back">
        <div class="tile-back-pattern">
          <div class="diamond"></div>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="tile-face" :class="[tileSuitClass, tileSpecificClass]">
        <span class="tile-number">{{ tileNumber }}</span>
        <span class="tile-suit" v-if="tileSuitName">{{ tileSuitName }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tile: { type: String, default: '' },
  selectable: { type: Boolean, default: false },
  backSide: { type: Boolean, default: false },
  small: { type: Boolean, default: false },
  mini: { type: Boolean, default: false },
  miniCount: { type: Number, default: 0 },
  selected: { type: Boolean, default: false }
})

const emit = defineEmits(['click'])

const tileSuitClass = computed(() => {
  if (!props.tile) return ''
  const prefix = props.tile[0]
  const suitMap = { W: 'wan', T: 'tiao', D: 'tong', F: 'wind', J: 'dragon' }
  return suitMap[prefix] || ''
})

const tileSpecificClass = computed(() => {
  if (!props.tile) return ''
  return props.tile
})

const tileNumber = computed(() => {
  if (!props.tile) return ''
  const prefix = props.tile[0]
  if (prefix === 'F') {
    const windNames = { E: '东', S: '南', W: '西', N: '北' }
    return windNames[props.tile.slice(1)] || ''
  }
  if (prefix === 'J') {
    const dragonNames = { C: '中', F: '發' }
    return dragonNames[props.tile.slice(1)] || ''
  }
  const numMap = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
  const num = parseInt(props.tile.slice(1), 10)
  return numMap[num - 1] || ''
})

const tileSuitName = computed(() => {
  if (!props.tile) return ''
  const prefix = props.tile[0]
  if (prefix === 'F' || prefix === 'J') return ''
  const suitNames = { W: '万', T: '条', D: '筒' }
  return suitNames[prefix] || ''
})

function handleClick() {
  if (props.selectable) {
    emit('click', props.tile)
  }
}
</script>

<style scoped>
/* ===== Base tile ===== */
.tile-card {
  width: 48px;
  height: 66px;
  border-radius: 8px;
  margin: 2px;
  transition: transform 0.15s, box-shadow 0.15s;
  background: linear-gradient(145deg, #fff 0%, #f5f0e0 100%);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.2);
  cursor: default;
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
}

.tile-card.selectable {
  cursor: pointer;
}

.tile-card.selectable:hover {
  transform: translateY(-6px);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.3);
}

.tile-card.selected {
  transform: translateY(-12px);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.1), 0 6px 16px rgba(240,208,96,0.4);
  outline: 2px solid #f0d060;
}

/* ===== Sizes ===== */
.tile-card.small {
  width: 28px;
  height: 38px;
  margin: 1px;
}

.tile-card.mini {
  width: 24px;
  height: 24px;
  margin: 1px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.15);
  box-shadow: none;
}

/* ===== Tile face (front) ===== */
.tile-face {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  line-height: 1.1;
  padding: 2px;
}

.tile-number {
  font-size: 20px;
}

.tile-suit {
  font-size: 11px;
  margin-top: 1px;
}

/* Small size face */
.tile-card.small .tile-number {
  font-size: 12px;
}

.tile-card.small .tile-suit {
  font-size: 8px;
}

/* ===== Suit colors ===== */
/* 万 - Red */
.tile-face.wan .tile-number,
.tile-face.wan .tile-suit {
  color: #c41e3a;
}

/* 条 - Green */
.tile-face.tiao .tile-number,
.tile-face.tiao .tile-suit {
  color: #1b7a2b;
}

/* 筒 - Blue */
.tile-face.tong .tile-number,
.tile-face.tong .tile-suit {
  color: #1a5fb4;
}

/* 风 - Black */
.tile-face.wind .tile-number {
  color: #222;
  font-size: 22px;
}

.tile-card.small .tile-face.wind .tile-number {
  font-size: 14px;
}

/* 中 - Red */
.tile-face.dragon.JC .tile-number {
  color: #c41e3a;
  font-size: 26px;
}

/* 發 - Green */
.tile-face.JF .tile-number {
  color: #1b7a2b;
  font-size: 22px;
}

/* 白 - Gray border + empty */
.tile-face.JW {
  border: 1px solid #aaa;
  border-radius: 6px;
}

.tile-card.small .tile-face.dragon .tile-number {
  font-size: 16px;
}

/* ===== Tile back ===== */
.tile-card.back-side {
  background: linear-gradient(145deg, #1a5c2e, #0d3d1a);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.tile-back {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tile-back-pattern {
  width: 60%;
  height: 60%;
  position: relative;
}

.tile-back-pattern .diamond {
  width: 100%;
  height: 100%;
  background: linear-gradient(145deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05));
  border: 1px solid rgba(255,255,255,0.12);
  transform: rotate(45deg);
  border-radius: 3px;
}

.tile-card.small .tile-back-pattern {
  width: 50%;
  height: 50%;
}

/* ===== Mini mode ===== */
.tile-mini {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-count {
  font-size: 11px;
  font-weight: bold;
  color: #ccc;
}
</style>
