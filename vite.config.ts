import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
    }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk - core React and router libraries
          vendor: ['react', 'react-dom', 'react-router'],
          
          // Supabase chunk - authentication and database
          supabase: ['@supabase/supabase-js', '@supabase/ssr'],
          
          // UI chunk - common UI components and utilities
          ui: ['react-hook-form', 'tailwindcss'],
        },
      },
    },
    
    // Enable compression and minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
    
    // Enable source maps in development
    sourcemap: process.env.NODE_ENV === 'development',
  },
  
  // Performance optimizations
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router',
      '@supabase/supabase-js',
      '@supabase/ssr',
    ],
  },
});
