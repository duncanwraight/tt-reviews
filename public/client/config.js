/**
 * TailwindCSS Configuration
 * Modular configuration for design tokens and theming
 */

// Initialize Tailwind config if available
if (typeof tailwind !== 'undefined') {
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          primary: '#7c3aed',
          secondary: '#64748b',
          accent: '#14b8a6',
        },
        fontFamily: {
          sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        },
      },
    },
  }
}
