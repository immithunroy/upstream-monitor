import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        edge: 'rgb(var(--c-edge) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        tx: 'rgb(var(--c-tx) / <alpha-value>)',
        tx2: 'rgb(var(--c-tx2) / <alpha-value>)',
        tx3: 'rgb(var(--c-tx3) / <alpha-value>)',
        mut: 'rgb(var(--c-mut) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
