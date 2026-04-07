/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        danger: '#ef4444',
        success: '#10b981',
      },
      animation: {
        'swipe-left': 'swipeLeft 0.3s ease-out',
        'swipe-right': 'swipeRight 0.3s ease-out',
      },
      keyframes: {
        swipeLeft: {
          '0%': { transform: 'translateX(0) rotate(0)' },
          '100%': { transform: 'translateX(-200%) rotate(-20deg)' }
        },
        swipeRight: {
          '0%': { transform: 'translateX(0) rotate(0)' },
          '100%': { transform: 'translateX(200%) rotate(20deg)' }
        }
      }
    },
  },
  plugins: [],
}