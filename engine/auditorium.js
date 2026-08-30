/*=============================================================
 * auditorium.js — ДВИЖОК-ПОМЕЩЕНИЕ «ВИРТУАЛЬНЫЕ КАФЕДРЫ» (3D)
 * Проект polimuli-chalkboard.
 *
 * Движок-помещение: виртуальные залы 30x30 м (высота 6 м), нарисованные
 * в перспективе на чистом canvas 2D (без зависимостей). Тип зала задаётся
 * комнатой занятия (session.room.kind):
 *   auditorium — кафедра-аудитория с доской: доска, кафедра, ряды парт,
 *                лектор, окна. Мазки — мел на доске.
 *   cinema     — кинозал: большой экран, ряды кресел, затемнение.
 *                Мазки — свет на экране.
 *   stand      — стенд-экспозиция: витрины-панели, подиумы-экспонаты.
 *                Мазки — на панели (канва).
 *
 * Камера умеет летать по залу: обзор с места, подход к поверхности,
 * облёт. Слой духа (spirit) — строка просвещения поверх зала.
 *
 * Слои занятия:
 *   1) зал (статичная 3D-комната: пол, потолок, окна, мебель),
 *   2) мазки на поверхности (kind'ы досок: note/text/line/box/...),
 *   3) изложение — камеры ("cam") по залу.
 *
 * kind'ы движка:
 *   note, text, ul, box, arrow, dot, grid  — мазки на поверхности
 *   highlight, mtext, mline                — маркерные пометки
 *   chalk                                  — линия у поверхности
 *   spirit                                 — строка просвещения поверх зала
 *   cam                                    — точка обзора камеры по залу
 *
 * Данные strokes; room.kind выбирает зал, style.type всегда "auditorium".
 * api: const ctrl = Auditorium.play(canvas, session, {w,h});
 *      ctrl.pause(); ctrl.resume(); ctrl.stop(); ctrl.seek(t); ctrl.panTo(x,z,sec);
 * ВНУТРЕННИЕ РАЗМЕРЫ: зал 30 x 30 м (x — вдоль, z — поперёк), высота 6 м.
 * ============================================================*/

(function (root) {
  'use strict';
  var Auditorium = (root.Auditorium = {});

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }

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

  // ---------- ПАЛИТРА БАЗЫ ----------
  var D = {
    rail: '#7a5230',
    frame: '#5a3a20',
    desk: '#6e4a26',
    deskLight: '#8a6234',
    dark: '#3a3228'
  };

  // ---------- КОМНАТЫ ----------
  // Мир: x = вдоль зала (0 у поверхности → 30 у входа), z = поперёк (0..30),
  // y = высота (пол 0, потолок 6).
  var ROOMS = {
    // Кафедра-аудитория с доской.
    auditorium: {
      name: 'КАФЕДРА-АУДИТОРИЯ',
      roomKind: 'auditorium',
      wall: '#c9bda4', wallHi: '#d8cdb4', wallLo: '#b4a88f',
      floor: '#8a6f4a', floorDark: '#6e5638', window: '#aee0ff', ceil: '#d7d2c4',
      surface: { bxc: 15, bzc: 1.2, bw: 11, bly: 0.9, bty: 4.3,
        frame: D.frame, bg: '#2b6a24', chalk: '#f4f4f0' },
      podium: { x: 15, z: 2.6, w: 3.6, d: 1.2, h: 1.1 },
      furniture: 'desks',
      lecturer: true,
      view: { cx: 22, cz: 15, tx: 15, tz: 1.4 },
      views: {
        'кафедра': { cx: 7.5, cz: 15, tx: 15, tz: 2 },
        'доска':   { cx: 22, cz: 15, tx: 15, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 20, tz: 20 }
      }
    },
    // Кинозал: экран, ряды кресел.
    cinema: {
      name: 'КИНОЗАЛ',
      roomKind: 'cinema',
      wall: '#23252b', wallHi: '#2c2f37', wallLo: '#1a1c21',
      floor: '#2a2a2a', floorDark: '#1c1c1c', window: '#0f1114', ceil: '#1f2228',
      surface: { bxc: 15, bzc: 0.8, bw: 20, bly: 0.9, bty: 5.1,
        frame: '#3a3f49', bg: '#eef1f4', chalk: '#1c2520' },
      furniture: 'seats',
      lecturer: false,
      view: { cx: 24, cz: 15, tx: 15, tz: 0.8 },
      views: {
        'зритель': { cx: 24, cz: 15, tx: 15, tz: 0.8 },
        'экран':   { cx: 8, cz: 15, tx: 15, tz: 0.8 },
        'облёт':   { cx: 3, cz: 3, tx: 22, tz: 22 }
      }
    },
    // Стенд-экспозиция: панель, подиумы.
    stand: {
      name: 'СТЕНД-ЭКСПОЗИЦИЯ',
      roomKind: 'stand',
      wall: '#e8e2d4', wallHi: '#f2ecdd', wallLo: '#d6cfbd',
      floor: '#b8a98c', floorDark: '#9c8d72', window: '#dbe8ff', ceil: '#efe9d8',
      surface: { bxc: 15, bzc: 1.0, bw: 14, bly: 0.8, bty: 4.6,
        frame: '#a8986b', bg: '#fdfbf2', chalk: '#3a3228' },
      furniture: 'stands',
      lecturer: false,
      view: { cx: 24, cz: 15, tx: 15, tz: 1.0 },
      views: {
        'витрина': { cx: 24, cz: 15, tx: 15, tz: 1.0 },
        'панель':  { cx: 10, cz: 15, tx: 15, tz: 1.0 },
        'облёт':   { cx: 4, cz: 4, tx: 20, tz: 20 }
      }
    }
  };

  // Ряды парт (auditorium): x от 4.5 до 27, шаг 2.5; 4 места в поперечнике.
  function desks() {
    var out = [];
    for (var r = 0; r < 9; r++) {
      var x = 4.5 + r * 2.5;
      for (var c = 0; c < 4; c++) {
        var z = 7.5 + c * 5;
        out.push({ x: x, z: z, w: 3.4, d: 1.0, h: 0.42, s: (c + r) % 2 });
      }
    }
    return out;
  }
  var DESKS = desks();

  // Ряды кресел (cinema): 10 рядов × 6 мест, амфитеатр слегка поднят.
  function seats() {
    var out = [];
    for (var r = 0; r < 10; r++) {
      var x = 6 + r * 2.2;
      for (var c = 0; c < 6; c++) {
        var z = 4.5 + c * 4.2;
        out.push({ x: x, z: z, w: 2.6, d: 0.9, h: 0.9 + r * 0.05, s: (c + r) % 2 });
      }
    }
    return out;
  }
  var SEATS = seats();

  // Подиумы-экспонаты (stand): расставлены по полу.
  function stands() {
    var out = [];
    for (var r = 0; r < 5; r++) {
      var x = 5 + r * 4.5;
      for (var c = 0; c < 2; c++) {
        var z = 9 + c * 12;
        out.push({ x: x, z: z, w: 2.4, d: 2.4, h: 1.0, s: (c + r) % 2 });
      }
    }
    return out;
  }
  var STANDS = stands();

  // ---------- ПРОЕКЦИЯ ----------
  function makeCam(cx, cz, tx, tz) {
    var dx = tx - cx, dz = tz - cz;
    var ang = Math.atan2(dx, dz);
    var yaw = Math.cos(ang), ryaw = Math.sin(ang);
    return {
      cx: cx, cz: cz, ang: ang,
      forward: { x: ryaw, z: yaw },
      right: { x: yaw, z: -ryaw }
    };
  }

  var FOCAL = 480;

  function project(cam, mx, my, mz, W, H) {
    var rx = mx - cam.cx, rz = mz - cam.cz;
    var d = rx * cam.forward.x + rz * cam.forward.z;
    var s = rx * cam.right.x + rz * cam.right.z;
    if (d < 0.4) return null;
    var px = W / 2 + (s * FOCAL) / d;
    var py = H / 2 - ((my - 1.6) * FOCAL) / d;
    return [px, py, d];
  }

  function drawPoly(ctx, pts, fill, stroke) {
    if (!pts || !pts.length) return;
    var good = [];
    for (var i = 0; i < pts.length; i++) if (pts[i]) good.push(pts[i]);
    if (good.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(good[0][0], good[0][1]);
    for (var j = 1; j < good.length; j++) ctx.lineTo(good[j][0], good[j][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  // ---------- РИСОВАНИЕ КОМНАТЫ ----------
  function drawRoom(ctx, cam, W, H, R, isCinema) {
    var c = cam;
    // Задняя стена (z = 30, от x=0..30, y=0..6)
    var p0 = project(c, 0, 0, 30, W, H);
    var p1 = project(c, 30, 0, 30, W, H);
    var p2 = project(c, 0, 6, 30, W, H);
    var p3 = project(c, 30, 6, 30, W, H);
    if (p0 && p1) {
      drawPoly(ctx, [p0, p1, p3, p2], R.wall, null);
      ctx.strokeStyle = rgba(R.wallHi, 1); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      ctx.strokeStyle = rgba(R.wallLo, 1); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p3[0], p3[1]); ctx.stroke();
    }

    // Пол: сетка квадратов 3x3 м
    for (var gx = 0; gx <= 10; gx++) {
      var a = project(c, gx * 3, 0, 0, W, H);
      var b = project(c, gx * 3, 0, 30, W, H);
      if (a && b) {
        ctx.strokeStyle = rgba(R.floorDark, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }
    for (var gz = 0; gz <= 10; gz++) {
      var c1 = project(c, 0, 0, gz * 3, W, H);
      var c2 = project(c, 30, 0, gz * 3, W, H);
      if (c1 && c2) {
        ctx.strokeStyle = rgba(R.floorDark, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.stroke();
      }
    }
    ctx.fillStyle = R.floor;
    ctx.fillRect(0, H - 2, W, 2);

    // Затемнение края для кино (тёмный зал)
    if (isCinema) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
    }

    // Окна на стенах x=0 и x=30 (по 3 с каждой стороны)
    for (var w = 0; w < 3; w++) {
      var lb = project(c, 0.1, 2.6, 6 + w * 9, W, H);
      var lt = project(c, 0.1, 4.0, 6 + w * 9, W, H);
      var rb = project(c, 29.9, 2.6, 6 + w * 9, W, H);
      var rt = project(c, 29.9, 4.0, 6 + w * 9, W, H);
      if (lb && rb) {
        drawPoly(ctx, [lb, rb, rt, lt], rgba(R.window, 0.8), null);
      }
    }
  }

  // ---------- ПОВЕРХНОСТЬ (доска/экран/панель) ----------
  function drawSurface(ctx, cam, W, H, R) {
    var s = R.surface;
    var ax0 = s.bxc - s.bw / 2 - 0.3, ax1 = s.bxc + s.bw / 2 + 0.3;
    var ay0 = s.bly - 0.3, ay1 = s.bty + 0.3;
    var f0 = project(cam, ax0, ay0, s.bzc, W, H);
    var f1 = project(cam, ax1, ay0, s.bzc, W, H);
    var f2 = project(cam, ax1, ay1, s.bzc, W, H);
    var f3 = project(cam, ax0, ay1, s.bzc, W, H);
    if (!f0 || !f1) return null;
    drawPoly(ctx, [f0, f1, f2, f3], s.frame, null);

    var b0 = project(cam, s.bxc - s.bw / 2, s.bly, s.bzc, W, H);
    var b1 = project(cam, s.bxc + s.bw / 2, s.bly, s.bzc, W, H);
    var b2 = project(cam, s.bxc + s.bw / 2, s.bty, s.bzc, W, H);
    var b3 = project(cam, s.bxc - s.bw / 2, s.bty, s.bzc, W, H);
    if (!b0) return null;
    drawPoly(ctx, [b0, b1, b2, b3], s.bg, null);
    // зерно поверхности
    var noise = makeNoise(7);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (var i = 0; i < 260; i++) {
      var bx = (b1[0] - b0[0]) * noise() + b0[0];
      var by = (b3[1] - b0[1]) * noise() + b0[1];
      ctx.fillRect(bx, by, 1 + noise() * 3, 1 + noise() * 2);
    }
    return { b0: b0, b1: b1, b2: b2, b3: b3 };
  }

  // ---------- МЕБЕЛЬ ----------
  function drawDesks(ctx, cam, W, H) {
    var noise = makeNoise(21);
    for (var i = 0; i < DESKS.length; i++) {
      var dk = DESKS[i];
      var p0 = project(cam, dk.x - dk.w / 2, dk.h, dk.z - dk.d / 2, W, H);
      var p1 = project(cam, dk.x + dk.w / 2, dk.h, dk.z - dk.d / 2, W, H);
      var p2 = project(cam, dk.x + dk.w / 2, dk.h, dk.z + dk.d / 2, W, H);
      var p3 = project(cam, dk.x - dk.w / 2, dk.h, dk.z + dk.d / 2, W, H);
      if (!p0 || !p1) continue;
      drawPoly(ctx, [p0, p1, p2, p3], dk.s ? D.deskLight : D.desk, null);
      var e0 = project(cam, dk.x - dk.w / 2, 0, dk.z - dk.d / 2, W, H);
      var e1 = project(cam, dk.x + dk.w / 2, 0, dk.z - dk.d / 2, W, H);
      var f1 = project(cam, dk.x + dk.w / 2, 0, dk.z + dk.d / 2, W, H);
      var f0 = project(cam, dk.x - dk.w / 2, 0, dk.z + dk.d / 2, W, H);
      if (e0 && e1) drawPoly(ctx, [e0, e1, f1, f0], 'rgba(70,50,30,0.4)', null);
      var c0 = project(cam, dk.x + 0.4, 0.5, dk.z + 0.2, W, H);
      var c1 = project(cam, dk.x + dk.w / 2 - 0.4, 0.5, dk.z + 0.2, W, H);
      var c2 = project(cam, dk.x + dk.w / 2 - 0.4, 0.62, dk.z - 0.35, W, H);
      var c3 = project(cam, dk.x + 0.4, 0.62, dk.z - 0.35, W, H);
      if (c0 && c1) drawPoly(ctx, [c0, c1, c2, c3], D.desk, null);
    }
  }

  function drawSeats(ctx, cam, W, H) {
    for (var i = 0; i < SEATS.length; i++) {
      var s = SEATS[i];
      var p0 = project(cam, s.x - s.w / 2, s.h, s.z - s.d / 2 - 0.4, W, H);
      var p1 = project(cam, s.x + s.w / 2, s.h, s.z - s.d / 2 - 0.4, W, H);
      var p2 = project(cam, s.x + s.w / 2, s.h, s.z + s.d / 2 - 0.4, W, H);
      var p3 = project(cam, s.x - s.w / 2, s.h, s.z + s.d / 2 - 0.4, W, H);
      if (!p0 || !p1) continue;
      drawPoly(ctx, [p0, p1, p2, p3], s.s ? '#8e1f1f' : '#701818', null);
      var q0 = project(cam, s.x - s.w / 2, 0.45, s.z + s.d / 2 - 0.4, W, H);
      var q1 = project(cam, s.x + s.w / 2, 0.45, s.z + s.d / 2 - 0.4, W, H);
      var q2 = project(cam, s.x + s.w / 2, 0.62, s.z + s.d / 2 + 0.25, W, H);
      var q3 = project(cam, s.x - s.w / 2, 0.62, s.z + s.d / 2 + 0.25, W, H);
      if (q0 && q1) drawPoly(ctx, [q0, q1, q2, q3], '#5a1212', null);
    }
  }

  function drawStands(ctx, cam, W, H) {
    var noise = makeNoise(13);
    for (var i = 0; i < STANDS.length; i++) {
      var s = STANDS[i];
      var p0 = project(cam, s.x - s.w / 2, s.h, s.z - s.d / 2, W, H);
      var p1 = project(cam, s.x + s.w / 2, s.h, s.z - s.d / 2, W, H);
      var p2 = project(cam, s.x + s.w / 2, s.h, s.z + s.d / 2, W, H);
      var p3 = project(cam, s.x - s.w / 2, s.h, s.z + s.d / 2, W, H);
      if (!p0 || !p1) continue;
      drawPoly(ctx, [p0, p1, p2, p3], s.s ? '#d6cfbd' : '#c8c0a8', null);
      // тень-основание
      var e0 = project(cam, s.x - s.w / 2, 0, s.z - s.d / 2, W, H);
      var e1 = project(cam, s.x + s.w / 2, 0, s.z - s.d / 2, W, H);
      var f1 = project(cam, s.x + s.w / 2, 0, s.z + s.d / 2, W, H);
      var f0 = project(cam, s.x - s.w / 2, 0, s.z + s.d / 2, W, H);
      if (e0 && e1) drawPoly(ctx, [e0, e1, f1, f0], 'rgba(120,100,70,0.4)', null);
      // экспонат сверху: маленький параллелепипед
      var eX = project(cam, s.x - 0.4, s.h + 0.35, s.z, W, H);
      var eY = project(cam, s.x + 0.4, s.h + 0.35, s.z, W, H);
      var eZ1 = project(cam, s.x, s.h + 0.7, s.z - 0.3, W, H);
      var eZ2 = project(cam, s.x, s.h + 0.7, s.z + 0.3, W, H);
      ctx.fillStyle = '#a03424';
      if (eX && eY && eZ1) {
        drawPoly(ctx, [[eX[0], eX[1]], [eY[0], eY[1]], [eZ1[0], eZ1[1]]], '#a03424', null);
        drawPoly(ctx, [[eX[0], eX[1]], [eY[0], eY[1]], [eZ2[0], eZ2[1]]], '#8a2c1e', null);
        drawPoly(ctx, [[eX[0], eX[1]], [eZ1[0], eZ1[1]], [eZ2[0], eZ2[1]]], '#b8442c', null);
      }
    }
  }

  function drawFurniture(ctx, cam, W, H, R) {
    if (R.furniture === 'desks') drawDesks(ctx, cam, W, H);
    else if (R.furniture === 'seats') drawSeats(ctx, cam, W, H);
    else if (R.furniture === 'stands') drawStands(ctx, cam, W, H);
  }

  // ---------- ЛЕКТОР ----------
  function drawLecturer(ctx, cam, W, H, t, R) {
    if (!R.lecturer) return;
    var x = R.podium.x, z = R.podium.z + R.podium.d / 2 - 0.4;
    var head = project(cam, x, 1.65, z, W, H);
    if (!head) return;
    ctx.fillStyle = D.dark;
    ctx.beginPath(); ctx.arc(head[0], head[1], head[2] * 0.05, 0, 7); ctx.fill();
    var shL = project(cam, x - 0.25, 1.35, z, W, H);
    var shR = project(cam, x + 0.25, 1.35, z, W, H);
    var fL = project(cam, x - 0.15, 0, z + 0.2, W, H);
    var fR = project(cam, x + 0.15, 0, z + 0.2, W, H);
    if (shL && fL) drawPoly(ctx, [shL, shR, fR, fL], D.dark, null);
    var hA = Math.sin(t * 3) * 0.4;
    var hL = project(cam, x + 0.5 + hA, 1.35, z + 0.3, W, H);
    var hR = project(cam, x + 0.9 + hA, 1.5, z + 0.4, W, H);
    if (hL && hR) {
      ctx.strokeStyle = D.dark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hL[0], hL[1]); ctx.lineTo(hR[0], hR[1]); ctx.stroke();
    }
  }

  // ---------- ПОВЕРХНОСТЬ: КООРДИНАТЫ МАЗКОВ ----------
  // Мазки в плоскостных координатах: x 0..bw по ширине, y 0..(bty-bly).
  function facePx(cam, R, x, yp, W, H) {
    var s = R.surface;
    var mx = s.bxc - s.bw / 2 + x;
    var my = s.bty - 1 - yp;
    return project(cam, mx, my, s.bzc, W, H);
  }

  // ---------- РИСОВАНИЕ МАЗКОВ ----------
  function drawStrokes(ctx, ss, cam, W, H, t, R) {
    var strokes = ss.strokes || [];
    var noise = makeNoise(30);
    var surf = R.surface;

    for (var i = 0; i < strokes.length; i++) {
      var s = strokes[i];
      var k = clamp((t - s.t) / (s.dur || 0.6), 0, 1);
      if (k <= 0) continue;
      var alpha = clamp(k, 0, 1) * (s.alpha !== undefined ? s.alpha : 1);
      var color = s.color || surf.chalk;

      if (s.kind === 'spirit') {
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 0.85);
        ctx.font = '600 17px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = R.roomKind === 'stand' ? '#8a2c1e' : (R.roomKind === 'cinema' ? '#ffd966' : '#ffd966');
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        ctx.strokeText(s.text || '', W / 2, H * (s.yP || 0.12));
        ctx.fillText(s.text || '', W / 2, H * (s.yP || 0.12));
        ctx.restore();
        continue;
      }

      if (s.kind === 'cam' || s.kind === 'label') continue;

      var origin = facePx(cam, R, s.x || 0, s.y || 0, W, H);
      if (!origin) continue;
      var sx = origin[0], sy = origin[1];
      var scale = 0.012;

      switch (s.kind) {
        case 'note': case 'text': case 'ul': {
          ctx.save();
          ctx.globalAlpha = alpha;
          var fs = (s.size || (s.kind === 'ul' ? 15 : (s.kind === 'note' ? 17 : 15))) * scale * 40;
          ctx.font = (s.bold ? '700 ' : (s.kind === 'note' ? '600 ' : '')) +
            Math.max(8, fs) + 'px "Segoe UI", Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillStyle = color;
          var tt = (s.kind === 'ul' ? '• ' : '') + (s.text || '');
          ctx.fillText(tt, sx, sy);
          ctx.restore();
          break;
        }
        case 'line': case 'mline': case 'chalk': {
          var b0 = facePx(cam, R, s.x, s.y, W, H);
          var b1 = facePx(cam, R, (s.to && s.to[0]) || (s.x + 6), (s.to && s.to[1]) || s.y, W, H);
          if (!b0 || !b1) continue;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = (s.width || 4) * 0.012;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(b0[0], b0[1]);
          var segs = 8;
          for (var si = 1; si <= segs; si++) {
            ctx.lineTo(lerp(b0[0], b1[0], si / segs) + (noise() - 0.5) * 1.2,
                       lerp(b0[1], b1[1], si / segs) + (noise() - 0.5) * 1.2);
          }
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'box': case 'highlight': {
          var p0 = facePx(cam, R, s.x, s.y, W, H);
          var p2 = facePx(cam, R, s.x + (s.w || 8), s.y + (s.h || 4), W, H);
          if (!p0 || !p2) continue;
          ctx.save();
          ctx.globalAlpha = alpha * (s.kind === 'highlight' ? 0.5 : 1);
          if (s.kind === 'highlight') {
            ctx.fillStyle = color || '#ffd966';
            ctx.fillRect(p0[0], p0[1], p2[0] - p0[0], p2[1] - p0[1]);
          } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(p0[0], p0[1], p2[0] - p0[0], p2[1] - p0[1]);
          }
          ctx.restore();
          break;
        }
        case 'arrow': {
          var a0 = facePx(cam, R, s.x, s.y, W, H);
          var a1 = facePx(cam, R, (s.to && s.to[0]) || (s.x + 6), (s.to && s.to[1]) || s.y, W, H);
          if (!a0 || !a1) continue;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
          ctx.restore();
          break;
        }
        case 'dot': {
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(sx, sy, (s.r || 2) * scale * 40, 0, 7); ctx.fill();
          ctx.restore();
          break;
        }
      }
    }
  }

  // ---------- ПРОХОД ----------
  function play(canvas, session, opts) {
    opts = opts || {};
    var W = opts.w || 960, H = opts.h || 540;
    var ctx = canvas.getContext('2d');
    var ss = session;
    var m = ss.session || {};
    var total = m.duration || 90;
    var strokes = ss.strokes || [];
    var roomKey = (ss.room && ss.room.kind) || 'auditorium';
    var R = ROOMS[roomKey] || ROOMS.auditorium;
    var isCinema = roomKey === 'cinema';

    var ctrl = {
      _t: 0, _speed: 1, _running: true,
      _cam: Object.assign({}, R.view),
      _camStart: null, _camTo: null, _camT0: -1, _camSec: 1,
      _raf: 0, _done: false,
      _onEnd: null
    };

    var sessTitle = m.title || '';

    function setCam(t) {
      for (var i = 0; i < strokes.length; i++) {
        var s = strokes[i];
        if (s.kind === 'cam') {
          var k = clamp((t - s.t) / (s.dur || 1), 0, 1);
          if (k < 1 && k > 0) {
            var aim = R.views[s.to] || R.view;
            ctrl._camStart = Object.assign({}, ctrl._cam);
            ctrl._camTo = { cx: aim.cx + (s.x || 0), cz: aim.cz + (s.z || 0), tx: aim.tx, tz: aim.tz };
            ctrl._camT0 = s.t; ctrl._camSec = s.dur || 1;
          }
        }
      }
      if (ctrl._camTo && ctrl._camT0 >= 0 && t < ctrl._camT0 + ctrl._camSec) {
        var k2 = ease(clamp((t - ctrl._camT0) / ctrl._camSec, 0, 1));
        ctrl._cam.cx = lerp(ctrl._camStart.cx, ctrl._camTo.cx, k2);
        ctrl._cam.cz = lerp(ctrl._camStart.cz, ctrl._camTo.cz, k2);
        ctrl._cam.tx = lerp(ctrl._camStart.tx, ctrl._camTo.tx, k2);
        ctrl._cam.tz = lerp(ctrl._camStart.tz, ctrl._camTo.tz, k2);
      }
      if (ctrl._camTo && t >= ctrl._camT0 + ctrl._camSec) {
        ctrl._cam.cx = ctrl._camTo.cx; ctrl._cam.cz = ctrl._camTo.cz;
        ctrl._cam.tx = ctrl._camTo.tx; ctrl._cam.tz = ctrl._camTo.tz;
        ctrl._camTo = null;
      }
    }

    function drawFrame() {
      if (!ctrl._running || ctrl._done) {
        ctrl._raf = requestAnimationFrame(drawFrame);
        return;
      }
      var t = ctrl._t;
      var cam = makeCam(ctrl._cam.cx, ctrl._cam.cz, ctrl._cam.tx, ctrl._cam.tz);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#17181a';
      ctx.fillRect(0, 0, W, H);
      drawRoom(ctx, cam, W, H, R, isCinema);
      drawSurface(ctx, cam, W, H, R);
      drawFurniture(ctx, cam, W, H, R);
      drawLecturer(ctx, cam, W, H, t, R);
      drawStrokes(ctx, ss, cam, W, H, t, R);
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.font = '14px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#eef1f4';
      ctx.fillText(R.name + ' · ' + sessTitle + ' · ' + Math.round(t) + 'с', 14, 24);
      ctx.restore();
      ctrl._raf = requestAnimationFrame(drawFrame);
    }

    ctrl.play = function () { ctrl._running = true; };
    ctrl.pause = function () { ctrl._running = false; };
    ctrl.resume = function () { ctrl._running = true; };
    ctrl.stop = function () { ctrl._running = false; ctrl._done = true; };
    ctrl.seek = function (tt) {
      ctrl._t = clamp(tt, 0, total);
      ctrl._camTo = null;
    };
    ctrl.setSpeed = function (m) { ctrl._speed = clamp(m, 0.1, 64); };
    ctrl.panTo = function (tx, tz, sec) {
      ctrl._camStart = Object.assign({}, ctrl._cam);
      ctrl._camTo = { cx: tx, cz: tz, tx: R.view.tx, tz: R.view.tz };
      ctrl._camT0 = ctrl._t; ctrl._camSec = sec || 1;
    };

    setInterval(function () {
      if (ctrl._running && !ctrl._done) {
        ctrl._t += ctrl._speed * 1 / 30;
        if (ctrl._t >= total) { ctrl._t = total; ctrl._running = false; if (ctrl.onEnd) ctrl.onEnd(); }
        setCam(ctrl._t);
      }
    }, 33);

    setCam(0);
    ctrl._raf = requestAnimationFrame(drawFrame);
    return ctrl;
  }

  Auditorium.play = play;
})(typeof window !== 'undefined' ? window : this);