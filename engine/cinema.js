/*=============================================================
 * cinema.js — ДВИЖОК «КИНОЗАЛ / ЭКРАН-ЛЕНТА»
 * Проект polimuli-chalkboard.
 *
 * СПЕЦИФИКА (отличие от доски-движков):
 *   - Затемнённый кинозал: экран-лента (бесконечный рулон), проектор
 *     со световым лучом, контуры кресел в переднем плане.
 *   - Материал — СЛАЙДЫ на экране, не письмо мелом.
 *   - kind "slide"    — слайд-заголовок (крупный, белым по экрану),
 *   - kind "stext"    — строка слайда (посимвольно проявляется),
 *   - kind "sline"    — линия/схема на слайде,
 *   - kind "sarrow"   — стрелка на слайде,
 *   - kind "sbox"     — рамка на слайде,
 *   - kind "cloud"    — комментарий лектора (режиссёра) без звука,
 *   - kind "move"     — подъём экранной ленты (новый «кадр»/кат-сцена).
 *   Режиссёр-монтаж: панорамы — как кат-сцены фильма.
 *
 * РЕКОМЕНДАЦИЯ: вводные презентации, обзор курса, кинолекция —
 * лектор-кинематографист, ректор, анонсирующий семестр.
 *
 * Данные strokes; style.type всегда "cinema".
 * API: const ctrl = Cinema.play(canvas, session, {w,h});
 * ============================================================*/

(function (root) {
  'use strict';
  var Cinema = (root.Cinema = {});

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function makeNoise(seed) {
    var s = seed >>> 0 || (seed * 48271) % 2147483647;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // затемнённый кинозал: стена, экран-лента, проектор, кресла
  function drawRoom(ctx, D, W, H, t) {
    // стена
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#23242e'); g.addColorStop(1, '#15161d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // экран-лента (рулон)
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(60, 30, W - 120, H - 140);
    // рамка экрана
    ctx.fillStyle = '#3a3d4a';
    ctx.fillRect(48, 22, W - 96, H - 132);
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(60, 34, W - 120, H - 156);
    // проектор
    ctx.fillStyle = '#3a3f4d';
    ctx.fillRect(W - 150, 20, 60, 40);
    ctx.fillStyle = '#2e3038';
    ctx.fillRect(W - 150, 60, 60, 12);
    // световой луч проектора (от проектора к экрану)
    ctx.save();
    var beam = ctx.createLinearGradient(W - 120, 60, 300, H / 2);
    beam.addColorStop(0, 'rgba(255,230,140,0.30)');
    beam.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(W - 120, 60);
    ctx.lineTo(W - 120, 100);
    ctx.lineTo(200, H / 2 + 60);
    ctx.lineTo(200, H / 2 - 60);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // контуры кресел
    for (var r = 0; r < 3; r++) {
      ctx.fillStyle = '#2e3040';
      ctx.fillRect(100 + (W - 200) * 0.3, H - 120 + r * 34, 56, 20);
      ctx.fillRect(100 + (W - 200) * 0.6, H - 120 + r * 34, 56, 20);
    }
    ctx.fillStyle = '#1a1b22';
    ctx.fillRect(0, H - 30, W, 30);
  }

  function drawSlideText(ctx, s, x, y, font, color, alpha, noise) {
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = alpha;
    // мягкая тень для читаемости по экрану
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(s, x + 2, y + 2);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.globalAlpha = 1;
  }

  function drawSlideLine(ctx, p0, p1, color, width, alpha) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawCloud(ctx, s, x, y, alpha, color) {
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.font = '600 14px "Segoe UI", Arial, sans-serif';
    var tw = ctx.measureText(s).width;
    var pad = 10, w = tw + pad * 2, h = 30;
    ctx.fillStyle = '#fdfaf0';
    ctx.strokeStyle = color || '#d9b84a';
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

  function play(canvas, session, opts) {
    var D = Object.assign({ type: 'cinema' }, session.style || {});
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

      drawRoom(ctx, D, W, H, t);

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
          case 'slide': {
            drawSlideText(ctx, s.s, sx(s.x), sy(s.y),
              s.font || 'bold 40px "Segoe UI"', s.color || '#f4f2ea', Math.min(1, k * 1.4), noise);
            break;
          }
          case 'stext': {
            drawSlideText(ctx, s.s.slice(0, Math.ceil(k * s.s.length)),
              sx(s.x), sy(s.y), s.font || 'bold 24px "Segoe UI"', s.color || '#eef1f6', 1, noise);
            break;
          }
          case 'sline': {
            drawSlideLine(ctx, [sx(s.from[0]), sy(s.from[1])],
              [sx(lerp(s.from[0], s.to[0], k)), sy(lerp(s.from[1], s.to[1], k))],
              s.color || '#eef1f6', s.width || 3, 0.9);
            break;
          }
          case 'sarrow': {
            drawSlideLine(ctx, [sx(s.from[0]), sy(s.from[1])],
              [sx(lerp(s.from[0], s.to[0], k)), sy(lerp(s.from[1], s.to[1], k))],
              s.color || '#ffd966', s.width || 4, 0.9);
            if (k >= 1) {
              var ang = Math.atan2(s.to[1] - s.from[1], s.to[0] - s.from[0]);
              var ah = s.head || 13;
              ctx.globalAlpha = 1;
              ctx.strokeStyle = s.color || '#ffd966';
              ctx.lineWidth = s.width || 4;
              ctx.beginPath();
              ctx.moveTo(sx(s.to[0]), sy(s.to[1]));
              ctx.lineTo(sx(s.to[0]) - ah * Math.cos(ang - 0.4), sy(s.to[1]) - ah * Math.sin(ang - 0.4));
              ctx.moveTo(sx(s.to[0]), sy(s.to[1]));
              ctx.lineTo(sx(s.to[0]) - ah * Math.cos(ang + 0.4), sy(s.to[1]) - ah * Math.sin(ang + 0.4));
              ctx.stroke();
            }
            break;
          }
          case 'sbox': {
            var bx = sx(s.x + (s.w || 40) * (1 - k) / 2);
            var bw = (s.w || 40) * k;
            var by = sy(s.y + (s.h || 30) * (1 - k) / 2);
            var bh = (s.h || 30) * k;
            var col = s.color || '#ffd966';
            drawSlideLine(ctx, [bx, by], [bx + bw, by], col, s.width || 3, 0.85);
            drawSlideLine(ctx, [bx + bw, by], [bx + bw, by + bh], col, s.width || 3, 0.85);
            drawSlideLine(ctx, [bx + bw, by + bh], [bx, by + bh], col, s.width || 3, 0.85);
            drawSlideLine(ctx, [bx, by + bh], [bx, by], col, s.width || 3, 0.85);
            break;
          }
          case 'sdot': {
            if (k >= 1) {
              ctx.globalAlpha = 1;
              ctx.fillStyle = s.color || '#ffd966';
              ctx.beginPath();
              ctx.arc(sx(s.x), sy(s.y), s.r || 5, 0, 7);
              ctx.fill();
            }
            break;
          }
          case 'cloud': {
            var a = clamp(k * 3, 0, 1);
            if (local >= s.dur - 0.4) a = clamp((s.dur - local) / 0.4, 0, 1);
            drawCloud(ctx, s.s || '', sx(s.x), sy(s.y), a, s.color);
            break;
          }
        }
      });

      ctrl._raf = requestAnimationFrame(drawFrame);
    }

    ctrl._raf = requestAnimationFrame(drawFrame);
    return ctrl;
  }

  Cinema.play = play;
})(typeof window !== 'undefined' ? window : this);