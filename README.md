Waialae wheel bet tracker v2

Open index.html in a browser.

What changed in v2:
- Supports 4-player and 5-player wheel.
- 4-player: select 1 wheel player. App creates 3 simultaneous matches.
- 5-player: select 2 wheel players. App creates 3 simultaneous matches against the 3 combinations of the other players.
- Uses Waialae handicap indexes from the scorecard:
  1:7, 2:17, 3:13, 4:1, 5:9, 6:11, 7:3, 8:15, 9:5,
  10:6, 11:16, 12:12, 13:18, 14:2, 15:10, 16:14, 17:4, 18:8.
- Lowest handicap in the group gets zero dots. Others get dots by handicap difference.
- Scores entered once are used across all simultaneous matchups.
- Tracks low net and aggregate separately.
- Tracks front, back, overall, and presses.
- Hole 9 press rule: lose wipes, push carries, win doubles and carries.
- Hole 18 press rule: lose wipes, push realizes, win doubles and realizes.

Deploy by uploading index.html, styles.css, and app.js to Netlify, Vercel, or GitHub Pages.
