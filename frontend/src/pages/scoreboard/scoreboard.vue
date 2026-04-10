<template>
  <div class="scoreboard">
    <h1 class="title">{{ matchFinished ? '最终结算' : '本局结算' }}</h1>

    <!-- Single round result -->
    <div v-if="!matchFinished && lastRound" class="round-result">
      <div class="round-header">第{{ lastRound.round }}局</div>
      <div class="result-players">
        <div v-for="(player, i) in playerNames" :key="i" class="result-row" :class="getResultClass(i)">
          <span class="result-name">{{ player }}</span>
          <span v-if="lastRound.winner === i" class="result-badge win">胡牌</span>
          <span v-else-if="lastRound.isDraw" class="result-badge draw">流局</span>
          <span class="result-score">{{ lastRound.scores[i] >= 0 ? '+' : '' }}{{ lastRound.scores[i] }}</span>
        </div>
      </div>
      <div v-if="lastRound.fan" class="fan-info">{{ lastRound.fan }}番</div>
    </div>

    <!-- All rounds table -->
    <div v-if="roundResults.length > 0" class="rounds-table">
      <div class="table-header">
        <span class="col-round">局</span>
        <span v-for="name in playerNames" :key="name" class="col-player">{{ name }}</span>
      </div>
      <div v-for="result in roundResults" :key="result.round" class="table-row">
        <span class="col-round">{{ result.round }}</span>
        <span v-for="(score, i) in result.scores" :key="i" class="col-score" :class="scoreClass(score, result.winner === i)">
          {{ score >= 0 ? '+' : '' }}{{ score }}
        </span>
      </div>
      <div class="table-row total-row">
        <span class="col-round">总计</span>
        <span v-for="(total, i) in runningScores" :key="'t'+i" class="col-score total-score">
          {{ total }}
        </span>
      </div>
    </div>

    <div class="actions">
      <button v-if="!matchFinished" @click="nextRound" class="btn btn-primary">下一局</button>
      <button @click="goHome" class="btn btn-secondary">返回首页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSocket } from '@/utils/socket'

const route = useRoute()
const router = useRouter()
const socket = getSocket()
const roomId = computed(() => route.params.roomId)
const matchFinished = ref(route.query.matchFinished === '1')

const roundResults = ref([])
const runningScores = ref([0, 0, 0, 0])
const playerNames = ref(['', '', '', ''])
const lastRound = computed(() => roundResults.value[roundResults.value.length - 1] || null)

onMounted(() => {
  // Listen for match data
  socket.on('game_over', (data) => {
    if (data.matchSession) {
      roundResults.value = data.matchSession.roundResults
      runningScores.value = data.matchSession.runningScores
      playerNames.value = data.matchSession.players || playerNames.value
      matchFinished.value = data.matchSession.finished
    }
  })

  socket.on('match_finished', (data) => {
    roundResults.value = data.roundResults
    runningScores.value = data.runningScores
    playerNames.value = data.players || playerNames.value
    matchFinished.value = true
  })

  // Request current state
  socket.emit('get_room_state', { roomId: roomId.value })
})

function scoreClass(score, isWinner) {
  if (isWinner) return 'winner-score'
  if (score > 0) return 'positive'
  if (score < 0) return 'negative'
  return ''
}

function getResultClass(i) {
  if (!lastRound.value) return ''
  if (lastRound.value.winner === i) return 'winner-row'
  return ''
}

function nextRound() {
  socket.emit('next_round', { roomId: roomId.value })
  router.push(`/game/${roomId.value}`)
}

function goHome() {
  socket.emit('leave_room')
  router.push('/')
}
</script>

<style scoped>
.scoreboard {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px 16px;
  background: linear-gradient(135deg, #1a472a 0%, #0d2818 100%);
}

.title {
  font-size: 28px;
  font-weight: bold;
  color: #f0d060;
  margin-bottom: 20px;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
}

/* Single round result */
.round-result {
  width: 100%;
  max-width: 360px;
  background: rgba(255,255,255,0.06);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 16px;
}

.round-header {
  text-align: center;
  color: #a0c0a0;
  font-size: 14px;
  margin-bottom: 12px;
}

.result-row {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.result-row:last-child { border-bottom: none; }
.winner-row { background: rgba(240,208,96,0.08); border-radius: 8px; padding: 8px 8px; }

.result-name {
  flex: 1;
  font-size: 16px;
  color: #e0e0e0;
}

.result-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  margin-right: 8px;
}
.result-badge.win { background: #4CAF50; color: white; }
.result-badge.draw { background: #888; color: white; }

.result-score {
  font-size: 18px;
  font-weight: bold;
  color: #f0d060;
}

.fan-info {
  text-align: center;
  color: #e0c060;
  font-size: 14px;
  margin-top: 8px;
}

/* Multi-round table */
.rounds-table {
  width: 100%;
  max-width: 420px;
  background: rgba(255,255,255,0.06);
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 20px;
}

.table-header, .table-row {
  display: flex;
  padding: 10px 12px;
}

.table-header {
  background: rgba(0,0,0,0.2);
  font-size: 12px;
  color: #8a8a8a;
}

.table-row {
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 14px;
}

.total-row {
  background: rgba(240,208,96,0.08);
  border-bottom: none;
  font-weight: bold;
}

.col-round {
  width: 40px;
  color: #7a9a7a;
  font-size: 12px;
}

.col-player {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: #bbb;
}

.col-score {
  flex: 1;
  text-align: center;
  font-size: 14px;
  color: #ccc;
}

.col-score.positive { color: #4CAF50; }
.col-score.negative { color: #f44336; }
.col-score.winner-score { color: #f0d060; font-weight: bold; }
.total-score { color: #f0d060 !important; font-size: 16px; }

/* Buttons */
.actions {
  width: 100%;
  max-width: 360px;
}

.btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  margin-bottom: 10px;
}

.btn-primary {
  background: linear-gradient(135deg, #4CAF50, #2E7D32);
  color: white;
}

.btn-secondary {
  background: transparent;
  color: #a0c0a0;
  border: 2px solid #3a6b3a;
}
</style>
