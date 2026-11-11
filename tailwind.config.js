/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        card: v('card'),
        field: v('field'),
        line: v('line'),
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), mute: v('ink-mute') },
        brand: { DEFAULT: v('brand'), dark: v('brand-dark') },
        mint: { DEFAULT: v('mint'), dark: v('mint-dark') },
        flame: { DEFAULT: v('flame'), dark: v('flame-dark') },
        grape: { DEFAULT: v('grape'), dark: v('grape-dark') },
        wrong: { DEFAULT: v('wrong'), dark: v('wrong-dark') },
      },
      fontFamily: { sans: ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      opacity: { 8: '0.08', 12: '0.12', 15: '0.15', 35: '0.35', 85: '0.85' },
      borderRadius: { xl2: '14px', card: '18px' },
      boxShadow: {
        soft: '0 1px 2px rgb(15 23 42 / .04), 0 4px 16px -6px rgb(15 23 42 / .10)',
      },
      keyframes: {
        rise: { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'none' } },
        pop: { '0%': { transform: 'scale(.9)', opacity: 0 }, '100%': { transform: 'scale(1)', opacity: 1 } },
      },
      animation: { rise: 'rise .22s ease-out both', pop: 'pop .3s cubic-bezier(.2,.8,.2,1) both' },
    },
  },
  plugins: [],
}
