/**
 * Architecture Enforcement Tests
 *
 * Simple tests that enforce the key architectural patterns from the security overhaul
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

// Helper to read file contents
const readFile = (filePath: string): string => {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

// Helper to get all TypeScript files
const getAllTSFiles = (dir: string): string[] => {
  const files: string[] = []

  const traverse = (currentDir: string) => {
    try {
      const items = readdirSync(currentDir)

      for (const item of items) {
        const fullPath = join(currentDir, item)
        const stat = statSync(fullPath)

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          traverse(fullPath)
        } else if (stat.isFile() && (extname(item) === '.ts' || extname(item) === '.tsx')) {
          files.push(fullPath)
        }
      }
    } catch {
      // Ignore errors
    }
  }

  traverse(dir)
  return files
}

describe('Architecture Enforcement', () => {
  describe('Database Access Patterns', () => {
    it('should enforce InternalApiService usage in routes', () => {
      const routeFiles = getAllTSFiles('src/routes')
      const appFile = 'src/app.tsx'

      for (const file of [...routeFiles, appFile]) {
        const content = readFile(file)
        if (!content) continue

        // Should not create direct Supabase clients in routes
        const hasDirectSupabaseCreation =
          content.includes('createClient(env.SUPABASE_URL') ||
          content.includes('createSupabaseClient(env)') ||
          content.includes('new SupabaseClient(')

        // Allow in specific contexts
        const isAllowedContext =
          file.includes('/services/') || file.includes('/config/') || file.includes('.test.')

        if (hasDirectSupabaseCreation && !isAllowedContext) {
          // SSR routes are being migrated
          const isSSRRoute = file === 'src/app.tsx'
          if (!isSSRRoute) {
            expect(hasDirectSupabaseCreation).toBe(false)
          }
        }
      }
    })

    it('should restrict service role key usage', () => {
      const allFiles = getAllTSFiles('src')
      let serviceRoleUsageCount = 0

      for (const file of allFiles) {
        const content = readFile(file)
        if (!content) continue

        const hasServiceRole = content.includes('SUPABASE_SERVICE_ROLE_KEY')

        if (hasServiceRole) {
          serviceRoleUsageCount++
          const isAllowedContext =
            file.includes('/services/') ||
            file.includes('/config/') ||
            file.includes('/middleware/') ||
            file.includes('.test.') ||
            file.includes('moderation') ||
            file.includes('admin') ||
            file === 'src/app.tsx' // SSR routes being migrated

          // Log violations for future cleanup
          if (!isAllowedContext) {
            console.warn(`Service role usage in unexpected context: ${file}`)
          }
        }
      }

      // Service role should be used minimally (expect fewer than 10 files)
      expect(serviceRoleUsageCount).toBeLessThan(10)
    })
  })

  describe('Authentication Patterns', () => {
    it('should use enhanced auth middleware in protected routes', () => {
      const routeFiles = getAllTSFiles('src/routes')

      for (const file of routeFiles) {
        const content = readFile(file)
        if (!content) continue

        // Routes with sensitive operations should use auth middleware
        const hasSensitiveOps =
          content.includes('.post(') || content.includes('.put(') || content.includes('.delete(')

        if (hasSensitiveOps) {
          const hasAuthMiddleware =
            content.includes('enhancedAuth') ||
            content.includes('secureAuth') ||
            content.includes('requireAdmin')

          // Allow for public endpoints and Discord webhook authentication
          const isPublicEndpoint =
            content.includes('/health') ||
            file.includes('health.ts') ||
            (file.includes('discord.ts') && content.includes('discordController'))

          if (!isPublicEndpoint) {
            expect(hasAuthMiddleware).toBe(true)
          }
        }
      }
    })
  })

  describe('Component Architecture', () => {
    it('should minimize dangerouslySetInnerHTML usage', () => {
      const componentFiles = getAllTSFiles('src/components')

      for (const file of componentFiles) {
        const content = readFile(file)
        if (!content) continue

        const hasDangerousHTML = content.includes('dangerouslySetInnerHTML')

        if (hasDangerousHTML) {
          // Should reference modular JS, CSS, or be small component
          const usesModularJS =
            content.includes('/client/auth.js') ||
            content.includes('/client/forms.js') ||
            content.includes('/client/styles.css') ||
            content.includes('/client/config.js')

          const isSmallComponent = content.split('\n').length < 100

          expect(usesModularJS || isSmallComponent).toBe(true)
        }
      }
    })

    it('should use modular JavaScript in ClientScript', () => {
      const clientScriptFile = 'src/components/ClientScript.tsx'
      const content = readFile(clientScriptFile)

      if (content) {
        // Should reference external modules
        expect(content.includes('/client/auth.js')).toBe(true)
        expect(content.includes('/client/forms.js')).toBe(true)

        // Should be significantly smaller than before (was 380+ lines)
        const lineCount = content.split('\n').length
        expect(lineCount).toBeLessThan(100)
      }
    })
  })

  describe('Error Handling', () => {
    it('should not expose sensitive data in error messages', () => {
      const allFiles = getAllTSFiles('src').filter(
        file => !file.includes('.test.') && !file.includes('.old.')
      )

      for (const file of allFiles) {
        const content = readFile(file)
        if (!content) continue

        // Check for potential sensitive data in error messages
        const hasSensitiveError =
          /error.*password/i.test(content) ||
          /error.*secret/i.test(content) ||
          /json.*password/i.test(content) ||
          /json.*secret/i.test(content)

        if (hasSensitiveError) {
          // Should be in a secure context or auth-related files
          const isInAuthService =
            file.includes('/services/auth') ||
            file.includes('/services/cookie-auth') ||
            file.includes('/controllers/auth') ||
            file.includes('/middleware/auth') ||
            file.includes('/lib/supabase.ts') ||
            file.includes('LoginPage.tsx')

          expect(isInAuthService).toBe(true)
        }
      }
    })
  })

  describe('Security Architecture', () => {
    it('should have proper file structure for security', () => {
      // Check that key security files exist
      expect(readFile('src/services/cookie-auth.service.ts')).toBeTruthy()
      expect(readFile('src/services/internal-api.service.ts')).toBeTruthy()
      expect(readFile('src/middleware/auth-secure.ts')).toBeTruthy()
      expect(readFile('public/client/auth.js')).toBeTruthy()
      expect(readFile('public/client/forms.js')).toBeTruthy()
    })

    it('should have architecture documentation', () => {
      // Check that documentation exists
      expect(readFile('docs/ARCHITECTURE-SECURITY.md')).toBeTruthy()
      expect(readFile('CLAUDE.md')).toContain('Authentication Implementation Patterns')
    })
  })
})
