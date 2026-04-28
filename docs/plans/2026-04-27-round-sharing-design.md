# Round Sharing + Archive Design

## Overview

Add the ability for a scorekeeper to share a live round with read-only viewers, plus local archive of past rounds.

## Architecture

- Scorekeeper's phone is always the source of truth
- CF Worker + KV is the sharing pipe, not the database of record
- KV entries have 7-day TTL — if expired, scorekeeper re-shares with one tap
- No auth — round code is the access token
- QR code generated client-side (embedded minimal encoder, no dependency)

## Worker Endpoints (added to existing feedback worker)

- `PUT /round/:code` — create/update round state (scorekeeper only)
- `GET /round/:code` — fetch current state (viewers)

## Go Live Flow (Scorekeeper)

1. Tap "Go Live" on Setup tab
2. Auto-suggested editable round code: `MAGOO-0427` (wheel player name + date)
3. On confirm: pushes state to Worker, shows Share Card
4. Share Card shows: round code, QR code, Copy Link button, native Share button, Stop Sharing link, green "Live" dot
5. Every `save()` also pushes to Worker, debounced to max 1 push per 3 seconds
6. "Stop Sharing" removes live flag locally. KV entry persists until TTL.

## Viewer Experience

### Entry Points
- Direct URL: `wheel.defensebuilders.com?r=MAGOO-0427`
- Manual: "Join Round" field on Setup tab

### Read-Only Mode
- All 5 tabs visible and navigable
- Score entry disabled (no numpad), setup inputs disabled
- Banner pinned at top: "Viewing MAGOO-0427 · Live" with Exit button
- Polls GET /round/:code every 10 seconds
- Pulse animation on banner when data refreshes
- 3 consecutive poll failures: banner shows "Connection lost" in amber
- Round not found: "This round is no longer available"

### State Isolation
- Viewer mode uses separate in-memory object, not scorekeeper's local state
- Exit returns to own local state
- A viewer can simultaneously be a scorekeeper of their own round

## Round Archive

### Auto-Archive
- On "Reset Round," current round is saved to `state.archivedRounds[]`
- Only if at least 1 hole has scores (no blank archives)

### Archive Entry Shape
```javascript
{
  code: 'MAGOO-0427' | null,
  date: '2026-04-27',
  players: [{name, hcp}, ...],
  gameType: 4,
  wheelA: 0,
  wheelB: 1,
  baseBet: 10,
  maxPresses: 0,
  scores: [[...]],
  summary: { grand: 45, matches: [{label, total}, ...] }
}
```

### Viewing Archives
- "Past Rounds" section at bottom of Setup tab
- Cards: date, player names, grand total
- Tap to load in read-only view (same mechanism as viewer mode)
- "Re-share" button available while viewing archived round

### Storage
- localStorage + IDB alongside active state
- ~5KB per round, no management UI needed yet
