import type { Config } from 'tailwindcss'

/**
 * Los colores NO se declaran aqui: se declaran como design tokens CSS
 * (--sl-*) en src/app/globals.css. Tailwind solo los referencia.
 * Regla del brief (57): toda la UI usa design tokens.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'sl-primary': 'rgb(var(--sl-primary) / <alpha-value>)',
        'sl-primary-soft': 'rgb(var(--sl-primary-soft) / <alpha-value>)',
        'sl-secondary': 'rgb(var(--sl-secondary) / <alpha-value>)',
        'sl-accent': 'rgb(var(--sl-accent) / <alpha-value>)',
        'sl-secondary-strong': 'rgb(var(--sl-secondary-strong) / <alpha-value>)',
        'sl-background': 'rgb(var(--sl-background) / <alpha-value>)',
        'sl-surface': 'rgb(var(--sl-surface) / <alpha-value>)',
        'sl-text': 'rgb(var(--sl-text) / <alpha-value>)',
        'sl-muted': 'rgb(var(--sl-muted) / <alpha-value>)',
        'sl-border': 'rgb(var(--sl-border) / <alpha-value>)',
        'sl-success': 'rgb(var(--sl-success) / <alpha-value>)',
        'sl-warning': 'rgb(var(--sl-warning) / <alpha-value>)',
        'sl-danger': 'rgb(var(--sl-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--sl-font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { sl: '10px' },
      boxShadow: {
        sl: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
}
export default config
