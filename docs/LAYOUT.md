# TT Reviews Layout Documentation

## Overall Site Structure

### Global Header

- **Logo/Brand** (left): "TT Reviews"
- **Primary Search Bar** (center): Prominent, always visible with autocomplete
- **Navigation Menu** (right): Equipment | Players | About | Login/Profile
- **Mobile**: Hamburger menu with search bar remaining prominent

### Homepage Layout

```
[Hero Section]
- Search bar (larger version)
- Tagline: "Trusted table tennis equipment reviews by the community"

[Featured Reviews] (3-column grid)
- Latest highly-rated equipment reviews
- Card format with image, equipment name, average rating, review count

[Popular Players] (horizontal scroll)
- Profile cards with player photo, name, highest rating

[Equipment Categories] (2x3 grid)
- Blades | Forehand Rubbers | Backhand Rubbers
- Long Pips | Anti-Spin | Training Equipment
```

## Equipment Review Pages

### Individual Equipment Page (e.g., "Curl P1-R")

```
[Equipment Header]
- Large product image (left)
- Equipment name, manufacturer, specifications (right)
- Overall rating stars + review count
- "Used by" player avatars (linking to profiles)

[Sidebar] (Left, 25% width)
- Filter reviews by:
  - Playing level
  - Style of play
  - Thickness (for rubbers)
  - Duration of testing
- Sort options

[Main Content] (Right, 75% width)
- Rating breakdown chart (spin/speed/control bars)
- Individual review cards:
  - Reviewer context (level, style, testing details)
  - Rating scores with visual bars
  - Written review
  - Other equipment used during testing
  - Purchase details
```

## Player Profile Pages

```
[Player Header]
- Professional photo (left)
- Name, highest rating, active years (center)
- Quick stats: Country, playing style, notable achievements (right)

[Navigation Tabs]
- Equipment Timeline | Videos | Career Stats

[Equipment Timeline] (Default view)
- Chronological equipment changes
- Each entry shows: Year, blade + rubbers, source link
- Equipment cards link to review pages

[Videos Section]
- Embedded YouTube videos
- User-submitted quality footage
- Organized by year/tournament

[Sponsors Timeline]
- Chronological sponsor relationships
- Company logos with date ranges
```

## Search & Equipment Finder Pages

### Equipment Finder

```
[Search Builder] (Left sidebar, 30%)
- Playing style selection
- Desired characteristics (spin/speed/control sliders)
- Equipment type filters
- Price range
- Brand preferences

[Results Grid] (Right, 70%)
- Equipment cards with key specs
- Match percentage based on criteria
- Quick comparison checkboxes
- Sort by: Relevance | Rating | Price | Newest
```

### Search Results

```
[Filters] (Collapsible left sidebar)
- Equipment type
- Price range
- Rating minimum
- Brand

[Results List]
- Mixed content: equipment + players
- Clear type indicators
- Snippet text with search term highlighting
```

## Key Layout Patterns

### Review Cards

```
[Image] [Equipment Name + Rating Stars]
[Reviewer Level/Style] [Key Metrics Bars]
[Review Snippet...] [Read More →]
```

### Player Cards

```
[Photo] [Player Name]
[Highest Rating] [Active Years]
[Current Equipment Preview]
```

### Responsive Behavior

- **Desktop**: Full sidebar layouts with 70/30 or 75/25 splits
- **Tablet**: Collapsible sidebars, stack on narrow screens
- **Mobile**: Single column, prominent search, touch-friendly filters

### Navigation Patterns

- **Breadcrumbs**: Equipment > Rubbers > Forehand > Curl P1-R
- **Cross-references**: "Players using this equipment" / "Equipment used by this player"
- **Related suggestions**: "Similar equipment" / "Players with similar style"

## Implementation Priorities

1. **Global Header & Navigation** - Foundation for all pages
2. **Homepage Layout** - Primary entry point and content discovery
3. **Search Components** - Core functionality across the platform
4. **Equipment Review Pages** - Primary content type
5. **Player Profile Pages** - Secondary content type
6. **Advanced Search/Finder** - Enhanced user experience

## Design System Integration

This layout implements the principles from STYLE-GUIDE.md:

- **Clean & Minimal**: Generous white space, subtle visual elements
- **Search-First**: Prominent search functionality always visible
- **Content-Focused**: Reviews and equipment data as primary focus
- **Globally Accessible**: Responsive design across devices

Layout uses the established color palette, typography hierarchy, and component patterns defined in the style guide.
