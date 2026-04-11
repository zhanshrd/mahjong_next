import { ref } from 'vue'

const bgmVolume = ref(parseFloat(localStorage.getItem('mahjong_bgm_vol') || '0.3'))
const sfxVolume = ref(parseFloat(localStorage.getItem('mahjong_sfx_vol') || '0.7'))
const bgmEnabled = ref(localStorage.getItem('mahjong_bgm_on') !== 'false')
const sfxEnabled = ref(localStorage.getItem('mahjong_sfx_on') !== 'false')

let bgmElement = null
const sfxCache = {}
let audioInitialized = false
let audioUnlocked = false

function savePrefs() {
  localStorage.setItem('mahjong_bgm_vol', bgmVolume.value)
  localStorage.setItem('mahjong_sfx_vol', sfxVolume.value)
  localStorage.setItem('mahjong_bgm_on', bgmEnabled.value)
  localStorage.setItem('mahjong_sfx_on', sfxEnabled.value)
}

function unlockAudio() {
  if (audioUnlocked) return
  // Create and immediately play a silent buffer to unlock audio context
  try {
    const silent = new Audio()
    silent.play().then(() => {
      audioUnlocked = true
    }).catch(() => {})
  } catch (e) {
    // Ignore
  }
}

let listenersAdded = false

export function useAudio() {
  function init() {
    if (audioInitialized) return
    audioInitialized = true

    // Prevent duplicate listener registration across multiple init() calls
    if (listenersAdded) return
    listenersAdded = true

    // Unlock audio on first user interaction
    const unlockHandler = () => {
      unlockAudio()
      document.removeEventListener('click', unlockHandler)
      document.removeEventListener('touchstart', unlockHandler)
    }
    document.addEventListener('click', unlockHandler, { once: true })
    document.addEventListener('touchstart', unlockHandler, { once: true })

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
