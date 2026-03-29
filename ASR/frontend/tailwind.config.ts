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
        /* Premium warm gold & deep charcoal palette */
        gold: {
          50: '#faf9f7',
          100: '#f5e5d3',
          200: '#e5b896',
          300: '#d4a574',
          400: '#c89960',
          500: '#b88d4c',
          600: '#a87d38',
          700: '#8d6930',
          800: '#6b5d48',
          900: '#4d3f2e',
        },
        charcoal: {
          50: '#faf9f7',
          100: '#e8e5e0',
          200: '#d4cfc8',
          300: '#b8b0a5',
          400: '#8b8278',
          500: '#6b5d48',
          600: '#3a3340',
          700: '#2a2530',
          800: '#1a1820',
          900: '#0f0e13',
        },
        /* Legacy support for existing components */
        ink: {
          DEFAULT: '#1a1820',
          1: '#2a2530',
          2: '#3a3340',
          3: '#4a4450',
          4: '#5a5460',
          5: '#6a6470',
        },
        tx: {
          DEFAULT: '#faf9f7',
          2: '#d4a574',
          3: '#a89068',
          4: '#6b5d48',
        },
        accent: '#d4a574',
      },
      animation: {
        enter: 'enter 0.3s cubic-bezier(0.16,1,0.3,1) both',
        'enter-up': 'enter-up 0.4s cubic-bezier(0.16,1,0.3,1) both',
        breath: 'breath 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2.5s ease-in-out infinite',
        float: 'float 4s ease-in-out infinite',
        shimmer: 'shimmer 2s infinite',
        'fade-in-scale': 'fade-in-scale 0.3s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.16,1,0.3,1)',
      },
      keyframes: {
        enter: {
          from: { opacity: '0', transform: 'scale(0.98) translateY(4px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'enter-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        breath: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.6', boxShadow: '0 0 20px rgba(212, 165, 116, 0.15)' },
          '50%': { opacity: '1', boxShadow: '0 0 30px rgba(212, 165, 116, 0.25)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        'fade-in-scale': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
        '3.5': '14px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
      },
    },
  },
  plugins: [],
};

export default config;
