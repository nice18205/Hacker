const DIFFICULTIES = {
  easy: { label: "简易", successRate: 0.56, returnDelay: [1100, 1500] },
  normal: { label: "普通", successRate: 0.72, returnDelay: [850, 1250] },
  hard: { label: "困难", successRate: 0.85, returnDelay: [620, 980] },
}

const state = {
  phase: "idle",
  playerScore: 0,
  aiScore: 0,
  targetScore: 7,
  difficulty: "normal",
  rallyCount: 0,
  incomingOwner: null,
  ballStart: 0,
  ballDuration: 0,
  ballTimer: null,
  aiTimer: null,
  animationFrame: null,
}

const playerScoreEl = document.querySelector("#playerScore")
const aiScoreEl = document.querySelector("#aiScore")
const statusTextEl = document.querySelector("#statusText")
const detailTextEl = document.querySelector("#detailText")
const overlayEl = document.querySelector("#overlay")
const overlayTextEl = document.querySelector("#overlayText")
const ballEl = document.querySelector("#ball")
const readyBallEl = document.querySelector("#readyBall")
const rallyCountEl = document.querySelector("#rallyCount")
const startButtonEl = document.querySelector("#startButton")
const restartButtonEl = document.querySelector("#restartButton")
const hitButtonEl = document.querySelector("#hitButton")
const difficultySelectEl = document.querySelector("#difficultySelect")
const targetScoreInputEl = document.querySelector("#targetScoreInput")
const arenaEl = document.querySelector("#arena")

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * (max - min))
}

function clearTimers() {
  if (state.ballTimer) clearTimeout(state.ballTimer)
  if (state.aiTimer) clearTimeout(state.aiTimer)
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
  state.ballTimer = null
  state.aiTimer = null
  state.animationFrame = null
}

function updateScores() {
  playerScoreEl.textContent = String(state.playerScore)
  aiScoreEl.textContent = String(state.aiScore)
  rallyCountEl.textContent = `回合 ${state.rallyCount}`
}

function setStatus(title, detail) {
  statusTextEl.textContent = title
  detailTextEl.textContent = detail
}

function setOverlay(text, visible) {
  overlayTextEl.textContent = text
  overlayEl.classList.toggle("hidden", !visible)
}

function setReadyBall(visible) {
  readyBallEl.classList.toggle("hidden", !visible)
}

function setBallHidden(hidden, ownerClass = "self") {
  ballEl.classList.toggle("hidden", hidden)
  ballEl.classList.toggle("self", ownerClass === "self")
}

function syncControls() {
  const canHit = state.phase === "serve_ready" || state.phase === "incoming_player"
  hitButtonEl.disabled = !canHit
}

function applyBallVisual(progress) {
  const safeProgress = clamp(progress, 0, 1)
  const size = 34 + safeProgress * 92
  const top = 12 + safeProgress * 70
  ballEl.style.width = `${size}px`
  ballEl.style.height = `${size}px`
  ballEl.style.top = `${top}%`
}

function animateIncoming() {
  if (state.phase !== "incoming_player" && state.phase !== "incoming_ai") return
  const elapsed = performance.now() - state.ballStart
  const progress = clamp(elapsed / state.ballDuration, 0, 1)
  applyBallVisual(progress)
  if (progress >= 1) return
  state.animationFrame = requestAnimationFrame(animateIncoming)
}

function finishMatch(winner) {
  state.phase = "finished"
  clearTimers()
  setReadyBall(false)
  setBallHidden(true)
  syncControls()
  if (winner === "player") {
    setStatus("你获胜了", "这版 AI 很基础，但完整框架已经能打通。")
    setOverlay("你获胜", true)
  } else {
    setStatus("AI 获胜", "点击重开可以马上再来一局。")
    setOverlay("AI 获胜", true)
  }
}

function checkWinner() {
  if (state.playerScore >= state.targetScore) {
    finishMatch("player")
    return true
  }
  if (state.aiScore >= state.targetScore) {
    finishMatch("ai")
    return true
  }
  return false
}

function awardPoint(side, reason) {
  if (side === "player") state.playerScore += 1
  if (side === "ai") state.aiScore += 1
  updateScores()
  if (checkWinner()) return
  state.phase = "serve_ready"
  state.incomingOwner = null
  setBallHidden(true)
  setReadyBall(true)
  setOverlay("你先发球", false)
  setStatus(side === "player" ? "你得分" : "AI 得分", reason)
  syncControls()
}

function startIncoming(owner) {
  clearTimers()
  state.incomingOwner = owner
  state.phase = owner === "player" ? "incoming_player" : "incoming_ai"
  state.ballStart = performance.now()
  state.ballDuration = owner === "player" ? 2150 : 1850
  setReadyBall(false)
  setOverlay("", false)
  setBallHidden(false, owner === "player" ? "ai" : "self")
  applyBallVisual(0)
  syncControls()
  if (owner === "player") {
    setStatus("AI 已回球", "球进入红色判定环时立即出手。")
  } else {
    setStatus("球飞向 AI", "等待 AI 简单判断后回球。")
  }
  animateIncoming()

  state.ballTimer = setTimeout(() => {
    if (owner === "player") {
      awardPoint("ai", "你没在判定环内完成回球。")
      return
    }
    runAiDecision()
  }, state.ballDuration)
}

function runAiDecision() {
  const config = DIFFICULTIES[state.difficulty]
  const aiSuccess = Math.random() < config.successRate
  const delay = randomBetween(config.returnDelay[0], config.returnDelay[1])
  state.aiTimer = setTimeout(() => {
    if (aiSuccess) {
      state.rallyCount += 1
      updateScores()
      startIncoming("player")
    } else {
      awardPoint("player", "AI 回球失败。")
    }
  }, delay)
}

function startMatch() {
  clearTimers()
  state.phase = "serve_ready"
  state.playerScore = 0
  state.aiScore = 0
  state.rallyCount = 0
  state.targetScore = clamp(Number(targetScoreInputEl.value) || 7, 3, 15)
  state.difficulty = difficultySelectEl.value
  updateScores()
  setReadyBall(true)
  setBallHidden(true)
  setOverlay("", false)
  setStatus("你先发球", "点击“挥拍 / 回球”、按空格，或触碰球场即可把球打给 AI。")
  syncControls()
  arenaEl.focus()
}

function handlePlayerHit() {
  if (state.phase === "serve_ready") {
    state.rallyCount += 1
    updateScores()
    startIncoming("ai")
    return
  }

  if (state.phase !== "incoming_player") return

  const progress = clamp((performance.now() - state.ballStart) / state.ballDuration, 0, 1)
  const timingDelta = Math.abs(progress - 0.78)
  if (timingDelta <= 0.22) {
    state.rallyCount += 1
    updateScores()
    setStatus("回球成功", timingDelta <= 0.11 ? "这次击球更接近完美时机。" : "成功把球回给了 AI。")
    startIncoming("ai")
  } else {
    awardPoint("ai", progress < 0.78 ? "出手太早了。" : "出手太晚了。")
  }
}

function resetGame() {
  clearTimers()
  state.phase = "idle"
  state.playerScore = 0
  state.aiScore = 0
  state.rallyCount = 0
  updateScores()
  setReadyBall(false)
  setBallHidden(true)
  setOverlay("点击开始", false)
  setStatus("点击开始后，你先发球。", "球进入红色判定环时，点击“挥拍 / 回球”或按空格即可。")
  syncControls()
}

startButtonEl.addEventListener("click", startMatch)
restartButtonEl.addEventListener("click", resetGame)
hitButtonEl.addEventListener("click", handlePlayerHit)
difficultySelectEl.addEventListener("change", () => {
  state.difficulty = difficultySelectEl.value
})
targetScoreInputEl.addEventListener("change", () => {
  targetScoreInputEl.value = String(clamp(Number(targetScoreInputEl.value) || 7, 3, 15))
})
arenaEl.addEventListener("click", handlePlayerHit)
window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return
  event.preventDefault()
  handlePlayerHit()
})

resetGame()
