/*=============================================================
 * polyart.js — ДВИЖОК-ПРОСТРАНСТВО «ПОЛИАРТ»
 * Проект polimuli-chalkboard.
 *
 * Полиарт — НЕ доска, а ПОЛНОЕ ПРОСТРАНСТВО ПОЛИАРТА:
 * одна виртуальная лента, по которой расставлены зоны-кабинеты
 * полиарт-университета (холл, мел-класс, метод-кабинет, комната
 * идей, кинозал). Занятие «живёт» на нескольких зонах: лента
 * проходит через них, а ЛЕТАЮЩИЕ КАМЕРЫ (ноу-хау университета)
 * облетают пространство, показывая обстановку, справочники и
 * масштаб. Верхний слой — ДУХ ПОЛИАРТА: полупрозрачная строка
 * просвещения поверх пространства (слой изложения и смысла).
 *
 * Слои занятия:
 *   1) конспект (зоны: мел/маркер/пробка/кино — материал),
 *   2) дух полиарта (kind "spirit") — смысл поверх пространства,
 *   3) изложение — камеры ("cam"), панорамы ("move"), зоны ("zone").
 *
 * kind'ы движка (супернабор всех досок):
 *   note, text, ul, box, arrow, dot, grid      — мел/маркер
 *   highlight, mtext, mline, mwipe             — маркер
 *   card, cardtitle, pin, thread               — пробка
 *   slide, stext, sbox, sline, sarrow          — кино
 *   spirit                                     — слой духа
 *   zone                                       — метка зоны
 *   cam                                        — полёт камеры вокруг зоны
 *   move                                       — панорама ленты
 *
 * Данные strokes; style.type всегда "polyart".
 * api: const ctrl = Polyart.play(canvas, session, {w,h});
 * ============================================================*/

(function (root) {
  'use strict';
  var Polyart = (root.Polyart = {});

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }

  // Зоны-кабинеты полиарт-университета. Ширина каждой зоны ZW.
  var ZW = 900;
  var ZONES = [
    { id: 'холл',      label: 'холл полиарта',          bg: '#20241d', frame: '#4a543a', glow: '#8aa06a' },
    { id: 'мел',       label: 'класс-мел',              bg: '#2d6a2f', frame: '#6b4a2a', glow: '#ffd966' },
    { id: 'маркер',    label: 'метод-кабинет',          bg: '#eef1f4', frame: '#b9c4cc', glow: '#d97706' },
    { id: 'пробка',    label: 'комната идей',           bg: '#7a5a32', frame: '#6b4a2a', glow: '#c0392b' },
    { id: 'кино',      label: 'кинозал',                bg: '#15171b', frame: '#3a3f49', glow: '#ffd966' }
  ];
  function zoneById(id) {
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].id === id) return ZONES[i];
    return ZONES[1];
  }

  function drawZoneWall(ctx, z, x0, y0, w, h) {
    // стена зоны: фон + рама + световая отметка (номер зоны на раме)
    ctx.fillStyle = z.bg;
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = z.frame;
    ctx.fillRect(x0, y0, w, 12);
    ctx.fillRect(x0, y0 + h - 8, w, 8);
    // лампа-блик вверху стены (свет зоны)
    ctx.fillStyle = z.glow;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(x0 + w / 2 - 60, y0 + 12, 120, 5);
    ctx.globalAlpha = 1;
    // зона-распорка между стенами (стык) — тёмная линия
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x0 - 6, y0, 6, h);
  }

  // справочник, развешанный на стене зоны (принцип «зал как инструмент»)
  function drawReference(ctx, x, y, w, h, title, z) {
    ctx.fillStyle = '#fdf9e8';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = z.frame;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = z.frame;
    ctx.font = '700 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, x + 8, y + 6);
  }

  function drawBoard(ctx, D, W, H, zoneList) {
    ctx.fillStyle = D.rail || '#1a1d18';
    ctx.fillRect(0, 0, W, H);
    zoneList.forEach(function (z, i) {
      drawZoneWall(ctx, z, i * ZW, 0, ZW, H);
    });
  }

  function drawWord(ctx, s, x, y, style, font) {
    ctx.font = font || '700 26px "Segoe UI", sans-serif';
    ctx.fillStyle = style;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(s, x, y);
  }

  // ---- мазки (универсальный чертёж по kind) ----
  function drawStroke(ctx, s, x, y, z, k, t, local, W, H) {
    var kind = s.kind;
    var alpha = clamp(k * 1.8, 0, 1);
    var col = s.color || z.glow;

    switch (kind) {
      case 'note':
      case 'text':
      case 'mtext':
      case 'stext': {
        drawWord(ctx, s.s || '', x, y, col, s.font || (kind === 'note' ? '800 30px "Segoe UI"' : '700 26px "Segoe UI"'));
        break;
      }
      case 'slide': {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '800 40px "Segoe UI", sans-serif';
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = z.glow;
        ctx.shadowBlur = 18;
        ctx.fillText(s.s || '', sxCenter(x), syCenter(y));
        ctx.restore();
        break;
      }
      case 'ul': {
        var a = s.from || [x, y + 14];
        var b = s.to || [x + (s.w || 220), y + 14];
        ctx.strokeStyle = col;
        ctx.lineWidth = s.width || 4;
        ctx.lineCap = 'round';
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'line':
      case 'mline':
      case 'sline': {
        var f = s.from || [x, y];
        var to = s.to || [x + 260, y];
        ctx.strokeStyle = col;
        ctx.lineWidth = s.width || 5;
        ctx.lineCap = 'round';
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(f[0], f[1]);
        ctx.lineTo(to[0], to[1]);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'arrow':
      case 'sarrow': {
        var f2 = s.from || [x, y];
        var t2 = s.to || [x + 240, y];
        ctx.strokeStyle = col;
        ctx.lineWidth = s.width || 5;
        ctx.lineCap = 'round';
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(f2[0], f2[1]);
        ctx.lineTo(t2[0], t2[1]);
        ctx.stroke();
        var ang = Math.atan2(t2[1] - f2[1], t2[0] - f2[0]);
        var ah = 14;
        ctx.beginPath();
        ctx.moveTo(t2[0], t2[1]);
        ctx.lineTo(t2[0] - ah * Math.cos(ang - 0.4), t2[1] - ah * Math.sin(ang - 0.4));
        ctx.moveTo(t2[0], t2[1]);
        ctx.lineTo(t2[0] - ah * Math.cos(ang + 0.4), t2[1] - ah * Math.sin(ang + 0.4));
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'box':
      case 'sbox': {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3;
        ctx.strokeStyle = col;
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        var bw = s.w || 300, bh = s.h || 52;
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.fillRect(x, y, bw, bh);
        ctx.fillStyle = col;
        ctx.shadowBlur = 0;
        ctx.fillRect(x, y, bw, 4);
        ctx.restore();
        break;
      }
      case 'highlight': {
        ctx.save();
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = s.color || '#fde68a';
        ctx.fillRect(x, y, s.w || 300, s.h || 32);
        ctx.restore();
        break;
      }
      case 'grid': {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.globalAlpha = alpha;
        var cols = s.cols || 2, rows = s.rows || 5, cw = s.cw || 90, ch = s.ch || 24;
        for (var gi = 0; gi < cols; gi++) {
          for (var gj = 0; gj < rows; gj++) {
            ctx.strokeRect(x + gi * cw, y + gj * ch, cw, ch);
          }
        }
        ctx.restore();
        break;
      }
      case 'dot': {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.color || '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, s.r || 5, 0, 7);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'mwipe': {
        ctx.save();
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = '#cfd8dc';
        ctx.fillRect(x, y, s.w || 140, s.h || 30);
        // влажный след, подсыхает
        ctx.globalAlpha = alpha * 0.25 * (1 - k);
        ctx.fillStyle = '#9fb4bd';
        ctx.fillRect(x, y, s.w || 140, s.h || 30);
        ctx.restore();
        break;
      }
      case 'card':
      case 'cardtitle': {
        var cx = x, cyy = y, cw2 = s.w || 170, chh = s.h || 56;
        var grow = 0.84 + 0.16 * k;
        var rot = (1 - k) * 0.16;
        ctx.save();
        ctx.translate(cx + cw2 / 2, cyy + chh / 2);
        ctx.rotate(rot);
        ctx.scale(grow, grow);
        ctx.translate(-(cx + cw2 / 2), -(cyy + chh / 2));
        ctx.globalAlpha = clamp(k * 1.8, 0, 1);
        ctx.fillStyle = s.fill || '#f6f1e2';
        ctx.fillRect(cx, cyy, cw2, chh);
        ctx.strokeStyle = s.border || '#b09a5c';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cyy, cw2, chh);
        if (s.s) {
          ctx.font = (kind === 'cardtitle' ? '800 18px "Segoe UI"' : '600 15px "Comic Sans MS", "Segoe UI", sans-serif');
          ctx.fillStyle = s.ink || '#3a3218';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(s.s, cx + 10, cyy + 12);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      }
      case 'pin': {
        ctx.fillStyle = s.color || '#c0392b';
        ctx.beginPath();
        ctx.arc(x, y - 6, 6, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#7a8a9a';
        ctx.fillRect(x - 1.5, y - 6, 3, 10);
        break;
      }
      case 'thread': {
        var f3 = s.from || [x, y];
        var t3 = s.to || [x + 200, y];
        var mx = (f3[0] + t3[0]) / 2;
        var my = (f3[1] + t3[1]) / 2 + 26;
        ctx.strokeStyle = s.color || '#a35d2a';
        ctx.lineWidth = s.width || 2;
        ctx.lineCap = 'round';
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(f3[0], f3[1]);
        ctx.quadraticCurveTo(mx, my, t3[0], t3[1]);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'cloud': {
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.font = '600 14px "Segoe UI", Arial, sans-serif';
        var tw = ctx.measureText(s.s || '').width;
        var pad = 10, cw3 = tw + pad * 2, ch3 = 30;
        ctx.fillStyle = '#fdfaf0';
        ctx.strokeStyle = s.color || '#b0a060';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + ch3 - 6);
        ctx.quadraticCurveTo(x + cw3 / 2, y + ch3 + 14, x + cw3, y + ch3 - 6);
        ctx.quadraticCurveTo(x + cw3 + 6, y + ch3 / 2, x + cw3, y);
        ctx.quadraticCurveTo(x + cw3 - 8, y - 10, x + cw3 / 2, y - 2);
        ctx.quadraticCurveTo(x + 2, y - 8, x, y + ch3 / 2);
        ctx.quadraticCurveTo(x - 4, y + ch3 - 4, x, y + ch3 - 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#3a3a3a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.s || '', x + pad, y + ch3 / 2 - 1);
        ctx.restore();
        break;
      }
    }
  }

  // слой духа полиарта (поверх всего, сверху)
  function drawSpirit(ctx, s, x, y, alpha, W) {
    if (!s.s) return;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.font = '600 16px "Segoe UI", Arial, sans-serif';
    var tw = ctx.measureText(s.s).width;
    var pad = 16, bw = Math.min(W - 40, tw + pad * 2);
    var bx = (W - bw) / 2;
    var by = y - 60;
    ctx.fillStyle = 'rgba(20,24,18,0.82)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 40, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,217,102,0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 40, 8);
    ctx.stroke();
    ctx.fillStyle = '#ffd966';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 600 16px "Segoe UI", Arial, sans-serif';
    ctx.fillText('✦ ' + s.s, W / 2, by + 20);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // полёт камеры вокруг зоны (облёт пространства)
  function camPos(cam, t, zoneBase) {
    var k = (t - cam.t0) / Math.max(0.001, cam.dur);
    var e = k * (1 + 0.5 * Math.sin(k * Math.PI)); // дуга туда и чуть-чуть вернуться
    var ang = (cam.a0 || 0) + e * (cam.span || 1.1);
    var R = cam.r || (ZW * 0.55);
    var cx = zoneBase + ZW / 2;
    var cy = (cam.cy != null ? cam.cy : 240);
    return {
      x: cx + R * Math.cos(ang),
      y: cy + R * Math.sin(ang) * 0.6 + (cam.yOff || 0)
    };
  }

  function play(canvas, session, opts) {
    var D = Object.assign({ type: 'polyart' }, session.style || {});
    var W = opts && opts.w || 960;
    var H = opts && opts.h || 540;
    var view = Object.assign({ x: 0, y: 0 }, session.view || {});

    // порядок зон сессии (повторение id создаёт несколько залов одной зоны)
    var zoneIds = (session.zones && session.zones.length) ? session.zones : ['мел'];
    var zoneList = zoneIds.map(function (id) { return zoneById(id); });

    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    var strokes = session.strokes || [];
    var total = session.duration || 0;
    strokes.forEach(function (s) { if (s.t + (s.dur || 0) > total) total = s.t + (s.dur || 0); });

    var cam = { x: view.x, y: view.y };
    var pan = null;
    var flight = null;
    var speed = 1;
    var _t = 0, _t0 = null;
    var pendingSeek = null;

    function doPanTo(x, y, sec) {
      pan = { fxx: cam.x, fyy: cam.y, tx: x, ty: y, dur: sec || 1.4, start: _t };
    }

    var ctrl = {
      running: true, _t: 0,
      pause: function () { ctrl.running = false; },
      resume: function () { ctrl.running = true; _t0 = null; },
      stop: function () { ctrl.running = false; cancelAnimationFrame(ctrl._raf); },
      seek: function (tt) { pendingSeek = clamp(tt, 0, total); _t0 = null; },
      setSpeed: function (m) { speed = m || 1; },
      panTo: function (x, y, sec) { doPanTo(x, y, sec); },
      _raf: 0
    };

    function doPanTo(x, y, sec) {
      pan = { fxx: cam.x, fyy: cam.y, tx: x, ty: y, dur: sec || 1.4, start: _t };
    }

    function camUpdate(t) {
      if (pan) {
        var k = (t - pan.start) / Math.max(0.001, pan.dur * speed);
        var e = ease(k);
        cam.x = lerp(pan.fxx, pan.tx, e);
        cam.y = lerp(pan.fyy, pan.ty, e);
        if (k >= 1) pan = null;
      }
      if (flight) {
        // приоритет полёта камеры над панорамой (летающая камера)
        var pos = camPos(flight, t, flight.zoneBase);
        cam.x = pos.x;
        cam.y = pos.y;
        if (t >= flight.t + flight.dur) flight = null;
      }
    }
    function sx(x) { return x - cam.x; }
    function sy(y) { return y - cam.y; }
    function sxCenter(xx) { return (xx + W / 2) - cam.x; }
    function syCenter(yy) { return (yy + H / 2) - cam.y; }

    function zoneIndexOfStroke(s) {
      // зона, в которой живёт мазок (по id зоны или по индексу зала сессии)
      var id = s.zone;
      if (id === undefined || id === null) return 0;
      if (typeof id === 'number') return clamp(id, 0, zoneList.length - 1);
      for (var i = 0; i < zoneIds.length; i++) if (zoneIds[i] === id) return i;
      return zoneIds.indexOf(id);
    }

    function drawFrame(now) {
      if (!ctrl.running) return;
      if (pendingSeek !== null) {
        _t0 = now - (pendingSeek / Math.max(0.1, speed)) * 1000;
        _t = pendingSeek;
        ctrl._t = pendingSeek;
        pendingSeek = null;
      }
      if (!_t0) _t0 = now;
      var t = clamp((now - _t0) / 1000 * speed, 0, total);
      _t = t;
      ctrl._t = t;
      camUpdate(t);

      drawBoard(ctx, D, W, H, zoneList);

      // статические элементы зон: справочники на стенах (зал как инструмент)
      strokes.forEach(function (s) {
        if (s.ref && s.t <= t) {
          var zi = zoneIndexOfStroke(s);
          if (zi >= 0 && zi < zoneList.length) {
            var r = zoneList[zi];
            drawReference(ctx, zi * ZW + 300, 34, 260, 40, 'справочник · ' + (s.ref || ''), r);
          }
        }
      });

      // духовные строки (верхний слой), за краем экрана не рисуем
      strokes.forEach(function (s) {
        if (s.kind !== 'spirit' || s.t > t) return;
        var local = t - s.t;
        var k = clamp(local / Math.max(0.001, s.dur || 2), 0, 1);
        if (k <= 0) return;
        // появляется и уходит мягко
        var a = Math.min(1, k * 4, ((s.dur || 2) - local) / 0.5 + 0.5);
        drawSpirit(ctx, s, 0, 20, a, W);
      });

      strokes.forEach(function (s) {
        if (s.t > t) return;
        var local = t - s.t;
        var k = clamp(local / Math.max(0.001, s.dur || 3), 0, 1);
        if (k <= 0) return;

        switch (s.kind) {
          case 'move': {
            if (s.t <= t && (!pan || pan.start < s.t)) {
              doPanTo(s.to[0], s.to[1], s.sec || 1.4);
            }
            break;
          }
          case 'cam': {
            // стартуем полёт камеры один раз
            if (!flight || (flight.s !== s)) {
              flight = {
                s: s, t: s.t, dur: s.dur || 3,
                zoneBase: zoneIndexOfStroke(s) * ZW,
                a0: s.a0 != null ? s.a0 : 0.2,
                span: s.span != null ? s.span : 1.1,
                r: s.r, cy: s.cy, yOff: s.yOff
              };
            }
            break;
          }
          case 'zone': {
            // метка зоны для ориентации (низ экрана)
            var zi = zoneIndexOfStroke(s);
            if (zi >= 0 && zi < zoneList.length) {
              var label = s.s || zoneList[zi].label;
              ctx.fillStyle = 'rgba(20,24,18,0.7)';
              ctx.font = '600 13px "Segoe UI"';
              var tw = ctx.measureText(label).width;
              var bx2 = zi * ZW + ZW / 2 - tw / 2 - 10;
              ctx.fillRect(bx2 - cx0(), sy(H - 40), tw + 20, 24);
              ctx.fillStyle = '#e8e2c8';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, bx2 - cx0() + 10, sy(H - 40) + 12);
            }
            break;
          }
          default: {
            var zi2 = zoneIndexOfStroke(s);
            var zb = zi2 * ZW;
            drawStroke(ctx, s, sx(zb + (s.x != null ? s.x : 60)), sy(s.y != null ? s.y : 120),
              zoneList[zi2], k, t, local, W, H);
          }
        }
      });

      ctrl._raf = requestAnimationFrame(drawFrame);
    }

    function cx0() { return cam.x; }

    ctrl._raf = requestAnimationFrame(drawFrame);
    return ctrl;
  }

  Polyart.play = play;
})(typeof window !== 'undefined' ? window : this);