/**
 * Environment variable utilities for handling both Cloudflare Workers and standard development
 */

import type { AppLoadContext } from "react-router";

/**
 * Get environment variable from either Cloudflare Workers or standard Node.js environment
 */
export function getEnvVar(context: AppLoadContext, key: string): string {
  // Try Cloudflare env first (for production and npm run dev:wrangler)
  if (context.cloudflare?.env) {
    return (context.cloudflare.env as any)[key] || '';
  }
  
  // Fallback to process.env for standard React development (npm run dev)
  return process.env[key] || '';
}

/**
 * Get Supabase configuration for the current environment
 */
export function getSupabaseConfig(context: AppLoadContext) {
  const supabaseUrl = getEnvVar(context, 'SUPABASE_URL') || 'http://localhost:54321';
  const supabaseAnonKey = getEnvVar(context, 'SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  
  return {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
  };
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(context: AppLoadContext): boolean {
  const environment = getEnvVar(context, 'ENVIRONMENT');
  const nodeEnv = getEnvVar(context, 'NODE_ENV');
  
  return (
    environment === 'development' ||
    nodeEnv === 'development' ||
    !nodeEnv || // If NODE_ENV is not set, assume development
    nodeEnv !== 'production'
  );
}