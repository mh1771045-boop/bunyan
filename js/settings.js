// Settings: defaults tuned per device, persisted in localStorage (with a safe fallback).
import { local } from './storage.js';

export const isTouch = (() => { try { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; } catch (e) { return false; } })();
const mem = (navigator.deviceMemory || 4);
const lowEnd = isTouch && (mem <= 3 || (navigator.hardwareConcurrency || 4) <= 4);

export const DEFAULT_LAYOUT = {
  joystick: { x: 0.14, y: 0.72, s: 1 },
  jump: { x: 0.9, y: 0.74, s: 1 },
  sneak: { x: 0.9, y: 0.52, s: 0.85 },
  sprint: { x: 0.14, y: 0.4, s: 0.8 },
  flyUp: { x: 0.8, y: 0.62, s: 0.85 },
  flyDown: { x: 0.8, y: 0.84, s: 0.85 },
  attack: { x: 0.78, y: 0.42, s: 0.9 },
  use: { x: 0.68, y: 0.56, s: 0.9 },
};

export const DEFAULTS = {
  version: 1,
  playerName: 'لاعب',
  renderDistance: isTouch ? (lowEnd ? 4 : 5) : 8,
  fov: 72,
  sensitivity: 1,
  invertY: false,
  smoothLight: true,
  fancyLeaves: !isTouch,
  textureStyle: 'pixel',
  clouds: true,
  fpsCap: isTouch ? 60 : 0,
  resScale: isTouch ? (lowEnd ? 0.6 : 0.75) : 1,
  brightness: 0.15,
  viewBob: true,
  showCoords: false,
  showFps: false,
  batterySaver: false,
  controlScheme: 'touch', // 'touch' (tap where you look) | 'crosshair'
  joystickMode: 'floating', // 'floating' | 'fixed'
  buttonOpacity: 0.55,
  buttonSize: 1,
  layout: DEFAULT_LAYOUT,
  showActionButtons: false,
  autoJump: isTouch,
  haptics: true,
  masterVolume: 0.8,
  sfxVolume: 0.8,
  musicVolume: 0.35,
  music: true,
  theme: 'auto',
  digits: 'latin',
  reducedMotion: false,
  backupReminder: true,
  lastBackup: 0,
};

export function loadSettings() {
  const s = Object.assign({}, DEFAULTS, local.get('settings', {}));
  s.layout = Object.assign({}, DEFAULT_LAYOUT, s.layout || {});
  for (const k of Object.keys(DEFAULT_LAYOUT)) s.layout[k] = Object.assign({}, DEFAULT_LAYOUT[k], s.layout[k]);
  return s;
}
export function saveSettings(s) { local.set('settings', s); }

export function applyBattery(s, on) {
  s.batterySaver = on;
  if (on) { s._before = { fpsCap: s.fpsCap, resScale: s.resScale, renderDistance: s.renderDistance, clouds: s.clouds, fancyLeaves: s.fancyLeaves }; s.fpsCap = 30; s.resScale = Math.min(s.resScale, 0.6); s.renderDistance = Math.min(s.renderDistance, 3); s.clouds = false; s.fancyLeaves = false; }
  else if (s._before) { Object.assign(s, s._before); delete s._before; }
}
