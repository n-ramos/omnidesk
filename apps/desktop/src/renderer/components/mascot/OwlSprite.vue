<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import idleUrl from '@renderer/assets/mascot/omnihoowl-idle.png'
import talkUrl from '@renderer/assets/mascot/omnihoowl-talk.png'
import sleepUrl from '@renderer/assets/mascot/omnihoowl-sleep.png'

const props = withDefaults(
  defineProps<{
    talking?: boolean
    sleeping?: boolean
    size?: number
    /**
     * Rendu purement decoratif (etat "rangee sur le cote") : pas de bouton, pas
     * d'animation et pas de clics, pour pouvoir l'imbriquer dans un autre bouton.
     */
    decorative?: boolean
  }>(),
  { talking: false, sleeping: false, size: 104, decorative: false },
)

defineEmits<{ (event: 'click'): void }>()

const FIDGETS = ['blink', 'tilt', 'hop', 'wiggle', 'flap'] as const
type Fidget = (typeof FIDGETS)[number]

const fidget = ref<Fidget | null>(null)
let fidgetTimer: ReturnType<typeof setTimeout> | undefined

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const scheduleFidget = (): void => {
  const delay = 20_000 + Math.random() * 28_000 // une petite animation toutes les 20-48 s
  fidgetTimer = setTimeout(() => {
    if (!props.talking && !props.sleeping && fidget.value === null && !prefersReducedMotion()) {
      fidget.value = FIDGETS[Math.floor(Math.random() * FIDGETS.length)] ?? null
    }
    scheduleFidget()
  }, delay)
}

// Seules les animations ponctuelles (fidgets) se terminent : le balancement au repos,
// la pose "parle" et la respiration du sommeil bouclent (animationiteration).
const onAnimationEnd = (): void => {
  if (fidget.value !== null) fidget.value = null
}

// Si Elodie se met a parler ou s'endort pendant un fidget, on le coupe proprement.
watch(
  () => props.talking || props.sleeping,
  (busy) => {
    if (busy) fidget.value = null
  },
)

// Le fidget "flap" montre brievement la pose ailes ouvertes pour varier les plaisirs.
const currentSrc = computed(() => {
  if (props.decorative) return idleUrl
  if (props.sleeping) return sleepUrl
  if (props.talking || fidget.value === 'flap') return talkUrl
  return idleUrl
})

const animationClass = computed(() => {
  if (props.decorative) return ''
  if (props.sleeping) return 'omnihoowl-img--sleep'
  if (props.talking) return 'omnihoowl-img--talk'
  if (fidget.value) return `omnihoowl-fidget-${fidget.value}`
  return 'omnihoowl-img--idle'
})

onMounted(() => {
  if (!props.decorative) scheduleFidget()
})
onBeforeUnmount(() => {
  if (fidgetTimer) clearTimeout(fidgetTimer)
})
</script>

<template>
  <component
    :is="decorative ? 'div' : 'button'"
    :type="decorative ? undefined : 'button'"
    class="omnihoowl-owl app-no-drag group relative block border-0 bg-transparent p-0 outline-none"
    :class="{ 'pointer-events-none': decorative }"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :aria-hidden="decorative ? 'true' : undefined"
    :aria-label="
      decorative
        ? undefined
        : sleeping
          ? 'Elodie dort - cliquez pour la reveiller'
          : 'Elodie - cliquez pour une citation'
    "
    :title="decorative ? undefined : 'Elodie'"
    @click="$emit('click')"
  >
    <span v-if="sleeping && !decorative" class="omnihoowl-zzz" aria-hidden="true">
      <i>z</i><i>z</i><i>z</i>
    </span>

    <img
      :src="currentSrc"
      alt="Elodie"
      draggable="false"
      class="omnihoowl-img h-full w-full select-none object-contain"
      :class="animationClass"
      @animationend="onAnimationEnd"
    />
  </component>
</template>

<style scoped>
.omnihoowl-img {
  filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.45));
  transform-origin: 50% 92%;
  will-change: transform;
}

.omnihoowl-img--idle {
  animation: omnihoowl-bob 4.8s ease-in-out infinite;
}

.omnihoowl-img--talk {
  animation: omnihoowl-talk 0.9s ease-in-out infinite;
}

.omnihoowl-img--sleep {
  animation: omnihoowl-sleep 3.6s ease-in-out infinite;
}

.omnihoowl-owl:hover .omnihoowl-img {
  filter: drop-shadow(0 12px 22px rgba(0, 0, 0, 0.5))
    drop-shadow(0 0 10px rgb(var(--accent-mint) / 0.35));
}

.omnihoowl-owl:active .omnihoowl-img {
  transform: translateY(1px) scale(0.97);
}

/* Petites bulles de sommeil */
.omnihoowl-zzz {
  position: absolute;
  top: 0;
  right: 8px;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  gap: 1px;
  pointer-events: none;
  color: rgb(var(--accent-mint) / 0.75);
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.omnihoowl-zzz i {
  font-style: normal;
  font-size: 10px;
  animation: omnihoowl-zzz 2.6s ease-in-out infinite;
}
.omnihoowl-zzz i:nth-child(2) {
  font-size: 12px;
  animation-delay: 0.5s;
}
.omnihoowl-zzz i:nth-child(3) {
  font-size: 15px;
  animation-delay: 1s;
}

/* Fidgets ponctuels (joues de temps en temps) */
.omnihoowl-fidget-blink {
  animation: omnihoowl-blink 0.55s ease-in-out 1;
}
.omnihoowl-fidget-tilt {
  animation: omnihoowl-tilt 1.4s ease-in-out 1;
}
.omnihoowl-fidget-hop {
  animation: omnihoowl-hop 0.85s ease-in-out 1;
}
.omnihoowl-fidget-wiggle {
  animation: omnihoowl-wiggle 0.95s ease-in-out 1;
}
.omnihoowl-fidget-flap {
  animation: omnihoowl-flap 0.75s ease-in-out 1;
}

@keyframes omnihoowl-bob {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-3px) rotate(-1.6deg);
  }
  50% {
    transform: translateY(0) rotate(0deg);
  }
  75% {
    transform: translateY(-2px) rotate(1.6deg);
  }
}

@keyframes omnihoowl-talk {
  0%,
  100% {
    transform: translateY(0) rotate(0deg) scale(1);
  }
  30% {
    transform: translateY(-4px) rotate(-2.4deg) scale(1.02);
  }
  60% {
    transform: translateY(-1px) rotate(2.4deg) scale(1.01);
  }
}

@keyframes omnihoowl-sleep {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(1px) scale(1.025);
  }
}

@keyframes omnihoowl-zzz {
  0% {
    opacity: 0;
    transform: translateY(5px) scale(0.8);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-11px) scale(1.1);
  }
}

@keyframes omnihoowl-blink {
  0%,
  100% {
    transform: scaleY(1);
  }
  45% {
    transform: scaleY(0.84) translateY(4px);
  }
}

@keyframes omnihoowl-tilt {
  0%,
  100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-8deg);
  }
  60% {
    transform: rotate(6deg);
  }
}

@keyframes omnihoowl-hop {
  0%,
  100% {
    transform: translateY(0);
  }
  35% {
    transform: translateY(-13px);
  }
  55% {
    transform: translateY(-13px);
  }
  72% {
    transform: translateY(0);
  }
}

@keyframes omnihoowl-wiggle {
  0%,
  100% {
    transform: rotate(0deg);
  }
  20% {
    transform: rotate(5deg);
  }
  45% {
    transform: rotate(-5deg);
  }
  70% {
    transform: rotate(3deg);
  }
}

@keyframes omnihoowl-flap {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  30% {
    transform: translateY(-6px) rotate(-4deg);
  }
  60% {
    transform: translateY(-3px) rotate(4deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .omnihoowl-img--idle,
  .omnihoowl-img--talk,
  .omnihoowl-img--sleep,
  .omnihoowl-fidget-blink,
  .omnihoowl-fidget-tilt,
  .omnihoowl-fidget-hop,
  .omnihoowl-fidget-wiggle,
  .omnihoowl-fidget-flap,
  .omnihoowl-zzz i {
    animation: none;
  }
}
</style>
