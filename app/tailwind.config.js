/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#111827',
        secondary: '#4B5563',
        accent: '#2563EB',
        accentAlt: '#14B8A6',
        surface: '#F9FAFB',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        content: '1200px',
      },
      boxShadow: {
        card: '0 20px 45px -24px rgba(15, 23, 42, 0.45)',
      },
    },
  },
  plugins: [],
}

