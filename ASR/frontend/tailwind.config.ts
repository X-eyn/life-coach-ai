import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: {
          DEFAULT: '#07070A',
          1: '#0D0D11',
          2: '#131318',
          3: '#1A1A21',
          4: '#22222B',
          5: '#2C2C37',
        },
        tx: {
          DEFAULT: '#EDEDF0',
          2: '#8E8E9E',
          3: '#57576A',
          4: '#35353F',
        },
        accent: '#F97316',
      },
      animation: {
        enter:    'enter 0.3s cubic-bezier(0.16,1,0.3,1) both',
        'enter-up': 'enter-up 0.4s cubic-bezier(0.16,1,0.3,1) both',
        breath:   'breath 3s ease-in-out infinite',
      },
      keyframes: {
        enter: {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to:   { opacity: '1', transform: 'scale(1)'    },
        },
        'enter-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to:   { opacity: '1', transform: 'translateY(0)'    },
        },
        breath: {
          '0%,100%': { opacity: '1'   },
          '50%':      { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
