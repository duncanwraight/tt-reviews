# Coding Standards for TT Reviews

This document outlines coding standards and best practices for the TT Reviews application built with Hono.

## Table of Contents

- [TypeScript Configuration](#typescript-configuration)
- [Hono Framework Patterns](#hono-framework-patterns)
- [JSX Components](#jsx-components)
- [Client-Side Interactions](#client-side-interactions)
- [Forms and Event Handling](#forms-and-event-handling)
- [Data Services](#data-services)
- [Error Handling](#error-handling)
- [File Organization](#file-organization)
- [Code Quality](#code-quality)

## TypeScript Configuration

### Required Settings

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Type Safety Rules

- **No `any` types**: Always use proper TypeScript types
- **Import specific types**: Use `{ createClient, SupabaseClient }` instead of generic imports
- **Proper type assertions**: Use `as Record<string, string>` for environment variables
- **Remove unused variables**: Prefix with underscore if intentionally unused

## Hono Framework Patterns

### Route Handlers

**✅ Preferred**: Write handlers directly after path definitions

```typescript
app.get('/players/:slug', async (c) => {
  const slug = c.req.param('slug')
  // Handler logic here
  return c.render(<PlayerPage />)
})
```

**❌ Avoid**: Ruby on Rails-like controllers unless using `factory.createHandlers()`

### Application Structure

- Use `app.route()` for modular applications
- Separate routes into different files
- Mount route modules using the route method

```typescript
// routes/players.ts
const players = new Hono()
  .get('/:slug', PlayersController.getPlayer)
  .post('/submit', PlayersController.submitPlayer)

// app.tsx
app.route('/api/players', players)
```

### Middleware Usage

- Apply middleware in logical order: CORS → Logging → Error Handling → Auth
- Use validation middleware like `zValidator` for request validation
- Create reusable middleware for common functionality

## JSX Components

### Component Definition

```typescript
import { FC } from 'hono/jsx'

interface ComponentProps {
  title: string
  children?: any
}

export const Component: FC<ComponentProps> = ({ title, children }) => {
  return (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  )
}
```

### Component Best Practices

- Use `FC` type for all functional components
- Define prop interfaces for type safety
- Support fragments with `<>...</>` when appropriate
- Use async components when data fetching is required
- Leverage context for shared state via `createContext` and `useContext`

### Server-Side Rendering (SSR)

- Primary JSX usage is for SSR
- Components render to HTML strings
- No client-side JavaScript by default
- Use Layout components for consistent page structure

## Client-Side Interactions

### When to Use Client Components

- Form submissions with validation feedback
- Interactive UI elements (counters, toggles)
- Real-time updates or dynamic content
- Complex user interactions

### Client Component Setup

```typescript
// Use hono/jsx/dom for client-side
import { useState, useEffect } from 'hono/jsx/dom'
import { render } from 'hono/jsx/dom'

function InteractiveComponent() {
  const [state, setState] = useState(initialValue)

  return (
    <div onClick={() => setState(newValue)}>
      Interactive content
    </div>
  )
}

// Mount to DOM
const root = document.getElementById('root')
render(<InteractiveComponent />, root)
```

### Event Handling

- Use standard event handlers: `onClick`, `onSubmit`, `onChange`
- Keep event handlers simple and delegate to functions
- Use `preventDefault()` to prevent default browser behavior
- Properly handle async operations in event handlers

## Forms and Event Handling

### Form Patterns

**✅ Recommended**: Use progressive enhancement

```typescript
// Server-side form with client enhancement
export function PlayerForm({ player }: PlayerFormProps) {
  return (
    <form id="player-form" method="POST" action="/api/players/submit">
      <input name="name" required defaultValue={player?.name} />
      <button type="submit">Submit</button>
    </form>
  )
}

// Client-side enhancement
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('player-form')
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      // Enhanced submission logic
      await handleFormSubmission(e)
    })
  }
})
```

### Event Handler Best Practices

- Use `addEventListener` for dynamic event binding
- Implement proper error handling in async handlers
- Provide user feedback during async operations
- Reset form state appropriately after submission

### Form Validation

- Implement both client and server-side validation
- Use HTML5 validation attributes as first line of defense
- Provide clear error messages to users
- Use validation middleware on API endpoints

## Data Services

### Service Layer Pattern

```typescript
export class PlayerService {
  constructor(private supabase: SupabaseClient) {}

  async getPlayer(slug: string): Promise<Player | null> {
    const { data, error } = await this.supabase
      .from('players')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error) {
      console.error('Error fetching player:', error)
      return null
    }

    return data as Player
  }
}
```

### Database Operations

- Always handle errors gracefully
- Use proper TypeScript types for database responses
- Implement consistent error logging
- Return null/empty arrays instead of throwing for not-found cases
- Use transactions for multi-table operations

## Error Handling

### API Error Responses

```typescript
// Consistent error response format
if (!playerData.name) {
  return c.json(
    {
      success: false,
      message: 'Player name is required',
    },
    400
  )
}

// Success response format
return successResponse(c, { player: createdPlayer })
```

### Client-Side Error Handling

```typescript
try {
  const response = await fetch('/api/endpoint')
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.message || 'Request failed')
  }

  // Handle success
} catch (error) {
  console.error('Operation failed:', error)
  // Show user-friendly error message
}
```

## File Organization

### Directory Structure

```
src/
├── components/
│   ├── pages/           # Page-level components
│   └── ui/              # Reusable UI components
├── controllers/         # Route handlers (if using controller pattern)
├── middleware/          # Custom middleware
├── routes/             # Route definitions
├── services/           # Business logic and data access
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
```

### Naming Conventions

- **Components**: PascalCase (e.g., `PlayerForm.tsx`)
- **Files**: kebab-case for non-components (e.g., `players.service.ts`)
- **Variables**: camelCase
- **Constants**: SCREAMING_SNAKE_CASE
- **Database tables**: snake_case

## Code Quality

### Linting and Formatting

- Run `npm run check` before commits
- Fix all TypeScript errors
- Follow ESLint rules consistently
- Use Prettier for code formatting

### Performance Considerations

- Minimize client-side JavaScript bundle size
- Use server-side rendering for initial page loads
- Implement proper caching strategies
- Optimize database queries with proper indexing

### Security Best Practices

- Validate all user inputs
- Use parameterized queries (Supabase handles this)
- Implement proper authentication and authorization
- Never expose sensitive information in client-side code
- Use HTTPS in production

### Testing Standards

- Write unit tests for business logic
- Test API endpoints with various inputs
- Implement integration tests for critical user flows
- Use proper mocking for external dependencies

## Comments and Documentation

### When to Comment

- Complex business logic
- Non-obvious workarounds
- API endpoint documentation
- Component prop interfaces

### What NOT to Comment

- Self-explanatory code
- Obvious operations
- Code that can be made clearer through refactoring

### JSDoc for Public APIs

```typescript
/**
 * Creates a new player with optional equipment setup
 * @param playerData - Basic player information
 * @param equipmentSetup - Optional equipment configuration
 * @returns Created player with generated slug
 */
async createPlayer(
  playerData: Omit<Player, 'id' | 'created_at' | 'updated_at'>,
  equipmentSetup?: EquipmentSetup
): Promise<Player | null>
```

## Commit Standards

### Commit Message Format

```
type(scope): description

Examples:
feat(players): add equipment setup form validation
fix(auth): resolve session storage issue
docs(readme): update installation instructions
```

### Pre-commit Checklist

1. Run `npm run check` (lint, format, type check)
2. Test changes manually
3. Update documentation if needed
4. Ensure no console.log statements in production code
5. Verify no sensitive data in commits
