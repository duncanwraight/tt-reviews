# Submission System Refactor Plan

## Overview
This document outlines a comprehensive refactor of the submission system to eliminate code duplication, improve consistency, and implement missing features. The refactor will consolidate 6 submission types into a unified, configuration-driven system.

## Current Submission Types
1. Equipment submissions (`equipment_submissions`)
2. Player submissions (`player_submissions`) 
3. Player edits (`player_edits`)
4. Video submissions (`video_submissions`)
5. Equipment reviews (`equipment_reviews`)
6. Player equipment setups (`player_equipment_setups`)

## Issues Identified
- **Code Duplication**: Forms, admin interfaces, Discord notifications, and database operations are duplicated across all submission types
- **Inconsistent UX**: Different styling, validation, and error handling patterns
- **Missing Features**: Incomplete Discord integration, inconsistent form modals, fragmented admin navigation
- **Maintenance Burden**: Adding new submission types requires changes in 4+ places

---

## Phase 1: Foundation & Infrastructure

### 1.1 Create Type System & Registry
- [ ] Define unified `SubmissionType` union type covering all submission types
- [ ] Create `SubmissionConfig` interface for type-specific configuration
- [ ] Build submission registry (`app/lib/submissions/registry.ts`) with configs for each type
- [ ] Define standard field types and validation schemas
- [ ] Create shared TypeScript interfaces for all submission data structures

### 1.2 Standardize Database Schema
- [ ] Review all submission table schemas for consistency
- [ ] Add missing columns to align with standard pattern (if needed)
- [ ] Ensure all tables have proper RLS policies
- [ ] Update migration files to reflect schema standardization
- [ ] Verify moderator_approvals table supports all submission types

### 1.3 Enhanced Moderation Service
- [ ] Extend existing `moderation.server.ts` to handle all submission types generically
- [ ] Add support for video submissions in moderation workflow
- [ ] Implement generic approval/rejection methods
- [ ] Add audit logging for all moderation actions
- [ ] Create helper methods for status transitions

---

## Phase 2: Discord Integration Consolidation

### 2.1 Unified Discord Notification System
- [ ] Create generic `SubmissionNotifier` class in `app/lib/discord/`
- [ ] Consolidate all Discord notification functions into single service
- [ ] Ensure consistent formatting across all submission types
- [ ] Include all relevant submission information for informed moderation decisions

### 2.2 Enhanced Discord Features
- [ ] Add "View on app" button to all Discord notifications linking to admin review portal
- [ ] Implement deep-linking to specific submission in admin interface
- [ ] Ensure Discord embed fields show complete submission data
- [ ] Standardize Discord embed colors and styling across submission types
- [ ] Add submission ID and direct link information to all embeds

### 2.3 Discord Interaction Improvements
- [ ] Update Discord interaction handler to support all submission types
- [ ] Ensure button interactions work consistently across all types
- [ ] Add error handling for failed Discord operations
- [ ] Implement retry logic for Discord webhook failures

---

## Phase 3: Form System Unification

### 3.1 Generic Form Components
- [ ] Create `SubmissionForm` component that renders forms based on configuration
- [ ] Build field component library (text, select, textarea, image upload, etc.)
- [ ] Implement dynamic form validation based on field configs
- [ ] Create reusable form sections for common patterns (player info, equipment details, etc.)

### 3.2 Enhanced Form Modal Experience
- [ ] Update `RouterFormModalWrapper` to redirect to user's profile page on success
- [ ] Ensure profile page shows pending submissions with status
- [ ] Add links from profile to view submission details
- [ ] Implement consistent success messaging across all submission types

### 3.3 Form-Specific Improvements
- [ ] Review and consolidate image upload handling across forms
- [ ] Standardize CSRF token implementation
- [ ] Ensure consistent loading states and error handling
- [ ] Add form auto-save functionality (stretch goal)

---

## Phase 4: Admin Interface Consolidation

### 4.1 Unified Admin Components
- [ ] Create generic `SubmissionManager` component for admin interfaces
- [ ] Build configurable table component with sorting, filtering, and pagination
- [ ] Implement unified action buttons (approve, reject, view details)
- [ ] Create shared moderation components (rejection modal, approval tracking)

### 4.2 Enhanced Admin Navigation
- [ ] Update administrative navigation to group all submissions under dropdown
- [ ] Structure as "[Submissions] | Categories | Content" with nested submission types
- [ ] Add submission count badges to navigation items
- [ ] Implement quick navigation between different submission types

### 4.3 Admin Dashboard Improvements
- [ ] Consolidate dashboard card logic for all submission types
- [ ] Ensure consistent status counting across all types
- [ ] Add visual indicators for submissions needing attention
- [ ] Implement admin notification system for urgent submissions

---

## Phase 5: Route Structure & API Consolidation

### 5.1 Dynamic Route Implementation
- [ ] Create dynamic submission routes (`/submissions/:type/submit`)
- [ ] Implement generic submission loaders and actions
- [ ] Migrate existing routes to use new dynamic system
- [ ] Ensure backward compatibility with existing URLs

### 5.2 API Standardization
- [ ] Consolidate submission endpoints into generic handlers
- [ ] Implement consistent error responses across all submission types
- [ ] Add proper rate limiting for all submission endpoints
- [ ] Ensure CSRF protection is consistent across all routes

### 5.3 Database Operation Unification
- [ ] Create generic database service for submission CRUD operations
- [ ] Implement consistent data validation across all submission types
- [ ] Add transaction support for complex submission operations
- [ ] Ensure proper error handling and rollback mechanisms

---

## Phase 6: User Experience Enhancements

### 6.1 Profile Integration
- [ ] Enhance user profile to show all submission types with status
- [ ] Add filtering and searching within user's submissions
- [ ] Implement submission history with detailed status tracking
- [ ] Add resubmission functionality for rejected submissions

### 6.2 Notification System
- [ ] Implement user notifications for submission status changes
- [ ] Add email notifications for approved/rejected submissions
- [ ] Create in-app notification system for submission updates
- [ ] Allow users to track submission progress in real-time

### 6.3 Submission Guidelines
- [ ] Create unified submission guidelines page
- [ ] Add contextual help within forms
- [ ] Implement submission quality scoring/feedback
- [ ] Add examples and best practices for each submission type

---

## Phase 7: Testing & Quality Assurance

### 7.1 Test Coverage
- [ ] Write comprehensive tests for unified submission system
- [ ] Test all submission workflows end-to-end
- [ ] Verify Discord integration works correctly for all types
- [ ] Test admin interface functionality across all submission types

### 7.2 Migration & Compatibility
- [ ] Ensure existing submissions continue to work during transition
- [ ] Test backward compatibility with existing URLs
- [ ] Verify data integrity during schema updates
- [ ] Plan rollback strategy in case of issues

### 7.3 Performance Optimization
- [ ] Optimize database queries for submission listings
- [ ] Implement caching for frequently accessed submission data
- [ ] Optimize form loading and submission performance
- [ ] Monitor and optimize Discord webhook performance

---

## Expected Benefits

### Code Reduction
- **Forms**: ~80% reduction (6 forms → 1 configurable component)
- **Admin Pages**: ~85% reduction (6 pages → 1 dynamic component)  
- **Discord Code**: ~70% reduction (6 notification functions → 1 service)
- **Database Operations**: ~60% reduction (consolidated moderation logic)

### Consistency Improvements
- Unified UX across all submission types
- Consistent validation and error handling
- Standardized Discord notification format
- Uniform admin interface patterns

### Feature Completeness
- Complete Discord integration with "View on app" buttons
- Enhanced form modals with profile redirection
- Organized admin navigation with submission dropdown
- Comprehensive user submission tracking

### Maintainability
- Single source of truth for submission logic
- Easy to add new submission types (config-driven)
- Centralized business rule management
- Simplified testing and debugging

---

## Implementation Recommendations

1. **Start with Phase 2** (Discord consolidation) - highest impact, lowest risk
2. **Parallel work on Phase 1** (foundation) while implementing Discord changes
3. **Phase 3-4** can be developed in parallel once foundation is solid
4. **Phase 5-6** should be implemented after core system is stable
5. **Phase 7** should run continuously throughout the project

## Risk Mitigation

- No risk mitigation is required, as the site isn't properly live
