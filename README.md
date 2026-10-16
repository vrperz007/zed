# zed
# Mound Report — TCU Baseball Pitching Reports

An app for coaches to track pitcher metrics from bullpen sessions to games,
built with HTML, CSS, JavaScript, and JSON. Coaches enter numbers from
tracking apps like TrackMan and Rapsodo, grade each session, add notes,
and attach video and photos.

**Live site:** 

## Features

- Staff overview with latest velocity, velocity trend, spin, and last grade
- Pitcher profiles with trend charts and a Bullpen vs. In-Game comparison
- Session logging for fastball, curveball, slider, and changeup metrics,
  plus Bauer units, movement score, tilt, spin efficiency, and gyro angle
- Letter grades (A+ to F) and coach's notes on every session
- Video and photo uploads for each session
- Backup and restore to move data between devices
- Works on desktop, tablet, and phone

## Built with

- Semantic HTML5
- CSS with design tokens, Flexbox, Grid, and light/dark themes
- Vanilla JavaScript (no frameworks)
- JSON for metric settings and sample data
- IndexedDB for saving data and media in the browser
- Git and GitHub Pages

## Project structure

- `index.html` — app shell
- `css/styles.css` — all styles and color tokens
- `js/app.js` — pages, forms, uploads, backup and restore
- `js/db.js` — IndexedDB storage
- `js/charts.js` — trend charts and sparklines
- `data/metrics.json` — metric definitions, session types, grades, class years
- `data/sample-data.json` — four sample pitchers for first launch

## Notes

All data is saved in the browser on each device; nothing is sent to a
server. Use Download Backup on the Data & Metrics page to keep a copy.
Metrics can be added or renamed by editing `data/metrics.json`.