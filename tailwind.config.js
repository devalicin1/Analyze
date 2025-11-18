/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        primary: {
          DEFAULT: '#0F8BFD',
          muted: '#E0F0FF',
        },
        gray: {
          50: '#F9FAFB',
          100: '#F2F4F7',
          200: '#EAECF0',
          300: '#D0D5DD',
          500: '#667085',
          700: '#344054',
          900: '#101828',
        },
      },
      boxShadow: {
        card: '0 4px 24px rgba(15, 139, 253, 0.04)',
      },
    },
  },
  plugins: [],
};

