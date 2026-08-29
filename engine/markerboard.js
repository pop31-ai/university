/*=============================================================
 * markerboard.js — ДВИЖОК «МАРКЕРНАЯ БЕЛАЯ ДОСКА»
 * Проект polimuli-chalkboard.
 *
 * СПЕЦИФИКА (отличие от мелового chalkboard.js):
 *   - Белая гладкая маркерная доска с лёгкой бликовостью.
 *   - Чернила маркера: плавный жирный штрих БЕЗ меловой зернистости
 *     (нет рассыпания). Цвета маркеров насыщенные.
 *   - kind "mtext" — посимвольное письмо «маркером» (без скрипа),
 *   - kind "mline" — маркерная линия,
 *   - kind "mwipe" — сухое стирание (губка оставляет влажный след,
 *     потом подсыхает), в отличие от мелового "erase".
 *   - kind "highlight" — фломастер-подсветка (полупрозрачный брусок).
 *   Лента и панорамы сохранены (рулон белой доски).
 *
 * РЕКОМЕНДАЦИЯ: стратегические совещания, метод-панели, планирование
 * по семестру; преподаватель-наставник ИИ-руководителя, администратор.
 * (Зеленая/чёрная меловая — chalkboard.js, пробка — corkboard.js,
 *  кинозал — cinema.js.)
 *
 * Данные — те же strokes; style.type всегда "white".
 * Используемые kind'ы: mtext, mline, note, box, cloud, highlight, mwipe, move.
 *
 * API: const ctrl = Marker.play(canvas, session, {w,h});
 * ============================================================*/

(function (root) {
  'use strict';
  var Marker = (root.Marker = {});

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function makeNoise(seed) {
    var s = seed >>> 0 || (seed * 48271) % 2147483647;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function drawBoard(ctx, D, W, H) {
    ctx.fillStyle = D.rail || '#8a8a92';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = D.frame || '#6a6a72';
    ctx.fillRect(0, 0, W, 14);
    ctx.fillRect(0, H - 10, W, 10);
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#eef1f3');
    g.addColorStop(1, '#dfe3e8');
    ctx.fillStyle = g;
    ctx.fillRect(12, 14, W - 24, H - 26);
    // лёгкий блик сверху
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(12, 14, W - 24, 5);
  }

  function drawMarkerText(ctx, s, x, y, font, color, alpha, noise) {
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    // тень-«чернила» чуть плотнее
    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      ctx.globalAlpha = alpha * 0.25;
      ctx.fillStyle = '#c8ccd2';
      ctx.fillText(s, x + i, y + j);
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    // лёгкая неровность (маркер, но не сыпется)
    var w = ctx.measureText(s).width;
    for (var k = 0; k < w * 0.08; k++) {
      ctx.fillStyle = 'rgba(80,90,100,' + (0.06 + noise() * 0.1) + ')';
      ctx.fillRect(x + noise() * w, y + noise() * (parseInt(font, 10) || 20), 1.5 + noise() * 2, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawMarkerLine(ctx, p0, p1, color, width, alpha, noise) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    var segs = Math.max(3, Math.round(Math.max(Math.abs(p1[0] - p0[0]), Math.abs(p1[1] - p0[1])) / 12));
    for (var i = 1; i <= segs; i++) {
      var qx = lerp(p0[0], p1[0], i / segs) + (noise() - 0.5) * 1.1;
      var qy = lerp(p0[1], p1[1], i / segs) + (noise() - 0.5) * 1.1;
      ctx.lineTo(qx, qy);
    }
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
    ctx.strokeStyle = color || '#b0a060';
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
    var D = Object.assign({ type: 'white' }, session.style || {});
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
          case 'mtext': {
            drawMarkerText(ctx, s.s.slice(0, Math.ceil(k * s.s.length)),
              sx(s.x), sy(s.y), s.font || 'bold 25px "Segoe UI"', s.color || D.chalk || '#22303c', 1, noise);
            break;
          }
          case 'mline': {
            drawMarkerLine(ctx, [sx(s.from[0]), sy(s.from[1])],
              [sx(lerp(s.from[0], s.to[0], k)), sy(lerp(s.from[1], s.to[1], k))],
              s.color || '#22263a', s.width || 5, 0.95, noise);
            break;
          }
          case 'note': {
            drawMarkerText(ctx, s.s, sx(s.x), sy(s.y),
              s.font || 'bold 23px "Segoe UI"', s.color || '#1a1a2a', Math.min(1, k * 1.6), noise);
            break;
          }
          case 'box': {
            var bx = sx(s.x + (s.w || 40) * (1 - k) / 2);
            var bw = (s.w || 40) * k;
            var by = sy(s.y + (s.h || 30) * (1 - k) / 2);
            var bh = (s.h || 30) * k;
            drawMarkerLine(ctx, [bx, by], [bx + bw, by], s.color || s.accent || '#d97706', 3.5, 0.9, noise);
            drawMarkerLine(ctx, [bx + bw, by], [bx + bw, by + bh], s.color || s.accent || '#d97706', 3.5, 0.9, noise);
            drawMarkerLine(ctx, [bx + bw, by + bh], [bx, by + bh], s.color || s.accent || '#d97706', 3.5, 0.9, noise);
            drawMarkerLine(ctx, [bx, by + bh], [bx, by], s.color || s.accent || '#d97706', 3.5, 0.9, noise);
            break;
          }
          case 'highlight': {
            ctx.globalAlpha = clamp(k * 2, 0, 0.4);
            ctx.fillStyle = s.color || '#fde68a';
            ctx.fillRect(sx(s.x), sy(s.y), (s.w || 160) * k, s.h || 30);
            ctx.globalAlpha = 1;
            break;
          }
          case 'cloud': {
            var a = clamp(k * 3, 0, 1);
            if (local >= s.dur - 0.4) a = clamp((s.dur - local) / 0.4, 0, 1);
            drawCloud(ctx, s.s || '', sx(s.x), sy(s.y), a, s.color);
            break;
          }
          case 'mwipe': {
            // сухое стирание: влажный след затем подсыхает
            var wet = 0.5 - 0.4 * k;
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = 'rgba(180,190,200,0.5)';
            ctx.fillRect(sx(s.x), sy(s.y), (s.w || 80) * k, (s.h || 24) * k);
            ctx.globalAlpha = 1;
            break;
          }
        }
      });

      ctrl._raf = requestAnimationFrame(drawFrame);
    }

    ctrl._raf = requestAnimationFrame(drawFrame);
    return ctrl;
  }

  Marker.play = play;
})(typeof window !== 'undefined' ? window : this);