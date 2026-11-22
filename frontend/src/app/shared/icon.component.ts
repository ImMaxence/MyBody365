import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Inline SVG icons (24×24, stroke), drawn after Lucide (ISC licence, © Lucide Contributors; parts © Cole
 * Bemis, Feather, MIT): see THIRD_PARTY_NOTICES.md. No icon font, no request.
 * Elements: [tag, attributes].
 */
type El = [string, Record<string, string>];
const p = (d: string): El => ['path', { d }];
const c = (cx: number, cy: number, r: number): El => ['circle', { cx: `${cx}`, cy: `${cy}`, r: `${r}` }];
const rect = (x: number, y: number, w: number, h: number, rx: number): El => [
  'rect',
  { x: `${x}`, y: `${y}`, width: `${w}`, height: `${h}`, rx: `${rx}` },
];

export const ICONS: Record<string, El[]> = {
  flame: [
    p('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'),
  ],
  home: [
    p('M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'),
    p('M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
  ],
  utensils: [p('M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2'), p('M7 2v20'), p('M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7')],
  camera: [p('M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z'), c(12, 13, 3)],
  chart: [p('M22 7 13.5 15.5 8.5 10.5 2 17'), p('M16 7h6v6')],
  user: [p('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'), c(12, 7, 4)],
  users: [
    p('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'),
    c(9, 7, 4),
    p('M22 21v-2a4 4 0 0 0-3-3.87'),
    p('M16 3.13a4 4 0 0 1 0 7.75'),
  ],
  shield: [
    p('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'),
  ],
  shieldCheck: [
    p('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'),
    p('m9 12 2 2 4-4'),
  ],
  plus: [p('M5 12h14'), p('M12 5v14')],
  minus: [p('M5 12h14')],
  play: [p('M6 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L7.5 3.64A1 1 0 0 0 6 4.5z')],
  pause: [rect(6, 4, 4, 16, 1), rect(14, 4, 4, 16, 1)],
  snowflake: [
    p('m10 20-1.25-2.5L6 18'),
    p('M10 4 8.75 6.5 6 6'),
    p('m14 20 1.25-2.5L18 18'),
    p('m14 4 1.25 2.5L18 6'),
    p('m17 21-3-6h-4'),
    p('m17 3-3 6 1.5 3'),
    p('M2 12h6.5L10 9'),
    p('m20 10-1.5 2 1.5 2'),
    p('M22 12h-6.5L14 15'),
    p('m4 10 1.5 2L4 14'),
    p('m7 21 3-6-1.5-3'),
    p('m7 3 3 6h4'),
  ],
  pencil: [p('M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z')],
  ruler: [
    p('M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z'),
    p('m14.5 12.5 2-2'),
    p('m11.5 9.5 2-2'),
    p('m8.5 6.5 2-2'),
    p('m17.5 15.5 2-2'),
  ],
  check: [p('M20 6 9 17l-5-5')],
  x: [p('M18 6 6 18'), p('m6 6 12 12')],
  chevronRight: [p('m9 18 6-6-6-6')],
  chevronLeft: [p('m15 18-6-6 6-6')],
  chevronDown: [p('m6 9 6 6 6-6')],
  arrowRight: [p('M5 12h14'), p('m12 5 7 7-7 7')],
  key: [
    p('M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z'),
    c(16.5, 7.5, 0.5),
  ],
  fingerprint: [
    p('M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4'),
    p('M14 13.12c0 2.38 0 6.38-1 8.88'),
    p('M17.29 21.02c.12-.6.43-2.3.5-3.02'),
    p('M2 12a10 10 0 0 1 18-6'),
    p('M2 16h.01'),
    p('M21.8 16c.2-2 .131-5.354 0-6'),
    p('M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2'),
    p('M8.65 22c.21-.66.45-1.32.57-2'),
    p('M9 6.8a6 6 0 0 1 9 5.2v2'),
  ],
  share: [p('M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'), p('M16 6l-4-4-4 4'), p('M12 2v13')],
  plusSquare: [rect(3, 3, 18, 18, 3), p('M8 12h8'), p('M12 8v8')],
  more: [c(12, 5, 1), c(12, 12, 1), c(12, 19, 1)],
  download: [p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'), p('M7 10l5 5 5-5'), p('M12 15V3')],
  monitor: [rect(2, 3, 20, 14, 2), p('M8 21h8'), p('M12 17v4')],
  smartphone: [rect(5, 2, 14, 20, 2), p('M12 18h.01')],
  chrome: [c(12, 12, 10), c(12, 12, 4), p('M21.17 8H12'), p('M3.95 6.06 8.54 14'), p('M10.88 21.94 15.46 14')],
  safari: [c(12, 12, 10), p('m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z')],
  sun: [
    c(12, 12, 4),
    p('M12 2v2'),
    p('M12 20v2'),
    p('m4.93 4.93 1.41 1.41'),
    p('m17.66 17.66 1.41 1.41'),
    p('M2 12h2'),
    p('M20 12h2'),
    p('m6.34 17.66-1.41 1.41'),
    p('m19.07 4.93-1.41 1.41'),
  ],
  moon: [p('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z')],
  contrast: [c(12, 12, 10), p('M12 18a6 6 0 0 0 0-12v12z')],
  globe: [c(12, 12, 10), p('M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'), p('M2 12h20')],
  logout: [p('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'), p('m16 17 5-5-5-5'), p('M21 12H9')],
  trash: [p('M3 6h18'), p('M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'), p('M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2')],
  link: [
    p('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'),
    p('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
  ],
  copy: [rect(8, 8, 14, 14, 2), p('M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2')],
  mail: [rect(2, 4, 20, 16, 2), p('m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7')],
  clock: [c(12, 12, 10), p('M12 6v6l4 2')],
  inbox: [
    p('M22 12h-6l-2 3h-4l-2-3H2'),
    p('M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'),
  ],
  list: [p('M8 6h13'), p('M8 12h13'), p('M8 18h13'), p('M3 6h.01'), p('M3 12h.01'), p('M3 18h.01')],
  lock: [rect(3, 11, 18, 11, 2), p('M7 11V7a5 5 0 0 1 10 0v4')],
  weight: [
    c(12, 5, 3),
    p('M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z'),
  ],
  target: [c(12, 12, 10), c(12, 12, 6), c(12, 12, 2)],
  dumbbell: [
    p('M14.4 14.4 9.6 9.6'),
    p('M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z'),
    p('m21.5 21.5-1.4-1.4'),
    p('M3.9 3.9 2.5 2.5'),
    p('M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z'),
  ],
  bell: [
    p('M10.268 21a2 2 0 0 0 3.464 0'),
    p('M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326'),
  ],
  info: [c(12, 12, 10), p('M12 16v-4'), p('M12 8h.01')],
  alert: [p('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'), p('M12 9v4'), p('M12 17h.01')],
  sparkles: [
    p('M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'),
  ],
  search: [c(11, 11, 8), p('m21 21-4.3-4.3')],
  // 1.11: the shopping list, and « what I have »
  cart: [c(8, 21, 1), c(19, 21, 1), p('M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12')],
  basket: [p('m15 11-1 9'), p('m19 11-4-7'), p('M2 11h20'), p('m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4'), p('M4.5 15.5h15'), p('m5 11 4-7'), p('m9 11 1 9')],
  userPlus: [p('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), c(9, 7, 4), p('M19 8v6'), p('M22 11h-6')],
  ban: [c(12, 12, 10), p('m4.9 4.9 14.2 14.2')],
  refresh: [p('M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'), p('M21 3v5h-5'), p('M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'), p('M8 16H3v5')],
  eyeOff: [
    p('M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'),
    p('M14.084 14.158a3 3 0 0 1-4.242-4.242'),
    p('M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'),
    p('m2 2 20 20'),
  ],
  heart: [p('M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z')],
  image: [rect(3, 3, 18, 18, 2), c(9, 9, 2), p('m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21')],
  switchCamera: [
    p('M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5'),
    p('M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5'),
    c(12, 12, 3),
    p('m18 22-3-3 3-3'),
    p('m6 2 3 3-3 3'),
  ],
  timer: [p('M10 2h4'), p('M12 14l3-3'), c(12, 14, 8)],
  columns: [rect(3, 3, 18, 18, 2), p('M12 3v18')],
  // 1.16: the photo editor
  crop: [p('M6 2v14a2 2 0 0 0 2 2h14'), p('M18 22V8a2 2 0 0 0-2-2H2')],
  rotateCw: [p('M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'), p('M21 3v5h-5')],
  sliders: [p('M21 4h-7'), p('M10 4H3'), p('M21 12h-9'), p('M8 12H3'), p('M21 20h-5'), p('M12 20H3'), p('M14 2v4'), p('M8 10v4'), p('M16 18v4')],
  film: [rect(3, 3, 18, 18, 2), p('M7 3v18'), p('M3 7.5h4'), p('M3 12h18'), p('M3 16.5h4'), p('M17 3v18'), p('M17 7.5h4'), p('M17 16.5h4')],
  layers: [
    p('M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z'),
    p('m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65'),
    p('m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65'),
  ],
  barcode: [p('M3 5v14'), p('M8 5v14'), p('M12 5v14'), p('M17 5v14'), p('M21 5v14')],
  book: [p('M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20')],
  thumbUp: [p('M7 10v12'), p('M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z')],
  thumbDown: [p('M17 14V2'), p('M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z')],
  flag: [p('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'), p('M4 22v-7')],
  qr: [rect(3, 3, 7, 7, 1), rect(14, 3, 7, 7, 1), rect(3, 14, 7, 7, 1), p('M14 14h3v3h-3z'), p('M20 14v.01'), p('M14 20h.01'), p('M17 17h4v4h-4')],
  send: [p('M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z'), p('m21.854 2.147-10.94 10.939')],
  cloud: [p('M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z')],
  /** 1.17: no network (Lucide cloud-off) */
  cloudOff: [p('m2 2 20 20'), p('M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193'), p('M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07')],
  /** 1.17: the pill box (Lucide pill) and the blood pressure (Lucide heart-pulse) */
  pill: [p('m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z'), p('m8.5 8.5 7 7')],
  heartPulse: [
    p('M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'),
    p('M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27'),
  ],
  /** 1.17: the whole photo in the frame (Lucide maximize) */
  maximize: [p('M8 3H5a2 2 0 0 0-2 2v3'), p('M21 8V5a2 2 0 0 0-2-2h-3'), p('M3 16v3a2 2 0 0 0 2 2h3'), p('M16 21h3a2 2 0 0 0 2-2v-3')],
  upload: [p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'), p('m17 8-5-5-5 5'), p('M12 3v12')],
  archive: [rect(2, 3, 20, 5, 1), p('M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8'), p('M10 12h4')],
  calendar: [rect(3, 4, 18, 18, 2), p('M16 2v4'), p('M8 2v4'), p('M3 10h18')],
  play2: [c(12, 12, 10), p('m10 8 6 4-6 4V8z')],
  repeat: [p('m17 2 4 4-4 4'), p('M3 11v-1a4 4 0 0 1 4-4h14'), p('m7 22-4-4 4-4'), p('M21 13v1a4 4 0 0 1-4 4H3')],
  leaf: [p('M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z'), p('M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12')],
  zap: [p('M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z')],
  scroll: [p('M15 12h-5'), p('M15 8h-5'), p('M19 17V5a2 2 0 0 0-2-2H4'), p('M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3')],
  bookmark: [p('m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z')],
  droplet: [p('M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z')],
  trendDown: [p('M22 17l-8.5-8.5-5 5L2 7'), p('M16 17h6v-6')],
  trendUp: [p('M22 7l-8.5 8.5-5-5L2 17'), p('M16 7h6v6')],
  gauge: [p('m12 14 4-4'), p('M3.34 19a10 10 0 1 1 17.32 0')],
  activity: [p('M22 12h-4l-3 9L9 3l-3 9H2')],
  pie: [p('M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z'), p('M21.21 15.89A10 10 0 1 1 8 2.83')],
  trophy: [p('M6 9H4.5a2.5 2.5 0 0 1 0-5H6'), p('M18 9h1.5a2.5 2.5 0 0 0 0-5H18'), p('M4 22h16'), p('M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22'), p('M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22'), p('M18 2H6v7a6 6 0 0 0 12 0V2Z')],
  bulb: [p('M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5'), p('M9 18h6'), p('M10 22h4')],
  bars: [p('M3 3v18h18'), p('M18 17V9'), p('M13 17V5'), p('M8 17v-3')],
  arrowUp: [p('M12 19V5'), p('m5 12 7-7 7 7')],
  arrowDown: [p('M12 5v14'), p('m19 12-7 7-7-7')],
  at: [c(12, 12, 4), p('M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8')],
  eye: [p('M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'), c(12, 12, 3)],
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display:contents' },
  // the whole <svg> is written in one go into an HTML wrapper: one DOM write per icon instead of one
  // Angular view per shape (much cheaper hydration), and the prerender can serialise it
  template: `<span class="ico" [innerHTML]="markup()"></span>`,
  styles: `
    .ico {
      display: contents;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input<number | string>(24);
  readonly stroke = input<number>(1.9);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly markup = computed(() => iconMarkup(this.name(), this.size(), this.stroke(), this.sanitizer));
}

const MARKUP = new Map<string, SafeHtml>();

/**
 * The icon as SVG markup. Built only from the constants above and numeric sizes (never from user
 * input), which is what makes bypassing the sanitizer (it drops every SVG element) safe here.
 */
function iconMarkup(name: string, size: number | string, stroke: number, sanitizer: DomSanitizer): SafeHtml {
  const key = `${name}|${size}|${stroke}`;
  let html = MARKUP.get(key);
  if (!html) {
    const s = Number(size) || 24;
    const w = Number(stroke) || 1.9;
    const shapes = (ICONS[name] ?? [])
      .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
      .join('');
    html = sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" ` +
        `stroke-linejoin="round" width="${s}" height="${s}" focusable="false">${shapes}</svg>`,
    );
    MARKUP.set(key, html);
  }
  return html;
}

/** Google's "G", in its own colours (Google sign-in branding guidelines). */
@Component({
  selector: 'app-google-g',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display:contents' },
  template: `
    <svg viewBox="0 0 24 24" width="20" height="20" focusable="false">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  `,
})
export class GoogleGComponent {}
