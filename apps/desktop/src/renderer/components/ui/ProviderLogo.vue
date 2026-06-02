<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Globe, Mail, MessageCircle } from 'lucide-vue-next'
import type { ProviderKind } from '@shared/models'

const props = withDefaults(
  defineProps<{
    providerId: ProviderKind
    size?: number
    faviconUrl?: string
  }>(),
  {
    size: 20,
    faviconUrl: undefined,
  },
)

const slackStroke = computed(() => Math.max(5, Math.round(props.size * 0.24)))
const teamsLetterFont = computed(() => Math.max(8, Math.round(props.size * 0.62)))

const faviconBroken = ref(false)

watch(
  () => props.faviconUrl,
  () => {
    faviconBroken.value = false
  },
)

const showFavicon = computed(
  () => props.providerId === 'webpage' && Boolean(props.faviconUrl) && !faviconBroken.value,
)
</script>

<template>
  <svg
    v-if="providerId === 'slack'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M9.5 3.75C9.5 2.784 8.716 2 7.75 2S6 2.784 6 3.75V8.5H9.5V3.75Z"
      fill="#36C5F0"
    />
    <path
      d="M9.5 15.5H7.75C6.784 15.5 6 16.284 6 17.25S6.784 19 7.75 19H12.5V15.5H9.5Z"
      fill="#2EB67D"
    />
    <path
      d="M20.25 9.5C21.216 9.5 22 8.716 22 7.75S21.216 6 20.25 6H15.5V9.5H20.25Z"
      fill="#ECB22E"
    />
    <path
      d="M14.5 14.5V20.25C14.5 21.216 15.284 22 16.25 22S18 21.216 18 20.25V14.5H14.5Z"
      fill="#E01E5A"
    />
    <path
      d="M3.75 14.5C2.784 14.5 2 15.284 2 16.25S2.784 18 3.75 18H8.5V14.5H3.75Z"
      fill="#36C5F0"
    />
    <path
      d="M8.5 9.5H3.75C2.784 9.5 2 8.716 2 7.75S2.784 6 3.75 6H8.5V9.5Z"
      fill="#E01E5A"
    />
    <path
      d="M14.5 8.5V3.75C14.5 2.784 15.284 2 16.25 2S18 2.784 18 3.75V8.5H14.5Z"
      fill="#2EB67D"
    />
    <path
      d="M15.5 14.5H20.25C21.216 14.5 22 15.284 22 16.25S21.216 18 20.25 18H15.5V14.5Z"
      fill="#ECB22E"
    />
    <path
      d="M10 6.75C10 5.784 10.784 5 11.75 5S13.5 5.784 13.5 6.75V12.25C13.5 13.216 12.716 14 11.75 14H6.25C5.284 14 4.5 13.216 4.5 12.25S5.284 10.5 6.25 10.5H10V6.75Z"
      :stroke="'#36C5F0'"
      :stroke-width="slackStroke"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M17.25 10C18.216 10 19 10.784 19 11.75S18.216 13.5 17.25 13.5H11.75C10.784 13.5 10 12.716 10 11.75V6.25C10 5.284 10.784 4.5 11.75 4.5S13.5 5.284 13.5 6.25V10H17.25Z"
      :stroke="'#2EB67D'"
      :stroke-width="slackStroke"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M14 17.25C14 18.216 13.216 19 12.25 19S10.5 18.216 10.5 17.25V11.75C10.5 10.784 11.284 10 12.25 10H17.75C18.716 10 19.5 10.784 19.5 11.75S18.716 13.5 17.75 13.5H14V17.25Z"
      :stroke="'#ECB22E'"
      :stroke-width="slackStroke"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M6.75 14C5.784 14 5 13.216 5 12.25S5.784 10.5 6.75 10.5H12.25C13.216 10.5 14 11.284 14 12.25V17.75C14 18.716 13.216 19.5 12.25 19.5S10.5 18.716 10.5 17.75V14H6.75Z"
      :stroke="'#E01E5A'"
      :stroke-width="slackStroke"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>

  <svg
    v-else-if="providerId === 'teams'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="2" y="6" width="14" height="12" rx="2.4" fill="#4B53BC" />
    <text
      x="9"
      y="15.5"
      text-anchor="middle"
      :font-size="teamsLetterFont"
      font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      font-weight="700"
      fill="#FFFFFF"
    >T</text>
    <circle cx="19" cy="9" r="2.6" fill="#7B83EB" />
    <path
      d="M16 13.5h5.2a.8.8 0 0 1 .8.8v2.6a3.4 3.4 0 0 1-3.4 3.4h-.6A2 2 0 0 1 16 18.3v-4.8Z"
      fill="#7B83EB"
    />
  </svg>

  <img
    v-else-if="showFavicon"
    :src="faviconUrl"
    :width="size"
    :height="size"
    alt=""
    referrerpolicy="no-referrer"
    class="rounded-sm object-contain"
    @error="faviconBroken = true"
  />

  <Globe v-else-if="providerId === 'webpage'" :size="size" />

  <MessageCircle v-else-if="providerId === 'omnichat'" :size="size" />

  <Mail v-else :size="size" />
</template>
