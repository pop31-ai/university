/*=============================================================
 * neo.js — движок-фабрика «Много досок» (базис полиарта)
 * polimuli-chalkboard
 *
 * Параметризованный движок, порождающий НЕСКОЛЬКО досок/стилей —
 * элементов пространства кабинета, которые лектор выбирает заранее
 * (до лекции). Единый API у всех: play/pause/resume/stop/seek/panTo/
 * setSpeed/_t — как и у остальных движков.
 *
 * Доски (экспортируются под именами):
 *   Glass — стеклянная панель, неоновое свечение
 *   LED   — светодиодная панель, яркие цветные светящиеся мазки
 *   Neo   — synthwave/неон-волна на ретро-фоне
 *   Wood  — деревянная грифельная панель (тёплый мел)
 *   Brick — кирпичная стена с мелом (граффити-конспект)
 *   Overhead — плёночный оверхед-проектор (световой луч, плёнка)
 *
 * kind'ы (общий набор + специфические):
 *   note, text, line, ul, box, cloud, arrow, dot, grid, highlight, move
 *   LED:  led (полоса светодиодов)
 *   Neo:  wave (неоновая волна)
 *   Overhead: cell (плёнка-камера), lamp (световой луч)
 *
 * style.type задаёт доску: 'glass'|'led'|'neo'|'wood'|'brick'|'overhead'
 * ============================================================*/

(function (root) {
  'use strict';

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hexRgb(hex) {
    var h = (hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    var c = hexRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function makeNoise(seed) {
    var s = seed >>> 0 || (seed * 48271) % 2147483647;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // ---------- палитры досок ----------
  var BOARDS = {
    glass: {
      bg: '#0d1420', panel: 'none', frame: 'rgba(124,247,255,0.35)',
      ink: '#aef6ff', accent: '#ffd966', glow: '#7cf7ff', highlight: '#ffd966'
    },
    led: {
      bg: '#120a1e', panel: 'none', frame: 'rgba(255,77,170,0.5)',
      ink: '#ff77cc', accent: '#66ff99', glow: '#ff44aa', highlight: '#66ff99'
    },
    neo: {
      bg: '#16082a', panel: 'none', frame: 'rgba(255,0,170,0.6)',
      ink: '#ff2fd6', accent: '#ffe14d', glow: '#ff2fd6', highlight: '#ffe14d'
    },
    wood: {
      bg: '#3a2418', panel: 'wood', frame: '#6b4a2a',
      ink: '#f4f0e6', accent: '#ffd966', glow: 'rgba(255,255,255,0.0)', highlight: '#d9a441'
    },
    brick: {
      bg: '#3a2018', panel: 'brick', frame: '#552418',
      ink: '#f4f4f0', accent: '#ffb4a8', glow: 'rgba(255,255,255,0.0)', highlight: '#ffb4a8'
    },
    overhead: {
      bg: '#10141a', panel: 'screen', frame: 'rgba(255,255,255,0.25)',
      ink: '#ffe27a', accent: '#ffe27a', glow: '#ffe27a', highlight: '#ffe27a'
    }
  };

  // ---------- отрисовка фонов досок ----------
  function drawPanel(ctx, D, W, H, kind) {
    ctx.fillStyle = D.bg;
    ctx.fillRect(0, 0, W, H);
    if (kind === 'wood') {
      // деревянная фактура
      makeNoise(5);
      ctx.save();
      for (var gx = 0; gx < W; gx += 34) {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        var yy = 14 + Math.sin(gx / 60) * 6;
        ctx.moveTo(gx, 14); ctx.bezierCurveTo(gx - 10, H / 2, gx + 10, H / 2, gx, H - 14);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(14, 14, W - 28, H - 28);
      ctx.restore();
    } else if (kind === 'brick') {
      // кирпичная кладка
      ctx.save();
      var bh = 34, bw = 74;
      for (var r = 0; r * bh < H; r++) {
        for (var c = 0; ; c++) {
          var x = c * bw + (r % 2 ? bw / 2 : 0);
          if (x > W) break;
          var y = 14 + r * bh;
          ctx.fillStyle = (c + r) % 2 ? '#4a2a20' : '#42261c';
          ctx.fillRect(x, y, bw - 3, bh - 3);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, bw - 3, bh - 3);
        }
      }
      ctx.restore();
    } else if (kind === 'screen') {
      // плёночный экран — светло-серое полотно со слабой дымкой
      ctx.fillStyle = 'rgba(225,225,215,0.9)';
      ctx.fillRect(16, 16, W - 32, H - 32);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 12, W - 24, H - 24);
    }

    // неоновая рама-свечение для световых досок
    if (kind === 'glass' || kind === 'led' || kind === 'neo') {
      ctx.save();
      ctx.strokeStyle = D.frame;
      ctx.shadowColor = D.glow;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 3;
      ctx.strokeRect(14, 14, W - 28, H - 28);
      ctx.restore();
    }
  }

  // свечение вокруг мазка (для световых досок)
  function glowAround(ctx, D, x, y, r, color, strength) {
    if (D.glow.indexOf('rgba') === 0 && D.glow.indexOf('0.0') >= 0) return; // дерево/кирпич без свечения
    var g = ctx.createRadialGradient(x, y, 0, x, y, r || 46);
    var c = hexRgb(color || D.glow);
    g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (strength || 0.4) + ')');
    g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - (r || 46), y - (r || 46), 2 * (r || 46) + 30, 2 * (r || 46) + 30);
  }

  function drawLineRep(ctx, D, x1, y1, x2, y2, color, width, glow) {
    ctx.save();
    if (glow !== false) { ctx.shadowColor = color || D.ink; ctx.shadowBlur = 12; }
    ctx.strokeStyle = color || D.ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = (width || 3) + 4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.lineWidth = (width || 3);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function drawTextRep(ctx, D, s, x, y, font, color, alpha, noise) {
    ctx.save();
    ctx.font = font || 'bold 26px "Segoe UI"';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color || D.ink;
    if (D.glow.indexOf('rgba') !== 0 && D.glow.indexOf('0.0') < 0) { ctx.shadowColor = color || D.ink; ctx.shadowBlur = 9; }
    if (noise) {
      var lines = String(s).split('\n');
      lines.forEach(function (ln, i) {
        ctx.fillText(ln, x + (noise() - 0.5) * 1.6, y + (noise() - 0.5) * 1.6 + i * 1.3 * (parseFloat(font) || 26));
      });
    } else {
      ctx.fillText(s, x, y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------- движок ----------
  function play(canvas, session, opts) {
    var D = Object.assign({}, BOARDS.glass, session.style || {});
    var RM = Object.assign({}, session.room || {});
    var strokes = session.strokes || [];
    var W = opts && opts.w || 960;
    var H = opts && opts.h || 540;
    var view = Object.assign({ x: 0, y: 0 }, session.view || {});
    var kind = D.type || session.style && session.style.type || 'glass';

    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var total = session.duration || 0;
    strokes.forEach(function (s) { if (s.t + s.dur > total) total = s.t + s.dur; });

    var cam = { x: view.x, y: view.y };
    var pan = null;

    var ctrl = {
      running: true, _t0: null, _t: 0, _speed: 1,
      pause: function () { ctrl.running = false; },
      resume: function () { ctrl.running = true; ctrl._t0 = null; },
      stop: function () { ctrl.running = false; cancelAnimationFrame(ctrl._raf); },
      seek: function (t) { ctrl._t = clamp(t, 0, total); ctrl._t0 = null; },
      panTo: function (x, y, sec) {
        pan = { fx: cam.x, fy: cam.y, tx: x, ty: y, dur: sec || 1.4, t0: ctrl._t };
      },
      setSpeed: function (m) { ctrl._speed = Math.max(0.1, m || 1); },
      _raf: 0
    };

    function camUpdate(t) {
      if (pan) {
        var k = clamp((t - pan.t0) / pan.dur, 0, 1);
        var e = 1 - Math.pow(1 - k, 3);
        cam.x = lerp(pan.fx, pan.tx, e);
        cam.y = lerp(pan.fy, pan.ty, e);
        if (k >= 1) pan = null;
      }
    }
    function sx(x) { return x - cam.x; }
    function sy(y) { return y - cam.y; }

    function drawFrame(now) {
      if (!ctrl.running) return;
      if (!ctrl._t0) ctrl._t0 = now;
      var t = clamp(((now - ctrl._t0) / 1000) * ctrl._speed, 0, total);
      if (Math.abs(t - ctrl._t) > 0.7) ctrl._t0 = now - (t / ctrl._speed) * 1000;
      ctrl._t = t;
      camUpdate(t);

      if (RM && RM.frame !== false && RM.kind) drawRoom(ctx, RM, W, H, kind);
      drawPanel(ctx, D, W, H, kind);

      strokes.forEach(function (s) {
        if (s.t > t) return;
        var local = t - s.t;
        var k = clamp(local / Math.max(0.001, s.dur), 0, 1);

        switch (s.kind) {
          case 'move': {
            if (s.t <= t && (!pan || pan.t0 < s.t)) ctrl.panTo(s.to[0], s.to[1], s.sec || 1.4);
            break;
          }
          case 'text': {
            drawTextRep(ctx, D, String(s.s).slice(0, Math.ceil(k * String(s.s).length)),
              sx(s.x), sy(s.y), s.font || 'bold 26px "Segoe UI"', s.color || D.ink, 1,
              (kind === 'wood' || kind === 'brick') ? makeNoise(4) : null);
            break;
          }
          case 'note': {
            drawTextRep(ctx, D, s.s, sx(s.x), sy(s.y),
              s.font || 'bold 24px "Segoe UI"', s.color || D.accent, Math.min(1, k * 1.6));
            break;
          }
          case 'line': {
            var x2 = lerp(s.x, s.x + (s.w || 200), k);
            drawLineRep(ctx, D, sx(s.x), sy(s.y), sx(x2), sy(s.y), s.color || D.ink, s.width || 3, D.glow);
            break;
          }
          case 'ul': {
            var x2u = lerp(s.x, s.x + (s.w || 200), k);
            drawLineRep(ctx, D, sx(s.x), sy(s.y + 8), sx(x2u), sy(s.y + 8), s.color || D.accent, 4, D.glow);
            break;
          }
          case 'box': {
            var bw = (s.w || 200) * Math.max(0.05, k);
            ctx.save();
            if (D.glow.indexOf('rgba') !== 0 && D.glow.indexOf('0.0') < 0) { ctx.shadowColor = s.color || D.accent; ctx.shadowBlur = 14; }
            ctx.strokeStyle = s.color || D.accent; ctx.lineWidth = 3;
            ctx.strokeRect(sx(s.x), sy(s.y), bw, s.h || 40);
            ctx.fillStyle = rgba(s.color || D.accent, 0.12);
            ctx.fillRect(sx(s.x), sy(s.y), bw, s.h || 40);
            ctx.restore();
            break;
          }
          case 'highlight': {
            if (local >= 0) {
              // яркое выделение: полупрозрачная подложка + рамка
              ctx.save();
              ctx.shadowColor = s.color || D.highlight;
              ctx.shadowBlur = 14;
              ctx.fillStyle = rgba(s.color || D.highlight, 0.22 * Math.min(1, k * 2));
              ctx.fillRect(sx(s.x), sy(s.y), s.w || 200, s.h || 30);
              ctx.strokeStyle = rgba(s.color || D.highlight, 0.8);
              ctx.lineWidth = 2;
              ctx.strokeRect(sx(s.x) - 1, sy(s.y) - 1, (s.w || 200) + 2, (s.h || 30) + 2);
              ctx.restore();
            }
            break;
          }
          case 'cloud': {
            ctx.save();
            ctx.font = s.font || 'italic 16px "Segoe UI"';
            ctx.fillStyle = rgba(s.color || D.ink, 0.6 * k);
            ctx.fillText(s.s || '', sx(s.x), sy(s.y));
            ctx.restore();
            break;
          }
          case 'arrow': {
            var ax = lerp(s.x, s.x + (s.w || 120), k);
            drawLineRep(ctx, D, sx(s.x), sy(s.y), sx(ax), sy(s.y), s.color || D.accent, s.width || 3, D.glow);
            break;
          }
          case 'dot': {
            if (local >= 0) {
              ctx.save();
              ctx.fillStyle = s.color || D.ink;
              if (D.glow.indexOf('rgba') !== 0 && D.glow.indexOf('0.0') < 0) { ctx.shadowColor = s.color || D.ink; ctx.shadowBlur = 10; }
              ctx.beginPath(); ctx.arc(sx(s.x), sy(s.y), s.r || 4, 0, Math.PI * 2); ctx.fill();
              ctx.restore();
            }
            break;
          }
          case 'grid': {
            if (local >= 0) {
              ctx.save();
              ctx.strokeStyle = rgba(s.color || D.ink, 0.45 * Math.min(1, k * 2));
              ctx.lineWidth = 1;
              for (var gi = 0; gi <= (s.cols || 2); gi++) {
                ctx.beginPath();
                ctx.moveTo(sx(s.x + gi * (s.cw || 90)), sy(s.y));
                ctx.lineTo(sx(s.x + gi * (s.cw || 90)), sy(s.y + (s.rows || 5) * (s.ch || 24)));
                ctx.stroke();
              }
              for (var gj = 0; gj <= (s.rows || 5); gj++) {
                ctx.beginPath();
                ctx.moveTo(sx(s.x), sy(s.y + gj * (s.ch || 24)));
                ctx.lineTo(sx(s.x + (s.cols || 2) * (s.cw || 90)), sy(s.y + gj * (s.ch || 24)));
                ctx.stroke();
              }
              ctx.restore();
            }
            break;
          }
          case 'led': {
            // полоса светодиодов
            if (local >= 0) {
              var lit = Math.ceil(k * (s.n || 16));
              ctx.save();
              var bw = (s.w || 300) / (s.n || 16);
              for (var li = 0; li < lit; li++) {
                ctx.fillStyle = s.color || D.accent;
                ctx.shadowColor = s.color || D.accent; ctx.shadowBlur = 8;
                ctx.fillRect(sx(s.x + li * bw), sy(s.y), bw - 3, s.h || 22);
              }
              ctx.restore();
            }
            break;
          }
          case 'wave': {
            // неоновая волна
            if (local >= 0) {
              ctx.save();
              ctx.strokeStyle = s.color || D.accent;
              ctx.shadowColor = s.color || D.accent; ctx.shadowBlur = 10;
              ctx.lineWidth = s.width || 3;
              ctx.beginPath();
              for (var wi = 0; wi <= 30; wi++) {
                var wx = s.x + (s.w || 300) * wi / 30;
                var wy = s.y + Math.sin(wi / 2 + (s.phase || 0)) * 6;
                if (wi === 0) ctx.moveTo(sx(wx), sy(wy)); else ctx.lineTo(sx(wx), sy(wy));
              }
              ctx.stroke();
              ctx.restore();
            }
            break;
          }
          case 'cell': {
            // плёночная ячейка оверхед-проектора
            if (local >= 0) {
              ctx.save();
              ctx.fillStyle = 'rgba(255,255,255,0.06)';
              ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
              ctx.fillRect(sx(s.x), sy(s.y), s.w || 300, s.h || 60);
              ctx.strokeRect(sx(s.x), sy(s.y), s.w || 300, s.h || 60);
              ctx.restore();
            }
            break;
          }
          case 'lamp': {
            // световой луч проектора
            if (local >= 0) {
              ctx.save();
              var g = ctx.createLinearGradient(0, H, 0, 0);
              g.addColorStop(0, 'rgba(255,226,122,0.0)');
              g.addColorStop(1, 'rgba(255,226,122,0.08)');
              ctx.fillStyle = g;
              ctx.fillRect(0, 0, W, H);
              ctx.restore();
            }
            break;
          }
        }
      });

      ctrl._raf = requestAnimationFrame(drawFrame);
    }

    // комнатный задник-кабинет (опционально)
    function drawRoom(ctx, RM, W, H, k) {
      var rk = RM.kind;
      if (rk === 'studio') {
        var g = ctx.createRadialGradient(W / 2, 50, 10, W / 2, 50, 320);
        g.addColorStop(0, 'rgba(255,255,255,0.10)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(20,24,32,0.9)';
        ctx.fillRect(0, H - 26, W, 26);
      } else if (rk === 'lab') {
        // лаборатория: стойка слева
        ctx.fillStyle = 'rgba(40,52,66,0.9)';
        ctx.fillRect(0, 0, 34, H);
        ctx.fillStyle = 'rgba(90,110,130,0.6)';
        ctx.fillRect(0, 0, 34, H);
        ctx.fillStyle = 'rgba(20,28,36,0.9)';
        ctx.fillRect(0, H - 30, W, 30);
      }
    }

    drawFrame(0);
    return ctrl;
  }

  var api = { play: play };

  root.Glass = api;
  root.LED = api;
  root.Neo = api;
  root.Wood = api;
  root.Brick = api;
  root.Overhead = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
