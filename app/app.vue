<template>
  <div class="bg-zinc-950">
    <div class="bg-zinc-950 bg-opacity-80">
      <div
        class="app bg-zinc-950 bg-opacity-80 h-screen w-full relative overflow-hidden select-none flex items-center justify-center"
        @contextmenu.prevent @mousedown="onMouseDown" @touchstart="onTouchStart" @mouseup="onMouseUp"
        @touchend="onTouchEnd" @mousemove="onMouseMove" @touchmove="onTouchMove">
        <canvas ref="canvas" class="absolute inset-0"></canvas>

        <div class="w-full h-screen bg-zinc-950 bg-opacity-80 relative overflow-hidden select-none flex items-center justify-center">
          <div ref="stopwatchCard"
            class="stopwatch-card bg-white bg-opacity-10 p-6 w-full max-w-md border-[1px] border-[#ffffff80] rounded-md backdrop-blur-sm backdrop-opacity-30 z-20 flex flex-col items-center">
            <div ref="timeDisplay" class="time-display suse-mono text-6xl font-bold text-white tracking-widest my-6">
              {{ formattedTime }}
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
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'

export default {
  name: 'RadialMenuStopwatch',
  setup() {
    const wheelRef = ref(null)
    const canvas = ref(null)
    const stopwatchCard = ref(null)
    const timeDisplay = ref(null)
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
      { icon: '', label: '' },
      { icon: 'material-symbols:restart-alt', label: 'Reset' },
      { icon: '', label: '' },
      { icon: 'line-md:monitor-screenshot-twotone', label: 'Full Screen' },
      { icon: '', label: '' },
      { icon: 'line-md:github-twotone', label: 'Code' },
      { icon: '', label: '' },
      { icon: 'line-md:pause-to-play-filled-transition', label: 'Play/Pause' },
    ])

    const time = ref(0)
    const isRunning = ref(false)
    const intervalId = ref(null)

    const formattedTime = computed(() => {
      const ms = time.value % 1000
      const totalSeconds = Math.floor(time.value / 1000)
      const seconds = totalSeconds % 60
      const minutes = Math.floor(totalSeconds / 60) % 60
      const hours = Math.floor(totalSeconds / 3600)

      const pad = (n, z = 2) => String(n).padStart(z, '0')
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${Math.floor(ms / 100)}`
    })

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
    }

    const reset = () => {
      clearInterval(intervalId.value)
      intervalId.value = null
      time.value = 0
      isRunning.value = false
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
      if (chosenIndex.value === 2) {
        reset();
      } else if (chosenIndex.value === 4) {
        toggleFullScreen();
      } else if (chosenIndex.value === 6) {
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
      clearInterval(intervalId.value)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('keydown', handleKeyDown)
    })

    return {
      canvas,
      wheelRef,
      stopwatchCard,
      timeDisplay,
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
      formattedTime,
      isRunning,
      toggleRunning,
      reset,
    }
  }
}

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
      href: 'https://fonts.googleapis.com/css2?family=SUSE+Mono:ital,wght@0,100..800;1,100..800&display=swap'
    },
  ]
})
</script>

<style scoped>
body {
  font-family: "SUSE Mono", sans-serif;
}

.suse-mono {
  font-family: "SUSE Mono", sans-serif;

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