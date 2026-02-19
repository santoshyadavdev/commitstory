const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      animation: {
        blob: 'blob 7s infinite ease-in-out',
        'fade-in': 'fadeIn 0.8s ease-out both',
        'fade-in-slow': 'fadeIn 0.8s ease-out 0.3s both',
        'fade-in-slower': 'fadeIn 0.8s ease-out 0.6s both',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'gradient-shift': 'gradientShift 6s ease infinite',
      },
      keyframes: {
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        gradientShift: {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
      },
      colors: {
        angular: { DEFAULT: '#dd0031', dark: '#c3002f' },
        tailwind: { DEFAULT: '#06b6d4', dark: '#0891b2' },
        gemini: { DEFAULT: '#4285f4', dark: '#1a73e8' },
      },
    },
  },
  plugins: [],
};
