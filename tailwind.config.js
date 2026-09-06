/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff', 100: '#d9ebff', 200: '#bcdcff', 300: '#8ec6ff',
          400: '#59a6ff', 500: '#3385fc', 600: '#1f66f1', 700: '#1a51dd',
          800: '#1c44b3', 900: '#1d3d8d', 950: '#162656'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
