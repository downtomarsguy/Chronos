<template>
  <div class="bg-zinc-950">
    <div class="bg-zinc-950 bg-opacity-80">
      <div
        class="app bg-zinc-950 bg-opacity-80 h-screen w-full relative overflow-hidden select-none flex items-center justify-center"
        @contextmenu.prevent @mousedown="onMouseDown" @touchstart="onTouchStart" @mouseup="onMouseUp"
        @touchend="onTouchEnd" @mousemove="onMouseMove" @touchmove="onTouchMove">

        <canvas ref="canvas" class="absolute inset-0"></canvas>

        <div
          class="w-full h-screen bg-zinc-950 relative overflow-hidden select-none flex items-center justify-center transition-colors duration-500 ease-in-out"
          :class="{ 'bg-opacity-70': blurLevel === 70, 'bg-opacity-90': blurLevel === 90, 'bg-opacity-0': blurLevel === 0 }">

          <div ref="stopwatchCard"
            class="stopwatch-card bg-white bg-opacity-10 py-4 px-6 border-[1px] border-[#ffffff80] rounded-md backdrop-blur-sm backdrop-opacity-30 z-20 flex flex-col items-center">

            <div class="relative">
              <canvas ref="matrixCanvas"
                class="absolute inset-0 pointer-events-none transition-opacity duration-500 z-10"></canvas>

              <div ref="timeDisplay"
                class="time-display suse-mono text-6xl font-bold text-white tracking-widest my-6 relative z-20 transition-opacity duration-500 flex items-center justify-center leading-none">

                <span v-for="(char, index) in displayChars" :key="index"
                  :class="['digit-span', getAnimationClass(index)]" :style="getGlowStyle(index)">
                  {{ char }}
                </span>

              </div>
            </div>
          </div>
        </div>

        <div ref="wheelRef" class="wheel z-30" :class="{ 'on': showing }" :data-chosen="chosenIndex"
          :style="{ '--x': `${wheelX}px`, '--y': `${wheelY}px` }">

          <div v-for="(item, index) in menuItems" :key="index" class="arc" :style="{
            '--rotation': `${-22.5 + index * 45}deg`,
            '--color': 'rgba(20, 184, 166, 0.4)',
            '--color-border': 'rgba(20, 184, 166, 0.6)',
            'transition-delay': `${(index % 2) * 0.015}s`
          }">
            <Icon :name="item.icon" class="arc-icon" />
          </div>
        </div>

        <div v-show="showHelpOverlay" ref="helpOverlay"
          class="help-overlay z-40 fixed bottom-4 left-4 bg-zinc-900 bg-opacity-90 p-4 rounded-md border border-[#ffffff40] backdrop-blur-sm max-w-sm transition-all duration-300 ease-in-out"
          @click="toggleHelpOverlay">

          <div ref="helpContent" class="help-content">
            <h3 class="text-white font-bold text-lg mb-3 suse-mono">Keybinds & Controls</h3>

            <ul class="text-white text-sm space-y-2 suse-mono">
              <li><strong class="keyboard-font">Space</strong>: Play/Pause Timer</li>
              <li><strong class="keyboard-font">R</strong>: Reset Timer</li>
              <li><strong class="keyboard-font">F</strong>: Toggle Fullscreen</li>
              <li><strong class="keyboard-font">B</strong>: Cycle Blur Modes (No → Half → Full)</li>
              <li><strong class="keyboard-font">H</strong>: Toggle Help</li>
              <li><strong class="">Right-Click / Long-Press</strong>: Open Radial Menu</li>
              <li><strong class="">Radial Menu Options</strong>:</li>
              <ul class="ml-4 text-xs space-y-1">
                <li>Reset | Full Screen | Help | Full Blur | Half Blur | No Blur | Code | Play/Pause</li>
              </ul>
            </ul>

            <p class="text-xs text-gray-300 mt-3">Click anywhere to close</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue'
import { useHead } from '#imports'
export default {
  name: 'RadialMenuStopwatch',
  setup() {
    useHead({
      link: [
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com'
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: ''
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Libertinus+Keyboard&family=SUSE+Mono:ital,wght@0,100..800;1,100..800&display=swap'
        },
      ]
    })

    const wheelRef = ref(null)
    const canvas = ref(null)
    const stopwatchCard = ref(null)
    const timeDisplay = ref(null)
    const helpOverlay = ref(null)
    const helpContent = ref(null)
    const showHelpOverlay = ref(false)
    const showing = ref(false)
    const anchorX = ref(0)
    const anchorY = ref(0)
    const wheelX = ref(0)
    const wheelY = ref(0)
    const chosenIndex = ref(0)
    const min = 100

    const ctx = ref(null)
    const nodes = ref([])
    const edges = ref([])
    const mouse = ref({ x: 0, y: 0 })
    const interactionRange = 25
    const moveAwayStrength = 0.1
    const friction = 0.98
    const disconnectionThreshold = 150

    const menuItems = ref([
      { icon: 'material-symbols:restart-alt', label: 'Reset' },
      { icon: 'line-md:monitor-screenshot-twotone', label: 'Full Screen' },
      { icon: 'line-md:question-square-twotone', label: 'Help' },
      { icon: 'line-md:star-twotone', label: 'Full Blur' },
      { icon: 'line-md:star-twotone-half', label: 'Half Blur' },
      { icon: 'line-md:star-alt', label: 'No Blur' },
      { icon: 'line-md:github-twotone', label: 'Code' },
      { icon: 'line-md:pause-to-play-filled-transition', label: 'Play/Pause' },
    ])

    const time = ref(0)
    const isRunning = ref(false)
    const blurLevel = ref(0)
    const intervalId = ref(null)

    // New refs for reset animation
    const isAnimatingReset = ref(false)
    const currentDisplay = ref([])
    const animatingDigits = ref(new Set())
    const stepInterval = 80 // ms per shift step
    const staggerDelay = 150 // ms between starting each digit's animation

    const formattedTime = computed(() => {
      const ms = time.value % 1000
      const totalSeconds = Math.floor(time.value / 1000)
      const seconds = totalSeconds % 60
      const minutes = Math.floor(totalSeconds / 60) % 60
      const hours = Math.floor(totalSeconds / 3600)

      const pad = (n, z = 2) => String(n).padStart(z, '0')
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${Math.floor(ms / 100)}`
    })

    const displayChars = computed(() => {
      if (isAnimatingReset.value) {
        return currentDisplay.value
      } else {
        return formattedTime.value.split('')
      }
    })

    const isDigitPosition = (index) => [0, 1, 3, 4, 6, 7, 9].includes(index)

    const getAnimationClass = (index) => {
      if (!isAnimatingReset.value || !isDigitPosition(index)) return ''
      return animatingDigits.value.has(index) ? 'matrix-anim' : ''
    }

    const getGlowStyle = (index) => {
      return {}
    }

    const saveTimerState = () => {
      localStorage.setItem('savedTime', time.value.toString())
      localStorage.setItem('isRunning', isRunning.value.toString())
    }

    const toggleRunning = () => {
      if (isRunning.value) {
        clearInterval(intervalId.value)
        intervalId.value = null
      } else {
        const start = Date.now() - time.value
        intervalId.value = setInterval(() => {
          time.value = Date.now() - start
        }, 100)
      }
      isRunning.value = !isRunning.value
      saveTimerState()
    }

    const setBlur = (level) => {
      blurLevel.value = level
    }

    const cycleBlur = () => {
      const blurModes = [0, 70, 90]
      const currentIndex = blurModes.indexOf(blurLevel.value)
      const nextIndex = (currentIndex + 1) % blurModes.length
      blurLevel.value = blurModes[nextIndex]
    }

    const toggleHelpOverlay = () => {
      if (showHelpOverlay.value) {
        if (helpContent.value) {
          helpContent.value.classList.remove('fade-in')
        }
        setTimeout(() => {
          if (helpOverlay.value) {
            helpOverlay.value.classList.remove('animate-expand-bottom')
            helpOverlay.value.classList.add('animate-collapse-bottom')
          }
          setTimeout(() => {
            showHelpOverlay.value = false
            if (helpOverlay.value) {
              helpOverlay.value.classList.remove('animate-collapse-bottom', 'animate-expand-bottom')
            }
          }, 800)
        }, 300)
      } else {
        showHelpOverlay.value = true
        nextTick(() => {
          if (helpOverlay.value) {
            helpOverlay.value.classList.add('animate-expand-bottom')
          }
          setTimeout(() => {
            if (helpContent.value) {
              helpContent.value.classList.add('fade-in')
            }
          }, 800)
        })
      }
    }

    const showHelp = () => {
      toggleHelpOverlay()
    }

    const reset = () => {
      clearInterval(intervalId.value)
      intervalId.value = null
      isRunning.value = false

      const currentStr = formattedTime.value
      if (currentStr === '00:00:00.0') {
        time.value = 0
        saveTimerState()
        return // No animation needed
      }

      isAnimatingReset.value = true
      currentDisplay.value = currentStr.split('')

      const nonZeroPositions = []
      for (let i = 0; i < currentDisplay.value.length; i++) {
        const char = currentDisplay.value[i]
        if (char >= '1' && char <= '9') {
          nonZeroPositions.push({ pos: i, value: parseInt(char) })
        }
      }

      // Sort for cascade effect (right-to-left, e.g., start with centiseconds)
      nonZeroPositions.sort((a, b) => b.pos - a.pos)

      nonZeroPositions.forEach((item, idx) => {
        setTimeout(() => {
          let stepsLeft = item.value + 1 // +1 to include original display
          animatingDigits.value.add(item.pos)

          const animateThisDigit = () => {
            stepsLeft--
            if (stepsLeft > 0) {
              const displayVal = stepsLeft - 1
              currentDisplay.value[item.pos] = displayVal.toString()
              setTimeout(animateThisDigit, stepInterval)
            } else {
              currentDisplay.value[item.pos] = '0'
              animatingDigits.value.delete(item.pos)
              if (animatingDigits.value.size === 0) {
                isAnimatingReset.value = false
                time.value = 0
                saveTimerState()
              }
            }
          }

          animateThisDigit()
        }, idx * staggerDelay)
      })
    }

    const toggleFullScreen = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen().catch(err => {
          console.error('Error attempting to enable full-screen mode:', err);
        });
      }
    };

    watch(isRunning, (newVal) => {
      menuItems.value[7].icon = newVal ? 'line-md:pause' : 'line-md:pause-to-play-filled-transition'
    })

    // Persist blur level to localStorage
    watch(blurLevel, (newVal) => {
      localStorage.setItem('blurLevel', newVal.toString())
    })

    // Persist timer state periodically when running
    watch(time, () => {
      if (isRunning.value) {
        saveTimerState()
      }
    })

    watch(isRunning, (newVal) => {
      saveTimerState()
    })

    const generateNodeStaggered = (totalCount, intervalMs = 15) => {
      let i = 0
      const interval = setInterval(() => {
        if (i < totalCount) {
          const x = Math.random() * canvas.value.width
          const y = Math.random() * canvas.value.height
          const newNode = {
            x,
            y,
            radius: 0,
            growth: Math.random() * 0.04 + 0.02,
            velocity: { x: 0, y: 0 },
            opacity: 0
          }
          nodes.value.push(newNode)

          nodes.value.forEach((node) => {
            if (Math.hypot(node.x - newNode.x, node.y - newNode.y) < 80 && node !== newNode) {
              edges.value.push({ source: node, target: newNode })
            }
          })

          i++
        } else {
          clearInterval(interval)
        }
      }, intervalMs)
    }

    const animate = () => {
      if (!ctx.value) return
      ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height)
      ctx.value.strokeStyle = "white"
      ctx.value.lineWidth = 1.2

      ctx.value.globalAlpha = 0.3
      edges.value.forEach((edge) => {
        ctx.value.beginPath()
        ctx.value.moveTo(edge.source.x, edge.source.y)
        ctx.value.lineTo(edge.target.x, edge.target.y)
        ctx.value.stroke()
      })

      ctx.value.globalAlpha = 1
      ctx.value.fillStyle = "white"
      nodes.value.forEach((node) => {
        node.opacity = Math.min(node.opacity + 0.02, 1)
        ctx.value.globalAlpha = node.opacity

        const dx = mouse.value.x - node.x
        const dy = mouse.value.y - node.y
        const distance = Math.hypot(dx, dy)

        if (distance < interactionRange) {
          const directionX = dx / distance
          const directionY = dy / distance
          node.velocity.x -= directionX * moveAwayStrength
          node.velocity.y -= directionY * moveAwayStrength
        } else {
          node.velocity.x *= friction
          node.velocity.y *= friction
        }

        if (node.x - node.radius <= 0 || node.x + node.radius >= canvas.value.width)
          node.velocity.x = -node.velocity.x
        if (node.y - node.radius <= 0 || node.y + node.radius >= canvas.value.height)
          node.velocity.y = -node.velocity.y

        node.x += node.velocity.x
        node.y += node.velocity.y

        node.radius += node.growth
        if (node.radius > 5) {
          node.growth *= -1
          node.radius = 5
        } else if (node.radius < 0) {
          node.radius = 0
          node.growth *= -1
        }

        ctx.value.beginPath()
        ctx.value.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.value.fill()
      })

      ctx.value.globalAlpha = 1
      checkNodeDisconnections()
      requestAnimationFrame(animate)
    }

    const checkNodeDisconnections = () => {
      const toRemove = []
      edges.value.forEach((edge, i) => {
        const dist = Math.hypot(edge.source.x - edge.target.x, edge.source.y - edge.target.y)
        if (dist > disconnectionThreshold) toRemove.push(i)
      })
      toRemove.reverse().forEach((i) => edges.value.splice(i, 1))
    }

    const handleMouseMove = (event) => {
      mouse.value.x = event.clientX
      mouse.value.y = event.clientY
    }

    const handleKeyDown = (event) => {
      if (event.key === 'f' || event.key === 'F') {
        toggleFullScreen();
      } else if (event.key === ' ') {
        event.preventDefault();
        toggleRunning();
      } else if (event.key === 'r' || event.key === 'R') {
        reset();
      } else if (event.key === 'h' || event.key === 'H') {
        showHelp();
      } else if (event.key === 'b' || event.key === 'B') {
        cycleBlur();
      }
    }

    const onMouseDown = (event) => {
      const { clientX: x, clientY: y } = event
      showing.value = true
      anchorX.value = x
      anchorY.value = y
      wheelX.value = x
      wheelY.value = y
    }

    const onTouchStart = (event) => {
      event.preventDefault()
      const { clientX: x, clientY: y } = event.touches[0]
      onMouseDown({ clientX: x, clientY: y })
    }

    const handleFullscreenChange = () => {
      const isEntering = !!document.fullscreenElement;

      if (isEntering) {
        if (stopwatchCard.value) {
          stopwatchCard.value.classList.remove('animate-expand');
          stopwatchCard.value.offsetHeight;
        }
        if (timeDisplay.value) {
          timeDisplay.value.classList.remove('fade-in');
          timeDisplay.value.offsetHeight;
        }
      }
      nodes.value = []
      edges.value = []
      canvas.value.width = window.innerWidth
      canvas.value.height = window.innerHeight
      const nodeCount = isEntering ? 100 : 69
      generateNodeStaggered(nodeCount)

      if (isEntering) {
        setTimeout(async () => {
          await nextTick()
          if (stopwatchCard.value) {
            stopwatchCard.value.classList.add('animate-expand')
          }

          setTimeout(() => {
            if (timeDisplay.value) {
              setTimeout(() => {
                timeDisplay.value.classList.add('fade-in')
              }, 10)
            }
          }, 800)
        }, 1500)
      }
    }

    const onMouseUp = () => {
      if (chosenIndex.value === 1) {
        reset();
      } else if (chosenIndex.value === 2) {
        toggleFullScreen();
      } else if (chosenIndex.value === 3) {
        showHelp();
      } else if (chosenIndex.value === 4) {
        setBlur(90);
      } else if (chosenIndex.value === 5) {
        setBlur(70);
      } else if (chosenIndex.value === 6) {
        setBlur(0);
      } else if (chosenIndex.value === 7) {
        window.open('https://github.com/downtomarsguy', '_blank');
      } else if (chosenIndex.value === 8) {
        toggleRunning();
      }
      showing.value = false
      chosenIndex.value = 0
    }

    const onTouchEnd = (event) => {
      event.preventDefault()
      onMouseUp()
    }

    const onMouseMove = (event) => {
      handleMouseMove(event)
      if (!showing.value) return

      const { clientX: x, clientY: y } = event
      const dx = x - anchorX.value
      const dy = y - anchorY.value
      const mag = Math.sqrt(dx * dx + dy * dy)
      let index = 0

      if (mag >= min) {
        let deg = Math.atan2(dy, dx) + 0.625 * Math.PI
        while (deg < 0) deg += Math.PI * 2
        index = Math.floor(deg / Math.PI * 4) + 1
      }
      chosenIndex.value = index
    }

    const onTouchMove = (event) => {
      event.preventDefault()
      const { clientX: x, clientY: y } = event.touches[0]
      onMouseMove({ clientX: x, clientY: y })
    }

    onMounted(async () => {
      // Load saved blur level from localStorage
      const savedBlur = localStorage.getItem('blurLevel')
      if (savedBlur !== null) {
        blurLevel.value = parseInt(savedBlur, 10)
      }

      // Load saved timer state from localStorage
      const savedTime = localStorage.getItem('savedTime')
      const savedRunning = localStorage.getItem('isRunning')
      if (savedTime !== null) {
        time.value = parseInt(savedTime, 10)
      }
      if (savedRunning !== null) {
        isRunning.value = savedRunning === 'true'
      }

      // If it was running, resume the timer
      if (isRunning.value) {
        const start = Date.now() - time.value
        intervalId.value = setInterval(() => {
          time.value = Date.now() - start
        }, 100)
      }

      ctx.value = canvas.value.getContext("2d")
      canvas.value.width = window.innerWidth
      canvas.value.height = window.innerHeight

      generateNodeStaggered(69)
      animate()

      document.addEventListener('fullscreenchange', handleFullscreenChange)
      document.addEventListener('keydown', handleKeyDown)

      setTimeout(async () => {
        await nextTick()
        if (stopwatchCard.value) {
          stopwatchCard.value.classList.add('animate-expand')
        }

        setTimeout(() => {
          if (timeDisplay.value) {
            timeDisplay.value.classList.add('fade-in')
          }
        }, 800)
      }, 1500)
    })

    onUnmounted(() => {
      saveTimerState()
      clearInterval(intervalId.value)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('keydown', handleKeyDown)
    })

    return {
      canvas,
      wheelRef,
      stopwatchCard,
      timeDisplay,
      helpOverlay,
      helpContent,
      showHelpOverlay,
      showing,
      chosenIndex,
      wheelX,
      wheelY,
      menuItems,
      onMouseDown,
      onTouchStart,
      onMouseUp,
      onTouchEnd,
      onMouseMove,
      onTouchMove,
      displayChars,
      getAnimationClass,
      getGlowStyle,
      isRunning,
      blurLevel,
      toggleRunning,
      setBlur,
      cycleBlur,
      toggleHelpOverlay,
      showHelp,
      reset,
    }
  }
}


</script>

<style scoped>
body {
  font-family: "SUSE Mono", sans-serif;
}

.suse-mono {
  font-family: "SUSE Mono", sans-serif;
}

.keyboard-font {
  font-family: "Libertinus Keyboard", sans-serif;
}

@keyframes expandVertical {
  from {
    transform: scaleY(0);
    opacity: 0;
  }

  to {
    transform: scaleY(1);
    opacity: 1;
  }
}

@keyframes expandFromBottom {
  from {
    transform: scaleY(0);
    opacity: 0;
  }

  to {
    transform: scaleY(1);
    opacity: 1;
  }
}

@keyframes collapseToBottom {
  from {
    transform: scaleY(1);
    opacity: 1;
  }

  to {
    transform: scaleY(0);
    opacity: 0;
  }
}

.stopwatch-card {
  transform: scaleY(0);
  opacity: 0;
  transform-origin: center;
}

.stopwatch-card.animate-expand {
  animation: expandVertical 0.8s ease-out forwards;
}

.time-display {
  opacity: 0;
  transition: opacity 0.3s ease-in;
}

.time-display.fade-in {
  opacity: 1;
}

.help-overlay {
  transform: scaleY(0);
  opacity: 0;
  transform-origin: bottom center;
  display: none;
}

.help-overlay.animate-expand-bottom {
  display: block;
  animation: expandFromBottom 0.8s ease-out forwards;
}

.help-overlay.animate-collapse-bottom {
  display: block;
  animation: collapseToBottom 0.5s ease-in forwards;
}

.help-content {
  opacity: 0;
  transition: opacity 0.3s ease-in;
}

.help-content.fade-in {
  opacity: 1;
}

.wheel {
  position: absolute;
  top: var(--y);
  left: var(--x);
  width: 500px;
  height: 500px;
  transform: translate(-50%, -50%);
  transform-origin: 0% 0%;
}

.wheel.on .arc {
  opacity: 0.6;
  transform: scale(1) rotate(var(--rotation)) !important;
  transition-timing-function: cubic-bezier(0, 0.5, 0.5, 1.5);
}

.arc {
  position: absolute;
  top: 0;
  right: 0;
  width: 50%;
  height: 50%;
  transform-origin: 0% 100%;
  background-image: radial-gradient(circle at 0% 100%,
      transparent,
      transparent 29.5%,
      var(--color-border) 30%,
      var(--color-border) 30.5%,
      var(--color) 31%,
      var(--color) 50%,
      var(--color-border) 50.25%,
      var(--color-border) 51.5%,
      transparent 51.75%,
      transparent);
  transition-property: transform, opacity;
  transition-duration: 0.3s;
  transition-timing-function: cubic-bezier(0.4, -0.4, 0.7, -0.3);
  -webkit-clip-path: polygon(0 0, 0 99%, 99% 0);
  clip-path: polygon(0 0, 0 99%, 99% 0);
  opacity: 0;
  transform: scale(0) rotate(var(--rotation));
}

.arc-icon {
  position: absolute;
  top: 40%;
  left: 15%;
  font-size: 2rem;
  transform: rotate(calc(var(--rotation) * -1));
  color: rgb(20, 184, 166);
  transition: color 0.3s, text-shadow 0.3s;
  text-shadow:
    0 0 6px rgba(20, 184, 166, 0.7),
    0 0 12px rgba(20, 184, 166, 0.5),
    0 0 20px rgba(20, 184, 166, 0.3),
    0 0 30px rgba(20, 184, 166, 0.2);
}

.wheel[data-chosen="1"] .arc:nth-child(1),
.wheel[data-chosen="2"] .arc:nth-child(2),
.wheel[data-chosen="3"] .arc:nth-child(3),
.wheel[data-chosen="4"] .arc:nth-child(4),
.wheel[data-chosen="5"] .arc:nth-child(5),
.wheel[data-chosen="6"] .arc:nth-child(6),
.wheel[data-chosen="7"] .arc:nth-child(7),
.wheel[data-chosen="8"] .arc:nth-child(8) {
  opacity: 0.9;
  transform: scale(1.1) rotate(var(--rotation)) !important;
  filter: brightness(120%);
}

.wheel[data-chosen="1"] .arc:nth-child(1) .arc-icon,
.wheel[data-chosen="2"] .arc:nth-child(2) .arc-icon,
.wheel[data-chosen="3"] .arc:nth-child(3) .arc-icon,
.wheel[data-chosen="4"] .arc:nth-child(4) .arc-icon,
.wheel[data-chosen="5"] .arc:nth-child(5) .arc-icon,
.wheel[data-chosen="6"] .arc:nth-child(6) .arc-icon,
.wheel[data-chosen="7"] .arc:nth-child(7) .arc-icon,
.wheel[data-chosen="8"] .arc:nth-child(8) .arc-icon {
  color: rgb(20, 184, 166) !important;
  text-shadow:
    0 0 10px rgba(20, 184, 166, 0.9),
    0 0 20px rgba(20, 184, 166, 0.7),
    0 0 30px rgba(20, 184, 166, 0.5);
}
</style>