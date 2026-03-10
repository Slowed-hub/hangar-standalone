# Copyright (c) 2026 Slowed-hub
# Licensed under the MIT License

// ============================================================
//  hangar.js – Plugin Stream Deck (PC Windows)
//  Rendu SVG style PYAM TIMER - standalone (sans serveur)
//  Auteur: Slowed
// ============================================================

// ======== LOGIQUE CYCLES (embarquée) ========
const OPEN_DURATION_MS  = 3900415;
const CLOSE_DURATION_MS = 7200767;
const CYCLE_DURATION_MS = OPEN_DURATION_MS + CLOSE_DURATION_MS;
const INITIAL_OPEN_TIME = new Date('2026-02-25T20:43:09.561+01:00').getTime();

const thresholds = [
    { min: 0,          max: 12*60*1000,  colors: ['green','green','green','green','green'] },
    { min: 12*60*1000, max: 24*60*1000,  colors: ['green','green','green','green','empty'] },
    { min: 24*60*1000, max: 36*60*1000,  colors: ['green','green','green','empty','empty'] },
    { min: 36*60*1000, max: 48*60*1000,  colors: ['green','green','empty','empty','empty'] },
    { min: 48*60*1000, max: 60*60*1000,  colors: ['green','empty','empty','empty','empty'] },
    { min: 60*60*1000, max: 65*60*1000,  colors: ['empty','empty','empty','empty','empty'] },
    { min: 65*60*1000, max: 89*60*1000,  colors: ['red',  'red',  'red',  'red',  'red'  ] },
    { min: 89*60*1000, max: 113*60*1000, colors: ['green','red',  'red',  'red',  'red'  ] },
    { min:113*60*1000, max: 137*60*1000, colors: ['green','green','red',  'red',  'red'  ] },
    { min:137*60*1000, max: 161*60*1000, colors: ['green','green','green','red',  'red'  ] },
    { min:161*60*1000, max: 185*60*1000, colors: ['green','green','green','green','red'  ] }
];

function getCurrentPhase(now = Date.now()) {
    const elapsed     = Math.max(0, now - INITIAL_OPEN_TIME);
    const timeInCycle = elapsed % CYCLE_DURATION_MS;
    if (timeInCycle < OPEN_DURATION_MS) {
        const nextChange = INITIAL_OPEN_TIME + Math.floor(elapsed / CYCLE_DURATION_MS) * CYCLE_DURATION_MS + OPEN_DURATION_MS;
        return { status: 'ONLINE', label: 'OPEN', timeInCycle, remaining: nextChange - now };
    } else {
        const nextChange = INITIAL_OPEN_TIME + (Math.floor(elapsed / CYCLE_DURATION_MS) + 1) * CYCLE_DURATION_MS;
        return { status: 'OFFLINE', label: 'CLOSED', timeInCycle, remaining: nextChange - now };
    }
}

function formatRemaining(remainingMs, status) {
    const minutes = Math.floor(remainingMs / 60000);
    const hours   = Math.floor(minutes / 60);
    if (status === 'OFFLINE') {
        return hours > 0 ? `${hours}h${minutes % 60}` : `${minutes}m`;
    }
    return `${minutes}m`;
}

function getColors(timeInCycle) {
    const t = thresholds.find(t => timeInCycle >= t.min && timeInCycle < t.max);
    return t ? t.colors : ['empty','empty','empty','empty','empty'];
}

function getNextOpenings(count = 2) {
    const now              = Date.now();
    const elapsed          = Math.max(0, now - INITIAL_OPEN_TIME);
    const cyclesSinceStart = Math.floor(elapsed / CYCLE_DURATION_MS);
    return Array.from({ length: count }, (_, i) => {
        const eventTime = new Date(INITIAL_OPEN_TIME + (cyclesSinceStart + i + 1) * CYCLE_DURATION_MS);
        return eventTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });
}

function computeStatus() {
    const now = Date.now();
    const { status, label, timeInCycle, remaining } = getCurrentPhase(now);
    return {
        status,
        label,
        countdown    : formatRemaining(remaining, status),
        colors       : getColors(timeInCycle),
        nextOpenings : getNextOpenings(2)
    };
}

// ======== CONFIG ========
const FETCH_INTERVAL_MS = 1000;

const translations = {
    fr: { OPEN: 'OUVERT', CLOSED: 'FERME', NEXT: 'PROCHAINES' },
    en: { OPEN: 'OPEN',   CLOSED: 'CLOSED', NEXT: 'NEXT OPENS' }
};

// ======== STREAM DECK BOOTSTRAP ========
const args   = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length - 1; i += 2) argMap[args[i]] = args[i + 1];

const PORT           = argMap['-port'];
const PLUGIN_UUID    = argMap['-pluginUUID'];
const REGISTER_EVENT = argMap['-registerEvent'];

if (!PORT || !PLUGIN_UUID) { console.error('[HangarTimer] Manque -port ou -pluginUUID.'); process.exit(1); }

// ======== WEBSOCKET ========
const WebSocket = require('ws');
const ws        = new WebSocket(`ws://127.0.0.1:${PORT}`);

const instances    = new Map();
let   tickInterval = null;

function send(obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function setState(context, state) { send({ event: 'setState', context, payload: { state } }); }
function setImage(context, dataUrl) { send({ event: 'setImage', context, payload: { image: dataUrl, target: 0 } }); }
function logMessage(msg) { send({ event: 'logMessage', payload: { message: `[HangarTimer] ${msg}` } }); }

// ======== RENDU SVG ========
function renderMain(status, label, countdown, colors, lang = 'fr') {
    const t           = translations[lang] || translations.fr;
    const isOnline    = status === 'ONLINE';
    const statusColor = isOnline ? '#00ff44' : '#ff3333';
    const labelText   = t[label] || label;

    const colorMap = { green: '#00ff44', red: '#ff3333', empty: '#2a2a3a' };
    const dotR = 7, gap = 6;
    const totalW = colors.length * dotR * 2 + (colors.length - 1) * gap;
    const startX = (144 - totalW) / 2 + dotR;
    const dots = colors.map((c, i) => {
        const cx = startX + i * (dotR * 2 + gap);
        return `<circle cx="${cx}" cy="122" r="${dotR}" fill="${colorMap[c] || '#2a2a3a'}" filter="url(#glow)"/>`;
    }).join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0d0d1a"/>
      <stop offset="100%" stop-color="#060610"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="144" height="144" rx="18" fill="url(#bg)"/>
  <text x="72" y="55" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="26" fill="${statusColor}" filter="url(#glow)" letter-spacing="2">${labelText}</text>
  <text x="72" y="98" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="34" fill="#ffffff" filter="url(#glow)">${countdown}</text>
  ${dots}
</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function renderNextOpenings(nextOpenings, lang = 'fr') {
    const lines = (nextOpenings || []).slice(0, 2);
    const linesSVG = lines.map((time, i) => {
        const y   = 80 + i * 40;
        const col = i === 0 ? '#00ff44' : '#aaaacc';
        return `<text x="72" y="${y}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="30" fill="${col}" filter="url(#glow2)">${time}</text>`;
    }).join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">
  <defs>
    <radialGradient id="bg2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0d0d1a"/>
      <stop offset="100%" stop-color="#060610"/>
    </radialGradient>
    <filter id="glow2" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="144" height="144" rx="18" fill="url(#bg2)"/>
  <text x="72" y="26" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="26" fill="#00cfff" letter-spacing="2" filter="url(#glow2)">NEXT</text>
  <line x1="20" y1="36" x2="124" y2="36" stroke="#00cfff" stroke-width="0.8" opacity="0.4"/>
  ${linesSVG}
</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ======== RENDU INSTANCE ========
function renderInstance(ctx, inst) {
    const data = computeStatus();
    const { status, label, countdown, colors, nextOpenings } = data;
    const lang = inst.lang || 'fr';
    if (inst.displayMode === 1) {
        setImage(ctx, renderNextOpenings(nextOpenings, lang));
    } else {
        setImage(ctx, renderMain(status, label, countdown, colors, lang));
    }
    setState(ctx, status === 'ONLINE' ? 0 : 1);
}

// ======== TICK ========
function tick() {
    for (const [ctx, inst] of instances) renderInstance(ctx, inst);
}

function startTick() {
    if (tickInterval) return;
    tick();
    tickInterval = setInterval(tick, FETCH_INTERVAL_MS);
    logMessage('Tick démarré');
}
function stopTick() {
    if (instances.size > 0) return;
    clearInterval(tickInterval);
    tickInterval = null;
}

// ======== EVENTS ========
ws.on('open', () => {
    send({ event: REGISTER_EVENT, uuid: PLUGIN_UUID });
    logMessage('Plugin enregistré');
});

ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const { event, context, action, payload } = msg;
    switch (event) {
        case 'willAppear':
            instances.set(context, { action, lang: payload?.settings?.lang || 'fr', displayMode: 0 });
            startTick(); break;
        case 'willDisappear':
            instances.delete(context); stopTick(); break;
        case 'keyDown': {
            const inst = instances.get(context);
            if (!inst) break;
            inst.displayMode = (inst.displayMode + 1) % 2;
            logMessage(`Mode → ${inst.displayMode}`);
            renderInstance(context, inst);
            break;
        }
        case 'didReceiveSettings': {
            const inst = instances.get(context);
            if (inst) inst.lang = payload?.settings?.lang || 'fr'; break;
        }
    }
});

ws.on('close', () => process.exit(0));
ws.on('error', err => console.error('[HangarTimer] WS error:', err.message));
process.on('SIGTERM', () => { ws.close(); process.exit(0); });
process.on('SIGINT',  () => { ws.close(); process.exit(0); });
