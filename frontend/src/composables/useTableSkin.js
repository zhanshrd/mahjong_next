import { ref, computed } from 'vue'

const SKINS = {
  classic_green: {
    name: '经典绿',
    tableBg: 'linear-gradient(135deg, #1a472a 0%, #0d3320 50%, #0a2a18 100%)',
    tileBack: 'linear-gradient(145deg, #1a5c2e, #0d3d1a)',
    accent: '#f0d060',
    text: '#e0e0e0',
    subText: '#7a9a7a',
    border: '#3a6b3a',
    panelBg: 'rgba(0,0,0,0.85)',
    dotColor: '#1a472a'
  },
  blue_ocean: {
    name: '蓝色海洋',
    tableBg: 'linear-gradient(135deg, #0a2a4a 0%, #0d3347 50%, #082030 100%)',
    tileBack: 'linear-gradient(145deg, #1a3c5e, #0d2a42)',
    accent: '#60c0f0',
    text: '#d0e0f0',
    subText: '#5a7a9a',
    border: '#2a4a6a',
    panelBg: 'rgba(0,0,20,0.85)',
    dotColor: '#0a2a4a'
  },
  red_mahogany: {
    name: '红木',
    tableBg: 'linear-gradient(135deg, #3a1a0a 0%, #4a2010 50%, #2a1008 100%)',
    tileBack: 'linear-gradient(145deg, #5a2a1a, #3a1810)',
    accent: '#f0c060',
    text: '#e0d0c0',
    subText: '#8a6a5a',
    border: '#5a3a2a',
    panelBg: 'rgba(20,0,0,0.85)',
    dotColor: '#3a1a0a'
  },
  dark_night: {
    name: '夜间模式',
    tableBg: 'linear-gradient(135deg, #0a0a1a 0%, #121225 50%, #080815 100%)',
    tileBack: 'linear-gradient(145deg, #1a1a3a, #0d0d25)',
    accent: '#a0a0f0',
    text: '#c0c0d0',
    subText: '#5a5a7a',
    border: '#2a2a4a',
    panelBg: 'rgba(0,0,10,0.9)',
    dotColor: '#0a0a1a'
  }
}

const currentSkin = ref(localStorage.getItem('mahjong_table_skin') || 'classic_green')

export function useTableSkin() {
  const skinVars = computed(() => SKINS[currentSkin.value] || SKINS.classic_green)

  const skinStyle = computed(() => ({
    '--table-bg': skinVars.value.tableBg,
    '--tile-back': skinVars.value.tileBack,
    '--accent': skinVars.value.accent,
    '--text': skinVars.value.text,
    '--sub-text': skinVars.value.subText,
    '--border': skinVars.value.border,
    '--panel-bg': skinVars.value.panelBg
  }))

  const allSkins = computed(() =>
    Object.entries(SKINS).map(([id, s]) => ({ id, name: s.name, dotColor: s.dotColor }))
  )

  function setSkin(id) {
    if (SKINS[id]) {
      currentSkin.value = id
      localStorage.setItem('mahjong_table_skin', id)
    }
  }

  return { currentSkin, skinVars, skinStyle, allSkins, setSkin }
}
