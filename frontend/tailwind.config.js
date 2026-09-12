/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#101010',
          surface: '#1A1A1A',
          card: '#1A1A1A',
          border: '#2A2A2A',
          hover: '#222222',
        },
        text: {
          primary: '#EAEAEA',
          secondary: '#A0A0A0',
          muted: '#666666',
        },
        brand: {
          accent: '#64748B', // Cool slate accent
          active: '#38BDF8', // Subtle sky blue for highlights
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.035em',
        tight: '-0.02em',
        normal: '0em',
        wide: '0.025em',
      }
    },
  },
  plugins: [],
}
