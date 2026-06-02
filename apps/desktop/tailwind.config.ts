import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{html,vue,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          // Degrade de fond personnalisable a chaud : chaque nuance pointe sur une
          // variable CSS (canaux RGB) definie dans styles.css, derivee d'une couleur de
          // base au runtime (cf. utils/baseColor.ts). Format channels + <alpha-value>
          // pour conserver les modificateurs d'opacite (ink-950/70, etc.).
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          925: 'rgb(var(--ink-925) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          750: 'rgb(var(--ink-750) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
        },
        accent: {
          // Couleur d'accent principale, personnalisable a chaud : pilotee par la
          // variable CSS --accent-mint (canaux RGB) definie dans styles.css et
          // reecrite au runtime. Le format channels + <alpha-value> est requis pour
          // que les modificateurs d'opacite (accent-mint/15, etc.) restent valides.
          // Les autres accents restent fixes (roles semantiques : erreur, info...).
          mint: 'rgb(var(--accent-mint) / <alpha-value>)',
          coral: '#ff987a',
          sky: '#8bbcff',
          gold: '#f4c76f',
          lilac: '#c6a7ff',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 24px 70px rgba(0, 0, 0, 0.34)',
        line: 'inset 0 0 0 1px rgba(255, 255, 255, 0.045)',
        lift: '0 18px 46px rgba(0, 0, 0, 0.22), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
      },
    },
  },
  plugins: [],
} satisfies Config
