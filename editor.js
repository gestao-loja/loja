(() => {
'use strict';

// ============================================================
// HELPERS
// ============================================================
const $ = id => document.getElementById(id);
const canvas = $('artboard');
if (!canvas) { console.error('Canvas #artboard não encontrado'); return; }
const ctx = canvas.getContext('2d');
const drawLayer = $('drawLayer');
const drawCtx = drawLayer ? drawLayer.getContext('2d') : null;
const frame = $('canvasFrame');
const stage = $('stage');
const guidesEl = $('guides');

const PRESETS = {
  mug:[1240,561], shirt:[1476,1772], tile:[1181,1181], photo:[591,886],
  banner:[1920,1080], card:[1050,600], story:[1080,1920], post:[1080,1080]
};

// ============================================================
// SUPABASE (Artes Prontas)
// ============================================================
const SUPABASE_URL = "https://tzolokxetilunyfzovav.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0HJWnbqDMg1LFwLuhaRLDg_FvEXwxZd";

let artsSupabase = null;
let artsList = [];
let artsCategories = [];

if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
  try {
    artsSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) { console.warn('Supabase não configurado:', e); }
}

// ============================================================
// ESTADO GLOBAL
// ============================================================
let items = [];
let selectedIds = new Set();
let nextId = 1;
let bg = '#ffffff';
let bgMode = 'solid';
let bgGradient = { c1:'#6c4df6', c2:'#ff6b9a', angle:135 };
let transparent = false;
let zoom = 1;
let history = [];
let historyAt = -1;
let toastTimer;
let isDragging = false, isResizing = false, isRotating = false, isPanning = false;
let dragDelta = {x:0,y:0};
let resizeHandle = null, resizeStart = null, rotateStart = null, panStart = null;
let showGrid = false;
let snapEnabled = true;
let rotationSnapEnabled = true;
let propLock = false;
let clipboard = null;
let gridSize = 50;
let showRulers = false;
let currentTool = 'select';
let brushSize = 8, brushColor = '#6c4df6', brushOpacity = 100, brushSmooth = 3;
let isDrawing = false, drawStart = null, lastDrawPoint = null;
let darkMode = localStorage.getItem('editor-dark') === 'true';

const imageCache = new Map();
const SNAP_THRESHOLD = 6;
const ROT_SNAP = [0,15,30,45,60,75,90,105,120,135,150,165,180,-15,-30,-45,-60,-75,-90,-105,-120,-135,-150,-165,-180];

// ============================================================
// UTILITÁRIOS
// ============================================================
function notify(msg) {
  const t = $('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2300);
}
function status(msg) {
  const s = $('status'); if (s) s.textContent = msg;
  const ss = $('saveState'); if (ss) ss.textContent = 'Alterações locais';
}
function selected() {
  const arr = [...selectedIds].map(id => items.find(i => i.id === id)).filter(Boolean);
  return arr.length ? arr : null;
}
function selectedFirst() { const a = selected(); return a ? a[0] : null; }
function isSelected(id) { return selectedIds.has(id); }
function clearSelection() { selectedIds.clear(); }
function selectOnly(id) { selectedIds.clear(); selectedIds.add(id); }
function toggleSelect(id) { if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

// ============================================================
// HISTÓRICO
// ============================================================
function state() {
  return JSON.stringify({
    items: items.map(i => { const c = { ...i }; delete c.img; return c; }),
    bg, bgMode, bgGradient, transparent,
    w: canvas.width, h: canvas.height, nextId
  });
}
function checkpoint() {
  const s = state();
  if (history[historyAt] === s) return;
  history = history.slice(0, historyAt + 1);
  history.push(s);
  if (history.length > 100) history.shift();
  historyAt = history.length - 1;
  try { localStorage.setItem('editor-autosave', s); } catch(e) {}
}
function restoreState(s) {
  const d = JSON.parse(s);
  items = d.items || [];
  bg = d.bg || '#fff';
  bgMode = d.bgMode || 'solid';
  bgGradient = d.bgGradient || { c1:'#6c4df6', c2:'#ff6b9a', angle:135 };
  transparent = !!d.transparent;
  canvas.width = d.w || 1240;
  canvas.height = d.h || 561;
  if (drawLayer) { drawLayer.width = canvas.width; drawLayer.height = canvas.height; }
  nextId = d.nextId || Math.max(1, ...items.map(x => x.id + 1));
  clearSelection();
  items.forEach(i => {
    if (i.type === 'image' && i.src) loadImage(i.src).then(img => { i.img = img; render(); });
  });
  render(); syncInspector(); syncDimensions(); syncLayers(); applyZoom();
}
function undo() { if (historyAt > 0) { historyAt--; restoreState(history[historyAt]); status('Desfeito.'); } }
function redo() { if (historyAt < history.length - 1) { historyAt++; restoreState(history[historyAt]); status('Refeito.'); } }

// ============================================================
// IMAGEM
// ============================================================
function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

// ============================================================
// BASE ITEM
// ============================================================
function baseItem(type, props = {}) {
  const defaults = {
    id: nextId++, type,
    name: ({text:'Texto',rect:'Retângulo',circle:'Círculo',triangle:'Triângulo',star:'Estrela',heart:'Coração',line:'Linha',image:'Imagem',hexagon:'Hexágono',pentagon:'Pentágono',diamond:'Losango',arrow:'Seta',icon:'Ícone',decor:'Decoração',cross:'Cruz',burst:'Explosão'})[type] || 'Elemento',
    x: canvas.width / 2, y: canvas.height / 2,
    w: type === 'text' ? Math.min(600, canvas.width * .72) : Math.min(220, canvas.width * .3),
    h: type === 'text' ? 90 : Math.min(180, canvas.height * .3),
    text: 'Seu texto aqui',
    font: 'Arial', fontSize: 48,
    color: '#6c4df6', opacity: 100, rotation: 0,
    bold: false, italic: false, underline: false, uppercase: false,
    align: 'center', visible: true, locked: false, lockedEdit: false, groupId: null,
    letterSpacing: 0, lineHeight: 1.2, textCurve: 0,
    cornerRadius: 0, shadow: 0, shadowColor: '#000000', shadowBlur: 10,
    stroke: 0, strokeColor: '#222222', glow: 0,
    fillMode: 'solid', fillGradient: { c1: '#6c4df6', c2: '#ff6b9a', angle: 135 },
    flipH: false, flipV: false, blendMode: 'source-over',
    filters: null, threeD: false, strokeOnly: false
  };
  return { ...defaults, ...props };
}
function addItem(type, props = {}, silent = false) {
  const item = baseItem(type, props);
  items.push(item);
  selectOnly(item.id);
  if (!silent) {
    checkpoint(); render(); syncInspector(); syncLayers();
    status('Elemento adicionado.');
  }
  return item;
}

// ============================================================
// HELPERS DE DESENHO
// ============================================================
function wrapText(text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = []; let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function applyFillStyle(c, item) {
  if (item.fillMode === 'gradient' && item.fillGradient) {
    const g = c.createLinearGradient(-item.w/2, -item.h/2, item.w/2, item.h/2);
    g.addColorStop(0, item.fillGradient.c1 || '#6c4df6');
    g.addColorStop(1, item.fillGradient.c2 || '#ff6b9a');
    return g;
  }
  return item.color || '#222';
}
function drawPolygon(c, sides, w, h) {
  c.beginPath();
  const step = (Math.PI * 2) / sides, start = -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const a = start + i * step;
    const x = Math.cos(a) * w/2, y = Math.sin(a) * h/2;
    if (i === 0) c.moveTo(x,y); else c.lineTo(x,y);
  }
  c.closePath();
}
function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x+r, y); c.lineTo(x+w-r, y); c.quadraticCurveTo(x+w, y, x+w, y+r);
  c.lineTo(x+w, y+h-r); c.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  c.lineTo(x+r, y+h); c.quadraticCurveTo(x, y+h, x, y+h-r);
  c.lineTo(x, y+r); c.quadraticCurveTo(x, y, x+r, y); c.closePath();
}
function drawStar(c, points, w, h, color) {
  c.beginPath();
  const innerR = w/4, outerR = w/2;
  for (let i = 0; i < points*2; i++) {
    const a = (i/(points*2)) * Math.PI * 2 - Math.PI/2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = Math.cos(a)*r, y = Math.sin(a)*r*(h/w);
    if (i === 0) c.moveTo(x,y); else c.lineTo(x,y);
  }
  c.closePath(); c.fill();
}
function drawHeart(c, w, h) {
  const s = Math.min(w,h)/2;
  c.beginPath();
  c.moveTo(0, -s*.6);
  c.bezierCurveTo(s*.9, -s*1.4, s*1.6, s*.4, 0, s*1.1);
  c.bezierCurveTo(-s*1.6, s*.4, -s*.9, -s*1.4, 0, -s*.6);
  c.closePath(); c.fill();
}
function drawCurvedText(c, text, item, fs) {
  const curve = item.textCurve / 100;
  const radius = Math.abs(curve) * 400 + 100;
  const chars = [...text];
  const totalW = chars.reduce((s, ch) => s + c.measureText(ch).width + (item.letterSpacing||0), 0);
  let startAngle = curve > 0 ? Math.PI/2 : -Math.PI/2;
  let acc = 0;
  chars.forEach(ch => {
    const cw = c.measureText(ch).width + (item.letterSpacing||0);
    const off = (acc + cw/2) / radius * (curve > 0 ? -1 : 1);
    const a = startAngle + off;
    const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
    c.save();
    c.translate(x, y);
    c.rotate(a + (curve > 0 ? Math.PI : 0) + (curve > 0 ? -Math.PI/2 : Math.PI/2));
    c.fillText(ch, 0, 0);
    c.restore();
    acc += cw;
  });
}
function drawSpacedText(c, text, item, fs, maxWidth, lineH, spacing) {
  const align = item.align || 'center';
  const lines = wrapText(text, maxWidth + spacing * 5);
  const start = -((lines.length - 1) * lineH) / 2;
  lines.forEach((line, index) => {
    const chars = [...line];
    const totalW = chars.reduce((s, ch) => s + c.measureText(ch).width + spacing, 0) - spacing;
    let startX;
    if (align === 'left') startX = -maxWidth / 2;
    else if (align === 'right') startX = maxWidth / 2 - totalW;
    else startX = -totalW / 2;
    let cx = startX;
    const cy = start + index * lineH;
    chars.forEach(ch => {
      const cw = c.measureText(ch).width;
      c.fillText(ch, cx + cw / 2, cy);
      cx += cw + spacing;
    });
  });
}
function shade(hex, percent) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + percent));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0x00FF) + percent));
  const b = Math.max(0, Math.min(255, (n & 0x0000FF) + percent));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
function toHex(c) {
  if (!c) return '#222222';
  if (c.startsWith('#')) return c.length === 4 ? '#' + [1,2,3].map(k => c[k]+c[k]).join('') : c;
  return '#222222';
}

// ============================================================
// DRAW ITEM
// ============================================================
function drawItem(item, opts = {}) {
  if (!item.visible) return;
  const showSelection = opts.showSelection !== false;
  ctx.save();
  ctx.globalAlpha = (item.opacity ?? 100) / 100;
  ctx.globalCompositeOperation = item.blendMode || 'source-over';
  ctx.translate(item.x, item.y);
  ctx.rotate((item.rotation || 0) * Math.PI / 180);
  if (item.flipH || item.flipV) ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
  const w = item.w || 100;
  const h = item.h || 60;

  if (item.shadow > 0) {
    ctx.shadowColor = item.shadowColor || '#000';
    ctx.shadowBlur = item.shadowBlur || 10;
    ctx.shadowOffsetX = item.shadow;
    ctx.shadowOffsetY = item.shadow;
  }
  if (item.glow > 0) {
    ctx.shadowColor = item.color || '#6c4df6';
    ctx.shadowBlur = item.glow;
  }

  if (item.threeD && item.type === 'text') {
    const depth = 6;
    const text = item.uppercase ? String(item.text).toUpperCase() : String(item.text);
    const fs = item.fontSize || 48;
    ctx.font = `${item.italic ? 'italic ' : ''}${item.bold ? 'bold ' : ''}${fs}px "${item.font || 'Arial'}"`;
    ctx.textAlign = item.align || 'center';
    ctx.textBaseline = 'middle';
    for (let i = depth; i >= 0; i--) {
      ctx.fillStyle = i === 0 ? applyFillStyle(ctx, item) : shade(item.color || '#6c4df6', -30 - (depth - i) * 5);
      ctx.fillText(text, -i, i, w);
    }
    if (showSelection && isSelected(item.id)) drawSelectionBox(item, w, h);
    ctx.restore();
    return;
  }

  if (item.strokeOnly && item.type === 'text') {
    const text = item.uppercase ? String(item.text).toUpperCase() : String(item.text);
    const fs = item.fontSize || 48;
    ctx.font = `${item.italic ? 'italic ' : ''}${item.bold ? 'bold ' : ''}${fs}px "${item.font || 'Arial'}"`;
    ctx.textAlign = item.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = item.color || '#222';
    ctx.lineWidth = Math.max(2, fs * 0.08);
    ctx.strokeText(text, 0, 0, w);
    if (showSelection && isSelected(item.id)) drawSelectionBox(item, w, h);
    ctx.restore();
    return;
  }

  const fillStyle = applyFillStyle(ctx, item);
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = item.color || '#222';
  ctx.lineWidth = Math.max(2, Math.min(w, h) * .025);

  if (item.type === 'text') {
    ctx.fillStyle = fillStyle;
    ctx.textAlign = item.align || 'center';
    ctx.textBaseline = 'middle';
    const text = item.uppercase ? String(item.text).toUpperCase() : String(item.text);
    const fs = item.fontSize || 48;
    const letterSpacing = item.letterSpacing || 0;
    const lineH = (item.lineHeight || 1.2) * fs;
    ctx.font = `${item.italic ? 'italic ' : ''}${item.bold ? 'bold ' : ''}${fs}px "${item.font || 'Arial'}"`;
    if (item.textCurve && Math.abs(item.textCurve) > 0) {
      drawCurvedText(ctx, text, item, fs);
    } else if (letterSpacing === 0) {
      const lines = wrapText(text, w);
      const start = -((lines.length - 1) * lineH) / 2;
      lines.forEach((line, index) => {
        const tx = item.align === 'left' ? -w / 2 : item.align === 'right' ? w / 2 : 0;
        ctx.fillText(line, tx, start + index * lineH, w);
        if (item.underline) {
          const m = ctx.measureText(line).width;
          let ux = tx - m / 2;
          if (item.align === 'left') ux = tx;
          if (item.align === 'right') ux = tx - m;
          ctx.beginPath();
          ctx.moveTo(ux, start + index * lineH + fs * .42);
          ctx.lineTo(ux + m, start + index * lineH + fs * .42);
          ctx.stroke();
        }
      });
    } else {
      drawSpacedText(ctx, text, item, fs, w, lineH, letterSpacing);
    }
  } else if (item.type === 'rect') {
    if (item.cornerRadius > 0) {
      roundRect(ctx, -w/2, -h/2, w, h, item.cornerRadius);
      ctx.fill();
      if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
    } else {
      ctx.fillRect(-w/2, -h/2, w, h);
      if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.strokeRect(-w/2, -h/2, w, h); }
    }
  } else if (item.type === 'circle') {
    ctx.beginPath(); ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2); ctx.fill();
    if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
  } else if (item.type === 'triangle') {
    ctx.beginPath(); ctx.moveTo(0, -h/2); ctx.lineTo(w/2, h/2); ctx.lineTo(-w/2, h/2); ctx.closePath(); ctx.fill();
    if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
  } else if (item.type === 'hexagon') {
    drawPolygon(ctx, 6, w, h); ctx.fill();
    if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
  } else if (item.type === 'pentagon') {
    drawPolygon(ctx, 5, w, h); ctx.fill();
    if (item.stroke > 0) { ctx.lineWidth = item.stroke; ctx.strokeStyle = item.strokeColor; ctx.stroke(); }
  } else if (item.type === 'diamond') {
    ctx.beginPath(); ctx.moveTo(0, -h/2); ctx.lineTo(w/2, 0); ctx.lineTo(0, h/2); ctx.lineTo(-w/2, 0); ctx.closePath(); ctx.fill();
  } else if (item.type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(-w/2, -h/6); ctx.lineTo(w/6, -h/6); ctx.lineTo(w/6, -h/2);
    ctx.lineTo(w/2, 0); ctx.lineTo(w/6, h/2); ctx.lineTo(w/6, h/6);
    ctx.lineTo(-w/2, h/6); ctx.closePath(); ctx.fill();
  } else if (item.type === 'cross') {
    const thick = Math.min(w, h) / 4;
    ctx.fillRect(-thick/2, -h/2, thick, h);
    ctx.fillRect(-w/2, -thick/2, w, thick);
  } else if (item.type === 'burst') {
    const spikes = 12;
    ctx.beginPath();
    for (let j = 0; j < spikes * 2; j++) {
      const angle = (j / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = j % 2 === 0 ? w / 2 : w / 4;
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  } else if (item.type === 'star') {
    drawStar(ctx, 5, w, h, item.color);
  } else if (item.type === 'heart') {
    drawHeart(ctx, w, h);
  } else if (item.type === 'line') {
    ctx.beginPath(); ctx.moveTo(-w/2, 0); ctx.lineTo(w/2, 0); ctx.stroke();
  } else if (item.type === 'icon' || item.type === 'decor') {
    ctx.font = `${Math.min(w, h)}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(item.text || '★', 0, 0, w);
  } else if (item.type === 'image') {
    if (item.img) {
      ctx.save();
      if (item.cornerRadius > 0) {
        roundRect(ctx, -w/2, -h/2, w, h, item.cornerRadius);
        ctx.clip();
      }
      if (item.filters) ctx.filter = item.filters;
      ctx.drawImage(item.img, -w/2, -h/2, w, h);
      ctx.filter = 'none';
      ctx.restore();
    } else if (item.src) {
      loadImage(item.src).then(img => { item.img = img; render(); }).catch(() => {});
    }
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  if (showSelection && isSelected(item.id)) drawSelectionBox(item, w, h);
  ctx.restore();
}

function drawSelectionBox(item, w, h) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#6c4df6';
  ctx.lineWidth = Math.max(2, canvas.width / 900 * 2);
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(-w/2 - 6, -h/2 - 6, w + 12, h + 12);
  ctx.setLineDash([]);
  const handles = [
    [-w/2 - 6, -h/2 - 6], [w/2 + 6, -h/2 - 6],
    [-w/2 - 6, h/2 + 6], [w/2 + 6, h/2 + 6],
    [0, -h/2 - 6], [0, h/2 + 6],
    [-w/2 - 6, 0], [w/2 + 6, 0]
  ];
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#6c4df6';
  ctx.lineWidth = 2;
  handles.forEach(([hx, hy]) => {
    ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  ctx.beginPath(); ctx.arc(0, -h/2 - 26, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#6c4df6'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -h/2 - 6); ctx.lineTo(0, -h/2 - 20);
  ctx.strokeStyle = '#6c4df6'; ctx.lineWidth = 1.5; ctx.stroke();
}

// ============================================================
// RENDER
// ============================================================
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!transparent) {
    if (bgMode === 'gradient') {
      const angle = (bgGradient.angle || 135) * Math.PI / 180;
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const len = Math.max(canvas.width, canvas.height);
      const x1 = cx - Math.cos(angle) * len / 2, y1 = cy - Math.sin(angle) * len / 2;
      const x2 = cx + Math.cos(angle) * len / 2, y2 = cy + Math.sin(angle) * len / 2;
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, bgGradient.c1);
      g.addColorStop(1, bgGradient.c2);
      ctx.fillStyle = g;
    } else if (bgMode === 'radial') {
      const g = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 10, canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height) / 1.5);
      g.addColorStop(0, bgGradient.c1);
      g.addColorStop(1, bgGradient.c2);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = bg;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (showGrid) drawGrid();
  items.forEach(i => drawItem(i));
  if (selectedIds.size > 1) drawMultiSelectionBounds();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(108, 77, 246, .12)';
  ctx.lineWidth = 1;
  for (let x = gridSize; x < canvas.width; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = gridSize; y < canvas.height; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawMultiSelectionBounds() {
  const arr = selected();
  if (!arr || arr.length < 2) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  arr.forEach(i => {
    minX = Math.min(minX, i.x - i.w / 2);
    minY = Math.min(minY, i.y - i.h / 2);
    maxX = Math.max(maxX, i.x + i.w / 2);
    maxY = Math.max(maxY, i.y + i.h / 2);
  });
  ctx.save();
  ctx.strokeStyle = '#6c4df6';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
  ctx.restore();
}

// ============================================================
// ZOOM / DIMENSÕES
// ============================================================
function applyZoom() {
  const maxW = Math.max(180, stage.clientWidth - 90);
  const maxH = Math.max(180, stage.clientHeight - 90);
  const fit = Math.min(maxW / canvas.width, maxH / canvas.height, 1);
  const actual = fit * zoom;
  frame.style.width = (canvas.width * actual) + 'px';
  frame.style.height = (canvas.height * actual) + 'px';
  canvas.style.width = (canvas.width * actual) + 'px';
  canvas.style.height = (canvas.height * actual) + 'px';
  if (drawLayer) {
    drawLayer.style.width = (canvas.width * actual) + 'px';
    drawLayer.style.height = (canvas.height * actual) + 'px';
  }
  const zl = $('zoomLabel'); if (zl) zl.textContent = Math.round(zoom * 100) + '%';
}

function syncDimensions() {
  const d = $('dimensions'); if (d) d.textContent = `${canvas.width} × ${canvas.height} px`;
  const cw = $('canvasW'); if (cw) cw.value = canvas.width;
  const ch = $('canvasH'); if (ch) ch.value = canvas.height;
}

// ============================================================
// UPDATE / BIND
// ============================================================
function updateSelected(key, value, rerender = true) {
  const arr = selected();
  if (!arr) return;
  // Bloqueio de edição para artes prontas
  const blockedKeys = ['color', 'fillMode', 'fillGradient', 'font', 'fontSize',
    'bold', 'italic', 'underline', 'uppercase', 'letterSpacing',
    'lineHeight', 'textCurve', 'text', 'cornerRadius', 'stroke', 'strokeColor',
    'glow', 'shadow', 'shadowColor', 'shadowBlur', 'blendMode', 'filters'];
  if (blockedKeys.includes(key)) {
    const onlyLocked = arr.every(i => i.lockedEdit);
    if (onlyLocked) {
      notify('🔒 Esta arte não pode ser editada, apenas movida/redimensionada.');
      return;
    }
  }
  arr.forEach(i => { i[key] = value; });
  if (rerender) { render(); syncLayers(); }
}

function bindInput(id, key, parse = v => v) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('input', () => {
    const val = parse(el.value);
    if (key === 'rotation') {
      const rl = $('rotationLabel');
      if (rl) rl.textContent = val + '°';
    }
    updateSelected(key, val);
  });
  el.addEventListener('change', () => { checkpoint(); status('Propriedade atualizada.'); });
}

// ============================================================
// SYNC INSPECTOR
// ============================================================
function syncInspector() {
  const arr = selected();
  const empty = !arr;
  const eI = $('emptyInspector');
  const iC = $('inspectorControls');
  if (eI) eI.classList.toggle('hidden', !empty);
  if (iC) iC.classList.toggle('hidden', empty);
  if (empty) {
    const st = $('selectedType');
    if (st) st.textContent = 'Nenhum item';
    const si = $('selectionInfo');
    if (si) si.textContent = '';
    return;
  }
  const i = arr[0];
  const st = $('selectedType');
  if (st) st.textContent = arr.length > 1 ? arr.length + ' itens' : (({
    text:'Texto', rect:'Forma', circle:'Forma', triangle:'Forma', star:'Forma',
    heart:'Forma', line:'Linha', image:'Imagem', hexagon:'Forma', pentagon:'Forma',
    diamond:'Forma', arrow:'Seta', icon:'Ícone', decor:'Decoração',
    cross:'Cruz', burst:'Explosão'
  })[i.type] || 'Elemento');
  const si = $('selectionInfo');
  if (si) si.textContent = arr.length > 1 ? `${arr.length} selecionados` : '';

  const set = (id, val) => { const el = $(id); if (el) el.value = val; };
  set('layerName', i.name || '');
  set('textValue', i.text || '');
  set('fontFamily', (i.font || 'Arial').replace(/['"]/g, ''));
  set('fontSize', i.fontSize || 48);
  set('textAlign', i.align || 'center');
  set('letterSpacing', i.letterSpacing || 0);
  set('lineHeight', i.lineHeight || 1.2);
  set('textCurve', i.textCurve || 0);
  set('objectColor', toHex(i.color || '#222222'));
  set('opacity', i.opacity ?? 100);
  set('posX', Math.round(i.x));
  set('posY', Math.round(i.y));
  set('objW', Math.round(i.w));
  set('objH', Math.round(i.h));
  set('rotation', i.rotation || 0);
  set('cornerRadius', i.cornerRadius || 0);
  set('shadowRange', i.shadow || 0);
  set('shadowColor', i.shadowColor || '#000000');
  set('shadowBlur', i.shadowBlur || 10);
  set('strokeRange', i.stroke || 0);
  set('strokeColor', i.strokeColor || '#222222');
  set('glowRange', i.glow || 0);
  set('blendMode', i.blendMode || 'source-over');

  const rl = $('rotationLabel');
  if (rl) rl.textContent = (i.rotation || 0) + '°';

  const toggles = [
    { id: 'boldBtn', key: 'bold' },
    { id: 'italicBtn', key: 'italic' },
    { id: 'underlineBtn', key: 'underline' },
    { id: 'uppercaseBtn', key: 'uppercase' }
  ];
  toggles.forEach(t => {
    const el = $(t.id);
    if (el) el.classList.toggle('active', !!i[t.key]);
  });

  const isText = i.type === 'text' || i.type === 'icon' || i.type === 'decor';
  const tC = $('textControl'), fC = $('fontControl'), tO = $('textOptions');
  if (tC) tC.classList.toggle('hidden', !isText);
  if (fC) fC.classList.toggle('hidden', !isText);
  if (tO) tO.classList.toggle('hidden', i.type !== 'text');

  const rC = $('radiusControl');
  if (rC) rC.classList.toggle('hidden', i.type !== 'rect' && i.type !== 'image');

  const gC = $('gradientControl');
  if (gC) gC.classList.toggle('hidden', i.type === 'image' || i.type === 'line');

  const fg = $('fillGradient');
  if (fg) fg.classList.toggle('hidden', i.fillMode !== 'gradient');

  document.querySelectorAll('[data-fill-mode]').forEach(b => {
    b.classList.toggle('active', (i.fillMode || 'solid') === b.dataset.fillMode);
  });

  if (i.fillGradient) {
    set('fillGrad1', i.fillGradient.c1 || '#6c4df6');
    set('fillGrad2', i.fillGradient.c2 || '#ff6b9a');
    set('fillGradAngle', i.fillGradient.angle || 135);
  }
}

// ============================================================
// SYNC LAYERS
// ============================================================
function syncLayers() {
  const list = $('layersList');
  if (!list) return;
  const lc = $('layerCount');
  if (lc) lc.textContent = items.length;
  if (!items.length) {
    list.innerHTML = '<p class="muted-note">Seus elementos aparecerão aqui.</p>';
    return;
  }
  list.innerHTML = '';
  [...items].reverse().forEach(i => {
    const b = document.createElement('button');
    b.className = 'layer-item' + (isSelected(i.id) ? ' selected' : '') + (i.locked ? ' locked' : '');
    b.innerHTML = `
      <span class="layer-icon">${({
        text: 'T', image: '▧', rect: '▰', circle: '◯', triangle: '△',
        star: '★', heart: '♥', line: '╱', hexagon: '⬡', pentagon: '⬠',
        diamond: '◆', arrow: '➤', icon: '★', decor: '✿', cross: '✚', burst: '✺'
      })[i.type] || '◇'}</span>
      <span class="layer-name"></span>
      <span class="layer-eye">${i.visible ? '◉' : '○'}</span>
      <span class="layer-eye">${i.locked ? '🔒' : '🔓'}</span>
    `;
    b.querySelector('.layer-name').textContent = (i.lockedEdit ? '🔒 ' : '') + (i.name || i.text || 'Elemento');
    const eyes = b.querySelectorAll('.layer-eye');
    b.addEventListener('click', e => {
      if (e.target === eyes[0]) {
        i.visible = !i.visible;
        checkpoint(); render(); syncLayers();
        return;
      }
      if (e.target === eyes[1]) {
        i.locked = !i.locked;
        checkpoint(); syncLayers();
        return;
      }
      if (e.shiftKey) toggleSelect(i.id);
      else selectOnly(i.id);
      render(); syncInspector(); syncLayers();
    });
    list.appendChild(b);
  });
}

// ============================================================
// POINT / HIT
// ============================================================
function point(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * canvas.width / r.width,
    y: (e.clientY - r.top) * canvas.height / r.height
  };
}
function hit(i, p) {
  const a = (i.rotation || 0) * Math.PI / 180;
  const dx = p.x - i.x, dy = p.y - i.y;
  const rx = dx * Math.cos(a) + dy * Math.sin(a);
  const ry = -dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(rx) <= i.w / 2 + 8 && Math.abs(ry) <= i.h / 2 + 8;
}
function hitHandle(item, p) {
  const a = (item.rotation || 0) * Math.PI / 180;
  const dx = p.x - item.x, dy = p.y - item.y;
  const rx = dx * Math.cos(a) + dy * Math.sin(a);
  const ry = -dx * Math.sin(a) + dy * Math.cos(a);
  const w = item.w, h = item.h;
  const handles = [
    { name: 'nw', x: -w/2 - 6, y: -h/2 - 6 },
    { name: 'ne', x: w/2 + 6, y: -h/2 - 6 },
    { name: 'sw', x: -w/2 - 6, y: h/2 + 6 },
    { name: 'se', x: w/2 + 6, y: h/2 + 6 },
    { name: 'n', x: 0, y: -h/2 - 6 },
    { name: 's', x: 0, y: h/2 + 6 },
    { name: 'w', x: -w/2 - 6, y: 0 },
    { name: 'e', x: w/2 + 6, y: 0 },
    { name: 'rot', x: 0, y: -h/2 - 26 }
  ];
  for (const hd of handles) {
    const d = Math.sqrt((rx - hd.x) ** 2 + (ry - hd.y) ** 2);
    if (d < 12) return hd.name;
  }
  return null;
}

// ============================================================
// SNAP / GUIAS
// ============================================================
function applySnap(arr) {
  const item = arr[0];
  const snapLines = [];
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const t = SNAP_THRESHOLD;
  if (Math.abs(item.x - cx) < t) { item.x = cx; snapLines.push({ type: 'v', pos: cx }); }
  if (Math.abs(item.y - cy) < t) { item.y = cy; snapLines.push({ type: 'h', pos: cy }); }
  items.forEach(other => {
    if (arr.includes(other) || !other.visible) return;
    if (Math.abs((item.x - item.w/2) - (other.x - other.w/2)) < t) {
      item.x = other.x - other.w/2 + item.w/2;
      snapLines.push({ type: 'v', pos: other.x - other.w/2 });
    }
    if (Math.abs((item.x + item.w/2) - (other.x + other.w/2)) < t) {
      item.x = other.x + other.w/2 - item.w/2;
      snapLines.push({ type: 'v', pos: other.x + other.w/2 });
    }
    if (Math.abs(item.y - other.y) < t) {
      item.y = other.y;
      snapLines.push({ type: 'h', pos: other.y });
    }
    if (Math.abs(item.x - other.x) < t) {
      item.x = other.x;
      snapLines.push({ type: 'v', pos: other.x });
    }
  });
  drawGuides(snapLines);
}
function drawGuides(lines) {
  if (!guidesEl) return;
  guidesEl.innerHTML = '';
  lines.forEach(l => {
    const div = document.createElement('div');
    div.className = 'guide-line ' + l.type;
    if (l.type === 'v') div.style.left = (l.pos / canvas.width * 100) + '%';
    else div.style.top = (l.pos / canvas.height * 100) + '%';
    guidesEl.appendChild(div);
  });
}
function clearGuides() { if (guidesEl) guidesEl.innerHTML = ''; }

// ============================================================
// EVENTOS CANVAS
// ============================================================
canvas.addEventListener('pointerdown', e => {
  if (e.button === 1 || (e.button === 0 && e.altKey && e.shiftKey)) {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    canvas.classList.add('grabbing');
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;

  if (currentTool === 'eyedropper') {
    const p = point(e);
    pickColorAt(p.x, p.y);
    return;
  }
  if (currentTool !== 'select') return;

  const p = point(e);
  const sel = selected();
  if (sel) {
    for (const item of sel) {
      if (item.locked) continue;
      const hd = hitHandle(item, p);
      if (hd === 'rot') {
        isRotating = true;
        rotateStart = {
          item,
          centerX: item.x, centerY: item.y,
          startRotation: item.rotation || 0,
          startAngle: Math.atan2(p.y - item.y, p.x - item.x) * 180 / Math.PI
        };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (hd) {
        isResizing = true;
        resizeHandle = hd;
        resizeStart = {
          items: sel.map(i => ({ id: i.id, x: i.x, y: i.y, w: i.w, h: i.h })),
          mouse: { x: p.x, y: p.y }
        };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }
  }

  const found = [...items].reverse().find(i => i.visible && !i.locked && hit(i, p));
  if (found) {
    if (e.shiftKey) toggleSelect(found.id);
    else if (!isSelected(found.id)) selectOnly(found.id);
    isDragging = true;
    dragDelta = { x: p.x - found.x, y: p.y - found.y };
    canvas.setPointerCapture(e.pointerId);
  } else {
    if (!e.shiftKey) clearSelection();
    isDragging = 'marquee';
    dragDelta = { x: p.x, y: p.y };
    canvas.setPointerCapture(e.pointerId);
  }
  render(); syncInspector(); syncLayers();
});

canvas.addEventListener('pointermove', e => {
  const p = point(e);
  const mc = $('mouseCoords');
  if (mc) mc.textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`;

  if (isPanning) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    stage.scrollLeft -= dx;
    stage.scrollTop -= dy;
    panStart = { x: e.clientX, y: e.clientY };
    return;
  }

  if (isRotating && rotateStart) {
    const angle = Math.atan2(p.y - rotateStart.centerY, p.x - rotateStart.centerX) * 180 / Math.PI;
    let rotation = rotateStart.startRotation + (angle - rotateStart.startAngle);
    if (rotationSnapEnabled) {
      let closest = rotation, minD = Infinity;
      ROT_SNAP.forEach(a => {
        const d = Math.abs(rotation - a);
        if (d < minD) { minD = d; closest = a; }
      });
      if (minD < 5) rotation = closest;
    }
    rotateStart.item.rotation = Math.round(rotation);
    render();
    const ri = $('rotation');
    if (ri) ri.value = rotateStart.item.rotation;
    const rl = $('rotationLabel');
    if (rl) rl.textContent = rotateStart.item.rotation + '°';
    return;
  }

  if (isResizing && resizeStart) {
    const dx = p.x - resizeStart.mouse.x;
    const dy = p.y - resizeStart.mouse.y;
    resizeStart.items.forEach(orig => {
      const item = items.find(i => i.id === orig.id);
      if (!item) return;
      let nw = orig.w, nh = orig.h, nx = orig.x, ny = orig.y;
      if (resizeHandle.includes('e')) nw = Math.max(20, orig.w + dx);
      if (resizeHandle.includes('w')) { nw = Math.max(20, orig.w - dx); nx = orig.x + (orig.w - nw); }
      if (resizeHandle.includes('s')) nh = Math.max(20, orig.h + dy);
      if (resizeHandle.includes('n')) { nh = Math.max(20, orig.h - dy); ny = orig.y + (orig.h - nh); }
      if (propLock && orig.w > 0 && orig.h > 0) {
        const ratio = orig.w / orig.h;
        if (resizeHandle.includes('e') || resizeHandle.includes('w')) nh = nw / ratio;
        else nw = nh * ratio;
      }
      item.w = nw; item.h = nh; item.x = nx; item.y = ny;
    });
    render();
    return;
  }

  if (isDragging === 'marquee') {
    const sx = dragDelta.x, sy = dragDelta.y;
    const mnx = Math.min(sx, p.x), mxx = Math.max(sx, p.x);
    const mny = Math.min(sy, p.y), mxy = Math.max(sy, p.y);
    items.forEach(i => {
      const imnx = i.x - i.w/2, imxx = i.x + i.w/2;
      const imny = i.y - i.h/2, imxy = i.y + i.h/2;
      const int = !(imxx < mnx || imnx > mxx || imxy < mny || imny > mxy);
      if (int) selectedIds.add(i.id);
      else if (!e.shiftKey) selectedIds.delete(i.id);
    });
    render();
    ctx.save();
    ctx.strokeStyle = '#6c4df6';
    ctx.fillStyle = 'rgba(108,77,246,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillRect(mnx, mny, mxx - mnx, mxy - mny);
    ctx.strokeRect(mnx, mny, mxx - mnx, mxy - mny);
    ctx.restore();
    return;
  }

  if (!isDragging) {
    const sel = selected();
    if (sel) {
      for (const item of sel) {
        const hd = hitHandle(item, p);
        if (hd === 'rot') { canvas.style.cursor = 'grab'; return; }
        if (hd) {
          const map = { nw:'nwse-resize', ne:'nesw-resize', sw:'nesw-resize', se:'nwse-resize', n:'ns-resize', s:'ns-resize', w:'ew-resize', e:'ew-resize' };
          canvas.style.cursor = map[hd] || 'default';
          return;
        }
      }
    }
    const found = [...items].reverse().find(i => i.visible && !i.locked && hit(i, p));
    canvas.style.cursor = found ? 'move' : 'default';
    return;
  }

  const arr = selected();
  if (!arr) return;
  const dx = p.x - dragDelta.x - arr[0].x;
  const dy = p.y - dragDelta.y - arr[0].y;
  arr.forEach(item => {
    if (item.locked) return;
    item.x += dx; item.y += dy;
  });
  dragDelta = { x: p.x - arr[0].x, y: p.y - arr[0].y };
  if (snapEnabled) applySnap(arr);
  render();
  const px = $('posX'), py = $('posY');
  if (px) px.value = Math.round(arr[0].x);
  if (py) py.value = Math.round(arr[0].y);
});

canvas.addEventListener('pointerup', () => {
  if (isDragging || isResizing || isRotating || isPanning) {
    isDragging = false;
    isResizing = false;
    isRotating = false;
    isPanning = false;
    canvas.classList.remove('grabbing');
    clearGuides();
    checkpoint();
    syncInspector();
    syncLayers();
  }
});

canvas.addEventListener('pointercancel', () => {
  isDragging = isResizing = isRotating = isPanning = false;
  clearGuides();
});

canvas.addEventListener('dblclick', e => {
  const p = point(e);
  const found = [...items].reverse().find(i => i.visible && !i.locked && hit(i, p));
  if (found && (found.type === 'text' || found.type === 'icon' || found.type === 'decor')) {
    if (found.lockedEdit) { notify('🔒 Esta arte não pode ser editada.'); return; }
    openInlineTextEdit(found, e);
  }
});

stage.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    if (e.deltaY < 0) zoom = Math.min(4, zoom + .08);
    else zoom = Math.max(.15, zoom - .08);
    applyZoom();
  }
}, { passive: false });

// ============================================================
// TEXTO INLINE
// ============================================================
function openInlineTextEdit(item, e) {
  const input = $('textEditInput');
  if (!input) return;
  input.value = item.text || '';
  input.classList.remove('hidden');
  const r = canvas.getBoundingClientRect();
  const scaleX = r.width / canvas.width;
  const scaleY = r.height / canvas.height;
  input.style.left = (r.left + (item.x - item.w / 2) * scaleX) + 'px';
  input.style.top = (r.top + (item.y - 10) * scaleY) + 'px';
  input.style.width = Math.max(120, item.w * scaleX) + 'px';
  input.focus();
  input.select();
  const commit = () => {
    item.text = input.value;
    input.classList.add('hidden');
    input.removeEventListener('blur', commit);
    input.removeEventListener('keydown', onKey);
    checkpoint(); render(); syncInspector(); syncLayers();
  };
  const onKey = ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { input.value = item.text; input.blur(); }
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', onKey);
}

// ============================================================
// FERRAMENTAS DE DESENHO
// ============================================================
function setupBrushCtx() {
  if (!drawCtx) return;
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';
  drawCtx.globalAlpha = brushOpacity / 100;
  drawCtx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
  drawCtx.strokeStyle = currentTool === 'eraser' ? '#000' : brushColor;
  drawCtx.fillStyle = currentTool === 'eraser' ? '#000' : brushColor;
  drawCtx.lineWidth = brushSize;
}
function paintPoint(x, y) {
  if (!drawCtx) return;
  drawCtx.save();
  setupBrushCtx();
  drawCtx.beginPath();
  drawCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
  drawCtx.fill();
  drawCtx.restore();
}
function paintLine(x1, y1, x2, y2) {
  if (!drawCtx) return;
  drawCtx.save();
  setupBrushCtx();
  drawCtx.beginPath();
  drawCtx.moveTo(x1, y1);
  drawCtx.lineTo(x2, y2);
  drawCtx.stroke();
  drawCtx.restore();
}
function pickColorAt(x, y) {
  if (!drawCtx) return;
  let px;
  try {
    px = drawCtx.getImageData(x, y, 1, 1).data;
    if (px[3] === 0) px = ctx.getImageData(x, y, 1, 1).data;
  } catch (e) { return; }
  const hex = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  brushColor = hex;
  const bc = $('brushColor');
  if (bc) bc.value = hex;
  const arr = selected();
  if (arr) {
    arr.forEach(i => i.color = hex);
    render(); syncInspector(); checkpoint();
  }
  notify('Cor capturada: ' + hex);
  currentTool = 'select';
  document.querySelectorAll('.draw-tool').forEach(x => x.classList.toggle('active', x.dataset.tool === 'select'));
  if (drawLayer) {
    drawLayer.classList.remove('active');
    drawLayer.style.pointerEvents = 'none';
  }
}

if (drawLayer) {
  drawLayer.addEventListener('pointerdown', e => {
    if (currentTool === 'select') return;
    e.preventDefault();
    const p = point(e);
    if (currentTool === 'eyedropper') { pickColorAt(p.x, p.y); return; }
    isDrawing = true;
    drawStart = { x: p.x, y: p.y };
    lastDrawPoint = { x: p.x, y: p.y };
    drawLayer.setPointerCapture(e.pointerId);
    if (currentTool === 'line' || currentTool === 'rect-draw' || currentTool === 'circle-draw') {
      window._drawSnapshot = drawCtx.getImageData(0, 0, drawLayer.width, drawLayer.height);
    }
    if (currentTool === 'brush' || currentTool === 'eraser') {
      paintPoint(p.x, p.y);
    }
  });
  drawLayer.addEventListener('pointermove', e => {
    if (!isDrawing) return;
    e.preventDefault();
    const p = point(e);
    if (currentTool === 'brush' || currentTool === 'eraser') {
      paintLine(lastDrawPoint.x, lastDrawPoint.y, p.x, p.y);
      lastDrawPoint = { x: p.x, y: p.y };
    } else if (currentTool === 'line') {
      if (window._drawSnapshot) drawCtx.putImageData(window._drawSnapshot, 0, 0);
      drawCtx.save(); setupBrushCtx();
      drawCtx.beginPath();
      drawCtx.moveTo(drawStart.x, drawStart.y);
      drawCtx.lineTo(p.x, p.y);
      drawCtx.stroke();
      drawCtx.restore();
    } else if (currentTool === 'rect-draw') {
      if (window._drawSnapshot) drawCtx.putImageData(window._drawSnapshot, 0, 0);
      drawCtx.save(); setupBrushCtx();
      drawCtx.strokeRect(drawStart.x, drawStart.y, p.x - drawStart.x, p.y - drawStart.y);
      drawCtx.restore();
    } else if (currentTool === 'circle-draw') {
      if (window._drawSnapshot) drawCtx.putImageData(window._drawSnapshot, 0, 0);
      drawCtx.save(); setupBrushCtx();
      const rx = Math.abs(p.x - drawStart.x) / 2;
      const ry = Math.abs(p.y - drawStart.y) / 2;
      drawCtx.beginPath();
      drawCtx.ellipse((p.x + drawStart.x) / 2, (p.y + drawStart.y) / 2, rx, ry, 0, 0, Math.PI * 2);
      drawCtx.stroke();
      drawCtx.restore();
    }
  });
  drawLayer.addEventListener('pointerup', () => {
    if (!isDrawing) return;
    isDrawing = false;
    drawStart = null;
    lastDrawPoint = null;
    window._drawSnapshot = null;
    checkpoint();
  });
  drawLayer.addEventListener('pointercancel', () => {
    isDrawing = false;
    drawStart = null;
    lastDrawPoint = null;
    window._drawSnapshot = null;
  });
}

document.querySelectorAll('.draw-tool').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.draw-tool').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentTool = b.dataset.tool;
    const opts = $('brushOptions');
    if (opts) opts.classList.toggle('hidden', currentTool === 'select' || currentTool === 'eyedropper');
    if (drawLayer) {
      drawLayer.classList.toggle('active', currentTool !== 'select' && currentTool !== 'eyedropper');
      drawLayer.style.pointerEvents = currentTool === 'select' ? 'none' : 'auto';
    }
    canvas.style.cursor = currentTool === 'eyedropper' ? 'crosshair' : 'default';
    notify('Ferramenta: ' + b.textContent.trim().replace(/\s.*/, ''));
  };
});

const safeOn = (id, ev, fn) => {
  const el = $(id);
  if (!el) return;
  el[ev === 'click' ? 'onclick' : ev === 'input' ? 'oninput' : 'onchange'] = fn;
};
safeOn('brushColor', 'input', e => { brushColor = e.target.value; });
safeOn('brushSize', 'input', e => {
  brushSize = +e.target.value;
  const v = $('brushSizeVal');
  if (v) v.textContent = e.target.value;
});
safeOn('brushOpacity', 'input', e => {
  brushOpacity = +e.target.value;
  const v = $('brushOpacityVal');
  if (v) v.textContent = e.target.value;
});
safeOn('brushSmooth', 'input', e => { brushSmooth = +e.target.value; });
safeOn('clearDrawings', 'click', () => {
  if (!drawCtx) return;
  drawCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
  checkpoint();
  notify('Desenhos apagados.');
});

// ============================================================
// BOTÕES PRINCIPAIS
// ============================================================
function deleteSelected() {
  if (!selectedIds.size) return;
  items = items.filter(i => !selectedIds.has(i.id));
  clearSelection();
  render(); syncInspector(); syncLayers(); checkpoint();
  status('Excluído.');
}
function moveLayer(dir) {
  if (!selectedIds.size) return;
  const sel = items.filter(i => selectedIds.has(i.id));
  const rest = items.filter(i => !selectedIds.has(i.id));
  if (dir === 'front') items = [...rest, ...sel];
  else if (dir === 'back') items = [...sel, ...rest];
  else if (dir === 'front1') {
    sel.forEach(i => {
      const idx = items.indexOf(i);
      if (idx < items.length - 1) [items[idx], items[idx+1]] = [items[idx+1], items[idx]];
    });
  } else if (dir === 'back1') {
    [...sel].reverse().forEach(i => {
      const idx = items.indexOf(i);
      if (idx > 0) [items[idx], items[idx-1]] = [items[idx-1], items[idx]];
    });
  }
  checkpoint(); render(); syncLayers();
}
function alignAction(action) {
  const arr = selected();
  if (!arr) return;
  if (action === 'dist-h' || action === 'dist-v') {
    if (arr.length < 3) { notify('Selecione 3+ elementos.'); return; }
    const sorted = [...arr].sort((a, b) => action === 'dist-h' ? a.x - b.x : a.y - b.y);
    const first = sorted[0], last = sorted[sorted.length - 1];
    if (action === 'dist-h') {
      const totalW = sorted.reduce((s, i) => s + i.w, 0);
      const gap = (last.x - first.x - totalW + sorted[0].w/2 + last.w/2) / (sorted.length - 1);
      let cx = first.x;
      sorted.forEach((i, idx) => {
        if (idx === 0) { cx = i.x; return; }
        cx += sorted[idx-1].w/2 + gap + i.w/2;
        i.x = cx;
      });
    } else {
      const totalH = sorted.reduce((s, i) => s + i.h, 0);
      const gap = (last.y - first.y - totalH + sorted[0].h/2 + last.h/2) / (sorted.length - 1);
      let cy = first.y;
      sorted.forEach((i, idx) => {
        if (idx === 0) { cy = i.y; return; }
        cy += sorted[idx-1].h/2 + gap + i.h/2;
        i.y = cy;
      });
    }
    checkpoint(); render(); syncInspector();
    return;
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  arr.forEach(i => {
    minX = Math.min(minX, i.x - i.w/2);
    maxX = Math.max(maxX, i.x + i.w/2);
    minY = Math.min(minY, i.y - i.h/2);
    maxY = Math.max(maxY, i.y + i.h/2);
  });
  if (action === 'center-canvas') {
    arr.forEach(i => { i.x = canvas.width/2; i.y = canvas.height/2; });
  } else if (arr.length === 1) {
    const i = arr[0];
    if (action === 'left') i.x = i.w/2;
    else if (action === 'right') i.x = canvas.width - i.w/2;
    else if (action === 'top') i.y = i.h/2;
    else if (action === 'bottom') i.y = canvas.height - i.h/2;
    else if (action === 'center-h') i.x = canvas.width/2;
    else if (action === 'center-v') i.y = canvas.height/2;
  } else {
    if (action === 'left') arr.forEach(i => i.x = minX + i.w/2);
    else if (action === 'right') arr.forEach(i => i.x = maxX - i.w/2);
    else if (action === 'top') arr.forEach(i => i.y = minY + i.h/2);
    else if (action === 'bottom') arr.forEach(i => i.y = maxY - i.h/2);
    else if (action === 'center-h') arr.forEach(i => i.x = (minX + maxX)/2);
    else if (action === 'center-v') arr.forEach(i => i.y = (minY + maxY)/2);
  }
  checkpoint(); render(); syncInspector();
}
function copySelection() {
  const arr = selected();
  if (!arr) return;
  clipboard = arr.map(i => { const c = { ...i }; delete c.img; return c; });
  notify('Copiado.');
}
function cutSelection() { copySelection(); deleteSelected(); }
function pasteClipboard() {
  if (!clipboard || !clipboard.length) return;
  const ids = [];
  clipboard.forEach(orig => {
    const c = { ...orig, id: nextId++, x: orig.x + 30, y: orig.y + 30 };
    items.push(c);
    ids.push(c.id);
  });
  clearSelection();
  ids.forEach(id => selectedIds.add(id));
  checkpoint(); render(); syncInspector(); syncLayers();
  notify('Colado.');
}

const safeClick = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
safeClick('zoomIn', () => { zoom = Math.min(4, zoom + .1); applyZoom(); });
safeClick('zoomOut', () => { zoom = Math.max(.15, zoom - .1); applyZoom(); });
safeClick('fitCanvas', () => { zoom = 1; applyZoom(); });
safeClick('gridToggle', () => {
  showGrid = !showGrid;
  $('gridToggle').classList.toggle('active', showGrid);
  render();
});
safeClick('snapToggle', () => {
  snapEnabled = !snapEnabled;
  $('snapToggle').classList.toggle('active', snapEnabled);
  notify(snapEnabled ? '🧲 Ímãs on' : 'Ímãs off');
});
safeClick('propLockToggle', () => {
  propLock = !propLock;
  $('propLockToggle').classList.toggle('active', propLock);
  notify(propLock ? '🔒 Proporção bloqueada' : 'Proporção livre');
});
safeClick('rotationSnapToggle', () => {
  rotationSnapEnabled = !rotationSnapEnabled;
  $('rotationSnapToggle').classList.toggle('active', rotationSnapEnabled);
  notify(rotationSnapEnabled ? 'Snap de rotação on' : 'Snap de rotação off');
});
safeClick('deleteBtn', deleteSelected);
safeClick('deleteToolbarBtn', deleteSelected);
safeClick('duplicateBtn', () => {
  const arr = selected(); if (!arr) return;
  const ids = [];
  arr.forEach(i => {
    const c = { ...i, id: nextId++, name: (i.name||'Elemento') + ' cópia', x: i.x+25, y: i.y+25 };
    delete c.img;
    items.push(c);
    ids.push(c.id);
  });
  clearSelection();
  ids.forEach(id => selectedIds.add(id));
  checkpoint(); render(); syncInspector(); syncLayers();
});
safeClick('bringFrontBtn', () => moveLayer('front'));
safeClick('sendBackBtn', () => moveLayer('back'));
safeClick('bringFrontOneBtn', () => moveLayer('front1'));
safeClick('sendBackOneBtn', () => moveLayer('back1'));
safeClick('undoBtn', undo);
safeClick('redoBtn', redo);
safeClick('darkModeBtn', () => {
  darkMode = !darkMode;
  document.body.classList.toggle('dark', darkMode);
  localStorage.setItem('editor-dark', darkMode);
  $('darkModeBtn').textContent = darkMode ? '☀️' : '🌙';
});

safeClick('groupBtn', () => {
  if (selectedIds.size < 2) { notify('Selecione 2+ elementos.'); return; }
  const gid = 'g_' + Date.now();
  selected().forEach(i => i.groupId = gid);
  checkpoint(); syncLayers(); notify('Agrupados.');
});
safeClick('ungroupBtn', () => {
  const arr = selected(); if (!arr) return;
  arr.forEach(i => i.groupId = null);
  checkpoint(); syncLayers(); notify('Desagrupados.');
});
safeClick('lockBtn', () => {
  const arr = selected(); if (!arr) return;
  const lock = !arr[0].locked;
  arr.forEach(i => i.locked = lock);
  checkpoint(); syncLayers(); notify(lock ? 'Bloqueado' : 'Desbloqueado');
});
safeClick('flipHBtn', () => { const arr = selected(); if (!arr) return; arr.forEach(i => i.flipH = !i.flipH); render(); checkpoint(); });
safeClick('flipVBtn', () => { const arr = selected(); if (!arr) return; arr.forEach(i => i.flipV = !i.flipV); render(); checkpoint(); });
safeClick('hideAllBtn', () => { items.forEach(i => i.visible = false); render(); syncLayers(); checkpoint(); });
safeClick('showAllBtn', () => { items.forEach(i => i.visible = true); render(); syncLayers(); checkpoint(); });

// ============================================================
// ADICIONAR TEXTO
// ============================================================
safeClick('addHeading', () => addItem('text', { name:'Título', text:'Seu título aqui', fontSize:72, bold:true, color:'#6c4df6', w: Math.min(800, canvas.width*.8), h:130 }));
safeClick('addSubheading', () => addItem('text', { name:'Subtítulo', text:'Uma mensagem especial', fontSize:43, color:'#29283a', w: Math.min(800, canvas.width*.8), h:100 }));
safeClick('addBodyText', () => addItem('text', { name:'Texto corrido', text:'Escreva sua mensagem personalizada', fontSize:29, color:'#29283a', w: Math.min(700, canvas.width*.75), h:150 }));
safeClick('add3DText', () => addItem('text', { name:'Texto 3D', text:'TEXTO 3D', fontSize:80, bold:true, color:'#6c4df6', threeD:true, w: Math.min(800, canvas.width*.8), h:140 }));
safeClick('addStrokeText', () => addItem('text', { name:'Texto contornado', text:'CONTORNO', fontSize:80, bold:true, color:'#6c4df6', strokeOnly:true, w: Math.min(800, canvas.width*.8), h:140 }));
safeClick('addShadowText', () => addItem('text', { name:'Texto com sombra', text:'SOMBRA', fontSize:80, bold:true, color:'#6c4df6', shadow:8, shadowBlur:12, w: Math.min(800, canvas.width*.8), h:140 }));

document.querySelectorAll('[data-add]').forEach(b => {
  b.onclick = () => {
    const t = b.dataset.add;
    addItem(t, {
      color: t === 'line' ? '#6c4df6' : '#ff6b9a',
      w: t === 'line' ? Math.min(300, canvas.width*.5) : 200,
      h: t === 'line' ? 5 : 160
    });
  };
});

// ============================================================
// ÍCONES
// ============================================================
const ICONS = {
  shapes: ['★','☆','♥','♦','♣','♠','●','○','■','□','▲','▼','◀','▶','◆','◇','⬡','⬠','✦','✧','✓','✗','⚡','🔥'],
  faces: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😜','🤪','😝'],
  nature: ['🌸','🌺','🌻','🌹','🌷','🌼','🍀','🌿','🌱','🌳','🌲','🌴','🌵','🍁','🍂','🍃','🌾','🌊','☀️','🌙','⭐','🌟','✨','💫'],
  food: ['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥗','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍘','🍥','🥠','🍢','🍡','🍧','🍨'],
  objects: ['📱','💻','🖥️','⌨️','🖱️','🖨️','📷','📹','🎥','📺','📻','🎙️','⏰','⌚','📚','📖','📝','✏️','🖊️','🖌️','🎨','🎭','🎬','🎤'],
  symbols: ['❤️','💔','💕','💖','💗','💓','💞','💝','💘','💌','☮️','☯️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☦️','⚛️','♈','♉','♊'],
  arrows: ['➤','➔','➜','➝','➞','➟','➠','⟶','⟹','⇨','⇾','⇢','⬅️','⬆️','⬇️','➡️','↗️','↘️','↙️','↖️','↕️','↔️','🔄','🔃'],
  transport: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','✈️','🚀','🚁','⛵','🚤','🛥️'],
  sports: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🥋','⛳','🎯','🎳','🛹','🛼','⛸️','🏂','⛷️','🏋️','🤸','🏊','🚴']
};
document.querySelectorAll('.icon-grid[data-icons]').forEach(grid => {
  const key = grid.dataset.icons;
  const arr = ICONS[key] || [];
  grid.innerHTML = arr.map(icon => `<button type="button">${icon}</button>`).join('');
  grid.querySelectorAll('button').forEach((btn, idx) => {
    btn.onclick = () => addItem('icon', { text: arr[idx], name: 'Ícone ' + arr[idx], w: 120, h: 120, color: '#222222' });
  });
});

const iconSearch = $('iconSearch');
if (iconSearch) {
  iconSearch.oninput = e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.icon-grid button').forEach(b => {
      b.style.display = b.textContent.toLowerCase().includes(q) || !q ? '' : 'none';
    });
  };
}

// ============================================================
// DECORAÇÕES
// ============================================================
const DECOR = ['✿','❀','❁','✾','❃','❋','✽','✼','❊','❉','❈','✺','✹','✸','✷','✶','✵','❖','✤','✣','✢','✱','✲','✳','✴','❂','☸','☯','☮','✝','✠','❦','❧','☙','❡','❢','❣','❤','❥'];
const decorGrid = $('decorGrid');
if (decorGrid) {
  decorGrid.innerHTML = DECOR.map(d => `<button type="button">${d}</button>`).join('');
  decorGrid.querySelectorAll('button').forEach((btn, i) => {
    btn.onclick = () => addItem('decor', { text: DECOR[i], name: 'Decoração', w: 120, h: 120, color: '#a18bff' });
  });
}

// ============================================================
// GRADIENTES PRONTOS
// ============================================================
const GRAD_PRESETS = [
  ['#6c4df6','#ff6b9a'],['#ff6b9a','#f6bd4b'],['#f6bd4b','#62c6a5'],
  ['#62c6a5','#4d8cf6'],['#4d8cf6','#6c4df6'],['#222222','#666666'],
  ['#e74c3c','#f39c12'],['#1abc9c','#3498db'],['#9b59b6','#e91e63'],
  ['#f8e4a1','#f6bd4b'],['#2c3e50','#4ca1af'],['#ee9ca7','#ffdde1']
];
const gp = $('gradPresets');
if (gp) {
  gp.innerHTML = GRAD_PRESETS.map(([a,b]) => `<button type="button" style="background:linear-gradient(135deg,${a},${b})" data-c1="${a}" data-c2="${b}"></button>`).join('');
  gp.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      bgGradient.c1 = btn.dataset.c1;
      bgGradient.c2 = btn.dataset.c2;
      bgMode = 'gradient';
      document.querySelectorAll('[data-bg-mode]').forEach(x => x.classList.toggle('active', x.dataset.bgMode === 'gradient'));
      $('bgSolid').classList.add('hidden');
      $('bgGradient').classList.remove('hidden');
      $('bgRadial').classList.add('hidden');
      $('bgGrad1').value = bgGradient.c1;
      $('bgGrad2').value = bgGradient.c2;
      transparent = false;
      render(); checkpoint();
    };
  });
}

// ============================================================
// NAVEGAÇÃO LATERAL
// ============================================================
document.querySelectorAll('[data-panel]').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('[data-panel]').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('[data-panel-content]').forEach(x => x.classList.toggle('hidden', x.dataset.panelContent !== b.dataset.panel));
    if (b.dataset.panel === 'arts' && !artsList.length) {
      loadArtsFromSupabase();
    }
  };
});

// ============================================================
// UPLOADS
// ============================================================
safeClick('uploadButton', () => $('imageInput').click());
const imageInput = $('imageInput');
if (imageInput) {
  imageInput.addEventListener('change', async e => {
    for (const file of [...e.target.files]) {
      if (!file.type.startsWith('image/')) continue;
      const src = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const img = await loadImage(src);
      const scale = Math.min(380 / img.width, 340 / img.height, 1);
      addItem('image', {
        name: file.name.replace(/\.[^.]+$/, ''),
        src, img,
        w: img.width * scale,
        h: img.height * scale,
        color: '#222'
      });
    }
    e.target.value = '';
  });
}

// ============================================================
// FUNDO
// ============================================================
document.querySelectorAll('[data-bg-mode]').forEach(b => {
  b.onclick = () => {
    bgMode = b.dataset.bgMode;
    document.querySelectorAll('[data-bg-mode]').forEach(x => x.classList.toggle('active', x === b));
    $('bgSolid').classList.toggle('hidden', bgMode !== 'solid');
    $('bgGradient').classList.toggle('hidden', bgMode !== 'gradient');
    $('bgRadial').classList.toggle('hidden', bgMode !== 'radial');
    transparent = false;
    render(); checkpoint();
  };
});
safeOn('backgroundColor', 'input', e => { bg = e.target.value; transparent = false; render(); });
const bgc = $('backgroundColor');
if (bgc) bgc.addEventListener('change', checkpoint);
safeOn('bgGrad1', 'input', e => { bgGradient.c1 = e.target.value; render(); });
safeOn('bgGrad2', 'input', e => { bgGradient.c2 = e.target.value; render(); });
safeOn('bgGradAngle', 'input', e => { bgGradient.angle = Number(e.target.value); render(); });
safeOn('bgRad1', 'input', e => { bgGradient.c1 = e.target.value; render(); });
safeOn('bgRad2', 'input', e => { bgGradient.c2 = e.target.value; render(); });
safeClick('transparentBackground', () => { transparent = true; render(); checkpoint(); notify('Fundo transparente ativado.'); });

// ============================================================
// TAMANHO
// ============================================================
const presetSel = $('preset');
if (presetSel) {
  presetSel.onchange = e => {
    if (PRESETS[e.target.value]) {
      $('canvasW').value = PRESETS[e.target.value][0];
      $('canvasH').value = PRESETS[e.target.value][1];
    }
  };
}
safeClick('applySize', () => {
  const w = Math.max(100, Math.min(5000, Number($('canvasW').value) || 1240));
  const h = Math.max(100, Math.min(5000, Number($('canvasH').value) || 561));
  canvas.width = w; canvas.height = h;
  if (drawLayer) { drawLayer.width = w; drawLayer.height = h; }
  render(); syncDimensions(); applyZoom(); checkpoint();
  status('Tamanho atualizado.');
});
safeOn('gridSize', 'input', e => { gridSize = Number(e.target.value); if (showGrid) render(); });
safeClick('showRulersBtn', () => {
  showRulers = !showRulers;
  $('rulerH').classList.toggle('hidden', !showRulers);
  $('rulerV').classList.toggle('hidden', !showRulers);
  $('showRulersBtn').classList.toggle('active', showRulers);
});
safeClick('clearGuidesBtn', () => { clearGuides(); notify('Guias limpas.'); });

// ============================================================
// TEMPLATES
// ============================================================
const templateSearch = $('templateSearch');
if (templateSearch) {
  templateSearch.oninput = e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.template-card').forEach(c => c.classList.toggle('hidden', !c.innerText.toLowerCase().includes(q)));
  };
}
const templates = {
  birthday: { bg: '#fff0f4', items: [
    { type:'text', name:'Msg', text:'Feliz', x:.5, y:.27, w:.8, h:.18, fontSize:60, color:'#733d62', font:'Georgia' },
    { type:'text', name:'Título', text:'ANIVERSÁRIO', x:.5, y:.48, w:.9, h:.2, fontSize:76, color:'#d34f8d', bold:true },
    { type:'text', name:'Detalhe', text:'✦ um dia para celebrar ✦', x:.5, y:.72, w:.9, h:.13, fontSize:27, color:'#733d62' }
  ]},
  minimal: { bg: '#f6f1e7', items: [
    { type:'text', name:'Texto', text:'feito com', x:.5, y:.37, w:.8, h:.15, fontSize:38, color:'#3e3b32', font:'Georgia' },
    { type:'text', name:'Título', text:'amor ♡', x:.5, y:.56, w:.8, h:.23, fontSize:88, color:'#b55b55', font:'Georgia', bold:true }
  ]},
  floral: { bg: '#e7f1e5', items: [
    { type:'text', name:'Flor', text:'❀', x:.5, y:.23, w:.3, h:.18, fontSize:78, color:'#3b6749' },
    { type:'text', name:'Título', text:'Especial', x:.5, y:.48, w:.8, h:.2, fontSize:67, color:'#3b6749', font:'Georgia', bold:true },
    { type:'text', name:'Sub', text:'para você', x:.5, y:.68, w:.8, h:.13, fontSize:34, color:'#3b6749', font:'Georgia' }
  ]},
  bold: { bg: '#222222', items: [
    { type:'text', name:'Topo', text:'YOUR', x:.5, y:.32, w:.8, h:.18, fontSize:62, color:'#f8e4a1', bold:true },
    { type:'text', name:'Título', text:'DESIGN', x:.5, y:.53, w:.95, h:.23, fontSize:94, color:'#f8e4a1', bold:true },
    { type:'text', name:'Detalhe', text:'MAKE IT YOURS', x:.5, y:.72, w:.8, h:.1, fontSize:24, color:'#ffffff' }
  ]},
  sale: { bg: '#fff3c4', items: [
    { type:'text', name:'Topo', text:'SUPER', x:.5, y:.3, w:.9, h:.2, fontSize:80, color:'#a84800', bold:true },
    { type:'text', name:'Título', text:'OFERTA', x:.5, y:.55, w:.95, h:.25, fontSize:110, color:'#d13f00', bold:true },
    { type:'text', name:'Sub', text:'até 50% off', x:.5, y:.78, w:.8, h:.12, fontSize:32, color:'#a84800' }
  ]},
  wedding: { bg: '#f4ecf7', items: [
    { type:'text', name:'Nome 1', text:'Ana', x:.5, y:.3, w:.8, h:.18, fontSize:72, color:'#5b2c6f', font:'Georgia', italic:true },
    { type:'text', name:'E', text:'&', x:.5, y:.48, w:.2, h:.15, fontSize:60, color:'#8e44ad', font:'Georgia' },
    { type:'text', name:'Nome 2', text:'Carlos', x:.5, y:.65, w:.8, h:.18, fontSize:72, color:'#5b2c6f', font:'Georgia', italic:true }
  ]},
  baby: { bg: '#e6f3ff', items: [
    { type:'text', name:'Emoji', text:'👶', x:.5, y:.25, w:.2, h:.18, fontSize:80, color:'#336699' },
    { type:'text', name:'Título', text:'Bem-vindo Bebê', x:.5, y:.55, w:.9, h:.2, fontSize:60, color:'#4488cc', bold:true },
    { type:'text', name:'Detalhe', text:'com muito amor', x:.5, y:.75, w:.8, h:.12, fontSize:26, color:'#336699', font:'Georgia' }
  ]},
  graduation: { bg: '#1a1a2e', items: [
    { type:'text', name:'Emoji', text:'🎓', x:.5, y:.25, w:.2, h:.18, fontSize:80, color:'#f6bd4b' },
    { type:'text', name:'Título', text:'FORMATURA', x:.5, y:.55, w:.9, h:.2, fontSize:72, color:'#f6bd4b', bold:true, letterSpacing:4 },
    { type:'text', name:'Detalhe', text:'2025', x:.5, y:.75, w:.8, h:.12, fontSize:38, color:'#f6bd4b' }
  ]}
};
document.querySelectorAll('[data-template]').forEach(b => {
  b.onclick = () => {
    const t = templates[b.dataset.template];
    if (!t) return;
    bg = t.bg; bgMode = 'solid'; transparent = false;
    items = []; clearSelection();
    if (drawCtx) drawCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
    t.items.forEach(d => {
      const props = { ...d, x: d.x * canvas.width, y: d.y * canvas.height, w: d.w * canvas.width, h: d.h * canvas.height };
      delete props.type;
      addItem(d.type, props, true);
    });
    clearSelection();
    if (items.length) selectOnly(items[items.length - 1].id);
    render(); syncInspector(); syncLayers();
    $('backgroundColor').value = bg;
    checkpoint();
    notify('Modelo aplicado.');
  };
});

// ============================================================
// INSPECTOR BINDINGS
// ============================================================
safeOn('layerName', 'input', e => { updateSelected('name', e.target.value, false); syncLayers(); });
safeOn('textValue', 'input', e => updateSelected('text', e.target.value));
safeOn('fontFamily', 'change', e => { updateSelected('font', e.target.value); checkpoint(); });
safeOn('fontSize', 'change', e => { updateSelected('fontSize', Math.max(6, Math.min(500, Number(e.target.value) || 48))); checkpoint(); });
safeOn('textAlign', 'change', e => { updateSelected('align', e.target.value); checkpoint(); });
safeOn('letterSpacing', 'input', e => updateSelected('letterSpacing', Number(e.target.value)));
safeOn('lineHeight', 'input', e => updateSelected('lineHeight', Number(e.target.value)));
safeOn('textCurve', 'input', e => updateSelected('textCurve', Number(e.target.value)));
safeOn('objectColor', 'input', e => updateSelected('color', e.target.value));
safeOn('opacity', 'input', e => updateSelected('opacity', Number(e.target.value)));
safeOn('cornerRadius', 'input', e => updateSelected('cornerRadius', Number(e.target.value)));
safeOn('shadowRange', 'input', e => updateSelected('shadow', Number(e.target.value)));
safeOn('shadowColor', 'input', e => updateSelected('shadowColor', e.target.value));
safeOn('shadowBlur', 'input', e => updateSelected('shadowBlur', Number(e.target.value)));
safeOn('strokeRange', 'input', e => updateSelected('stroke', Number(e.target.value)));
safeOn('strokeColor', 'input', e => updateSelected('strokeColor', e.target.value));
safeOn('glowRange', 'input', e => updateSelected('glow', Number(e.target.value)));
safeOn('blendMode', 'change', e => { updateSelected('blendMode', e.target.value); checkpoint(); });

['layerName','textValue','letterSpacing','lineHeight','textCurve','objectColor','opacity','cornerRadius','shadowRange','shadowColor','shadowBlur','strokeRange','strokeColor','glowRange'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('change', checkpoint);
});

['boldBtn','italicBtn','underlineBtn','uppercaseBtn'].forEach((id, idx) => {
  const keys = ['bold','italic','underline','uppercase'];
  safeClick(id, () => {
    const arr = selected(); if (!arr) return;
    if (arr.every(i => i.lockedEdit)) { notify('🔒 Esta arte não pode ser editada.'); return; }
    const v = !arr[0][keys[idx]];
    arr.forEach(i => i[keys[idx]] = v);
    render(); syncInspector(); checkpoint();
  });
});

bindInput('posX', 'x', v => Number(v) || 0);
bindInput('posY', 'y', v => Number(v) || 0);
bindInput('objW', 'w', v => Math.max(1, Number(v) || 1));
bindInput('objH', 'h', v => Math.max(1, Number(v) || 1));
bindInput('rotation', 'rotation', v => Number(v) || 0);

document.querySelectorAll('[data-fill-mode]').forEach(b => {
  b.onclick = () => {
    const arr = selected(); if (!arr) return;
    if (arr.every(i => i.lockedEdit)) { notify('🔒 Esta arte não pode ser editada.'); return; }
    const mode = b.dataset.fillMode;
    arr.forEach(i => i.fillMode = mode);
    document.querySelectorAll('[data-fill-mode]').forEach(x => x.classList.toggle('active', x === b));
    $('fillGradient').classList.toggle('hidden', mode !== 'gradient');
    render(); checkpoint();
  };
});
safeOn('fillGrad1', 'input', e => { const arr = selected(); if (!arr) return; arr.forEach(i => { i.fillGradient = { ...(i.fillGradient||{}), c1: e.target.value }; }); render(); });
safeOn('fillGrad2', 'input', e => { const arr = selected(); if (!arr) return; arr.forEach(i => { i.fillGradient = { ...(i.fillGradient||{}), c2: e.target.value }; }); render(); });
safeOn('fillGradAngle', 'input', e => { const arr = selected(); if (!arr) return; arr.forEach(i => { i.fillGradient = { ...(i.fillGradient||{}), angle: Number(e.target.value) }; }); render(); });

safeClick('resetEffects', () => {
  const arr = selected(); if (!arr) return;
  arr.forEach(i => { i.shadow = 0; i.shadowBlur = 10; i.shadowColor = '#000'; i.stroke = 0; i.strokeColor = '#222'; i.glow = 0; i.filters = null; i.blendMode = 'source-over'; });
  render(); syncInspector(); checkpoint();
});

// ============================================================
// FILTROS
// ============================================================
document.querySelectorAll('[data-filter]').forEach(b => {
  b.onclick = () => {
    const arr = selected();
    if (!arr) { notify('Selecione uma imagem primeiro.'); return; }
    const f = b.dataset.filter;
    arr.forEach(i => {
      if (i.type !== 'image') return;
      let cur = i.filters || '';
      if (f === 'reset') cur = '';
      else if (f === 'gray') cur += ' grayscale(1)';
      else if (f === 'sepia') cur += ' sepia(1)';
      else if (f === 'invert') cur += ' invert(1)';
      else if (f === 'blur') cur += ' blur(4px)';
      else if (f === 'bright') cur += ' brightness(1.3)';
      else if (f === 'dark') cur += ' brightness(0.7)';
      else if (f === 'contrast') cur += ' contrast(1.5)';
      else if (f === 'saturate') cur += ' saturate(1.8)';
      i.filters = cur.trim();
    });
    render(); checkpoint();
  };
});

// ============================================================
// EXPORTAR PNG
// ============================================================
function drawExportItem(c, i) {
  if (!i.visible) return;
  c.save();
  c.globalAlpha = (i.opacity ?? 100) / 100;
  c.globalCompositeOperation = i.blendMode || 'source-over';
  c.translate(i.x, i.y);
  c.rotate((i.rotation || 0) * Math.PI / 180);
  if (i.flipH || i.flipV) c.scale(i.flipH ? -1 : 1, i.flipV ? -1 : 1);
  const w = i.w || 100, h = i.h || 60;
  if (i.shadow > 0) {
    c.shadowColor = i.shadowColor || '#000';
    c.shadowBlur = i.shadowBlur || 10;
    c.shadowOffsetX = i.shadow;
    c.shadowOffsetY = i.shadow;
  }
  let fillStyle = i.color || '#222';
  if (i.fillMode === 'gradient' && i.fillGradient) {
    const g = c.createLinearGradient(-w/2, -h/2, w/2, h/2);
    g.addColorStop(0, i.fillGradient.c1 || '#6c4df6');
    g.addColorStop(1, i.fillGradient.c2 || '#ff6b9a');
    fillStyle = g;
  }
  c.fillStyle = fillStyle;
  c.strokeStyle = i.color || '#222';
  c.lineWidth = Math.max(2, Math.min(w,h) * .025);

  if (i.type === 'text') {
    c.fillStyle = fillStyle;
    c.textAlign = i.align || 'center';
    c.textBaseline = 'middle';
    const text = i.uppercase ? String(i.text).toUpperCase() : String(i.text);
    const fs = i.fontSize || 48;
    const lineH = (i.lineHeight || 1.2) * fs;
    c.font = `${i.italic?'italic ':''}${i.bold?'bold ':''}${fs}px "${i.font||'Arial'}"`;
    if (i.textCurve && Math.abs(i.textCurve) > 0) {
      drawCurvedText(c, text, i, fs);
    } else {
      const words = text.split(/\s+/);
      const lines = []; let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (c.measureText(test).width > w && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
      const start = -((lines.length-1) * lineH)/2;
      lines.forEach((ln, n) => {
        const tx = i.align === 'left' ? -w/2 : i.align === 'right' ? w/2 : 0;
        c.fillText(ln, tx, start + n*lineH, w);
        if (i.underline) {
          const m = c.measureText(ln).width;
          let ux = tx - m/2;
          if (i.align === 'left') ux = tx;
          if (i.align === 'right') ux = tx - m;
          c.beginPath();
          c.moveTo(ux, start + n*lineH + fs*.42);
          c.lineTo(ux + m, start + n*lineH + fs*.42);
          c.stroke();
        }
      });
    }
  } else if (i.type === 'rect') {
    if (i.cornerRadius > 0) { roundRect(c, -w/2, -h/2, w, h, i.cornerRadius); c.fill(); }
    else c.fillRect(-w/2, -h/2, w, h);
  } else if (i.type === 'circle') {
    c.beginPath(); c.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI*2); c.fill();
  } else if (i.type === 'triangle') {
    c.beginPath(); c.moveTo(0,-h/2); c.lineTo(w/2,h/2); c.lineTo(-w/2,h/2); c.closePath(); c.fill();
  } else if (i.type === 'hexagon') { drawPolygon(c, 6, w, h); c.fill(); }
  else if (i.type === 'pentagon') { drawPolygon(c, 5, w, h); c.fill(); }
  else if (i.type === 'diamond') {
    c.beginPath(); c.moveTo(0,-h/2); c.lineTo(w/2,0); c.lineTo(0,h/2); c.lineTo(-w/2,0); c.closePath(); c.fill();
  } else if (i.type === 'arrow') {
    c.beginPath();
    c.moveTo(-w/2,-h/6); c.lineTo(w/6,-h/6); c.lineTo(w/6,-h/2);
    c.lineTo(w/2,0); c.lineTo(w/6,h/2); c.lineTo(w/6,h/6);
    c.lineTo(-w/2,h/6); c.closePath(); c.fill();
  } else if (i.type === 'cross') {
    const t = Math.min(w,h)/4;
    c.fillRect(-t/2, -h/2, t, h);
    c.fillRect(-w/2, -t/2, w, t);
  } else if (i.type === 'burst') {
    const spikes = 12;
    c.beginPath();
    for (let j = 0; j < spikes*2; j++) {
      const angle = (j/(spikes*2)) * Math.PI * 2 - Math.PI/2;
      const r = j % 2 === 0 ? w/2 : w/4;
      const x = Math.cos(angle)*r, y = Math.sin(angle)*r;
      if (j === 0) c.moveTo(x,y); else c.lineTo(x,y);
    }
    c.closePath(); c.fill();
  } else if (i.type === 'star') { drawStar(c, 5, w, h, i.color); }
  else if (i.type === 'heart') { drawHeart(c, w, h); }
  else if (i.type === 'line') {
    c.beginPath(); c.moveTo(-w/2,0); c.lineTo(w/2,0); c.stroke();
  } else if (i.type === 'icon' || i.type === 'decor') {
    c.font = `${Math.min(w,h)}px Arial`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(i.text || '★', 0, 0, w);
  } else if (i.type === 'image' && i.img) {
    if (i.cornerRadius > 0) { roundRect(c, -w/2, -h/2, w, h, i.cornerRadius); c.clip(); }
    if (i.filters) c.filter = i.filters;
    c.drawImage(i.img, -w/2, -h/2, w, h);
    c.filter = 'none';
  }
  c.restore();
}

safeClick('exportBtn', () => {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const oc = out.getContext('2d');
  if (!transparent) {
    if (bgMode === 'gradient') {
      const a = (bgGradient.angle || 135) * Math.PI/180;
      const cx = canvas.width/2, cy = canvas.height/2;
      const len = Math.max(canvas.width, canvas.height);
      const x1 = cx - Math.cos(a)*len/2, y1 = cy - Math.sin(a)*len/2;
      const x2 = cx + Math.cos(a)*len/2, y2 = cy + Math.sin(a)*len/2;
      const g = oc.createLinearGradient(x1,y1,x2,y2);
      g.addColorStop(0, bgGradient.c1); g.addColorStop(1, bgGradient.c2);
      oc.fillStyle = g;
    } else if (bgMode === 'radial') {
      const g = oc.createRadialGradient(canvas.width/2, canvas.height/2, 10, canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height)/1.5);
      g.addColorStop(0, bgGradient.c1); g.addColorStop(1, bgGradient.c2);
      oc.fillStyle = g;
    } else oc.fillStyle = bg;
    oc.fillRect(0, 0, out.width, out.height);
  }
  if (drawLayer) oc.drawImage(drawLayer, 0, 0);
  items.forEach(i => drawExportItem(oc, i));
  const name = ($('projectName').value || 'minha-arte').trim().replace(/[^\p{L}\p{N}_-]+/gu, '-');
  out.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = name + '.png';
    a.href = url;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    status('PNG salvo.');
    notify('✅ Arte salva! Volte ao catálogo e anexe no produto.');
  }, 'image/png');
});

// ============================================================
// SALVAR / ABRIR PROJETO
// ============================================================
safeClick('saveProjectBtn', () => {
  const data = {
    app: 'Personaliza Studio', version: 4,
    name: $('projectName').value,
    width: canvas.width, height: canvas.height,
    background: bg, bgMode, bgGradient, transparent,
    items: items.map(i => { const c = { ...i }; delete c.img; return c; })
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ($('projectName').value || 'projeto').trim().replace(/[^\p{L}\p{N}_-]+/gu, '-') + '.json';
  a.click();
  URL.revokeObjectURL(url);
  notify('Projeto salvo.');
});
safeClick('openProjectBtn', () => $('projectInput').click());
const pi = $('projectInput');
if (pi) {
  pi.onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      canvas.width = d.width || 1240;
      canvas.height = d.height || 561;
      if (drawLayer) { drawLayer.width = canvas.width; drawLayer.height = canvas.height; }
      bg = d.background || '#fff';
      bgMode = d.bgMode || 'solid';
      bgGradient = d.bgGradient || { c1:'#6c4df6', c2:'#ff6b9a', angle:135 };
      transparent = !!d.transparent;
      items = d.items || [];
      nextId = Math.max(1, ...items.map(i => i.id + 1));
      for (const i of items) {
        if (i.type === 'image' && i.src) {
          try { i.img = await loadImage(i.src); } catch (e) {}
        }
      }
      clearSelection();
      render(); syncInspector(); syncLayers(); syncDimensions(); applyZoom();
      checkpoint();
      $('projectName').value = d.name || 'Projeto importado';
      $('backgroundColor').value = bg;
      notify('Projeto aberto.');
    } catch (err) {
      notify('Não foi possível abrir o projeto.');
    }
    e.target.value = '';
  };
}

// ============================================================
// ARTES PRONTAS — SUPABASE
// ============================================================
async function loadArtsFromSupabase() {
  const grid = $('artsGrid');
  if (!grid) return;

  if (!artsSupabase) {
    grid.innerHTML = '<div class="arts-empty">Configure o Supabase no editor.js para carregar as artes.</div>';
    return;
  }

  grid.innerHTML = '<div class="arts-loading">Carregando artes...</div>';

  try {
    const { data, error } = await artsSupabase
      .from('gestao_loja_artes_prontas')
      .select('id, nome, categoria, tags, url_imagem, thumb_url')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .order('id', { ascending: false });

    if (error) throw error;

    artsList = data || [];

    const cats = new Set();
    artsList.forEach(a => { if (a.categoria) cats.add(a.categoria); });
    artsCategories = [...cats];

    buildArtCategories();
    renderArtsGrid();

  } catch (err) {
    console.error('Erro ao carregar artes:', err);
    grid.innerHTML = '<div class="arts-empty">Não foi possível carregar as artes.<br><small>Verifique as credenciais do Supabase.</small></div>';
  }
}

function buildArtCategories() {
  const bar = $('artCategories');
  if (!bar) return;
  bar.innerHTML = '<button class="chip active" data-cat="all">Todas</button>';
  artsCategories.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.cat = c;
    b.textContent = c;
    bar.appendChild(b);
  });
  bar.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
      bar.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
      chip.classList.add('active');
      renderArtsGrid(chip.dataset.cat);
    };
  });
}

function renderArtsGrid(filterCat) {
  const grid = $('artsGrid');
  if (!grid) return;

  const search = ($('artSearch')?.value || '').toLowerCase();
  const cat = filterCat || $('artCategories .chip.active')?.dataset.cat || 'all';

  let list = artsList;
  if (cat && cat !== 'all') list = list.filter(a => a.categoria === cat);
  if (search) {
    list = list.filter(a => {
      const t = ((a.nome || '') + ' ' + (a.tags || '') + ' ' + (a.categoria || '')).toLowerCase();
      return t.includes(search);
    });
  }

  if (!list.length) {
    grid.innerHTML = '<div class="arts-empty">Nenhuma arte encontrada.<br><small>Cadastre no Supabase.</small></div>';
    return;
  }

  grid.innerHTML = list.map(a => `
    <div class="art-card" data-id="${a.id}" title="${escapeHtml(a.nome || '')}">
      <img src="${escapeHtml(a.thumb_url || a.url_imagem)}" alt="${escapeHtml(a.nome || '')}" loading="lazy">
      ${a.nome ? `<div class="art-name">${escapeHtml(a.nome)}</div>` : ''}
    </div>
  `).join('');

  grid.querySelectorAll('.art-card').forEach(card => {
    card.onclick = () => {
      const art = artsList.find(x => String(x.id) === card.dataset.id);
      if (art) addArtFromLib(art);
    };
  });
}

async function addArtFromLib(art) {
  try {
    const img = await loadImage(art.url_imagem);

    // ✅ Preenche TODO o canvas mantendo a proporção original
    const canvasRatio = canvas.width / canvas.height;
    const imgRatio = img.width / img.height;

    let w, h;
    if (imgRatio > canvasRatio) {
      // Imagem mais larga → ajusta pela largura
      w = canvas.width;
      h = canvas.width / imgRatio;
    } else {
      // Imagem mais alta → ajusta pela altura
      h = canvas.height;
      w = canvas.height * imgRatio;
    }

    const item = addItem('image', {
      name: art.nome || 'Arte',
      src: art.url_imagem,
      img: img,
      x: canvas.width / 2,
      y: canvas.height / 2,
      w: w,
      h: h,
      color: '#222',
      lockedEdit: true
    }, true);

    selectOnly(item.id);
    render(); syncInspector(); syncLayers(); checkpoint();
    notify('🎨 Arte adicionada!');
  } catch (e) {
    console.error(e);
    notify('Não foi possível carregar a arte.');
  }
}

const artSearch = $('artSearch');
if (artSearch) artSearch.oninput = () => renderArtsGrid();

// ============================================================
// TECLADO
// ============================================================
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const typing = ['INPUT','TEXTAREA','SELECT'].includes(tag);
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
  if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteSelected(); return; }
  if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); $('duplicateBtn')?.click(); return; }
  if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
  if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); cutSelection(); return; }
  if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
  if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); items.forEach(i => selectedIds.add(i.id)); render(); syncInspector(); syncLayers(); return; }
  if (ctrl && e.key.toLowerCase() === 'g') { e.preventDefault(); $('groupBtn')?.click(); return; }
  if (ctrl && e.key === '0') { e.preventDefault(); zoom = 1; applyZoom(); return; }
  if (ctrl && e.key === '+') { e.preventDefault(); zoom = Math.min(4, zoom + .1); applyZoom(); return; }
  if (ctrl && e.key === '-') { e.preventDefault(); zoom = Math.max(.15, zoom - .1); applyZoom(); return; }

  if (typing) return;

  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    const arr = selected(); if (!arr) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    arr.forEach(i => {
      if (i.locked) return;
      if (e.key === 'ArrowUp') i.y -= step;
      if (e.key === 'ArrowDown') i.y += step;
      if (e.key === 'ArrowLeft') i.x -= step;
      if (e.key === 'ArrowRight') i.x += step;
    });
    render();
    const px = $('posX'), py = $('posY');
    if (px) px.value = Math.round(arr[0].x);
    if (py) py.value = Math.round(arr[0].y);
    clearTimeout(window._at);
    window._at = setTimeout(() => { checkpoint(); syncInspector(); }, 300);
  }
  if (e.key === 'Escape') { clearSelection(); render(); syncInspector(); syncLayers(); }
});
window.addEventListener('resize', applyZoom);

// ============================================================
// INIT
// ============================================================
function init() {
  const params = new URLSearchParams(location.search);
  const formato = params.get('formato');
  const mapa = { caneca:'mug', camiseta:'shirt', azulejo:'tile', foto:'photo', banner:'banner', story:'story', post:'post', cartao:'card' };
  if (formato && mapa[formato]) {
    const [w,h] = PRESETS[mapa[formato]];
    canvas.width = w; canvas.height = h;
    if (drawLayer) { drawLayer.width = w; drawLayer.height = h; }
    const p = $('preset');
    if (p) p.value = mapa[formato];
  }
  if (darkMode) {
    document.body.classList.add('dark');
    const db = $('darkModeBtn');
    if (db) db.textContent = '☀️';
  }
  addItem('text', {
    name: 'Título', text: 'Sua arte começa aqui!',
    fontSize: 58, bold: true, color: '#6c4df6',
    w: Math.min(850, canvas.width * .8), h: 130
  }, true);
  clearSelection();
  checkpoint();
  applyZoom(); syncDimensions(); syncLayers(); syncInspector();
  const bc = $('backgroundColor');
  if (bc) bc.value = bg;
}

init();

})();