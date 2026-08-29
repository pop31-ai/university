/*=============================================================
 * glassboard.js — движок «Стеклянная доска» (автономный стиль)
 * polimuli-chalkboard
 *
 * Стеклянная маркерная панель на тёмном фоне, стилусы-маркеры с
 * НЕОНОВЫМ СВЕЧЕНИЕМ (glow). Автономный движок с тем же API, что
 * и остальные: play/pause/resume/stop/seek/panTo/_t.
 *
 * Данные конспекта — strokes[] в ВИРТУАЛЬНОЙ бесконечной ленте:
 *   { t, dur, kind, ... }
 *   kind: "note"  тезис-заголовок (появление целиком, с glow)
 *         "text"  строка/формула стилусом (посимвольное письмо)
 *         "line"  отрезок неоном
 *         "ul"    подчёркивание
 *         "box"   рамка-акцент (неоновая)
 *         "arrow" стрелка-луч
 *         "dot"   светящаяся точка
 *         "grid"  клетки
 *         "move"  разворот ленты { to:[x,y], sec }
 *
 * style: { type:'glass', bg, frame=pane, glow, chalk=ink, accent }
 * room:  { kind:'studio'|'hall', title } — задник кабинета
 *
 * API:
 *   const ctrl = Glass.play(canvas, session, {w,h});
 *   ctrl.pause(); ctrl.resume(); ctrl.stop(); ctrl.seek(t);
 *   ctrl.panTo(x,y,sec); ctrl.setSpeed(mult);
 * ============================================================*/

(function (root) {
  'use strict';
  var Glass = (root.Glass = {});

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexRgb(hex) {
    var h = (hex || '#7cf7ff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    var c = hexRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  // неоновое свечение
  function drawGlow(ctx, x, y, w, h, radius, color, strength) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, radius || 40);
    var c = hexRgb(color || '#7cf7ff');
    g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (strength || 0.35) + ')');
    g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - (radius || 40), y - (radius || 40), w + 2 * (radius || 40), h + 2 * (radius || 40));
  }

  // ---------- панель ----------
  function drawPanel(ctx, D, W, H) {
    // фон — тёмная стена
    ctx.fillStyle = D.bg || '#0d1420';
    ctx.fillRect(0, 0, W, H);
    // лёгкое зеркальное стекло
    var grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.05)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    grad.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(12, 12, W - 24, H - 24);

    // металлическая рама панели с лёгким неоновым контуром
    ctx.strokeStyle = D.frame || 'rgba(124,247,255,0.35)';
    ctx.lineWidth = 3;
    ctx.shadowColor = D.frame || '#7cf7ff';
    ctx.shadowBlur = 12;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.shadowBlur = 0;

    // лёгкая сетка стекла
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (var x = 24; x < W - 20; x += 60) { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, H - 18); ctx.stroke(); }
    for (var y = 24; y < H - 20; y += 60) { ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(W - 18, y); ctx.stroke(); }
  }

  // прямые потом рисуются с glow-обводкой и мягкой внешней подложкой
  function drawLineNeon(ctx, x1, y1, x2, y2, color, width) {
    ctx.save();
    ctx.shadowColor = color || '#7cf7ff';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = color || '#7cf7ff';
    ctx.lineWidth = (width || 3) + 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.lineWidth = (width || 3);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function drawTextInto(ctx, s, x, y, font, color, alpha, noise) {
    ctx.save();
    ctx.font = font || 'bold 26px "Segoe UI"';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    // свечение текста
    ctx.shadowColor = color || '#aef6ff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = color || '#aef6ff';
    if (noise) {
      // лёгкое дрожание рукописного начертания
      var lines = String(s).split('\n');
      lines.forEach(function (ln, i) {
        ctx.fillText(ln, x + (noise() - 0.5) * 1.6, y + (noise() - 0.5) * 1.6 + i * 1.2 * (parseFloat(font) || 26));
      });
    } else {
      ctx.fillText(s, x, y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawBoxNeon(ctx, x, y, w, h, color) {
    ctx.save();
    ctx.strokeStyle = color || '#ffd966';
    ctx.shadowColor = color || '#ffd966';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    // полупрозрачная заливка
    ctx.fillStyle = rgba(color || '#ffd966', 0.12);
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // ---------- кабинет ----------
  function drawRoom(ctx, RM, W, H) {
    if (!RM || RM.frame === false) return;
    var kind = RM.kind;
    if (kind === 'studio') {
      // студия света
      ctx.fillStyle = 'rgba(124,247,255,0.05)';
      ctx.fillRect(0, 0, W, H);
      // блик от потолочной лампы
      var g = ctx.createRadialGradient(W / 2, 60, 10, W / 2, 60, 260);
      g.addColorStop(0, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // нижняя стойка
      ctx.fillStyle = 'rgba(30,42,60,0.9)';
      ctx.fillRect(0, H - 26, W, 26);
      ctx.fillStyle = 'rgba(124,247,255,0.2)';
      ctx.fillRect(60, H - 26, 6, 26);
    } else if (kind === 'hall') {
      // затемнённый зал с мягкой подсветкой панели
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- движок ----------
  function play(canvas, session, opts) {
    var D = Object.assign({}, session.style || {});
    var RM = Object.assign({}, session.room || {});
    var strokes = session.strokes || [];
    var W = opts && opts.w || 960;
    var H = opts && opts.h || 540;
    var view = Object.assign({ x: 0, y: 0 }, session.view || {});

    canvas.width = W;
    canvas.height = H;
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
      if (t > ctrl._t + 0.5) ctrl._t0 = now - (t / ctrl._speed) * 1000; // keep continuity on speed change
      ctrl._t = t;
      camUpdate(t);

      if (RM && RM.frame !== false && RM.kind) drawRoom(ctx, RM, W, H);
      drawPanel(ctx, D, W, H);

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
            drawTextInto(ctx, String(s.s).slice(0, Math.ceil(k * String(s.s).length)),
              sx(s.x), sy(s.y), s.font || 'bold 26px "Segoe UI"', s.color || D.chalk || '#aef6ff', 1);
            break;
          }
          case 'note': {
            drawTextInto(ctx, s.s, sx(s.x), sy(s.y),
              s.font || 'bold 24px "Segoe UI"', s.color || D.accent || '#ffd966', Math.min(1, k * 1.6));
            break;
          }
          case 'line': {
            var x2 = lerp(s.x, s.x + (s.w || 200), k);
            drawLineNeon(ctx, sx(s.x), sy(s.y), sx(x2), sy(s.y), s.color || '#7cf7ff', s.width || 3);
            break;
          }
          case 'ul': {
            var x2u = lerp(s.x, s.x + (s.w || 200), k);
            drawLineNeon(ctx, sx(s.x), sy(s.y + 6), sx(x2u), sy(s.y + 6), s.color || D.accent || '#ffd966', 4);
            break;
          }
          case 'box': {
            var bw = (s.w || 200) * Math.max(0.05, k);
            drawBoxNeon(ctx, sx(s.x), sy(s.y), bw, s.h || 40, s.color || D.accent);
            break;
          }
          case 'cloud': {
            ctx.save();
            ctx.font = s.font || 'italic 16px "Segoe UI"';
            ctx.fillStyle = rgba(s.color || '#aef6ff', 0.5 * k);
            ctx.fillText(s.s || '', sx(s.x), sy(s.y));
            ctx.restore();
            break;
          }
          case 'arrow': {
            var ax = lerp(s.x, s.x + (s.w || 120), k);
            drawLineNeon(ctx, sx(s.x), sy(s.y), sx(ax), sy(s.y), s.color || '#ff9d7c', s.width || 3);
            break;
          }
          case 'dot': {
            if (local >= 0) {
              ctx.save();
              ctx.fillStyle = s.color || '#7cf7ff';
              ctx.shadowColor = s.color || '#7cf7ff';
              ctx.shadowBlur = 12;
              ctx.beginPath();
              ctx.arc(sx(s.x), sy(s.y), (s.r || 4), 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
            break;
          }
          case 'grid': {
            if (local >= 0) {
              ctx.save();
              ctx.strokeStyle = rgba(s.color || '#7cf7ff', 0.4 * Math.min(1, k * 2));
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
          case 'highlight': {
            if (local >= 0) {
              ctx.fillStyle = rgba(s.color || '#ffd966', 0.15 * Math.min(1, k * 2));
              ctx.fillRect(sx(s.x), sy(s.y), s.w || 200, s.h || 30);
            }
            break;
          }
        }
      });

      ctrl._raf = requestAnimationFrame(drawFrame);
    }

    drawFrame(0);

    return ctrl;
  }

  Glass.play = play;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
