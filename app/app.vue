<template>
  <div class="bg-zinc-950">
    <div class="bg-zinc-950 bg-opacity-80">
      <div
        class="app bg-zinc-950 bg-opacity-80 h-screen w-full relative overflow-hidden select-none flex items-center justify-center"
        @contextmenu.prevent
        @mousedown="onMouseDown"
        @touchstart="onTouchStart"
        @mouseup="onMouseUp"
        @touchend="onTouchEnd"
        @mousemove="onMouseMove"
        @touchmove="onTouchMove"
      >
        <!-- Background canvas -->
        <canvas ref="canvas" class="absolute inset-0"></canvas>

        <!-- Centered stopwatch card -->
        <div
          class="bg-white bg-opacity-10 p-6 w-full max-w-md border-[1px] border-[#ffffff80] rounded-md backdrop-blur-sm backdrop-opacity-30 z-20 flex flex-col items-center"
        >
          <!-- Stopwatch display -->
          <div class="text-6xl font-bold text-white tracking-widest my-6">
            {{ formattedTime }}
          </div>
        </div>

        <!-- Radial menu -->
        <div
          ref="wheelRef"
          class="wheel z-30"
          :class="{ 'on': showing }"
          :data-chosen="chosenIndex"
          :style="{ '--x': `${wheelX}px`, '--y': `${wheelY}px` }"
        >
          <div
            v-for="(item, index) in menuItems"
            :key="index"
            class="arc"
            :style="{
              '--rotation': `${-22.5 + index * 45}deg`,
              '--color': 'rgba(20, 184, 166, 0.4)',
              '--color-border': 'rgba(20, 184, 166, 0.6)',
              'transition-delay': `${(index % 2) * 0.015}s`
            }"
          >
            <Icon :name="item.icon" class="arc-icon" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'

export default {
  name: 'RadialMenuStopwatch',
  setup() {
    const wheelRef = ref(null)
    const canvas = ref(null)
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
      { icon: 'line-md:home-md-twotone', label: 'Home' },
      { icon: 'line-md:person-twotone', label: 'Accounts' },
      { icon: 'line-md:edit-full-twotone', label: 'Edit' },
      { icon: 'line-md:monitor-screenshot-twotone', label: 'Full Screen' },
      { icon: 'line-md:clipboard-list-twotone', label: 'Logs' },
      { icon: 'line-md:github-twotone', label: 'Code' },
      { icon: 'line-md:pause-to-play-filled-transition', label: 'Play/Pause' },
      { icon: 'material-symbols:restart-alt', label: 'Reset' }
    ])

    // Stopwatch state
    const time = ref(0) // milliseconds
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

    // Update play/pause icon based on running state
    watch(isRunning, (newVal) => {
      menuItems.value[6].icon = newVal ? 'line-md:pause' : 'line-md:pause-to-play-filled-transition'
    })

    // Particle background
    const generateNodes = (count) => {
      for (let i = 0; i < count; i++) {
        const x = Math.random() * canvas.value.width
        const y = Math.random() * canvas.value.height
        const newNode = {
          x,
          y,
          radius: Math.random() * 3 + 2,
          growth: Math.random() * 0.04 + 0.01,
          velocity: { x: 0, y: 0 },
        }
        nodes.value.push(newNode)

        nodes.value.forEach((node) => {
          if (Math.hypot(node.x - newNode.x, node.y - newNode.y) < 80 && node !== newNode) {
            edges.value.push({ source: node, target: newNode })
          }
        })
      }
    }

    const animate = () => {
      if (!ctx.value) return
      ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height)
      ctx.value.strokeStyle = "white"
      ctx.value.lineWidth = 0.5

      edges.value.forEach((edge) => {
        ctx.value.beginPath()
        ctx.value.moveTo(edge.source.x, edge.source.y)
        ctx.value.lineTo(edge.target.x, edge.target.y)
        ctx.value.stroke()
      })

      ctx.value.fillStyle = "white"
      nodes.value.forEach((node) => {
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
        if (node.radius > 5 || node.radius < 2) node.growth *= -1

        ctx.value.beginPath()
        ctx.value.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.value.fill()
      })

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

    const toggleFullScreen = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen().catch(err => {
          console.error('Error attempting to enable full-screen mode:', err);
        });
      }
    };

    const handleFullscreenChange = () => {
      // Clear existing nodes and edges
      nodes.value = []
      edges.value = []
      // Resize canvas to new dimensions
      canvas.value.width = window.innerWidth
      canvas.value.height = window.innerHeight
      // Regenerate nodes for the new size
      generateNodes(69)
    }

    const onMouseUp = () => {
      // Handle radial menu actions based on chosen index
      if (chosenIndex.value === 4) {
        toggleFullScreen();
      } else if (chosenIndex.value === 6) {
        window.open('https://github.com/downtomarsguy', '_blank');
      } else if (chosenIndex.value === 7) {
        toggleRunning();
      } else if (chosenIndex.value === 8) {
        reset();
      }
      // Hide wheel and reset index
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

    onMounted(() => {
      ctx.value = canvas.value.getContext("2d")
      canvas.value.width = window.innerWidth
      canvas.value.height = window.innerHeight
      generateNodes(69)
      animate()

      // Listen for fullscreen changes to regenerate background
      document.addEventListener('fullscreenchange', handleFullscreenChange)
    })

    onUnmounted(() => {
      clearInterval(intervalId.value)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    })

    return {
      canvas,
      wheelRef,
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
      // Stopwatch
      formattedTime,
      isRunning,
      toggleRunning,
      reset,
    }
  }
}
</script>

<style scoped>
/* (unchanged radial menu styles) */
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