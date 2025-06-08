# TT Reviews Style Guide

## Overview
This style guide defines the visual design principles and implementation guidelines for the TT Reviews platform. Our design emphasizes clarity, accessibility, and modern aesthetics while serving the global table tennis community.

## Design Principles

### 1. Clean & Minimal
- Generous white space for visual breathing room
- Subtle visual elements that don't compete with content
- Clear visual hierarchy through typography and spacing

### 2. Search-First
- Prominent search functionality always visible
- Clear filtering options with intuitive controls
- Fast, responsive search experience

### 3. Content-Focused
- Reviews and equipment data are the primary focus
- Community features enhance but don't overshadow content
- Scannable layouts for quick decision-making

### 4. Globally Accessible
- Works across devices and screen sizes
- Supports multiple languages and character sets
- Accessible to users with disabilities (WCAG 2.1 AA)

## Visual Elements

### Layout Patterns
- **Card-based design** for equipment listings and reviews
- **Sidebar filtering** for advanced search options
- **Responsive grid systems** that adapt to screen size
- **Consistent spacing** using 8px grid system

### Shadows & Borders
- **Subtle shadows** for depth without heaviness
- **1px borders** in neutral colors for definition
- **Border radius** of 8px for modern, friendly feel

### Interactive Elements
- **Clear hover states** with subtle color changes
- **Focus indicators** for keyboard navigation
- **Loading states** for better perceived performance

## Typography

### Primary Font: Plus Jakarta Sans
- **Font Family**: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- **Characteristics**: Contemporary design, excellent legibility, international support
- **Usage**: All body text, headings, interface elements
- **Weights Available**: 200, 300, 400, 500, 600, 700, 800
- **Google Fonts**: Available as web font for optimal performance

### Font Hierarchy
- **Heading 1 (H1)**: 32px, Weight 700, Line height 1.2
- **Heading 2 (H2)**: 24px, Weight 600, Line height 1.3
- **Heading 3 (H3)**: 20px, Weight 600, Line height 1.4
- **Body Text**: 16px, Weight 400, Line height 1.5
- **Small Text**: 14px, Weight 400, Line height 1.4
- **Caption**: 12px, Weight 500, Line height 1.3

## Color Palette

### Modern Neutral Scheme
- **Primary**: Deep Purple `#7c3aed`
  - Used for: Primary buttons, active states, brand elements
  - Conveys: Innovation, quality, premium feel
  
- **Secondary**: Cool Gray `#64748b`
  - Used for: Secondary text, borders, inactive states
  - Conveys: Professionalism, neutrality
  
- **Accent**: Teal `#14b8a6`
  - Used for: Highlights, success states, positive ratings
  - Conveys: Growth, success, positive action
  
- **Background**: Off-White `#fafafa`
  - Used for: Page backgrounds, card backgrounds
  - Provides: Clean, minimal foundation
  
- **Text**: Near-Black `#18181b`
  - Used for: Primary text content
  - Ensures: Maximum readability and contrast

### Extended Palette
- **Success**: Green `#10b981` - Positive ratings, confirmations
- **Warning**: Amber `#f59e0b` - Moderate ratings, cautions  
- **Error**: Red `#ef4444` - Negative ratings, errors
- **Info**: Blue `#3b82f6` - Information, links

### Usage Guidelines
- Maintain 4.5:1 contrast ratio minimum for accessibility
- Use primary color sparingly for maximum impact
- Teal accent should highlight important actions only
- Background variations: White `#ffffff` for cards, Gray `#f1f5f9` for sections

## Component Guidelines

### Navigation
- Clean, horizontal navigation bar
- Active state clearly indicated
- Mobile-first responsive behavior

### Search & Filtering
- Prominent search bar with autocomplete
- Collapsible filter sections
- Clear filter state indicators
- Easy filter removal

### Review Cards
- Equipment image prominently displayed
- Key metrics easily scannable
- Reviewer context clearly shown
- Action buttons consistently placed

### Player Profiles
- Professional headshots when available
- Equipment timeline clearly structured
- Source links prominently displayed
- Sponsor information organized chronologically

## Implementation Notes

### CSS Framework
- Consider Tailwind CSS for utility-first approach
- Maintain consistent spacing with design tokens
- Use CSS custom properties for theme variables

### Performance
- Optimize images for fast loading
- Progressive enhancement for advanced features
- Mobile-first responsive design

### Accessibility
- Maintain color contrast ratios (4.5:1 minimum)
- Provide alt text for all images
- Ensure keyboard navigation works throughout
- Use semantic HTML elements

## References
This style guide is referenced in:
- README.md for project overview
- CLAUDE.md for development guidance
- Implementation documentation