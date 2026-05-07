/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-deep': '#05070a',
        'bg-surface': '#0f121a',
        'primary': '#6366f1',
        'secondary': '#ec4899',
        'accent': '#06b6d4',
        'core': '#10b981',
        'growth': '#3b82f6',
        'passive': '#f59e0b',
        'churn': '#ef4444',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}
