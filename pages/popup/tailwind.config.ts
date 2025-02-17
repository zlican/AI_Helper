import baseConfig from '@extension/tailwindcss-config';
import type { Config } from 'tailwindcss';

export default {
  ...baseConfig,
  theme: {
    extend: {
      width: {
        '25': '6.25rem', // 100px
      },
    },
  },
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
} as Config;
