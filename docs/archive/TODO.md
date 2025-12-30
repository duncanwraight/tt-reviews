# TODO

## User Testing Required

These items need manual verification:

| Item | Notes |
|------|-------|
| Discord Webhook Notifications | Check if notifications are being sent when submissions are created |
| Security Validation / Pentest | Manual security testing needed |
| Auth Edge Cases | Manual testing of authentication flows |

---

## Outstanding Work

### API & External Integration (Medium Priority)

- [ ] **API Token Generation**: Add mechanism to /admin area for generating API tokens
- [ ] **Pure API Routes**: JSON endpoints for external integration
  - `GET /api/equipment/:slug`
  - `GET /api/players/:slug`
  - `GET /api/search`
  - `POST /api/reviews`
  - `GET /api/reviews/:id`

### Moderation Improvements (Low Priority)

- [ ] **Image Cleanup**: Automatic deletion of images for rejected submissions
- [ ] **Audit Logging**: Add audit trail for admin actions and security events

### Caching (Medium Priority)

- [ ] **Cloudflare KV Caching**: Implement for frequently accessed data
- [ ] **Database Result Caching**: Cache expensive queries (equipment stats, player ratings)
- [ ] **API Response Caching**: Cache search results and listing pages

### Performance (Low Priority)

- [ ] **Bundle Analysis**: Implement bundle size monitoring
- [ ] **Virtual Scrolling**: For large equipment/player lists (if needed)
- [ ] **Service Worker**: Offline functionality
- [ ] **Web Vitals Monitoring**: Performance tracking

### Testing (Medium Priority)

- [ ] **Expand Test Suite**: Currently only `discord.test.ts` exists
  - Add React Router specific tests
  - Test SSR/hydration behavior
  - Add integration tests

### SEO & Content (Content Work - Not Code)

- [ ] Create top 20 equipment review priority list
- [ ] Develop educational guide content calendar
- [ ] Implement internal linking automation
- [ ] Create category landing pages for high-volume keywords
- [ ] Equipment recommendation engine based on playing style

### UX Improvements (Low Priority)

- [ ] **Duplicate Detection**: Check for existing equipment/players before submission
- [ ] **Draft Submissions**: Allow saving incomplete submissions
- [ ] **Per-Type Sponge Thicknesses**: Different options for inverted vs long pips
- [ ] **Player Submission Images**: Include images in new player submissions
- [ ] **Better Discord Cards**: Improve webhook card appearance

---

## Completed (Verified in Codebase)

The following items were listed as TODO but are already implemented:

| Item | Evidence |
|------|----------|
| Signup Modal Message | `login.tsx:93-96` - Shows "check your email" message |
| Password Reset Landing Pages | `reset-password.tsx` - Full branded flow |
| Enhanced Auth Error Handling | All auth routes have hash parameter error detection |
| Error Boundaries | `ErrorBoundary.tsx` - Comprehensive implementation |
| Two-Approval Workflow (Discord) | 10+ files reference `awaiting_second_approval` |
| Client-Side Form Validation | `UnifiedSubmissionForm.tsx` with validation |
| Basic Cache Headers | Exists in sitemap, robots, images routes |
| Discord Tests | `discord.test.ts` exists |

---

## Not Required / Removed

| Item | Reason |
|------|--------|
| Rejection Reason Collection (Discord Modal) | Low value - admin UI sufficient |
| Manual Account Linking Route | Low value - automatic mapping works |
| Enhanced Status Notifications (Ephemeral) | Nice-to-have, not essential |
| Advanced Slash Commands | Low priority enhancement |
| Affiliate Partnership Program | Business decision, not dev work |
| Tournament Equipment Tracking | Feature scope creep |
| User-Generated Content Systems | Already have reviews |
| Real-time Alerting | Over-engineering for current scale |
| Custom Dashboards | Over-engineering for current scale |
| Distributed Tracing | Over-engineering for current scale |
| SWR Patterns | Basic caching sufficient |
| Edge Caching | Basic caching sufficient |
| Progressive Enhancement (no-JS) | React Router Forms already work |
