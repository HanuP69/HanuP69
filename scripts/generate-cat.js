#!/usr/bin/env node
/**
 * Generates an animated SVG of a cute cat mascot roaming along a randomized
 * path. Designed to be regenerated on a schedule by a GitHub Action so the
 * path looks "fresh" every run, and embedded in a GitHub profile README.
 *
 * Usage: node generate-cat.js <output.svg>
 */

const fs = require("fs");
const path = require("path");

const WIDTH = 900;
const HEIGHT = 220;
const PADDING = 70;
const NUM_WAYPOINTS = 7;
const TOTAL_DURATION = 18; // seconds for one full loop

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

// Generate a random set of waypoints the cat will walk between.
// Keeps everything within padding so the sprite never clips off-canvas.
function generateWaypoints() {
  const points = [];
  for (let i = 0; i < NUM_WAYPOINTS; i++) {
    points.push({
      x: rand(PADDING, WIDTH - PADDING),
      y: rand(PADDING, HEIGHT - PADDING),
    });
  }
  // close the loop back to the first point so the motion path is seamless
  points.push({ ...points[0] });
  return points;
}

// Build an SVG path "d" string (smooth-ish via simple line segments;
// kept intentionally simple/robust rather than spline-curved).
function pointsToPathD(points) {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

function catSpriteMarkup(id) {
  // A simple, cute side-profile walking cat built from basic shapes.
  // Two body poses are blended into a tiny walk-cycle via a nested
  // animateTransform on the legs for a "roaming" feel.
  return `
    <g id="${id}">
      <!-- tail -->
      <path d="M -12 4 Q -24 -6 -16 -18" stroke="#3a3a3a" stroke-width="4.5"
            fill="none" stroke-linecap="round">
        <animateTransform attributeName="transform" type="rotate"
          values="0 -12 4; 12 -12 4; 0 -12 4; -8 -12 4; 0 -12 4"
          dur="1.1s" repeatCount="indefinite"/>
      </path>
      <!-- back legs -->
      <rect x="-7" y="9" width="4" height="10" rx="2" fill="#2e2e2e">
        <animateTransform attributeName="transform" type="rotate"
          values="0 -5 9; -20 -5 9; 0 -5 9; 20 -5 9; 0 -5 9"
          dur="0.6s" repeatCount="indefinite"/>
      </rect>
      <rect x="0" y="9" width="4" height="10" rx="2" fill="#3a3a3a">
        <animateTransform attributeName="transform" type="rotate"
          values="0 2 9; 20 2 9; 0 2 9; -20 2 9; 0 2 9"
          dur="0.6s" repeatCount="indefinite"/>
      </rect>
      <!-- body -->
      <ellipse cx="-2" cy="2" rx="15" ry="9" fill="#4a4a4a"/>
      <!-- front legs -->
      <rect x="6" y="9" width="4" height="10" rx="2" fill="#2e2e2e">
        <animateTransform attributeName="transform" type="rotate"
          values="0 8 9; 20 8 9; 0 8 9; -20 8 9; 0 8 9"
          dur="0.6s" repeatCount="indefinite"/>
      </rect>
      <rect x="12" y="9" width="4" height="10" rx="2" fill="#3a3a3a">
        <animateTransform attributeName="transform" type="rotate"
          values="0 14 9; -20 14 9; 0 14 9; 20 14 9; 0 14 9"
          dur="0.6s" repeatCount="indefinite"/>
      </rect>
      <!-- head (drawn larger relative to body for a cuter look) -->
      <g>
        <ellipse cx="16" cy="-8" rx="12" ry="10.5" fill="#525252"/>
        <!-- ears -->
        <path d="M 7 -16 L 4.5 -24 L 13 -17.5 Z" fill="#525252"/>
        <path d="M 25 -16 L 28.5 -24 L 20 -17.5 Z" fill="#525252"/>
        <path d="M 8 -17.5 L 6.3 -21.5 L 11.5 -17.8 Z" fill="#e8a0b8"/>
        <path d="M 24 -17.5 L 26.7 -21.5 L 21.5 -17.8 Z" fill="#e8a0b8"/>
        <!-- face -->
        <circle cx="20" cy="-8.5" r="1.6" fill="#1a1a1a"/>
        <circle cx="12.5" cy="-8.5" r="1.6" fill="#1a1a1a"/>
        <path d="M 15 -3.5 q 1.5 1.6 3 0" stroke="#1a1a1a" stroke-width="0.9" fill="none" stroke-linecap="round"/>
        <!-- whiskers -->
        <path d="M 25 -6 L 33 -7" stroke="#cfcfcf" stroke-width="0.8"/>
        <path d="M 25 -4 L 33 -3" stroke="#cfcfcf" stroke-width="0.8"/>
        <path d="M 25 -8 L 33 -10.5" stroke="#cfcfcf" stroke-width="0.8"/>
      </g>
    </g>`;
}

function buildSVG() {
  const waypoints = generateWaypoints();
  const pathD = pointsToPathD(waypoints);

  // Build per-segment keyTimes so the cat spends time roughly proportional
  // to segment length on each leg (keeps speed visually consistent-ish).
  const segLengths = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    segLengths.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  const totalLen = segLengths.reduce((s, l) => s + l, 0);
  let acc = 0;
  const keyTimes = [0];
  for (const len of segLengths) {
    acc += len;
    keyTimes.push(Math.min(1, acc / totalLen));
  }
  keyTimes[keyTimes.length - 1] = 1; // guard float drift

  // Determine direction (facing left/right) at each waypoint transition
  // so we can flip the sprite via keySplines-free discrete steps using
  // a second animateTransform that toggles scaleX(-1) on left-moving legs.
  const facingKeyTimes = [];
  const facingValues = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const movingLeft = b.x < a.x;
    facingKeyTimes.push(keyTimes[i]);
    facingValues.push(movingLeft ? "-1 1" : "1 1");
  }
  facingKeyTimes.push(1);
  facingValues.push(facingValues[facingValues.length - 1]);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}"
     width="100%" height="${HEIGHT}" role="img" aria-label="A small animated cat mascot wandering around">
  <defs>
    <style>
      .track { stroke: none; fill: none; }
    </style>
  </defs>

  <!-- invisible motion path the cat follows -->
  <path id="catPath" class="track" d="${pathD}"/>

  <!-- the cat sprite, riding the motion path -->
  <g>
    <animateMotion dur="${TOTAL_DURATION}s" repeatCount="indefinite"
      calcMode="linear" rotate="0">
      <mpath href="#catPath"/>
    </animateMotion>
    <g>
      <animateTransform attributeName="transform" type="scale"
        values="${facingValues.join(";")}"
        keyTimes="${facingKeyTimes.map((t) => t.toFixed(4)).join(";")}"
        dur="${TOTAL_DURATION}s" repeatCount="indefinite" calcMode="discrete"/>
      <g transform="scale(1.8)">
        ${catSpriteMarkup("cat")}
      </g>
    </g>
  </g>
</svg>`;

  return svg;
}

function main() {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error("Usage: node generate-cat.js <output.svg>");
    process.exit(1);
  }
  const svg = buildSVG();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg, "utf8");
  console.log(`Wrote ${outPath}`);
}

main();