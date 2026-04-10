import { ref } from 'vue'

const bgmVolume = ref(parseFloat(localStorage.getItem('mahjong_bgm_vol') || '0.3'))
const sfxVolume = ref(parseFloat(localStorage.getItem('mahjong_sfx_vol') || '0.7'))
const bgmEnabled = ref(localStorage.getItem('mahjong_bgm_on') !== 'false')
const sfxEnabled = ref(localStorage.getItem('mahjong_sfx_on') !== 'false')

let bgmElement = null
const sfxCache = {}

function savePrefs() {
  localStorage.setItem('mahjong_bgm_vol', bgmVolume.value)
  localStorage.setItem('mahjong_sfx_vol', sfxVolume.value)
  localStorage.setItem('mahjong_bgm_on', bgmEnabled.value)
  localStorage.setItem('mahjong_sfx_on', sfxEnabled.value)
}

export function useAudio() {
  function init() {
    // Preload sound effects
    const sfxNames = ['draw', 'discard', 'chow', 'pong', 'kong', 'win', 'tingpai']
    for (const name of sfxNames) {
      const audio = new Audio(`/audio/${name}.mp3`)
      audio.preload = 'auto'
      audio.volume = sfxVolume.value
      sfxCache[name] = audio
    }

    // Setup BGM
    bgmElement = new Audio('/audio/bgm.mp3')
    bgmElement.loop = true
    bgmElement.volume = bgmVolume.value
  }

  function playSFX(name) {
    if (!sfxEnabled.value) return
    const cached = sfxCache[name]
    if (!cached) return
    const clone = cached.cloneNode()
    clone.volume = sfxVolume.value
    clone.play().catch(() => {})
  }

  function startBGM() {
    if (!bgmElement || !bgmEnabled.value) return
    bgmElement.play().catch(() => {})
  }

  function stopBGM() {
    if (!bgmElement) return
    bgmElement.pause()
    bgmElement.currentTime = 0
  }

  function toggleBGM() {
    bgmEnabled.value = !bgmEnabled.value
    if (bgmEnabled.value) startBGM()
    else stopBGM()
    savePrefs()
  }

  function toggleSFX() {
    sfxEnabled.value = !sfxEnabled.value
    savePrefs()
  }

  function setBGMVolume(v) {
    bgmVolume.value = v
    if (bgmElement) bgmElement.volume = v
    savePrefs()
  }

  function setSFXVolume(v) {
    sfxVolume.value = v
    savePrefs()
  }

  return {
    bgmVolume, sfxVolume, bgmEnabled, sfxEnabled,
    init, playSFX, startBGM, stopBGM, toggleBGM, toggleSFX,
    setBGMVolume, setSFXVolume
  }
}
