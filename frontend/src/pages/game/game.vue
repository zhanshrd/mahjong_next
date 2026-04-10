<template>
  <div class="game-table" :class="{ landscape: isLandscape }" :style="skinStyle">
    <!-- Round info bar -->
    <div class="round-bar" v-if="roundNumber > 0">
      <span class="round-info">第{{ roundNumber }}/{{ totalRounds }}局</span>
      <span class="round-wind">{{ roundWindName }}风局</span>
    </div>

    <!-- Skin picker & Audio control -->
    <SkinPicker />
    <AudioControl />

    <!-- Top player (opposite) -->
    <div class="player-area player-top">
      <div class="player-info" :class="{ active: currentPlayer === topPlayerIdx }">
        <span v-if="dealerIndex === topPlayerIdx" class="dealer-badge">庄</span>
        <span class="player-name">{{ topPlayer.name }}</span>
        <span v-if="currentPlayer === topPlayerIdx" class="turn-dot"></span>
      </div>
      <div class="other-hand-top">
        <TileCard
          v-for="(_, i) in topPlayer.handCount"
          :key="'top-' + i"
          back-side
          small
        />
      </div>
      <div class="other-melds" v-if="otherMelds[topPlayerIdx] && otherMelds[topPlayerIdx].length">
        <div class="meld-group" v-for="(meld, mi) in otherMelds[topPlayerIdx]" :key="'tm'+mi">
          <TileCard v-for="(t, ti) in meld" :key="'tmt'+ti" :tile="t" small />
        </div>
      </div>
      <!-- Top player discards (below their hand) -->
      <div class="discard-zone discard-top" v-if="playerDiscards[topPlayerIdx].length">
        <TileCard
          v-for="(tile, i) in playerDiscards[topPlayerIdx]"
          :key="'td'+i"
          :tile="tile"
          small
          :class="{ 'last-discard': isLastDiscard(topPlayerIdx, tile, i) }"
        />
      </div>
    </div>

    <!-- Middle row: left / center / right -->
    <div class="middle-row">
      <!-- Left player -->
      <div class="player-area player-left">
        <div class="player-info" :class="{ active: currentPlayer === leftPlayerIdx }">
          <span v-if="dealerIndex === leftPlayerIdx" class="dealer-badge">庄</span>
          <span class="player-name">{{ leftPlayer.name }}</span>
          <span v-if="currentPlayer === leftPlayerIdx" class="turn-dot"></span>
        </div>
        <div class="side-summary">
          <TileCard mini :mini-count="leftPlayer.handCount" />
          <span class="side-count">{{ leftPlayer.handCount }}张</span>
        </div>
        <div class="other-melds" v-if="otherMelds[leftPlayerIdx] && otherMelds[leftPlayerIdx].length">
          <div class="meld-group" v-for="(meld, mi) in otherMelds[leftPlayerIdx]" :key="'lm'+mi">
            <TileCard v-for="(t, ti) in meld" :key="'lmt'+ti" :tile="t" small />
          </div>
        </div>
        <!-- Left player discards -->
        <div class="discard-zone discard-left" v-if="playerDiscards[leftPlayerIdx].length">
          <TileCard
            v-for="(tile, i) in playerDiscards[leftPlayerIdx]"
            :key="'ld'+i"
            :tile="tile"
            small
            :class="{ 'last-discard': isLastDiscard(leftPlayerIdx, tile, i) }"
          />
        </div>
      </div>

      <!-- Center area: wind indicator + discards info -->
      <div class="center-area">
        <!-- Wind compass indicator -->
        <div class="wind-compass">
          <div class="wind-ring">
            <span class="wind-pos wind-north" :class="{ active: currentPlayer === northIdx }">{{ windLabel(northIdx) }}</span>
            <span class="wind-pos wind-east" :class="{ active: currentPlayer === eastIdx }">{{ windLabel(eastIdx) }}</span>
            <span class="wind-pos wind-south" :class="{ active: currentPlayer === southIdx }">{{ windLabel(southIdx) }}</span>
            <span class="wind-pos wind-west" :class="{ active: currentPlayer === westIdx }">{{ windLabel(westIdx) }}</span>
          </div>
          <div class="compass-center">
            <span class="tiles-count">{{ tilesLeft }}</span>
            <span class="tiles-label">余</span>
          </div>
        </div>
      </div>

      <!-- Right player -->
      <div class="player-area player-right">
        <div class="player-info" :class="{ active: currentPlayer === rightPlayerIdx }">
          <span v-if="dealerIndex === rightPlayerIdx" class="dealer-badge">庄</span>
          <span class="player-name">{{ rightPlayer.name }}</span>
          <span v-if="currentPlayer === rightPlayerIdx" class="turn-dot"></span>
        </div>
        <div class="side-summary">
          <TileCard mini :mini-count="rightPlayer.handCount" />
          <span class="side-count">{{ rightPlayer.handCount }}张</span>
        </div>
        <div class="other-melds" v-if="otherMelds[rightPlayerIdx] && otherMelds[rightPlayerIdx].length">
          <div class="meld-group" v-for="(meld, mi) in otherMelds[rightPlayerIdx]" :key="'rm'+mi">
            <TileCard v-for="(t, ti) in meld" :key="'rmt'+ti" :tile="t" small />
          </div>
        </div>
        <!-- Right player discards -->
        <div class="discard-zone discard-right" v-if="playerDiscards[rightPlayerIdx].length">
          <TileCard
            v-for="(tile, i) in playerDiscards[rightPlayerIdx]"
            :key="'rd'+i"
            :tile="tile"
            small
            :class="{ 'last-discard': isLastDiscard(rightPlayerIdx, tile, i) }"
          />
        </div>
      </div>
    </div>

    <!-- My area (bottom) -->
    <div class="my-area">
      <!-- My discards (above melds) -->
      <div class="discard-zone discard-bottom" v-if="playerDiscards[myIndex].length">
        <TileCard
          v-for="(tile, i) in playerDiscards[myIndex]"
          :key="'md'+i"
          :tile="tile"
          small
          :class="{ 'last-discard': isLastDiscard(myIndex, tile, i) }"
        />
      </div>

      <!-- My melds -->
      <div class="my-melds" v-if="myMelds.length > 0">
        <div class="meld-group" v-for="(meld, i) in myMelds" :key="'mm'+i">
          <TileCard v-for="(t, j) in meld" :key="'mmt'+i+j" :tile="t" small />
        </div>
      </div>

      <!-- My info -->
      <div class="player-info me" :class="{ active: isMyTurn }">
        <span v-if="dealerIndex === myIndex" class="dealer-badge">庄</span>
        <span class="player-name">{{ myName }}</span>
        <span v-if="isMyTurn" class="turn-label">你的回合</span>
      </div>

      <!-- My hand -->
      <div class="my-hand">
        <TileCard
          v-for="(tile, i) in mainHand"
          :key="'h'+i"
          :tile="tile"
          :selectable="isMyTurn && hasDrawn"
          :selected="selectedTile === tile && selectedIndex === i"
          @click="selectTile(tile, i)"
        />
        <!-- Drawn tile shown separately on the right -->
        <div v-if="drawnTile && hasDrawn" class="drawn-tile-gap"></div>
        <TileCard
          v-if="drawnTile && hasDrawn"
          :tile="drawnTile"
          :selectable="isMyTurn"
          :selected="selectedTile === drawnTile && selectedIndex === -1"
          @click="selectDrawnTile"
          class="tile-drawn"
        />
      </div>

      <!-- Action buttons -->
      <div class="my-actions">
        <button v-if="isMyTurn && hasDrawn && selectedTile" @click="discardSelected" class="action-btn discard-btn">
          打出
        </button>
        <button v-if="selfKongTiles.length > 0" @click="doSelfKong(selfKongTiles[0])" class="action-btn kong-btn">
          暗杠
        </button>
        <button v-if="isMyTurn && hasDrawn && !selectedTile" @click="requestTingpai" class="action-btn tingpai-btn">
          听牌提示
        </button>
        <button v-if="tingpaiDetails.length > 0" @click="showTingpai = !showTingpai" class="action-btn tingpai-btn">
          听 {{ tingpaiDetails.length }} 张
        </button>
      </div>
    </div>

    <!-- Claim panel -->
    <div class="claim-panel" v-if="showClaimPanel">
      <div class="claim-title">可声明</div>

      <!-- Chow combo selector -->
      <div class="chow-selector" v-if="showChowSelector && chowOptions.length > 0">
        <div class="chow-hint">选择吃牌组合：</div>
        <div
          v-for="(combo, ci) in chowOptions"
          :key="'chow-'+ci"
          class="chow-combo"
          :class="{ selected: selectedChowCombo === ci }"
          @click="selectedChowCombo = ci"
        >
          <TileCard v-for="(t, ti) in combo" :key="'ct'+ci+ti" :tile="t" small />
        </div>
        <div class="chow-actions">
          <button @click="confirmChow" class="action-btn claim-chow" :disabled="selectedChowCombo < 0">确认吃</button>
          <button @click="cancelChowSelect" class="action-btn pass-btn">取消</button>
        </div>
      </div>

      <!-- Claim type buttons -->
      <div class="claim-options" v-if="!showChowSelector">
        <button
          v-for="claim in myClaimOptions"
          :key="claim.type"
          @click="onClaimClick(claim.type)"
          class="action-btn"
          :class="'claim-' + claim.type"
        >
          {{ claimLabel(claim.type) }}
        </button>
        <button @click="passClaim" class="action-btn pass-btn">过</button>
      </div>
    </div>

    <!-- Tingpai overlay -->
    <div class="tingpai-overlay" v-if="showTingpai && tingpaiDetails.length > 0" @click="showTingpai = false">
      <div class="tingpai-box" @click.stop>
        <div class="tingpai-title">听牌提示</div>
        <div class="tingpai-list">
          <div v-for="item in tingpaiDetails" :key="item.tile" class="tingpai-item">
            <TileCard :tile="item.tile" />
            <div class="tingpai-info">
              <span class="tingpai-remaining">余 {{ item.remaining }} 张</span>
              <span v-if="item.fan" class="tingpai-fan">{{ item.fan }} 番</span>
            </div>
          </div>
        </div>
        <div class="tingpai-hint" @click="showTingpai = false">点击关闭</div>
      </div>
    </div>

    <!-- Turn overlay -->
    <Transition name="fade">
      <div v-if="turnMessage" class="turn-overlay">
        {{ turnMessage }}
      </div>
    </Transition>

    <!-- Game over overlay -->
    <div v-if="finished" class="game-over-overlay">
      <div class="game-over-content">
        <div class="round-label" v-if="roundNumber">第{{ roundNumber }}/{{ totalRounds }}局</div>
        <template v-if="winner !== null">
          <div class="winner-text">
            {{ winner === myIndex ? '你赢了！' : players[winner]?.name + ' 胡牌！' }}
          </div>
          <div v-if="gameOverFan" class="fan-text">{{ gameOverFan }} 番</div>
          <div v-if="gameOverPatterns.length" class="patterns-list">
            <span v-for="p in gameOverPatterns" :key="p.name" class="pattern-tag">
              {{ p.name }} {{ p.fan }}番
            </span>
          </div>
        </template>
        <template v-else>
          <div class="draw-text">流局</div>
        </template>
        <!-- Running scores -->
        <div v-if="matchRunningScores.length" class="running-scores">
          <div v-for="(s, i) in matchRunningScores" :key="i" class="score-item">
            <span class="score-name">{{ players[i]?.name }}</span>
            <span class="score-val">{{ s >= 0 ? '+' : '' }}{{ s }}</span>
          </div>
        </div>
        <button v-if="!matchFinished && isCreator" @click="nextRound" class="action-btn score-btn">下一局</button>
        <button v-if="matchFinished" @click="goToScoreboard" class="action-btn score-btn">查看最终结果</button>
        <button v-if="!matchFinished" @click="goToScoreboard" class="action-btn home-btn">查看本局</button>
        <button @click="goHome" class="action-btn home-btn">返回首页</button>
      </div>
    </div>

    <!-- Quick Chat -->
    <QuickChat v-if="!finished" :roomId="roomId" />
    <ChatBubble
      v-for="bubble in chatBubbles"
      :key="bubble.timestamp"
      :playerIndex="bubble.playerIndex"
      :playerName="bubble.playerName"
      :phrase="bubble.phrase"
      :emoji="bubble.emoji"
      :myIndex="myIndex"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSocket } from '@/utils/socket'
import { useGameStore } from '@/store/game.js'
import { sortTiles } from '@/utils/tileSort.js'
import { useAudio } from '@/composables/useAudio.js'
import { useTableSkin } from '@/composables/useTableSkin.js'
import TileCard from '@/components/TileCard/TileCard.vue'
import AudioControl from '@/components/AudioControl/AudioControl.vue'
import SkinPicker from '@/components/SkinPicker/SkinPicker.vue'
import QuickChat from '@/components/QuickChat/QuickChat.vue'
import ChatBubble from '@/components/QuickChat/ChatBubble.vue'

const route = useRoute()
const router = useRouter()
const socket = getSocket()
const store = useGameStore()
const roomId = computed(() => route.params.roomId)
const { playSFX, init: initAudio, startBGM, stopBGM } = useAudio()
const { skinStyle } = useTableSkin()

// Match/round state
const roundNumber = ref(0)
const totalRounds = ref(1)
const roundWindName = ref('东')
const dealerIndex = ref(0)
const matchRunningScores = ref([])
const matchFinished = ref(false)
const chatBubbles = ref([])
const isCreator = ref(false)

// Game state
const myHand = ref([])
const myMelds = ref([])
const currentPlayer = ref(0)
const hasDrawn = ref(false)
const tilesLeft = ref(0)
const lastDiscard = ref(null)
const lastDiscardPlayer = ref(-1)
const winner = ref(null)
const finished = ref(false)
const players = ref([])
const myIndex = ref(0)
const otherHands = ref([])
const otherMelds = ref([[], [], [], []])

// Per-player discards (indexed by absolute player index)
const playerDiscards = ref([[], [], [], []])

// Claim system state
const claimEligible = ref(false)
const myClaimOptions = ref([]) // [{type: 'win'|'pong'|'chow', tile, chowOptions?}]
const chowOptions = ref([])    // [[tile1, tile2], ...] when chow is available
const showChowSelector = ref(false)
const selectedChowCombo = ref(-1)
const waitingClaimResolution = ref(false)

// Tingpai state
const tingpaiDetails = ref([]) // [{tile, remaining, fan, patterns}]

// UI state
const selectedTile = ref(null)
const selectedIndex = ref(-1)
const currentDrawnTile = ref(null)
const showTingpai = ref(false)
const gameOverFan = ref(null)
const gameOverPatterns = ref([])
const isLandscape = ref(window.innerWidth > window.innerHeight)
const selfKongTiles = ref([]) // tiles that can be used for concealed kong

function resetForNewRound() {
  playerDiscards.value = [[], [], [], []]
  myMelds.value = []
  otherMelds.value = [[], [], [], []]
  chatBubbles.value = []
  tingpaiDetails.value = []
  selfKongTiles.value = []
  clearClaimState()
  lastDiscard.value = null
  lastDiscardPlayer.value = -1
  selectedTile.value = null
  selectedIndex.value = -1
  currentDrawnTile.value = null
  hasDrawn.value = false
  showTingpai.value = false
}

// Sorted hand (excluding the just-drawn tile, shown separately)
const drawnTile = computed(() => {
  if (currentDrawnTile.value && hasDrawn.value) return currentDrawnTile.value
  return null
})

const mainHand = computed(() => {
  if (drawnTile.value) {
    // Remove one instance of the drawn tile from the hand display
    const tiles = [...myHand.value]
    const idx = tiles.lastIndexOf(drawnTile.value)
    if (idx !== -1) tiles.splice(idx, 1)
    return sortTiles(tiles)
  }
  return sortTiles(myHand.value)
})

// Turn logic
const isMyTurn = computed(() => currentPlayer.value === myIndex.value)

// Auto-draw: when it's my turn and I haven't drawn, draw automatically
watch([isMyTurn, hasDrawn], ([myTurn, drawn]) => {
  if (myTurn && !drawn && !finished.value && !claimEligible.value) {
    setTimeout(() => {
      if (isMyTurn.value && !hasDrawn.value && !finished.value && !claimEligible.value) {
        drawTile()
      }
    }, 400)
  }
})

const showClaimPanel = computed(() =>
  claimEligible.value && myClaimOptions.value.length > 0 && !waitingClaimResolution.value
)

const turnMessage = computed(() => {
  if (finished.value) return null
  if (showClaimPanel.value) return null
  if (isMyTurn.value && !hasDrawn.value) return '你的回合 - 请摸牌'
  if (isMyTurn.value && hasDrawn.value && !selectedTile.value) return '请选择要打出的牌'
  return null
})

// Player positions relative to me (clockwise: right=+1, top=+2, left=+3)
const rightPlayerIdx = computed(() => (myIndex.value + 1) % 4)
const topPlayerIdx = computed(() => (myIndex.value + 2) % 4)
const leftPlayerIdx = computed(() => (myIndex.value + 3) % 4)

// Wind positions: 0=East, 1=South, 2=West, 3=North
const eastIdx = computed(() => 0)
const southIdx = computed(() => 1)
const westIdx = computed(() => 2)
const northIdx = computed(() => 3)

function windLabel(idx) {
  const labels = { 0: '东', 1: '南', 2: '西', 3: '北' }
  return labels[idx] || ''
}

function getRelativePlayer(idx) {
  const p = players.value[idx]
  const handInfo = otherHands.value[idx]
  return {
    name: p?.name || '',
    handCount: typeof handInfo === 'number' ? handInfo : (Array.isArray(handInfo) ? handInfo.length : 0)
  }
}

const topPlayer = computed(() => getRelativePlayer(topPlayerIdx.value))
const leftPlayer = computed(() => getRelativePlayer(leftPlayerIdx.value))
const rightPlayer = computed(() => getRelativePlayer(rightPlayerIdx.value))
const myName = computed(() => players.value[myIndex.value]?.name || '我')

// Check if a discard is the most recent one
function isLastDiscard(playerIdx, tile, tileIdx) {
  if (lastDiscardPlayer.value !== playerIdx) return false
  const discards = playerDiscards.value[playerIdx]
  return tile === lastDiscard.value && tileIdx === discards.length - 1
}

// === Socket event handlers ===
onMounted(() => {
  initAudio()
  startBGM()

  // Get creator status from store
  isCreator.value = store.isCreator

  socket.on('game_started', (data) => {
    resetForNewRound()
    myIndex.value = data.playerIndex
    if (data.roundNumber) roundNumber.value = data.roundNumber
    if (data.totalRounds) totalRounds.value = data.totalRounds
    if (data.matchSession) {
      dealerIndex.value = data.matchSession.dealerIndex
      roundWindName.value = data.matchSession.roundWindName
      matchRunningScores.value = data.matchSession.runningScores
      matchFinished.value = data.matchSession.finished
    }
    updateState(data)
    store.gamePhase = 'playing'
  })

  socket.on('game_state_update', (state) => {
    updateState(state)
  })

  socket.on('tile_drawn', (data) => {
    playSFX('draw')
    currentDrawnTile.value = data.tile
    // draw_tile response includes waitingTiles
    if (data.waitingTiles && data.waitingTiles.length) {
      tingpaiDetails.value = data.waitingTiles.map(t =>
        typeof t === 'string'
          ? { tile: t, remaining: 4, fan: null, patterns: [] }
          : t
      )
    }
    if (data.selfKongTiles) selfKongTiles.value = data.selfKongTiles
    updateState(data)
  })

  socket.on('player_drew', (data) => {
    if (data.tilesLeft !== undefined) tilesLeft.value = data.tilesLeft
    if (data.playerIndex !== undefined) {
      const idx = data.playerIndex
      if (typeof otherHands.value[idx] === 'number') {
        otherHands.value[idx] += 1
      }
    }
  })

  socket.on('tile_discarded', (data) => {
    playSFX('discard')
    if (data.playerIndex !== undefined) {
      playerDiscards.value[data.playerIndex] = [
        ...playerDiscards.value[data.playerIndex],
        data.tile
      ]
      lastDiscardPlayer.value = data.playerIndex
    }
    lastDiscard.value = data.tile
    currentPlayer.value = data.nextPlayer
    selectedTile.value = null
    selectedIndex.value = -1
    currentDrawnTile.value = null
    clearClaimState()
    if (data.playerIndex === myIndex.value) {
      const idx = myHand.value.indexOf(data.tile)
      if (idx !== -1) myHand.value.splice(idx, 1)
    } else if (data.playerIndex !== undefined) {
      if (typeof otherHands.value[data.playerIndex] === 'number') {
        otherHands.value[data.playerIndex] -= 1
      }
    }
  })

  // === New claim system ===

  // Sent to eligible player with claim details (chowOptions for chow)
  socket.on('claim_received', (data) => {
    // data: { type, tile, fromPlayer, chowOptions: [[tile1,tile2],...] }
    if (data.type === 'chow' && data.chowOptions && data.chowOptions.length > 0) {
      chowOptions.value = data.chowOptions
    }
  })

  // Legacy fallback: can_claim (some backends still send this)
  socket.on('can_claim', (data) => {
    const claims = data.claims || [{ type: data.type, tile: data.tile }]
    claimEligible.value = true
    myClaimOptions.value = claims
    waitingClaimResolution.value = false
  })

  // Broadcast: a claim was resolved (someone won/ponged/chowed)
  socket.on('claim_resolved', (data) => {
    if (data.type === 'pong') playSFX('pong')
    else if (data.type === 'chow') playSFX('chow')
    else if (data.type === 'kong') playSFX('kong')
    clearClaimState()
    if (data.currentPlayer !== undefined) currentPlayer.value = data.currentPlayer
  })

  // Broadcast: all players declined, next player's turn
  socket.on('claim_declined', (data) => {
    // data: { nextPlayer }
    clearClaimState()
    if (data.nextPlayer !== undefined) currentPlayer.value = data.nextPlayer
  })

  // === Tingpai ===

  socket.on('tingpai_result', (data) => {
    // data: { tiles: [{tile, remaining, fan, patterns}] }
    tingpaiDetails.value = data.tiles || []
    if (tingpaiDetails.value.length > 0) {
      showTingpai.value = true
    }
  })

  // === Game over ===

  socket.on('game_over', (data) => {
    stopBGM()
    if (data.winner !== null) playSFX('win')
    finished.value = true
    winner.value = data.winner
    gameOverFan.value = data.fan || null
    gameOverPatterns.value = data.patterns || []
    store.gamePhase = 'finished'

    // Match session data
    if (data.matchSession) {
      matchRunningScores.value = data.matchSession.runningScores
      matchFinished.value = data.matchSession.finished
      roundNumber.value = data.matchSession.currentRound
      dealerIndex.value = data.matchSession.dealerIndex
    }
  })

  // Quick chat from other players
  socket.on('quick_chat', (data) => {
    chatBubbles.value.push(data)
    if (chatBubbles.value.length > 4) chatBubbles.value.shift()
    // Auto-remove after 3s
    setTimeout(() => {
      chatBubbles.value = chatBubbles.value.filter(b => b.timestamp !== data.timestamp)
    }, 3000)
  })

  socket.on('error', (data) => {
    console.error('Game error:', data.message)
  })

  // Landscape detection
  window.addEventListener('resize', onResize)

  // Request game state
  socket.emit('get_game_state', { roomId: roomId.value })
})

onUnmounted(() => {
  stopBGM()
  const events = [
    'game_started', 'game_state_update', 'tile_drawn', 'player_drew',
    'tile_discarded', 'claim_received', 'can_claim',
    'claim_resolved', 'claim_declined', 'tingpai_result',
    'game_over', 'quick_chat', 'error'
  ]
  events.forEach(e => socket.off(e))
  window.removeEventListener('resize', onResize)
})

function onResize() {
  isLandscape.value = window.innerWidth > window.innerHeight
}

function clearClaimState() {
  claimEligible.value = false
  myClaimOptions.value = []
  chowOptions.value = []
  showChowSelector.value = false
  selectedChowCombo.value = -1
  waitingClaimResolution.value = false
}

function updateState(data) {
  if (data.playerIndex !== undefined) myIndex.value = data.playerIndex
  if (data.myHand) myHand.value = [...data.myHand]
  if (data.myMelds) myMelds.value = [...data.myMelds]
  if (data.otherMelds) otherMelds.value = data.otherMelds
  if (data.currentPlayer !== undefined) currentPlayer.value = data.currentPlayer
  if (data.hasDrawn !== undefined) hasDrawn.value = data.hasDrawn
  if (data.tilesLeft !== undefined) tilesLeft.value = data.tilesLeft
  if (data.lastDiscard !== undefined) lastDiscard.value = data.lastDiscard
  if (data.otherHands) otherHands.value = data.otherHands
  if (data.players) players.value = data.players
  if (data.dealerIndex !== undefined) dealerIndex.value = data.dealerIndex
  if (data.selfKongTiles) selfKongTiles.value = data.selfKongTiles
}

// === Player actions ===

function selectTile(tile, index) {
  if (!isMyTurn.value || !hasDrawn.value) return
  if (selectedTile.value === tile && selectedIndex.value === index) {
    selectedTile.value = null
    selectedIndex.value = -1
  } else {
    selectedTile.value = tile
    selectedIndex.value = index
  }
}

function selectDrawnTile() {
  if (!isMyTurn.value || !hasDrawn.value || !drawnTile.value) return
  if (selectedTile.value === drawnTile.value && selectedIndex === -1) {
    selectedTile.value = null
    selectedIndex.value = -1
  } else {
    selectedTile.value = drawnTile.value
    selectedIndex.value = -1 // -1 means the drawn tile
  }
}

function drawTile() {
  if (!isMyTurn.value || hasDrawn.value) return
  socket.emit('draw_tile', { roomId: roomId.value })
}

function discardSelected() {
  if (!selectedTile.value) return
  socket.emit('discard_tile', { roomId: roomId.value, tile: selectedTile.value })
  selectedTile.value = null
  selectedIndex.value = -1
  currentDrawnTile.value = null
  hasDrawn.value = false
}

function requestTingpai() {
  socket.emit('get_tingpai', { roomId: roomId.value })
}

// === Claim actions ===

function onClaimClick(claimType) {
  if (claimType === 'chow') {
    // If we have chowOptions from claim_received, show selector
    if (chowOptions.value.length > 1) {
      showChowSelector.value = true
      selectedChowCombo.value = 0
    } else if (chowOptions.value.length === 1) {
      // Only one combo, auto-select
      doClaim('chow', chowOptions.value[0])
    } else {
      // No chowOptions received yet, send claim and server will handle
      doClaim('chow')
    }
  } else {
    doClaim(claimType)
  }
}

function doClaim(claimType, chowTiles) {
  const payload = { roomId: roomId.value, claimType }
  if (claimType === 'chow' && chowTiles) {
    payload.chowTiles = chowTiles
  }
  socket.emit('declare_claim', payload)
  waitingClaimResolution.value = true
  showChowSelector.value = false
}

function confirmChow() {
  if (selectedChowCombo.value < 0 || selectedChowCombo.value >= chowOptions.value.length) return
  doClaim('chow', chowOptions.value[selectedChowCombo.value])
}

function cancelChowSelect() {
  showChowSelector.value = false
  selectedChowCombo.value = -1
}

function passClaim() {
  socket.emit('pass_claim', { roomId: roomId.value })
  clearClaimState()
}

function claimLabel(type) {
  const labels = { win: '胡', pong: '碰', chow: '吃', kong: '杠' }
  return labels[type] || type
}

function doSelfKong(tile) {
  socket.emit('self_kong', { roomId: roomId.value, tile })
  selfKongTiles.value = []
}

function goToScoreboard() {
  router.push({ path: `/scoreboard/${roomId.value}`, query: { matchFinished: matchFinished.value ? '1' : '0' } })
}

function goHome() {
  socket.emit('leave_room')
  store.reset()
  router.push('/')
}

function nextRound() {
  finished.value = false
  socket.emit('next_round', { roomId: roomId.value })
}
</script>

<style scoped>
/* ===== Game table ===== */
.game-table {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #1a472a 0%, #0d3320 50%, #0a2a18 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  user-select: none;
}

/* ===== Player areas ===== */
.player-area {
  position: absolute;
  z-index: 2;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 12px;
  font-size: 13px;
  color: #a0b0a0;
  transition: all 0.3s;
}

.player-info.active {
  background: rgba(76, 175, 80, 0.25);
  color: #e0ffe0;
}

.player-info.me {
  margin-bottom: 2px;
}

.player-name {
  font-weight: 600;
}

.turn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f0d060;
  animation: pulse-dot 1s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

.turn-label {
  color: #f0d060;
  font-size: 12px;
  animation: pulse-dot 1.5s infinite;
}

/* ===== Top player ===== */
.player-top {
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.other-hand-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 280px;
}

/* ===== Left/Right players ===== */
.player-left {
  top: 50%;
  left: 8px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.player-right {
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* Simplified side display: mini tile + count */
.side-summary {
  display: flex;
  align-items: center;
  gap: 4px;
}

.side-count {
  font-size: 12px;
  color: #7a9a7a;
  font-weight: 600;
}

.other-melds {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 2px;
}

.meld-group {
  display: flex;
  gap: 1px;
  padding: 2px 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
}

/* ===== Middle row ===== */
.middle-row {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 60px;
  z-index: 1;
}

/* ===== Wind compass ===== */
.wind-compass {
  position: relative;
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}

.wind-ring {
  position: absolute;
  inset: 0;
}

.wind-pos {
  position: absolute;
  font-size: 14px;
  font-weight: 700;
  color: #5a7a5a;
  transition: all 0.3s;
  padding: 2px 6px;
  border-radius: 6px;
}

.wind-pos.active {
  color: #f0d060;
  background: rgba(240, 208, 96, 0.15);
  text-shadow: 0 0 8px rgba(240, 208, 96, 0.5);
}

.wind-north {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
}

.wind-east {
  top: 50%;
  right: 0;
  transform: translateY(-50%);
}

.wind-south {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}

.wind-west {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}

.compass-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tiles-count {
  font-size: 22px;
  font-weight: bold;
  color: #f0d060;
  line-height: 1;
}

.tiles-label {
  font-size: 10px;
  color: #7a9a7a;
}

/* ===== Per-player discard zones ===== */
.discard-zone {
  display: flex;
  flex-wrap: wrap;
  gap: 1px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.12);
  border-radius: 6px;
}

.discard-bottom {
  justify-content: center;
  max-width: 320px;
  margin: 0 auto 4px;
}

.discard-top {
  justify-content: center;
  max-width: 280px;
  margin: 0 auto;
}

.discard-left {
  justify-content: flex-start;
  max-width: 100px;
  max-height: 160px;
  overflow-y: auto;
}

.discard-right {
  justify-content: flex-end;
  max-width: 100px;
  max-height: 160px;
  overflow-y: auto;
}

/* Highlight last discard */
.discard-zone :deep(.last-discard) .tile-card,
.discard-zone :deep(.last-discard.tile-card) {
  outline: 2px solid #f0d060;
  border-radius: 6px;
}

/* ===== Claim panel ===== */
.claim-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 20;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 16px;
  padding: 16px 20px;
  text-align: center;
  min-width: 200px;
}

.claim-title {
  font-size: 14px;
  color: #a0b0a0;
  margin-bottom: 12px;
}

.claim-options {
  display: flex;
  gap: 8px;
  justify-content: center;
}

/* Chow combo selector */
.chow-selector {
  margin-top: 8px;
}

.chow-hint {
  font-size: 12px;
  color: #a0b0a0;
  margin-bottom: 8px;
}

.chow-combo {
  display: flex;
  gap: 2px;
  justify-content: center;
  padding: 6px;
  margin-bottom: 6px;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.05);
  transition: border-color 0.2s;
}

.chow-combo.selected {
  border-color: #9C27B0;
  background: rgba(156, 39, 176, 0.15);
}

.chow-combo:hover {
  background: rgba(255, 255, 255, 0.1);
}

.chow-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-top: 8px;
}

/* ===== My area ===== */
.my-area {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 8px 8px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.5), transparent);
}

.my-melds {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 4px;
}

.my-hand {
  display: flex;
  justify-content: center;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding: 4px;
  max-width: 100vw;
  align-items: center;
}

.drawn-tile-gap {
  width: 12px;
  flex-shrink: 0;
}

.tile-drawn {
  animation: pop-in 0.25s ease-out;
}

@keyframes pop-in {
  from { transform: scale(0.5) translateY(-20px); opacity: 0.3; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}

.my-actions {
  display: flex;
  gap: 6px;
  padding: 4px 0;
  justify-content: center;
}

/* ===== Buttons ===== */
.action-btn {
  padding: 8px 18px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.1s;
}

.action-btn:active {
  transform: scale(0.95);
}

.draw-btn {
  background: #4CAF50;
  color: white;
}

.discard-btn {
  background: #FF9800;
  color: white;
}

.claim-win, .win-btn {
  background: #f44336;
  color: white;
  animation: glow 0.8s infinite alternate;
}

@keyframes glow {
  from { box-shadow: 0 0 4px #f44336; }
  to { box-shadow: 0 0 16px #f44336; }
}

.claim-pong, .pong-btn {
  background: #2196F3;
  color: white;
}

.claim-chow, .chow-btn {
  background: #9C27B0;
  color: white;
}

.claim-kong, .kong-btn {
  background: #FF5722;
  color: white;
}

.pass-btn {
  background: rgba(255, 255, 255, 0.12);
  color: #aaa;
  border: 1px solid #555;
}

.tingpai-btn {
  background: rgba(240, 208, 96, 0.2);
  color: #f0d060;
  border: 1px solid rgba(240, 208, 96, 0.3);
  font-size: 13px;
  padding: 6px 12px;
}

.score-btn {
  background: linear-gradient(135deg, #4CAF50, #2E7D32);
  color: white;
  margin-bottom: 10px;
  width: 100%;
}

.home-btn {
  background: transparent;
  color: #a0c0a0;
  border: 1px solid #3a6b3a;
  width: 100%;
}

/* ===== Tingpai overlay ===== */
.tingpai-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.tingpai-box {
  background: #1a472a;
  border: 1px solid #3a6b3a;
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  max-width: 360px;
  max-height: 80vh;
  overflow-y: auto;
}

.tingpai-title {
  font-size: 18px;
  color: #f0d060;
  margin-bottom: 16px;
}

.tingpai-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tingpai-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.tingpai-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.tingpai-remaining {
  font-size: 13px;
  color: #c0d0c0;
}

.tingpai-fan {
  font-size: 12px;
  color: #f0d060;
  font-weight: 600;
}

.tingpai-hint {
  margin-top: 16px;
  font-size: 12px;
  color: #6c7a6c;
  cursor: pointer;
}

/* ===== Turn overlay ===== */
.turn-overlay {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 10px 24px;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 12px;
  color: #f0d060;
  font-size: 16px;
  font-weight: bold;
  z-index: 10;
  pointer-events: none;
}

.fade-enter-active { transition: opacity 0.3s; }
.fade-leave-active { transition: opacity 0.5s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ===== Game over ===== */
.game-over-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.game-over-content {
  text-align: center;
  min-width: 260px;
  padding: 32px;
}

.winner-text {
  font-size: 32px;
  font-weight: bold;
  color: #f0d060;
  text-shadow: 2px 2px 8px rgba(240, 208, 96, 0.5);
}

.fan-text {
  font-size: 20px;
  color: #e0c060;
  margin-top: 8px;
}

.draw-text {
  font-size: 32px;
  font-weight: bold;
  color: #aaa;
}

.patterns-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-top: 12px;
}

.pattern-tag {
  padding: 4px 10px;
  background: rgba(240, 208, 96, 0.15);
  border: 1px solid rgba(240, 208, 96, 0.3);
  border-radius: 8px;
  font-size: 13px;
  color: #e0c060;
}

/* ===== Landscape optimizations ===== */
@media (orientation: landscape) and (max-height: 500px) {
  .game-table {
    font-size: 13px;
  }

  .player-top {
    top: 2px;
  }

  .other-hand-top {
    max-width: 220px;
  }

  .middle-row {
    padding: 0 50px;
  }

  .wind-compass {
    width: 90px;
    height: 90px;
  }

  .wind-pos {
    font-size: 12px;
  }

  .tiles-count {
    font-size: 18px;
  }

  .my-area {
    padding: 3px 6px 5px;
  }

  .my-hand {
    padding: 2px;
  }

  .player-info {
    padding: 2px 8px;
    font-size: 12px;
  }

  .action-btn {
    padding: 5px 14px;
    font-size: 13px;
  }

  .discard-bottom {
    max-width: 260px;
  }

  .discard-top {
    max-width: 220px;
  }

  .discard-left,
  .discard-right {
    max-height: 120px;
    max-width: 80px;
  }
}

/* ===== Depth / Parallax (near-big far-small) ===== */
.game-table {
  perspective: 1000px;
  perspective-origin: center 80%;
}
.player-top {
  transform: translateX(-50%) scale(0.72);
  opacity: 0.85;
}
.player-left {
  transform: translateY(-50%) scale(0.88);
  opacity: 0.92;
}
.player-right {
  transform: translateY(-50%) scale(0.88);
  opacity: 0.92;
}
.my-area {
  transform: scale(1);
}

/* Table vignette */
.game-table::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center 70%, transparent 30%, rgba(0,0,0,0.25) 100%);
  pointer-events: none;
  z-index: 0;
  border-radius: 0;
}

/* ===== Round info bar ===== */
.round-bar {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 10;
  background: rgba(0,0,0,0.4);
  padding: 4px 14px;
  border-radius: 10px;
}
.round-info {
  font-size: 12px;
  color: var(--accent, #f0d060);
  font-weight: bold;
}
.round-wind {
  font-size: 11px;
  color: var(--sub-text, #7a9a7a);
}

/* ===== Dealer badge ===== */
.dealer-badge {
  display: inline-block;
  padding: 1px 6px;
  background: #f0d060;
  color: #1a472a;
  border-radius: 6px;
  font-size: 10px;
  font-weight: bold;
  margin-right: 4px;
}

/* ===== Running scores ===== */
.running-scores {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  margin: 12px 0;
  padding: 8px;
  background: rgba(255,255,255,0.06);
  border-radius: 8px;
}
.score-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.score-name {
  color: #aaa;
  font-size: 13px;
}
.score-val {
  font-weight: bold;
  font-size: 13px;
}
.round-label {
  font-size: 13px;
  color: #7a9a7a;
  margin-bottom: 8px;
}
</style>
