/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        haven: {
          bg:      '#12101f',
          surface: '#1c1830',
          card:    '#231f3c',
          border:  '#332d55',
          muted:   '#4a4272',
          primary: '#8b5cf6',
          bright:  '#a78bfa',
          glow:    '#7c3aed',
          cyan:    '#22d3ee',
          text:    '#f0ecff',
          sub:     '#b0a3d4',
          dim:     '#7a6fa0',
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
          '0%,100%': { boxShadow: '0 0 20px rgba(139,92,246,0.3)' },
          '50%':     { boxShadow: '0 0 40px rgba(139,92,246,0.6)' },
        },
      },
      boxShadow: {
        card:     '0 4px 24px rgba(0,0,0,0.5), 0 1px 0 rgba(139,92,246,0.1)',
        glow:     '0 0 30px rgba(139,92,246,0.4)',
        'glow-sm':'0 0 12px rgba(139,92,246,0.25)',
      },
    },
  },
  plugins: [],
}
