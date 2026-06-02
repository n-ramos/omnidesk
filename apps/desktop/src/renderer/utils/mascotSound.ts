// Petit son doux et chaleureux joue quand Elodie prend la parole.
// Synthetise via Web Audio : aucun fichier audio a embarquer.

let context: AudioContext | null = null

const getContext = (): AudioContext | null => {
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      context = new Ctor()
    }
    if (context.state === 'suspended') {
      void context.resume()
    }
    return context
  } catch {
    return null
  }
}

interface Note {
  freq: number
  start: number
  dur: number
}

const NOTES: Note[] = [
  { freq: 680, start: 0, dur: 0.15 },
  { freq: 540, start: 0.12, dur: 0.2 },
]

/** Joue un bref « hou-hou » discret (deux notes sinus descendantes, filtrees). */
export const playMascotChirp = (): void => {
  const audio = getContext()
  if (!audio) return

  const now = audio.currentTime
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2000
  filter.connect(audio.destination)

  for (const { freq, start, dur } of NOTES) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    const t0 = now + start
    const t1 = t0 + dur

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t0)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.9, t1)

    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t1)

    osc.connect(gain)
    gain.connect(filter)
    osc.start(t0)
    osc.stop(t1 + 0.03)
  }
}
