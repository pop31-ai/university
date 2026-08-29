/*=============================================================
 * chalkboard.js — ДВИЖОК «КОНСПЕКТ-МЕЛ»
 * Проект polimuli-chalkboard.
 *
 * ЧИСТЫЙ универсальный меловой движок: зелёная либо чёрная доска,
 * бесконечная рулонная лента (полотно на стене), кафедра-трибуна.
 * Подходит для преподавателей, ведущих классическую запись мелом:
 * математик, физик-теоретик, языковед, преподаватель истории.
 *
 * РЕКОМЕНДАЦИЯ ПО ТИПУ:
 *   green  — зелёная школьная доска (стандарт кабинета).
 *   black  — чёрная доска (лекционная аудитория, эстетика «театра»).
 *   (Маркерная/пробка/кино — см. отдельные движки markerboard.js,
 *    corkboard.js, cinema.js — по специфике они разделены.)
 *
 * -------------------------------------------------------------
 * ДОСКА = БЕСКОНЕЧНАЯ РУЛОННАЯ ЛЕНТА на стене: мел пишет на участке
 * ленты, затем «move»-мазок подъезжает вверх/вниз/вбок и открывает
 * следующий участок. Кафедра-трибуна — неподвижный передний план.
 *
 * Данные конспекта — strokes[] (хронология), координаты в ВИРТУАЛЬНОЙ
 * бесконечной ленте:
 *
 *   { t, dur, kind, ... }
 *   kind: "note"  тезис-заголовок (появление целиком)
 *         "text"  строка/формула мелом (посимвольное письмо)
 *         "line"  отрезок мелом
 *         "ul"    подчёркивание
 *         "box"   рамка-акцент
 *         "cloud" облачко-комментарий (слова лектора без звука)
 *         "arrow" вектор/стрелка
 *         "grid"  клетки таблицы
 *         "dot"   точка данных
 *         "erase" губка (затирает участок)
 *         "move"  разворот ленты { to:[x,y], sec }
 *
 * style: { type: 'green'|'black', bg, frame, rail, chalk, accent, ... }
 * room:  { kind:'math'|'lab', title } — задник кабинета (необязательно)
 * view:  { x, y } — стартовое окно ленты.
 *
 * API:
 *   const ctrl = Chalk.play(canvas, session, {w,h});
 *   ctrl.pause(); ctrl.resume(); ctrl.stop(); ctrl.seek(t); ctrl.panTo(x,y,sec);
 * ============================================================*/

(function (root) {
  'use strict';
  var Chalk = (root.Chalk = {});

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

  // ---------- доска ----------
  function drawBoard(ctx, D, W, H) {
    var noise = makeNoise(11);
    ctx.fillStyle = D.rail || '#7a5230';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = D.frame || (D.type === 'black' ? '#3a2a18' : '#5a3a20');
    ctx.fillRect(0, 0, W, 14);
    ctx.fillRect(0, H - 10, W, 10);
    ctx.fillStyle = D.bg || (D.type === 'black' ? '#1c2520' : '#2b6a24');
    ctx.fillRect(10, 12, W - 20, H - 22);
    // рваная меловая текстура
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (var i = 0; i < 500; i++) {
      ctx.fillRect(12 + noise() * (W - 24), 14 + noise() * (H - 26), 1 + noise() * 2, 1 + noise() * 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (var j = 0; j < 160; j++) {
      ctx.fillRect(12 + noise() * (W - 24), 14 + noise() * (H - 26), 20 + noise() * 40, 1 + noise());
    }
  }

  function drawTextInto(ctx, s, x, y, font, color, alpha, noise) {
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgba(color, alpha);
    ctx.fillText(s, x, y);
    var w = ctx.measureText(s).width;
    for (var i = 0; i < w * 0.25; i++) {
      var gx = x + noise() * w;
      var gy = y + noise() * (parseInt(font, 10) || 20);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + noise() * 0.1) + ')';
      ctx.fillRect(gx, gy, 1 + noise() * 2, 1 + noise() * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawLine(ctx, p0, p1, color, width, alpha, noise) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    var segs = Math.max(4, Math.round(Math.max(Math.abs(p1[0] - p0[0]), Math.abs(p1[1] - p0[1])) / 8));
    for (var i = 1; i <= segs; i++) {
      var qx = lerp(p0[0], p1[0], i / segs) + (noise() - 0.5) * 1.6;
      var qy = lerp(p0[1], p1[1], i / segs) + (noise() - 0.5) * 1.6;
      ctx.lineTo(qx, qy);
    }
    ctx.stroke();
    for (var k = 0; k < 40; k++) {
      var tt = noise();
      ctx.fillStyle = 'rgba(' + hexRgb(color).join(',') + ',' + (0.1 + noise() * 0.15) + ')';
      ctx.fillRect(lerp(p0[0], p1[0], tt) + (noise() - 0.5) * width * 2,
                   lerp(p0[1], p1[1], tt) + (noise() - 0.5) * width * 2, 1 + noise() * 2, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawCloud(ctx, s, x, y, alpha, color) {
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.font = '600 15px "Segoe UI", Arial, sans-serif';
    var tw = ctx.measureText(s).width;
    var pad = 10, w = tw + pad * 2, h = 30;
    ctx.fillStyle = '#fcf8ec';
    ctx.strokeStyle = color || '#7a6a3a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h - 6);
    ctx.quadraticCurveTo(x + w / 2, y + h + 14, x + w, y + h - 6);
    ctx.quadraticCurveTo(x + w + 6, y + h / 2, x + w, y);
    ctx.quadraticCurveTo(x + w - 8, y - 10, x + w / 2, y - 2);
    ctx.quadraticCurveTo(x + 2, y - 8, x, y + h / 2);
    ctx.quadraticCurveTo(x - 4, y + h - 4, x, y + h - 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a3a3a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x + pad, y + h / 2 - 1);
    ctx.restore();
  }

  function drawPodium(ctx, D, W, H, t) {
    if (D.podium === false) return;
    var x = W - 200, y = H - 165;
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(x + 110, y + 60, 26, 80);
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(x + 30, y + 60, 26, 80);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(x, y, 176, 14);
    ctx.fillStyle = '#8a6238';
    ctx.fillRect(x + 4, y + 2, 168, 4);
    ctx.fillStyle = '#e8d9b8';
    ctx.fillRect(x + 84, y - 16, 6, 18);
    ctx.fillStyle = '#ffd966';
    ctx.beginPath();
    ctx.arc(x + 87, y - 20, 9, 0, 7);
    ctx.fill();
    var gl = 0.12 + 0.06 * Math.sin(t * 2.2);
    ctx.fillStyle = 'rgba(255,230,140,' + gl + ')';
    ctx.beginPath();
    ctx.arc(x + 87, y - 20, 26, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(x + 32, y + 18, 110, 8);
    ctx.fillStyle = '#c8c0a8';
    ctx.fillRect(x + 34, y + 28, 92, 2);
    ctx.fillRect(x + 34, y + 34, 72, 2);
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(x + 150, y + 18, 18, 6);
    ctx.fillStyle = '#4a5a6a';
    ctx.fillRect(x + 126, y + 20, 22, 4);
  }

  // ---------- кабинет (необязательный задник комнаты) ----------
  function drawRoomFrame(ctx, RM, W, H) {
    var kind = RM.kind || 'class';
    var wallA = '#a8946e', wallB = '#8f7a56';
    if (kind === 'lab') { wallA = '#c7cdd2'; wallB = '#aeb6bc'; }
    else if (kind === 'math') { wallA = '#d9cda8'; wallB = '#c4b58c'; }
    else if (kind === 'bio') { wallA = '#b7c9a4'; wallB = '#a0b48c'; }
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, wallA); g.addColorStop(1, wallB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = RM.base || '#6b4a2a';
    ctx.fillRect(0, H - 8, W, 8);
    ctx.save();
    if (kind === 'lab') {
      ctx.fillStyle = '#9aa37e';
      ctx.fillRect(W - 240, 120, 200, H - 200);
      ctx.fillStyle = '#b7c0a4';
      ctx.fillRect(W - 224, 140, 90, 40);
      ctx.fillRect(W - 120, 140, 90, 40);
      ctx.fillStyle = '#6b6f7a';
      ctx.fillRect(120, 260, 10, 140);
      ctx.fillRect(150, 200, 6, 200);
      ctx.fillStyle = 'rgba(220,235,245,0.5)';
      ctx.beginPath();
      ctx.moveTo(160, 210); ctx.lineTo(150, 250); ctx.arc(155, 250, 8, 0, 7); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7a6a42';
      ctx.fillRect(40, H - 90, 220, 30);
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(200, H - 190, 6, 100);
      ctx.fillStyle = '#e8d9b8';
      ctx.beginPath();
      ctx.arc(203, H - 190, 16, 0, 7);
      ctx.fill();
    } else if (kind === 'math') {
      ctx.fillStyle = '#7a6a42';
      ctx.fillRect(W - 230, 120, 190, H - 130);
      ctx.fillStyle = '#9a8a5a';
      ctx.fillRect(W - 214, 140, 60, 40);
      ctx.fillRect(W - 214, 200, 60, 40);
      ctx.fillRect(W - 140, 140, 60, 40);
      ctx.fillRect(W - 140, 200, 60, 40);
      ctx.fillStyle = '#f0e8d0';
      ctx.fillRect(40, 120, 170, 110);
      ctx.fillStyle = '#2a2a2a';
      ctx.font = '13px "Segoe UI"';
      ctx.textAlign = 'center';
      var t = ['1 2 3 4 5', '2 4 6 8 10', '3 6 9 12 15', '4 8 12 16 20', '5 10 15 20 25'];
      t.forEach(function (ln, i) { ctx.fillText(ln, 60, 135 + i * 18); });
    } else if (kind === 'bio') {
      ctx.fillStyle = '#6a5a34';
      ctx.fillRect(W - 220, 120, 180, H - 130);
      ctx.fillStyle = '#4a6a3a';
      ctx.fillRect(W - 204, 300, 60, 120);
      ctx.fillStyle = '#6a8a4a';
      ctx.beginPath();
      ctx.arc(W - 174, 300, 26, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#7a7a5a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(140, 260, 28, 0, 7);
      ctx.stroke();
    }
    ctx.restore();
    if (RM.title) {
      ctx.fillStyle = RM.plaque || '#7a4a2a';
      var tw = Math.max(180, RM.title.length * 9.2);
      var tx = (W - tw) / 2, ty = 10;
      ctx.fillRect(tx, ty, tw, 26);
      ctx.fillStyle = '#fdf6e0';
      ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(RM.title, W / 2, ty + 13);
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
      running: true, _t0: null, _t: 0,
      pause: function () { ctrl.running = false; },
      resume: function () { ctrl.running = true; ctrl._t0 = null; },
      stop: function () { ctrl.running = false; cancelAnimationFrame(ctrl._raf); },
      seek: function (t) { ctrl._t = clamp(t, 0, total); },
      panTo: function (x, y, sec) {
        pan = { fx: cam.x, fy: cam.y, tx: x, ty: y, dur: sec || 1.4, t0: ctrl._t };
      },
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
      var t = clamp((now - ctrl._t0) / 1000, 0, total);
      ctrl._t = t;
      camUpdate(t);

      if (RM && RM.frame !== false && RM.kind) drawRoomFrame(ctx, RM, W, H);
      drawBoard(ctx, D, W, H);

      strokes.forEach(function (s) {
        var noise = makeNoise(Math.floor(s.t * 13 + s.dur * 7) + 1);
        if (s.t > t) return;
        var local = t - s.t;
        var k = clamp(local / Math.max(0.001, s.dur), 0, 1);

        switch (s.kind) {
          case 'move': {
            if (s.t <= t && (!pan || pan.t0 < s.t)) ctrl.panTo(s.to[0], s.to[1], s.sec || 1.4);
            break;
          }
          case 'text': {
            drawTextInto(ctx, s.s.slice(0, Math.ceil(k * s.s.length)),
              sx(s.x), sy(s.y), s.font || 'bold 26px "Segoe UI"', s.color || D.chalk, 1, noise);
            break;
          }
          case 'note': {
            drawTextInto(ctx, s.s, sx(s.x), sy(s.y),
              s.font || 'bold 24px "Segoe UI"', s.color || D.white, Math.min(1, k * 1.6), noise);
            break;
          }
          case 'line': {
            drawLine(ctx, [sx(s.from[0]), sy(s.from[1])],
              [sx(lerp(s.from[0], s.to[0], k)), sy(lerp(s.from[1], s.to[1], k))],
              s.color || D.chalk, s.width || 4, 0.9, noise);
            break;
          }
          case 'ul': {
            drawLine(ctx, [sx(s.x), sy(s.y)], [sx(s.x) + (s.w || 60) * k, sy(s.y)],
              s.color || D.accent || '#ffd966', s.width || 3, 0.85, noise);
            break;
          }
          case 'box': {
            var bx = sx(s.x + (s.w || 40) * (1 - k) / 2);
            var bw = (s.w || 40) * k;
            var by = sy(s.y + (s.h || 30) * (1 - k) / 2);
            var bh = (s.h || 30) * k;
            drawLine(ctx, [bx, by], [bx + bw, by], s.color || D.accent, s.width || 3, 0.8, noise);
            drawLine(ctx, [bx + bw, by], [bx + bw, by + bh], s.color || D.accent, s.width || 3, 0.8, noise);
            drawLine(ctx, [bx + bw, by + bh], [bx, by + bh], s.color || D.accent, s.width || 3, 0.8, noise);
            drawLine(ctx, [bx, by + bh], [bx, by], s.color || D.accent, s.width || 3, 0.8, noise);
            break;
          }
          case 'cloud': {
            var a = clamp(k * 3, 0, 1);
            if (local >= s.dur - 0.4) a = clamp((s.dur - local) / 0.4, 0, 1);
            drawCloud(ctx, s.s || '', sx(s.x), sy(s.y), a, s.color);
            break;
          }
          case 'arrow': {
            drawLine(ctx, [sx(s.from[0]), sy(s.from[1])],
              [sx(lerp(s.from[0], s.to[0], k)), sy(lerp(s.from[1], s.to[1], k))],
              s.color || D.chalk, s.width || 4, 0.9, noise);
            if (k >= 1) {
              var ang = Math.atan2(s.to[1] - s.from[1], s.to[0] - s.from[0]);
              var ah = s.head || 12;
              ctx.globalAlpha = 1;
              ctx.strokeStyle = rgba(s.color || D.chalk, 1);
              ctx.lineWidth = s.width || 4;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(sx(s.to[0]), sy(s.to[1]));
              ctx.lineTo(sx(s.to[0]) - ah * Math.cos(ang - 0.4), sy(s.to[1]) - ah * Math.sin(ang - 0.4));
              ctx.moveTo(sx(s.to[0]), sy(s.to[1]));
              ctx.lineTo(sx(s.to[0]) - ah * Math.cos(ang + 0.4), sy(s.to[1]) - ah * Math.sin(ang + 0.4));
              ctx.stroke();
            }
            break;
          }
          case 'grid': {
            var cols = s.cols || 2, rows = s.rows || 4;
            var toShow = Math.floor(k * rows);
            var cw = s.cw || 70, ch = s.ch || 22;
            for (var r = 0; r <= toShow; r++) {
              drawLine(ctx, [sx(s.x), sy(s.y + r * ch)], [sx(s.x + cols * cw), sy(s.y + r * ch)],
                s.color || 'rgba(255,255,255,0.5)', 1.5, 0.6, noise);
            }
            for (var c2 = 0; c2 <= cols; c2++) {
              drawLine(ctx, [sx(s.x + c2 * cw), sy(s.y)], [sx(s.x + c2 * cw), sy(s.y + toShow * ch)],
                s.color || 'rgba(255,255,255,0.5)', 1.5, 0.6, noise);
            }
            break;
          }
          case 'dot': {
            if (k >= 1) {
              ctx.globalAlpha = 1;
              ctx.fillStyle = s.color || D.white;
              ctx.beginPath();
              ctx.arc(sx(s.x), sy(s.y), s.r || 4, 0, 7);
              ctx.fill();
            }
            break;
          }
          case 'erase': {
            ctx.fillStyle = D.bg || (D.type === 'black' ? '#1c2520' : '#2b6a24');
            ctx.fillRect(sx(s.x), sy(s.y), (s.w || 80) * k, (s.h || 24) * k);
            break;
          }
        }
      });

      drawPodium(ctx, D, W, H, t);
      ctrl._raf = requestAnimationFrame(drawFrame);
    }

    ctrl._raf = requestAnimationFrame(drawFrame);
    return ctrl;
  }

  Chalk.play = play;
})(typeof window !== 'undefined' ? window : this);