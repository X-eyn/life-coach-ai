import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#FA954C',
          light: '#FDB97A',
          dark: '#E07035',
        },
        surface: {
          0: '#0A0A0B',
          1: '#111113',
          2: '#18181B',
          3: '#1F1F23',
          4: '#27272B',
        },
        border: 'rgba(255,255,255,0.08)',
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease forwards',
        'slide-up': 'slide-up 0.4s ease forwards',
        pulse2: 'pulse2 2s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulse2: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
