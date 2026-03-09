/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        haven: {
          bg:      '#0b1622',
          surface: '#122233',
          card:    '#172b40',
          border:  '#27445f',
          muted:   '#3b5d79',
          primary: '#2f7f9f',
          bright:  '#63adc8',
          glow:    '#236e8d',
          cyan:    '#4bc7e8',
          text:    '#ecf5fb',
          sub:     '#b7cad9',
          dim:     '#7f99ad',
        },
        severity: {
          critical: '#ef4444',
          high:     '#f97316',
          medium:   '#eab308',
          low:      '#22c55e',
        },
        verdict: {
          scam:       '#ef4444',
          legitimate: '#22c55e',
          unclear:    '#f97316',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-in':   'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up':   'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'spin-slow':  'spin 1.5s linear infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideIn:   { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        slideUp:   { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 20px rgba(47,127,159,0.3)' },
          '50%':     { boxShadow: '0 0 40px rgba(47,127,159,0.55)' },
        },
      },
      boxShadow: {
        card:      '0 4px 24px rgba(0,0,0,0.42), 0 1px 0 rgba(47,127,159,0.15)',
        glow:      '0 0 30px rgba(47,127,159,0.35)',
        'glow-sm': '0 0 12px rgba(47,127,159,0.22)',
      },
    },
  },
  plugins: [],
}
