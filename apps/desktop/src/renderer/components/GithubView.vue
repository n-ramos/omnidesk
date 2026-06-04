<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Eye,
  FolderGit2,
  Github,
  GitPullRequest,
  LogOut,
  PlayCircle,
  RefreshCw,
  Star,
  XCircle,
} from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import OmnichatAuthGate from '@renderer/components/OmnichatAuthGate.vue'
import { useSessionStore } from '@renderer/stores/sessionStore'
import { useGithubStore } from '@renderer/stores/githubStore'
import type { GithubPullRequest, GithubWorkflowRun } from '@shared/github'

const session = useSessionStore()
const github = useGithubStore()
let lastExternalOpenAt = 0

onMounted(() => {
  void session.init()
  window.addEventListener('focus', refreshAfterExternalOpen)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshAfterExternalOpen)
})

// Ne charge GitHub qu'une fois le compte authentifie (les routes proxy exigent le JWT).
watch(
  () => session.isAuthenticated,
  (authed) => {
    if (authed) {
      void github.init()
    }
  },
  { immediate: true },
)

const refreshAfterExternalOpen = (): void => {
  if (!lastExternalOpenAt || !github.connected || github.loading) {
    return
  }
  const openedRecently = Date.now() - lastExternalOpenAt < 15 * 60 * 1000
  lastExternalOpenAt = 0
  if (openedRecently) {
    void github.refresh()
  }
}

const openExternal = (url: string): void => {
  lastExternalOpenAt = Date.now()
  void window.omnidesk?.shell.openExternal(url)
}

// Teinte de l'icone d'une PR selon son etat de review (fond discret, info secondaire).
const prTint = (pr: GithubPullRequest): string => {
  if (pr.isDraft) {
    return 'text-zinc-500'
  }
  if (pr.reviewDecision === 'approved') {
    return 'text-accent-mint'
  }
  if (pr.reviewDecision === 'changes_requested') {
    return 'text-accent-coral'
  }
  return 'text-accent-lilac'
}

// Icone + teinte d'un run GitHub Actions : en cours (gold), succes (mint), echec (coral).
const runIcon = (run: GithubWorkflowRun): typeof CircleDot => {
  if (run.status !== 'completed') {
    return CircleDot
  }
  if (run.conclusion === 'success') {
    return CheckCircle2
  }
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out') {
    return XCircle
  }
  return CircleDot
}

const runTint = (run: GithubWorkflowRun): string => {
  if (run.status !== 'completed') {
    return 'text-accent-gold'
  }
  if (run.conclusion === 'success') {
    return 'text-accent-mint'
  }
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out') {
    return 'text-accent-coral'
  }
  return 'text-zinc-500'
}
</script>

<template>
  <section class="scroll-thin flex min-h-0 flex-1 flex-col overflow-auto">
    <!-- OmniProxy absent : GitHub indisponible. -->
    <div v-if="!session.isConfigured" class="grid flex-1 place-items-center p-8 text-center">
      <div class="max-w-sm">
        <span class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-white/[0.05] text-zinc-400">
          <Github :size="26" />
        </span>
        <h2 class="text-base font-semibold text-zinc-100">GitHub indisponible</h2>
        <p class="mt-2 text-sm leading-6 text-zinc-500">
          OmniProxy n'est pas configure dans cette version. GitHub necessite un compte Omnidesk.
        </p>
      </div>
    </div>

    <!-- Pas de session : on affiche le gate de connexion au compte (comme l'omnichat). -->
    <OmnichatAuthGate v-else-if="!session.isAuthenticated" />

    <template v-else>
      <header
        class="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-9 place-items-center rounded-xl bg-accent-lilac/12 text-accent-lilac">
            <Github :size="18" />
          </span>
          <div class="min-w-0">
            <h1 class="text-sm font-semibold text-zinc-100">GitHub</h1>
            <p v-if="github.connected && github.status?.login" class="truncate text-xs text-zinc-500">
              @{{ github.status.login }}
            </p>
            <p v-else class="text-xs text-zinc-500">Tableau de bord</p>
          </div>
        </div>
        <div v-if="github.connected" class="flex items-center gap-1.5">
          <button
            class="grid size-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.07] hover:text-zinc-100 disabled:opacity-50"
            type="button"
            title="Rafraichir"
            :disabled="github.loading"
            @click="github.refresh()"
          >
            <RefreshCw :size="15" :class="github.loading ? 'animate-spin' : ''" />
          </button>
          <button
            class="grid size-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-accent-coral/12 hover:text-accent-coral disabled:opacity-50"
            type="button"
            title="Deconnecter GitHub"
            :disabled="github.loading"
            @click="github.disconnect()"
          >
            <LogOut :size="15" />
          </button>
        </div>
      </header>

      <div
        v-if="github.error"
        class="mx-5 mt-4 flex items-center gap-2 rounded-xl border border-accent-coral/30 bg-accent-coral/10 px-3 py-2 text-xs text-accent-coral"
      >
        <AlertTriangle :size="14" class="shrink-0" />
        <span class="min-w-0 flex-1">{{ github.error }}</span>
      </div>

      <!-- Compte authentifie mais GitHub non lie : appel a connexion. -->
      <div v-if="!github.connected" class="grid flex-1 place-items-center p-8 text-center">
        <div class="max-w-sm">
          <span class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-accent-lilac/12 text-accent-lilac">
            <Github :size="26" />
          </span>
          <h2 class="text-base font-semibold text-zinc-100">Connecte ton compte GitHub</h2>
          <p class="mt-2 text-sm leading-6 text-zinc-500">
            Affiche tes pull requests, les reviews qu'on te demande, tes depots et tes runs
            GitHub Actions. L'autorisation s'ouvre dans ton navigateur ; aucun secret n'est
            stocke dans l'application.
          </p>
          <button
            class="mx-auto mt-5 inline-flex items-center gap-2 rounded-xl bg-accent-mint px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-60"
            type="button"
            :disabled="github.connecting"
            @click="github.connect()"
          >
            <Spinner v-if="github.connecting" :size="15" />
            <Github v-else :size="16" />
            {{ github.connecting ? 'Ouverture du navigateur...' : 'Connecter GitHub' }}
          </button>
        </div>
      </div>

      <!-- Tableau de bord. -->
      <div v-else class="grid gap-3 p-4 lg:grid-cols-2">
        <!-- Mes pull requests -->
        <article class="flex min-h-0 flex-col rounded-2xl bg-white/[0.04] p-4 shadow-line">
          <header class="mb-3 flex items-center gap-2">
            <span class="grid size-7 place-items-center rounded-lg bg-accent-lilac/10 text-accent-lilac">
              <GitPullRequest :size="15" />
            </span>
            <h2 class="text-sm font-semibold text-zinc-100">Mes pull requests</h2>
            <span class="ml-auto text-xs tabular-nums text-zinc-500">{{ github.authoredPrs.length }}</span>
          </header>
          <ul v-if="github.authoredPrs.length" class="flex flex-col gap-0.5">
            <li v-for="pr in github.authoredPrs" :key="pr.id">
              <button
                class="group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.05]"
                type="button"
                @click="openExternal(pr.url)"
              >
                <GitPullRequest :size="15" class="mt-0.5 shrink-0" :class="prTint(pr)" />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span class="truncate text-sm text-zinc-200">{{ pr.title }}</span>
                    <span
                      v-if="pr.isDraft"
                      class="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400"
                    >draft</span>
                  </span>
                  <span class="mt-0.5 block truncate text-xs text-zinc-500">
                    {{ pr.repo.fullName }} #{{ pr.number }}
                  </span>
                </span>
                <ExternalLink
                  :size="13"
                  class="mt-0.5 shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100"
                />
              </button>
            </li>
          </ul>
          <p v-else class="px-2 py-3 text-sm text-zinc-600">Aucune pull request ouverte.</p>
        </article>

        <!-- Reviews a faire -->
        <article class="flex min-h-0 flex-col rounded-2xl bg-white/[0.04] p-4 shadow-line">
          <header class="mb-3 flex items-center gap-2">
            <span class="grid size-7 place-items-center rounded-lg bg-accent-sky/10 text-accent-sky">
              <Eye :size="15" />
            </span>
            <h2 class="text-sm font-semibold text-zinc-100">Reviews a faire</h2>
            <span class="ml-auto text-xs tabular-nums text-zinc-500">{{ github.reviewRequests.length }}</span>
          </header>
          <ul v-if="github.reviewRequests.length" class="flex flex-col gap-0.5">
            <li v-for="pr in github.reviewRequests" :key="pr.id">
              <button
                class="group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.05]"
                type="button"
                @click="openExternal(pr.url)"
              >
                <GitPullRequest :size="15" class="mt-0.5 shrink-0 text-accent-sky" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm text-zinc-200">{{ pr.title }}</span>
                  <span class="mt-0.5 block truncate text-xs text-zinc-500">
                    {{ pr.repo.fullName }} #{{ pr.number }} · @{{ pr.authorLogin }}
                  </span>
                </span>
                <ExternalLink
                  :size="13"
                  class="mt-0.5 shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100"
                />
              </button>
            </li>
          </ul>
          <p v-else class="px-2 py-3 text-sm text-zinc-600">Aucune review demandee.</p>
        </article>

        <!-- Depots -->
        <article class="flex min-h-0 flex-col rounded-2xl bg-white/[0.04] p-4 shadow-line">
          <header class="mb-3 flex items-center gap-2">
            <span class="grid size-7 place-items-center rounded-lg bg-accent-gold/10 text-accent-gold">
              <FolderGit2 :size="15" />
            </span>
            <h2 class="text-sm font-semibold text-zinc-100">Depots</h2>
            <span class="ml-auto text-xs tabular-nums text-zinc-500">{{ github.repos.length }}</span>
          </header>
          <ul v-if="github.repos.length" class="flex flex-col gap-0.5">
            <li v-for="repo in github.repos" :key="repo.id">
              <button
                class="group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.05]"
                type="button"
                @click="openExternal(repo.url)"
              >
                <FolderGit2 :size="15" class="mt-0.5 shrink-0 text-zinc-400" />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span class="truncate text-sm text-zinc-200">{{ repo.fullName }}</span>
                    <span
                      v-if="repo.isPrivate"
                      class="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400"
                    >prive</span>
                  </span>
                  <span v-if="repo.description" class="mt-0.5 block truncate text-xs text-zinc-500">
                    {{ repo.description }}
                  </span>
                  <span class="mt-1 flex items-center gap-3 text-[11px] text-zinc-600">
                    <span v-if="repo.language">{{ repo.language }}</span>
                    <span class="inline-flex items-center gap-1"><Star :size="11" /> {{ repo.stars }}</span>
                  </span>
                </span>
                <ExternalLink
                  :size="13"
                  class="mt-0.5 shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100"
                />
              </button>
            </li>
          </ul>
          <p v-else class="px-2 py-3 text-sm text-zinc-600">Aucun depot.</p>
        </article>

        <!-- Actions en cours / recentes -->
        <article class="flex min-h-0 flex-col rounded-2xl bg-white/[0.04] p-4 shadow-line">
          <header class="mb-3 flex items-center gap-2">
            <span class="grid size-7 place-items-center rounded-lg bg-accent-mint/10 text-accent-mint">
              <PlayCircle :size="15" />
            </span>
            <h2 class="text-sm font-semibold text-zinc-100">Actions</h2>
            <span class="ml-auto text-xs tabular-nums text-zinc-500">{{ github.workflowRuns.length }}</span>
          </header>
          <ul v-if="github.workflowRuns.length" class="flex flex-col gap-0.5">
            <li v-for="run in github.workflowRuns" :key="run.id">
              <button
                class="group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.05]"
                type="button"
                @click="openExternal(run.url)"
              >
                <component :is="runIcon(run)" :size="15" class="mt-0.5 shrink-0" :class="runTint(run)" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm text-zinc-200">{{ run.name }}</span>
                  <span class="mt-0.5 block truncate text-xs text-zinc-500">
                    {{ run.repo.fullName }} · {{ run.branch }}
                  </span>
                </span>
                <ExternalLink
                  :size="13"
                  class="mt-0.5 shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100"
                />
              </button>
            </li>
          </ul>
          <p v-else class="px-2 py-3 text-sm text-zinc-600">Aucun run recent.</p>
        </article>
      </div>
    </template>
  </section>
</template>
