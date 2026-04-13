import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'

export const useGameStore = defineStore('game', () => {
  // 使用 shallowRef 优化大型对象
  const roomId = ref('')
  const playerName = ref('')
  const playerIndex = ref(-1)
  const players = shallowRef([])
  const isCreator = ref(false)
  const roomPassword = ref('8888')

  // Game state
  const myHand = shallowRef([])
  const myMelds = shallowRef([])
  const discardPile = shallowRef([])
  const currentPlayer = ref(0)
  const hasDrawn = ref(false)
  const tilesLeft = ref(0)
  const lastDiscard = ref(null)
  const winner = ref(null)
  const finished = ref(false)

  // UI state
  const selectedTile = ref(null)
  const currentDrawnTile = ref(null)
  const availableClaims = shallowRef([])
  const gamePhase = ref('lobby') // lobby | waiting | playing | finished

  const isMyTurn = computed(() => currentPlayer.value === playerIndex.value)
  const otherHands = shallowRef([])

  function reset() {
    roomId.value = ''
    playerName.value = ''
    playerIndex.value = -1
    players.value = []
    isCreator.value = false
    roomPassword.value = '8888'
    myHand.value = []
    myMelds.value = []
    discardPile.value = []
    currentPlayer.value = 0
    hasDrawn.value = false
    tilesLeft.value = 0
    lastDiscard.value = null
    winner.value = null
    finished.value = false
    selectedTile.value = null
    currentDrawnTile.value = null
    availableClaims.value = []
    gamePhase.value = 'lobby'
    otherHands.value = []
  }

  function updateFromServer(state) {
    if (state.myHand) myHand.value = [...state.myHand]
    if (state.myMelds) myMelds.value = [...state.myMelds]
    if (state.discardPile) discardPile.value = [...state.discardPile]
    if (state.currentPlayer !== undefined) currentPlayer.value = state.currentPlayer
    if (state.hasDrawn !== undefined) hasDrawn.value = state.hasDrawn
    if (state.tilesLeft !== undefined) tilesLeft.value = state.tilesLeft
    if (state.lastDiscard !== undefined) lastDiscard.value = state.lastDiscard
    if (state.winner !== undefined) winner.value = state.winner
    if (state.finished !== undefined) finished.value = state.finished
    if (state.otherHands) otherHands.value = state.otherHands
    if (state.players) players.value = state.players
  }

  return {
    roomId, playerName, playerIndex, players, isCreator, roomPassword,
    myHand, myMelds, discardPile, currentPlayer, hasDrawn,
    tilesLeft, lastDiscard, winner, finished,
    selectedTile, currentDrawnTile, availableClaims, gamePhase,
    isMyTurn, otherHands,
    reset, updateFromServer
  }
})
