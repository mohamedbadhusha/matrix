/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Matrix Pro design tokens
        navy: {
          DEFAULT: '#0E0E36',
          dark:    '#08081E',
          light:   '#13133F',
        },
        panel: {
          dark:   '#13133F',
          mid:    '#1A1A52',
          light:  '#1F1F60',
        },
        accent: {
          cyan:   '#00D4FF',
          purple: '#7B2FBE',
        },
        profit:  '#00C896',
        loss:    '#FF4757',
        warning: '#FF6B35',
        border:  '#2A2A6C',
        muted:   '#6B7280',

        // shadcn/ui compatible tokens
        background:   '#0E0E36',
        foreground:   '#E2E8F0',
        card:         '#13133F',
        'card-foreground': '#E2E8F0',
        popover:      '#1A1A52',
        'popover-foreground': '#E2E8F0',
        primary:      '#00D4FF',
        'primary-foreground': '#08081E',
        secondary:    '#1A1A52',
        'secondary-foreground': '#94A3B8',
        muted2:       '#1F1F60',
        'muted-foreground': '#6B7280',
        destructive:  '#FF4757',
        'destructive-foreground': '#FFFFFF',
        input:        '#2A3A5C',
        ring:         '#00D4FF',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'price': ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
      },
      boxShadow: {
        'glow-cyan':   '0 0 20px rgba(0, 212, 255, 0.3)',
        'glow-green':  '0 0 20px rgba(0, 200, 150, 0.3)',
        'glow-red':    '0 0 20px rgba(255, 71, 87, 0.3)',
        'glow-purple': '0 0 20px rgba(123, 47, 190, 0.3)',
        'panel':       '0 4px 24px rgba(0, 0, 0, 0.4)',
      },
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(42, 58, 92, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(42, 58, 92, 0.3) 1px, transparent 1px)',
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dark': 'linear-gradient(135deg, #1A1A2E 0%, #0F3460 100%)',
      },
      backgroundSize: {
        'grid': '32px 32px',
      },
    },
  },
  plugins: [],
};
