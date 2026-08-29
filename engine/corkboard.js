/*=============================================================
 * corkboard.js — ДВИЖОК «ПРОБКОВАЯ ДОСКА»
 * Проект polimuli-chalkboard.
 *
 * СПЕЦИФИКА (отличие от мелового chalkboard.js и маркерного):
 *   - Пробковая тёплая доска с точечной фактурой.
 *   - Материал — КАРТОЧКИ, приколотые булавками, НЕ письмо мелом.
 *   - kind "card"    — карточка: прилетает, прикалывается булавкой,
 *                    (её можно двигать: полное появление + лёгкий поворот)
 *   - kind "pin"     — булавка-кнопка на карточке,
 *   - kind "thread"  — нить/верёвочка, связывающая карточки (идея-связь),
 *   - kind "cardtitle" — заголовок-карточка сверху.
 *   Лента-панорама сохранена: рулон пробковой доски (стена из пробки).
 *
 * РЕКОМЕНДАЦИЯ: мозговая карта, план семестра, лаборатория идей —
 * преподаватель-методолог, наставник, руководитель команды, ИИ-админ.
 *
 * Данные strokes; style.type всегда "cork".
 * Используемые kind'ы: card, cardtitle, pin, thread, note, cloud, move.
 *
 * API: const ctrl = Cork.play(canvas, session, {w,h});
 * ============================================================*/

(function (root) {
  'use strict';
  var Cork = (root.Cork = {});

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
    var noise = makeNoise(21);
    ctx.fillStyle = D.rail || '#7a5a32';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = D.frame || '#6b4a2a';
    ctx.fillRect(0, 0, W, 14);
    ctx.fillRect(0, H - 10, W, 10);
    ctx.fillStyle = '#c2843f';
    ctx.fillRect(12, 14, W - 24, H - 26);
    for (var ci = 0; ci < 900; ci++) {
      var cx = 12 + noise() * (W - 24);
      var cy = 14 + noise() * (H - 26);
      ctx.fillStyle = noise() < 0.5
        ? 'rgba(160,100,40,' + (0.25 + noise() * 0.4) + ')'
        : 'rgba(214,158,86,' + (0.25 + noise() * 0.4) + ')';
      ctx.fillRect(cx, cy, 2 + noise() * 3, 2 + noise() * 3);
    }
  }

  function drawCard(ctx, s, x, y, k, font, color, noise) {
    // карточка «прилетает»: масштаб и небольшой поворот
    var grow = 0.82 + 0.18 * k;
    var rot = (1 - k) * 0.18;
    var cw = s.w || 170, chh = s.h || 58;
    ctx.save();
    ctx.translate(x + cw / 2, y + chh / 2);
    ctx.rotate(rot);
    ctx.scale(grow, grow);
    ctx.translate(-(x + cw / 2), -(y + chh / 2));
    ctx.globalAlpha = clamp(k * 1.8, 0, 1);
    ctx.fillStyle = s.fill || '#f6f1e2';
    ctx.fillRect(x, y, cw, chh);
    ctx.strokeStyle = s.border || '#b09a5c';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cw, chh);
    // рукописная строка
    if (s.s) {
      ctx.font = font || '600 15px "Comic Sans MS", "Segoe UI", sans-serif';
      ctx.fillStyle = s.ink || '#3a3218';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(s.s, x + 12, y + 16);
    }
    ctx.restore();
    // лёгкая неровность пробковой тени
    ctx.globalAlpha = 1;
  }

  function drawPin(ctx, x, y, color) {
    ctx.fillStyle = color || '#c0392b';
    ctx.beginPath();
    ctx.arc(x, y - 6, 6, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#7a8a9a';
    ctx.fillRect(x - 1.5, y - 6, 3, 10);
  }

  function drawThread(ctx, p0, p1, color, width, alpha) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.strokeStyle = color || '#a35d2a';
    ctx.lineWidth = width || 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    // провисшая нить
    var mx = (p0[0] + p1[0]) / 2;
    var my = (p0[1] + p1[1]) / 2 + 28;
    ctx.quadraticCurveTo(mx, my, p1[0], p1[1]);
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
    var D = Object.assign({ type: 'cork' }, session.style || {});
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
        var noise = makeNoise(Math.floor(s.t * 13 + 3) + 1);
        if (s.t > t) return;
        var local = t - s.t;
        var k = clamp(local / Math.max(0.001, s.dur), 0, 1);

        switch (s.kind) {
          case 'move': {
            if (s.t <= t && (!pan || pan.t0 < s.t)) ctrl.panTo(s.to[0], s.to[1], s.sec || 1.4);
            break;
          }
          case 'cardtitle': {
            drawCard(ctx, s, sx(s.x), sy(s.y), k, 'bold 19px "Segoe UI"', s.color, noise);
            break;
          }
          case 'card': {
            drawCard(ctx, s, sx(s.x), sy(s.y), k, s.font, s.color, noise);
            break;
          }
          case 'pin': {
            if (k >= 1) drawPin(ctx, sx(s.x), sy(s.y), s.color);
            break;
          }
          case 'thread': {
            var f = s.from, to = s.to;
            var fpn = clamp(k * 1.5, 0, 1);
            drawThread(ctx, [sx(f[0]), sy(f[1])], [sx(to[0]), sy(to[1])],
              s.color, s.width, s.alpha == null ? fpn : s.alpha);
            break;
          }
          case 'note': {
            drawCloud(ctx, s.s || '', sx(s.x), sy(s.y), Math.min(1, k * 1.6), s.color);
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

  Cork.play = play;
})(typeof window !== 'undefined' ? window : this);