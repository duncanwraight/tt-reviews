# Discord Integration Tests

## Overview

This test suite validates both "push" (notifications to Discord) and "pull" (commands from Discord) functionality of the Discord integration.

## Test Coverage

### Push Functionality (Notifications to Discord)
- **Equipment Submission Notifications**: Validates Discord embed structure, fields, colors, and action buttons
- **Player Edit Notifications**: Tests change summary generation and button interactions
- **JSON Structure Validation**: Ensures payloads match Discord API requirements

### Pull Functionality (Commands from Discord)
- **Equipment Search**: Tests `/equipment` slash command with real database
- **Player Search**: Tests `/player` slash command with real database  
- **Prefix Commands**: Tests `!equipment` and `!player` commands
- **Permission Validation**: Ensures only authorized Discord roles can use commands
- **Error Handling**: Tests empty queries, unknown commands, unauthorized access

### Button Interactions (Moderation)
- **Equipment Approval/Rejection**: Tests moderation button functionality
- **Player Edit Approval/Rejection**: Tests player edit moderation
- **Permission Checks**: Ensures only authorized users can moderate
- **Database Integration**: Tests actual moderation actions against database

### Protocol Compliance
- **Discord Ping/Pong**: Tests Discord verification handshake
- **Response Formats**: Validates all responses match Discord interaction response types

## Running Tests

```bash
# Run all Discord tests
npm run test:discord

# Run all tests
npm test

# Run tests in watch mode
npm run test -- --watch
```

## Test Environment

- **Database**: Uses real local Supabase database
- **Environment**: Loads from `.dev.vars` file
- **Discord API**: Mocks HTTP requests but validates JSON payloads
- **Permissions**: Uses actual Discord role configuration

## Key Test Scenarios

1. **Real Database Integration**: Tests search commands against actual equipment/player data
2. **Permission Enforcement**: Validates Discord role-based access control
3. **Discord Protocol**: Ensures compliance with Discord interaction API
4. **Error Handling**: Tests graceful failure scenarios
5. **Security**: Validates unauthorized access rejection

## Fixes Applied During Development

1. **Permission Checking Order**: Fixed ping responses to bypass permission checks
2. **Role Configuration**: Updated test roles to match `.dev.vars` configuration
3. **Message Component Permissions**: Added permission checks to button interactions
4. **Environment Loading**: Configured proper `.dev.vars` loading for tests
5. **Mock Structure**: Fixed Discord interaction object structures

## Test Results

All 15 tests pass, covering:
- 2 Push functionality tests
- 4 Pull functionality tests  
- 4 Button interaction tests
- 1 Discord protocol test
- 4 Prefix command tests

The tests ensure the Discord integration works correctly in both directions and maintains proper security controls.