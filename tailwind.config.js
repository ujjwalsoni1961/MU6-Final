/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#74e5ea', light: '#b8f2f5', dark: '#38b4ba' },
        secondary: { DEFAULT: '#8b5cf6', light: '#a78bfa', dark: '#7c3aed' },
        glass: { DEFAULT: 'rgba(255,255,255,0.25)', border: 'rgba(255,255,255,0.3)' },
        surface: { DEFAULT: '#ffffff', dim: '#f8fafc' },
        'text-main': '#0f172a',
        'text-muted': '#64748b',
        'text-light': '#94a3b8',
        'bg-base': '#f0f9fa',
      },
      fontFamily: {
        sans: ['PlusJakartaSans', 'System'],
      },
      borderRadius: {
        button: '12px',
        card: '20px',
      },
    },
  },
  plugins: [],
};
