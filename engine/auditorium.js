/*=============================================================
 * auditorium.js — ДВИЖОК-ПОМЕЩЕНИЕ «ВИРТУАЛЬНЫЕ КАФЕДРЫ» (3D)
 * Проект polimuli-chalkboard.
 *
 * Движок-помещение: залы университета, нарисованные в перспективе
 * на чистом canvas 2D (без зависимостей). ВУЗ — инфраструктура:
 * каждая кафедра владеет своей МОДЕЛЬЮ аудитории (метраж, доска,
 * кафедра-подиум, колер, мебель). Конспект сессии привязан к
 * аудитории через ss.room.model:
 *
 *   aud_math  — КАФЕДРА МАТЕМАТИКИ · 30×30 м · меловая доска, парты
 *   lab_phys  — КАФЕДРА ФИЗИКИ   · 30×40 м · меловая доска, опытный стол
 *   lab_chem  — КАФЕДРА ХИМИИ    · 30×40 м · маркерная доска, столы-колбы
 *   cinema    — КИНОЗАЛ · 30×30 м · экран, ряды кресел, затемнение
 *   stand     — СТЕНД-ЭКСПОЗИЦИЯ · 30×30 м · панель, подиумы
 *
 * «Зал по химии — и конспект по химии»: движок выбирает зал по
 * room.model, а текст (мазки/сцены) сессии — это и есть конспект
 * предмета этой кафедры. Логично и системно.
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
 * Данные strokes; ss.room.model выбирает зал, style.type = "auditorium".
 * api: const ctrl = Auditorium.play(canvas, session, {w,h});
 *      ctrl.pause(); ctrl.resume(); ctrl.stop(); ctrl.seek(t); ctrl.panTo(x,z,sec);
 * ВНУТРЕННИЕ РАЗМЕРЫ: у каждой модели свой metr {w, d, h} (метраж зала);
 * ось x — вдоль доски, z — глубина от доски к входу, y — высота.
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

  // ---------- МЕБЕЛЬ: генераторы под метраж модели ----------
  // Парты (aud_math): ряды в глубину, по 4 колонны в поперечнике.
  function desks(metr) {
    var out = [];
    var rows = Math.max(4, Math.floor((metr.d - 6) / 2.5));
    var cols = Math.max(2, Math.floor((metr.w - 6) / 5));
    for (var r = 0; r < rows; r++) {
      var x = metr.w / 2 + (r - (rows - 1) / 2) * 2.5;
      for (var c = 0; c < cols; c++) {
        var z = 7 + c * 5;
        out.push({ x: x, z: z, w: 3.4, d: 1.0, h: 0.42, s: (c + r) % 2 });
      }
    }
    return out;
  }

  // Лабораторные столы (lab_phys / lab_chem): по 2 колонны в глубину.
  function tables(metr) {
    var out = [];
    var rows = Math.max(3, Math.floor((metr.d - 10) / 3.2));
    for (var r = 0; r < rows; r++) {
      var x = metr.w / 2 + (r - (rows - 1) / 2) * 3.2;
      for (var c = 0; c < 2; c++) {
        var z = 12 + c * 7;
        out.push({ x: x, z: z, w: 2.2, d: 1.4, h: 0.9, s: (c + r) % 2 });
      }
    }
    return out;
  }

  // Ряды кресел (cinema): амфитеатр слегка поднят.
  function seats(metr) {
    var out = [];
    var rows = Math.max(4, Math.floor((metr.d - 6) / 2.2));
    var cols = Math.max(4, Math.floor((metr.w - 5) / 3.6));
    for (var r = 0; r < rows; r++) {
      var x = metr.w / 2 + (r - (rows - 1) / 2) * 2.2;
      for (var c = 0; c < cols; c++) {
        var z = 4.5 + c * 3.6;
        out.push({ x: x, z: z, w: 2.2, d: 0.9, h: 0.9 + r * 0.05, s: (c + r) % 2 });
      }
    }
    return out;
  }

  // Подиумы-экспонаты (stand).
  function stands(metr) {
    var out = [];
    for (var r = 0; r < 5; r++) {
      var x = metr.w / 2 + (r - 2) * 4.5;
      for (var c = 0; c < 2; c++) {
        var z = 9 + c * 12;
        if (x >= 4 && x <= metr.w - 4) out.push({ x: x, z: z, w: 2.4, d: 2.4, h: 1.0, s: (c + r) % 2 });
      }
    }
    return out;
  }

  // Верстаки мастерской (wood): толстая столешница-фанера, тиски, заготовки.
  function benches(metr) {
    var out = [];
    var rows = Math.max(3, Math.floor((metr.d - 10) / 3.4));
    for (var r = 0; r < rows; r++) {
      var x = metr.w / 2 + (r - (rows - 1) / 2) * 3.4;
      for (var c = 0; c < 2; c++) {
        var z = 11 + c * 8;
        out.push({ x: x, z: z, w: 2.6, d: 1.3, h: 0.95, s: (c + r) % 2 });
      }
    }
    return out;
  }

  // Универсальное наполнение: сетка прямоугольных столов/стендов/ячеек.
  // kind — тип мебели для отрисовки (стол/стенд/стойка), extra конфигурирует детали.
  function furnGrid(metr, cfg) {
    var out = [];
    var gap = cfg.gap || 2.6;
    var rows = Math.max(2, Math.floor(metr.d / gap));
    var cols = Math.max(1, Math.floor((metr.w - 6) / 4));
    for (var r = 0; r < Math.min(rows, cfg.maxRows || 6); r++) {
      var x = cfg.x0 || metr.w / 2;
      for (var c = 0; c < Math.min(cols, cfg.maxCols || 4); c++) {
        var z = (cfg.z0 || 8) + r * gap + (c % 2) * 0.6;
        out.push({
          x: x, z: z,
          w: cfg.w, d: cfg.d, h: cfg.h,
          kind: cfg.kind, s: (c + r) % 2, extra: cfg.extra
        });
      }
    }
    return out;
  }
  // Длинные ряды станочного/цехового типа вдоль x.
  function furnRows(metr, cfg) {
    var out = [];
    var rows = Math.max(2, Math.floor((metr.d - 10) / (cfg.rowGap || 6)));
    for (var r = 0; r < rows; r++) {
      var z = (cfg.z0 || 12) + r * (cfg.rowGap || 6);
      out.push({ x: 0, z: z, w: metr.w - 6, d: cfg.d, h: cfg.h, kind: cfg.kind, s: r % 2, extra: cfg.extra });
    }
    return out;
  }

  // ---------- МОДЕЛИ ЗАЛОВ (ВУЗ = ИНФРАСТРУКТУРА КАФЕДР) ----------
  // Мир: x = вдоль доски (0..metr.w), z = от доски к входу (0..metr.d),
  // y = высота (пол 0, потолок metr.h).
  // surface: доска у стены входа лектора: bxc — центр по x, bzc — глубина доски,
  // bw — ширина доски в метрах, bly/bty — низ/верх доски, bg — цвет доски,
  // chalk — цвет мела/маркера на доске.
  function roomBase(o) {
    return {
      metr: o.metr || { w: 30, d: 30, h: 6 },
      name: o.name,
      cathedra: o.cathedra,          // вывеска кафедры на стене
      wall: o.wall, wallHi: o.wallHi, wallLo: o.wallLo,
      floor: o.floor, floorDark: o.floorDark, window: o.window, ceil: o.ceil,
      surface: o.surface,
      podium: o.podium,
      furniture: o.furniture,        // desks | tables | seats | stands | benches | fixture
      fixture: o.fixture,            // подвид мебели для furniture==='fixture' (напр. machines | rigs)
      open: o.open,                  // внешняя/открытая площадка (нет лектора-подиума)
      lecturer: o.lecturer,
      isCinema: o.isCinema,
      spiritColor: o.spiritColor,
      view: o.view,
      views: o.views,
      _furn: (function () {
        var fc = o.fixtureData || o.fixture;
        var f = o.furniture;
        if (f === 'desks') return desks(o.metr || { w: 30, d: 30 });
        if (f === 'tables') return tables(o.metr || { w: 30, d: 30 });
        if (f === 'seats') return seats(o.metr || { w: 30, d: 30 });
        if (f === 'benches') return benches(o.metr || { w: 30, d: 30 });
        if (f === 'stands') return stands(o.metr || { w: 30, d: 30 });
        if (f === 'fixture') return fc ? (o.fixtureLayout === 'rows' ? furnRows : furnGrid)(o.metr || { w: 30, d: 30 }, fc) : furnRows(o.metr || { w: 30, d: 30 }, { kind: 'generic', w: 4, d: 2, h: 1.1 });
        return stands(o.metr || { w: 30, d: 30 });
      })()
    };
  }

  var MODELS = {
    // КАФЕДРА МАТЕМАТИКИ · 30×30 · меловая зелёная доска, парты, кафедра-подиум.
    aud_math: roomBase({
      metr: { w: 30, d: 30, h: 6 },
      name: 'КАФЕДРА МАТЕМАТИКИ',
      cathedra: 'Кафедра математики · меловая доска · парты',
      wall: '#c9bda4', wallHi: '#d8cdb4', wallLo: '#b4a88f',
      floor: '#8a6f4a', floorDark: '#6e5638', window: '#aee0ff', ceil: '#d7d2c4',
      surface: { bzc: 1.2, bw: 11, bly: 0.9, bty: 4.3,
        frame: D.frame, bg: '#2b6a24', chalk: '#f4f4f0' },
      podium: { z: 2.6, w: 3.6, d: 1.2, h: 1.1 },
      furniture: 'desks',
      lecturer: true,
      spiritColor: '#ffd966',
      view: { cx: 22, cz: 15, tx: 15, tz: 1.4 },
      views: {
        'кафедра': { cx: 7.5, cz: 15, tx: 15, tz: 2 },
        'доска':   { cx: 22, cz: 15, tx: 15, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 20, tz: 20 }
      }
    }),
    // КАФЕДРА ФИЗИКИ · 30×40 · меловая доска, опытный стол, лабораторные столы.
    lab_phys: roomBase({
      metr: { w: 30, d: 40, h: 6 },
      name: 'КАФЕДРА ФИЗИКИ',
      cathedra: 'Кафедра физики · опытный стол · лаборатория',
      wall: '#aebfce', wallHi: '#c2d2e0', wallLo: '#8ea2b4',
      floor: '#6f7c8c', floorDark: '#56626f', window: '#cfe4ff', ceil: '#cdd8e2',
      surface: { bzc: 1.2, bw: 12, bly: 0.9, bty: 4.3,
        frame: '#3a4a5a', bg: '#1f4d6e', chalk: '#f4f4f0' },
      podium: { z: 2.6, w: 4.0, d: 1.2, h: 1.0 },
      furniture: 'tables',
      lecturer: true,
      spiritColor: '#bfe3ff',
      view: { cx: 24, cz: 20, tx: 15, tz: 1.4 },
      views: {
        'кафедра': { cx: 7.5, cz: 20, tx: 15, tz: 2 },
        'доска':   { cx: 24, cz: 20, tx: 15, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 22, tz: 34 }
      }
    }),
    // КАФЕДРА ХИМИИ · 30×40 · маркерная белая доска, столы-колбы.
    lab_chem: roomBase({
      metr: { w: 30, d: 40, h: 6 },
      name: 'КАФЕДРА ХИМИИ',
      cathedra: 'Кафедра химии · маркерная доска · столы реактивов',
      wall: '#d8d2b8', wallHi: '#e6dfc6', wallLo: '#c2b89e',
      floor: '#9a8b6a', floorDark: '#7b6d50', window: '#e3f0ff', ceil: '#e3ddca',
      surface: { bzc: 1.2, bw: 12, bly: 0.9, bty: 4.3,
        frame: '#6a5a3a', bg: '#f6f4ec', chalk: '#14456b' },
      podium: { z: 2.6, w: 4.0, d: 1.2, h: 1.0 },
      furniture: 'tables',
      lecturer: true,
      spiritColor: '#ffe082',
      view: { cx: 24, cz: 20, tx: 15, tz: 1.4 },
      views: {
        'кафедра': { cx: 7.5, cz: 20, tx: 15, tz: 2 },
        'доска':   { cx: 24, cz: 20, tx: 15, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 22, tz: 34 }
      }
    }),
    // КАФЕДРА ФАНЕРЫ · 30×30 · фанерная доска-броня, верстаки, шестерни.
    // «Фанера — броня: слои держат, тонкий дюраль пробивается».
    wood: roomBase({
      metr: { w: 30, d: 30, h: 6 },
      name: 'КАФЕДРА ФАНЕРЫ',
      cathedra: 'Кафедра фанеры · фанера-броня · верстаки · сборки',
      wall: '#c9ab79', wallHi: '#dabd8b', wallLo: '#aa8c5e',
      floor: '#8a6f43', floorDark: '#6e5634', window: '#ffd98a', ceil: '#d8c49a',
      surface: { bzc: 1.2, bw: 10, bly: 0.9, bty: 4.3,
        frame: '#6a4a26', bg: '#c9a765', chalk: '#3a2a14' },
      podium: { z: 2.6, w: 3.6, d: 1.2, h: 1.05 },
      furniture: 'benches',
      lecturer: true,
      spiritColor: '#ffcf5e',
      view: { cx: 24, cz: 15, tx: 15, tz: 1.4 },
      views: {
        'кафедра': { cx: 7.5, cz: 15, tx: 15, tz: 2 },
        'доска':   { cx: 24, cz: 15, tx: 15, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 22, tz: 22 }
      }
    }),
    // НИР-ЛАБОРАТОРИЯ · 30×40 · научная лаборатория СНО, прототипы и стойки приборов.
    lab_rnd: roomBase({
      metr: { w: 30, d: 40, h: 6 },
      name: 'НИР-ЛАБОРАТОРИЯ',
      cathedra: 'НИР-лаборатория · научная работа · прототипы и приборы',
      wall: '#a8bfc9', wallHi: '#bfd4de', wallLo: '#87a2af',
      floor: '#6d7f8c', floorDark: '#54646f', window: '#d6ecff', ceil: '#cbd7de',
      surface: { bzc: 1.2, bw: 12, bly: 0.9, bty: 4.3,
        frame: '#3a4a58', bg: '#244d5e', chalk: '#eef6f8' },
      podium: { z: 2.6, w: 4.0, d: 1.2, h: 1.0 },
      furniture: 'fixture',
      fixtureData: { kind: 'rnd', w: 2.6, d: 1.4, h: 0.9, gap: 3.0, z0: 10, maxRows: 5, extra: 'proto' },
      lecturer: true,
      spiritColor: '#bff0ff',
      view: { cx: 24, cz: 20, tx: 15, tz: 1.4 },
      views: {
        'кафедра': { cx: 7.5, cz: 20, tx: 15, tz: 2 },
        'доска':   { cx: 24, cz: 20, tx: 15, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 22, tz: 34 }
      }
    }),
    // ОКР-БЮРО · 30×30 · опытно-конструкторское бюро, чертёжные кульманы.
    bureau_okr: roomBase({
      metr: { w: 30, d: 30, h: 6 },
      name: 'ОКР-БЮРО',
      cathedra: 'ОКР-бюро · опытно-конструкторская работа · чертежи',
      wall: '#cdbfa4', wallHi: '#ddd0b4', wallLo: '#b8aa8c',
      floor: '#8a7a58', floorDark: '#6d5f42', window: '#e7f2ff', ceil: '#ddd3b8',
      surface: { bzc: 1.2, bw: 12, bly: 0.9, bty: 4.3,
        frame: '#5c4a30', bg: '#fbf8ee', chalk: '#1d3a6b' },
      podium: { z: 2.6, w: 4.0, d: 1.2, h: 1.0 },
      furniture: 'fixture',
      fixtureData: { kind: 'bureau', w: 2.2, d: 1.5, h: 0.9, gap: 2.6, z0: 9, maxRows: 5, extra: 'draft' },
      lecturer: true,
      spiritColor: '#ffe9a8',
      view: { cx: 24, cz: 15, tx: 15, tz: 1.4 },
      views: {
        'кафедра': { cx: 7.5, cz: 15, tx: 15, tz: 2 },
        'доска':   { cx: 24, cz: 15, tx: 15, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 22, tz: 22 }
      }
    }),
    // МАШИНОСТРОИТЕЛЬНЫЙ ЦЕХ · 40×30 · станочные ряды (токарные, фрезерные).
    machine_shop: roomBase({
      metr: { w: 40, d: 30, h: 7 },
      name: 'МАШИНОСТРОИТЕЛЬНЫЙ ЦЕХ',
      cathedra: 'Машиностроительный цех · станки и изготовление деталей',
      wall: '#b9b4a8', wallHi: '#cbc7ba', wallLo: '#9c9788',
      floor: '#6f6a5e', floorDark: '#56524a', window: '#ffe4b8', ceil: '#cfcabd',
      surface: { bzc: 1.2, bw: 12, bly: 0.9, bty: 4.3,
        frame: '#4a463c', bg: '#c6b98f', chalk: '#2a2418' },
      podium: { z: 2.6, w: 4.0, d: 1.2, h: 1.0 },
      furniture: 'fixture',
      fixtureLayout: 'rows',
      fixtureData: { kind: 'machine', w: 4, d: 2.0, h: 1.1, rowGap: 6, z0: 12, maxRows: 4, extra: 'cnc' },
      lecturer: true,
      spiritColor: '#ffcf6b',
      view: { cx: 32, cz: 15, tx: 20, tz: 1.4 },
      views: {
        'кафедра': { cx: 8, cz: 15, tx: 20, tz: 2 },
        'цех':     { cx: 32, cz: 15, tx: 20, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 30, tz: 24 }
      }
    }),
    // ЭЛЕКТРО-РАДИОМАСТЕРСКАЯ · 30×30 · стенды пайки, стеллажи деталей.
    elec_shop: roomBase({
      metr: { w: 30, d: 30, h: 6 },
      name: 'ЭЛЕКТРО-РАДИОМАСТЕРСКАЯ',
      cathedra: 'Электро-радиомастерская · сборка и наладка электроники',
      wall: '#c2bccb', wallHi: '#d6d0df', wallLo: '#a49db5',
      floor: '#787388', floorDark: '#5e5a6c', window: '#dff0ff', ceil: '#d3ceda',
      surface: { bzc: 1.2, bw: 11, bly: 0.9, bty: 4.3,
        frame: '#544a66', bg: '#3d4a6b', chalk: '#eef3fb' },
      podium: { z: 2.6, w: 3.6, d: 1.2, h: 1.0 },
      furniture: 'fixture',
      fixtureData: { kind: 'elec', w: 2.4, d: 1.4, h: 0.95, gap: 2.8, z0: 10, maxRows: 5, extra: 'rack' },
      lecturer: true,
      spiritColor: '#cff2ff',
      view: { cx: 24, cz: 15, tx: 15, tz: 1.4 },
      views: {
        'кафедра': { cx: 7.5, cz: 15, tx: 15, tz: 2 },
        'доска':   { cx: 24, cz: 15, tx: 15, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 22, tz: 22 }
      }
    }),
    // ИСПЫТАТЕЛЬНЫЙ СТЕНД · 40×40 · испытательные машины и стенды.
    test_stand: roomBase({
      metr: { w: 40, d: 40, h: 7 },
      name: 'ИСПЫТАТЕЛЬНЫЙ СТЕНД',
      cathedra: 'Испытательный стенд · проверка прочности и надёжности',
      wall: '#aeb2bd', wallHi: '#c3c7d1', wallLo: '#8f939e',
      floor: '#6b6f78', floorDark: '#52565e', window: '#dbeaff', ceil: '#c6cad1',
      surface: { bzc: 1.2, bw: 13, bly: 0.9, bty: 4.3,
        frame: '#3f434b', bg: '#4a5560', chalk: '#f2f5f8' },
      podium: { z: 2.6, w: 4.2, d: 1.2, h: 1.05 },
      furniture: 'fixture',
      fixtureLayout: 'rows',
      fixtureData: { kind: 'rig', w: 3.2, d: 2.0, h: 1.2, rowGap: 6, z0: 12, maxRows: 4, extra: 'clamp' },
      lecturer: true,
      spiritColor: '#ffe082',
      view: { cx: 32, cz: 20, tx: 20, tz: 1.4 },
      views: {
        'кафедра': { cx: 8, cz: 20, tx: 20, tz: 2 },
        'стенд':   { cx: 32, cz: 20, tx: 20, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 30, tz: 34 }
      }
    }),
    // ЦЕНТР КОЛЛЕКТИВНОГО ПОЛЬЗОВАНИЯ · 40×40 · острова общих приборов.
    cpc: roomBase({
      metr: { w: 40, d: 40, h: 6 },
      name: 'ЦЕНТР КОЛЛЕКТИВНОГО ПОЛЬЗОВАНИЯ',
      cathedra: 'Центр коллективного пользования · общее оборудование кафедр',
      wall: '#b9c7b4', wallHi: '#cddac9', wallLo: '#9cae94',
      floor: '#74806c', floorDark: '#5a6554', window: '#e0f5e4', ceil: '#d0dcc8',
      surface: { bzc: 1.2, bw: 13, bly: 0.9, bty: 4.3,
        frame: '#40523c', bg: '#2c5a3a', chalk: '#eef7f0' },
      podium: { z: 2.6, w: 4.2, d: 1.2, h: 1.0 },
      furniture: 'fixture',
      fixtureData: { kind: 'cpc', w: 3.6, d: 2.4, h: 1.1, gap: 5.0, z0: 12, maxRows: 4, extra: 'island' },
      lecturer: true,
      spiritColor: '#c9f2c9',
      view: { cx: 32, cz: 20, tx: 20, tz: 1.4 },
      views: {
        'кафедра': { cx: 8, cz: 20, tx: 20, tz: 2 },
        'центр':   { cx: 32, cz: 20, tx: 20, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 30, tz: 34 }
      }
    }),
    // ВНЕШНИЙ ИСПЫТАТЕЛЬНЫЙ ПОЛИГОН · 60×40 · открытая площадка, разметка, мишени.
    test_range: roomBase({
      metr: { w: 60, d: 40, h: 6 },
      name: 'ВНЕШНИЙ ИСПЫТАТЕЛЬНЫЙ ПОЛИГОН',
      cathedra: 'Испытательный полигон · полевые проверки кафедр',
      wall: '#b8cfc4', wallHi: '#cce0d6', wallLo: '#9db8ab',
      floor: '#7f947f', floorDark: '#64755f', window: '#e8f7ff', ceil: '#cddcd3',
      surface: { bzc: 1.2, bw: 12, bly: 0.9, bty: 4.2,
        frame: '#4f6a5c', bg: '#cfe0c8', chalk: '#22352a' },
      podium: null,
      open: true,
      furniture: 'fixture',
      fixtureData: { kind: 'range', w: 4.0, d: 3.0, h: 0.6, gap: 8.0, z0: 14, maxRows: 2, maxCols: 3, extra: 'target' },
      lecturer: false,
      spiritColor: '#bff2cf',
      view: { cx: 46, cz: 20, tx: 30, tz: 1.4 },
      views: {
        'полигон': { cx: 30, cz: 20, tx: 30, tz: 2 },
        'мишень':  { cx: 46, cz: 20, tx: 30, tz: 1.4 },
        'облёт':   { cx: 6, cz: 6, tx: 40, tz: 32 }
      }
    }),
    // ОПЫТНОЕ ПРОИЗВОДСТВО · 30×30 · экспериментальные ячейки выпуска поделок.
    pilot_plant: roomBase({
      metr: { w: 30, d: 30, h: 6 },
      name: 'ОПЫТНОЕ ПРОИЗВОДСТВО',
      cathedra: 'Опытное производство · выпуск малых партий и поделок кафедр',
      wall: '#c7b7a0', wallHi: '#d7c9b2', wallLo: '#b0a087',
      floor: '#837662', floorDark: '#675b4a', window: '#ffe3b0', ceil: '#d9ccb6',
      surface: { bzc: 1.2, bw: 11, bly: 0.9, bty: 4.3,
        frame: '#5e4f38', bg: '#c6a96e', chalk: '#332412' },
      podium: { z: 2.6, w: 3.6, d: 1.2, h: 1.0 },
      furniture: 'fixture',
      fixtureData: { kind: 'pilot', w: 2.8, d: 1.6, h: 0.95, gap: 3.2, z0: 10, maxRows: 5, extra: 'cell' },
      lecturer: true,
      spiritColor: '#ffd98a',
      view: { cx: 24, cz: 15, tx: 15, tz: 1.4 },
      views: {
        'кафедра': { cx: 7.5, cz: 15, tx: 15, tz: 2 },
        'производство': { cx: 24, cz: 15, tx: 15, tz: 1.4 },
        'облёт':   { cx: 4, cz: 4, tx: 22, tz: 22 }
      }
    }),
    // ЦЕНТР ВНЕШНИХ СВЯЗЕЙ: круглый стол, глобус, экраны-партнёры.
    uni_net: roomBase({
      metr: { w: 30, d: 30, h: 6 },
      name: 'ЦЕНТР ВНЕШНИХ СВЯЗЕЙ',
      cathedra: 'Университетская сеть · сотрудничество и обмен с другими универами',
      wall: '#b8c6d8', wallHi: '#c9d6e6', wallLo: '#a3b3c8',
      floor: '#8f9fb2', floorDark: '#74869b', window: '#d7ecff', ceil: '#ccd8e8',
      surface: { bzc: 1.0, bw: 11, bly: 0.9, bty: 4.3,
        frame: '#5d6f85', bg: '#eef4fb', chalk: '#21324d' },
      podium: { z: 2.6, w: 3.6, d: 1.2, h: 1.0 },
      furniture: 'fixture',
      fixtureData: { kind: 'net', w: 3.0, d: 1.6, h: 0.95, gap: 3.4, z0: 10, maxRows: 4, extra: 'round' },
      lecturer: true,
      spiritColor: '#bcd6ff',
      view: { cx: 24, cz: 15, tx: 15, tz: 1.4 },
      views: {
        'кафедра': { cx: 7.5, cz: 15, tx: 15, tz: 2 },
        'сеть':  { cx: 24, cz: 15, tx: 15, tz: 1.4 },
        'облёт': { cx: 4, cz: 4, tx: 22, tz: 22 }
      }
    }),
    // КИНОЗАЛ: экран, ряды кресел, затемнение.
    cinema: roomBase({
      metr: { w: 30, d: 30, h: 6 },
      name: 'КИНОЗАЛ',
      cathedra: 'Кинозал университета · экран, ряды кресел',
      wall: '#23252b', wallHi: '#2c2f37', wallLo: '#1a1c21',
      floor: '#2a2a2a', floorDark: '#1c1c1c', window: '#0f1114', ceil: '#1f2228',
      surface: { bzc: 0.8, bw: 20, bly: 0.9, bty: 5.1,
        frame: '#3a3f49', bg: '#eef1f4', chalk: '#1c2520' },
      podium: null,
      furniture: 'seats',
      lecturer: false,
      isCinema: true,
      spiritColor: '#ffd966',
      view: { cx: 24, cz: 15, tx: 15, tz: 0.8 },
      views: {
        'зритель': { cx: 24, cz: 15, tx: 15, tz: 0.8 },
        'экран':   { cx: 8, cz: 15, tx: 15, tz: 0.8 },
        'облёт':   { cx: 3, cz: 3, tx: 22, tz: 22 }
      }
    }),
    // СТЕНД-ЭКСПОЗИЦИЯ: панель, подиумы.
    stand: roomBase({
      metr: { w: 30, d: 30, h: 6 },
      name: 'СТЕНД-ЭКСПОЗИЦИЯ',
      cathedra: 'Стенд-экспозиция университета · витрина и экспонаты',
      wall: '#e8e2d4', wallHi: '#f2ecdd', wallLo: '#d6cfbd',
      floor: '#b8a98c', floorDark: '#9c8d72', window: '#dbe8ff', ceil: '#efe9d8',
      surface: { bzc: 1.0, bw: 14, bly: 0.8, bty: 4.6,
        frame: '#a8986b', bg: '#fdfbf2', chalk: '#3a3228' },
      podium: null,
      furniture: 'stands',
      lecturer: false,
      spiritColor: '#8a2c1e',
      view: { cx: 24, cz: 15, tx: 15, tz: 1.0 },
      views: {
        'витрина': { cx: 24, cz: 15, tx: 15, tz: 1.0 },
        'панель':  { cx: 10, cz: 15, tx: 15, tz: 1.0 },
        'облёт':   { cx: 4, cz: 4, tx: 20, tz: 20 }
      }
    })
  };

  // Псевдонимы: старые kind'ы → модели (обратная совместимость).
  MODELS.auditorium = MODELS.aud_math;
  MODELS.lab = MODELS.lab_phys;

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

  // ---------- РИСОВАНИЕ КОМНАТЫ (по метражу модели) ----------
  function drawRoom(ctx, cam, W, H, R) {
    var c = cam;
    var m = R.metr;
    // Задняя стена (z = m.d, от x=0..m.w, y=0..m.h)
    var p0 = project(c, 0, 0, m.d, W, H);
    var p1 = project(c, m.w, 0, m.d, W, H);
    var p2 = project(c, 0, m.h, m.d, W, H);
    var p3 = project(c, m.w, m.h, m.d, W, H);
    if (p0 && p1) {
      drawPoly(ctx, [p0, p1, p3, p2], R.wall, null);
      ctx.strokeStyle = rgba(R.wallHi, 1); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      ctx.strokeStyle = rgba(R.wallLo, 1); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p3[0], p3[1]); ctx.stroke();
    }

    // Пол: сетка квадратов 3x3 м (по метражу)
    for (var gx = 0; gx <= Math.round(m.w / 3); gx++) {
      var a = project(c, gx * 3, 0, 0, W, H);
      var b = project(c, gx * 3, 0, m.d, W, H);
      if (a && b) {
        ctx.strokeStyle = rgba(R.floorDark, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }
    for (var gz = 0; gz <= Math.round(m.d / 3); gz++) {
      var c1 = project(c, 0, 0, gz * 3, W, H);
      var c2 = project(c, m.w, 0, gz * 3, W, H);
      if (c1 && c2) {
        ctx.strokeStyle = rgba(R.floorDark, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.stroke();
      }
    }
    ctx.fillStyle = R.floor;
    ctx.fillRect(0, H - 2, W, 2);

    // Затемнение края для кино (тёмный зал)
    if (R.isCinema) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
    }

    // Окна на стенах x=0 и x=m.w (по 3 с каждой стороны, по глубине зала)
    for (var w = 0; w < 3; w++) {
      var wz = 6 + w * Math.max(4, (m.d - 12) / 2);
      var lb = project(c, 0.1, 2.6, wz, W, H);
      var lt = project(c, 0.1, 4.0, wz, W, H);
      var rb = project(c, m.w - 0.1, 2.6, wz, W, H);
      var rt = project(c, m.w - 0.1, 4.0, wz, W, H);
      if (lb && rb) {
        drawPoly(ctx, [lb, rb, rt, lt], rgba(R.window, 0.8), null);
      }
    }

    // ЧПУ-станок (мастерская wood): станина, портал, лист фанеры — у заднего угла.
    if (R.furniture === 'benches') {
      var cnx = m.w - 4.5, cnz = 9;
      var s0 = project(c, cnx - 1.6, 0.15, cnz - 1.0, W, H);
      var s1 = project(c, cnx + 1.6, 0.15, cnz - 1.0, W, H);
      var s2 = project(c, cnx + 1.6, 1.0, cnz - 1.0, W, H);
      var s3 = project(c, cnx - 1.6, 1.0, cnz - 1.0, W, H);
      if (s0 && s1) drawPoly(ctx, [s0, s1, s2, s3], '#5a6a6e', null);
      var p0c = project(c, cnx - 1.6, 1.0, cnz + 1.0, W, H);
      var p1c = project(c, cnx + 1.6, 1.0, cnz + 1.0, W, H);
      if (s2 && p0c) drawPoly(ctx, [s2, s3, project(c, cnx - 1.6, 1.0, cnz + 1.0, W, H), p1c], '#4a585c', null);
      // портал-резец
      var g0 = project(c, cnx - 1.2, 1.5, cnz, W, H);
      var g1 = project(c, cnx + 1.2, 1.5, cnz, W, H);
      var g2 = project(c, cnx + 1.2, 0.6, cnz, W, H);
      var g3 = project(c, cnx - 1.2, 0.6, cnz, W, H);
      if (g0 && g1) drawPoly(ctx, [g0, g1, g2, g3], R.spiritColor || '#8a7a52', null);
    }
  }

  // ---------- ВЫВЕСКА КАФЕДРЫ (табличка над доской) ----------
  function drawCathedra(ctx, cam, W, H, R) {
    if (!R.cathedra) return;
    var m = R.metr;
    var sf = R.surface || {};
    var cx = m.w / 2;
    var bzc = sf.bzc || 1.2;
    // табличка выше доски: от bty+0.15 до bty+0.6 (по высоте стены)
    var y0 = Math.min((sf.bty || 4.3) + 0.7, m.h - 0.8);
    var p0 = project(cam, cx - 4.5, y0, bzc, W, H);
    var p1 = project(cam, cx + 4.5, y0, bzc, W, H);
    var p2 = project(cam, cx + 4.5, y0 + 0.55, bzc, W, H);
    var p3 = project(cam, cx - 4.5, y0 + 0.55, bzc, W, H);
    if (!p0) return;
    drawPoly(ctx, [p0, p1, p2, p3], 'rgba(20,25,32,0.78)', null);
    var pc = project(cam, cx, y0 + 0.27, bzc, W, H);
    if (!pc) return;
    ctx.save();
    ctx.fillStyle = R.spiritColor || '#ffd966';
    ctx.font = '600 ' + Math.max(9, Math.min(15, pc[2] * 0.012)) + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(R.cathedra, pc[0], pc[1]);
    ctx.restore();
  }

  // ---------- ПОВЕРХНОСТЬ (доска/экран/панель) + МЕТРАЖНАЯ ШКАЛА ----------
  function drawSurface(ctx, cam, W, H, R) {
    var s = R.surface;
    var m = R.metr;
    var bxc = m.w / 2;
    var ax0 = bxc - s.bw / 2 - 0.3, ax1 = bxc + s.bw / 2 + 0.3;
    var ay0 = s.bly - 0.3, ay1 = s.bty + 0.3;
    var f0 = project(cam, ax0, ay0, s.bzc, W, H);
    var f1 = project(cam, ax1, ay0, s.bzc, W, H);
    var f2 = project(cam, ax1, ay1, s.bzc, W, H);
    var f3 = project(cam, ax0, ay1, s.bzc, W, H);
    if (!f0 || !f1) return null;
    drawPoly(ctx, [f0, f1, f2, f3], s.frame, null);

    var b0 = project(cam, bxc - s.bw / 2, s.bly, s.bzc, W, H);
    var b1 = project(cam, bxc + s.bw / 2, s.bly, s.bzc, W, H);
    var b2 = project(cam, bxc + s.bw / 2, s.bty, s.bzc, W, H);
    var b3 = project(cam, bxc - s.bw / 2, s.bty, s.bzc, W, H);
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

    // метражная шкала: деления по 1 м вдоль нижней кромки доски
    var steps = Math.min(24, Math.max(6, Math.round(s.bw)));
    var tickCol = (s.bg === '#fdfbf2' || s.bg === '#f6f4ec' || s.chalk === '#1c2520') ? '#8a8a7a' : '#d8d8c0';
    ctx.save();
    ctx.strokeStyle = rgba(tickCol, 0.7);
    ctx.lineWidth = 1;
    ctx.fillStyle = rgba(tickCol, 0.9);
    ctx.font = '500 ' + Math.max(7, Math.min(11, (b1[2] || 20) * 0.008)) + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    var tickH = (b0[1] - b3[1]) * 0.03;      // высота штриха под нижней кромкой
    for (var st = 0; st <= steps; st++) {
      if (st % 2 !== 0) continue;
      var fr = st / steps;
      var fx = b0[0] + (b1[0] - b0[0]) * fr;
      var fy = b0[1] + (b1[1] - b0[1]) * fr;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + Math.max(2, tickH)); ctx.stroke();
      ctx.fillText(String(st), fx, fy + Math.max(10, tickH * 3));
    }
    ctx.restore();

    return { b0: b0, b1: b1, b2: b2, b3: b3 };
  }

  // ---------- МЕБЕЛЬ ----------
  function drawDesks(ctx, cam, W, H, R) {
    var noise = makeNoise(21);
    for (var i = 0; i < R._furn.length; i++) {
      var dk = R._furn[i];
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

  function drawTables(ctx, cam, W, H, R) {
    for (var i = 0; i < R._furn.length; i++) {
      var tb = R._furn[i];
      var p0 = project(cam, tb.x - tb.w / 2, tb.h, tb.z - tb.d / 2, W, H);
      var p1 = project(cam, tb.x + tb.w / 2, tb.h, tb.z - tb.d / 2, W, H);
      var p2 = project(cam, tb.x + tb.w / 2, tb.h, tb.z + tb.d / 2, W, H);
      var p3 = project(cam, tb.x - tb.w / 2, tb.h, tb.z + tb.d / 2, W, H);
      if (!p0 || !p1) continue;
      drawPoly(ctx, [p0, p1, p2, p3], tb.s ? '#5c7a60' : '#4a6650', null);
      var e0 = project(cam, tb.x - tb.w / 2, 0, tb.z - tb.d / 2, W, H);
      var e1 = project(cam, tb.x + tb.w / 2, 0, tb.z - tb.d / 2, W, H);
      var f1 = project(cam, tb.x + tb.w / 2, 0, tb.z + tb.d / 2, W, H);
      var f0 = project(cam, tb.x - tb.w / 2, 0, tb.z + tb.d / 2, W, H);
      if (e0 && e1) drawPoly(ctx, [e0, e1, f1, f0], 'rgba(40,50,44,0.4)', null);
      // прибор на столе: маленький кубик
      if (tb.s) {
        var qx = project(cam, tb.x, tb.h + 0.28, tb.z, W, H);
        if (qx) {
          ctx.fillStyle = '#2a4a6e';
          ctx.beginPath(); ctx.arc(qx[0], qx[1], Math.max(2, qx[2] * 0.012), 0, 7); ctx.fill();
        }
      } else {
        // колба для химии / цилиндр для физики
        var q0 = project(cam, tb.x - 0.18, tb.h + 0.05, tb.z - 0.15, W, H);
        var q1 = project(cam, tb.x + 0.18, tb.h + 0.05, tb.z - 0.15, W, H);
        var q2 = project(cam, tb.x + 0.18, tb.h + 0.5, tb.z + 0.05, W, H);
        var q3 = project(cam, tb.x - 0.18, tb.h + 0.5, tb.z + 0.05, W, H);
        if (q0 && q1) drawPoly(ctx, [q0, q1, q2, q3], R.spiritColor === '#ffe082' ? '#a5d8a5' : '#aee0ff', null);
      }
    }
  }

  function drawSeats(ctx, cam, W, H, R) {
    for (var i = 0; i < R._furn.length; i++) {
      var s = R._furn[i];
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

  function drawStands(ctx, cam, W, H, R) {
    var noise = makeNoise(13);
    for (var i = 0; i < R._furn.length; i++) {
      var s = R._furn[i];
      var p0 = project(cam, s.x - s.w / 2, s.h, s.z - s.d / 2, W, H);
      var p1 = project(cam, s.x + s.w / 2, s.h, s.z - s.d / 2, W, H);
      var p2 = project(cam, s.x + s.w / 2, s.h, s.z + s.d / 2, W, H);
      var p3 = project(cam, s.x - s.w / 2, s.h, s.z + s.d / 2, W, H);
      if (!p0 || !p1) continue;
      drawPoly(ctx, [p0, p1, p2, p3], s.s ? '#d6cfbd' : '#c8c0a8', null);
      var e0 = project(cam, s.x - s.w / 2, 0, s.z - s.d / 2, W, H);
      var e1 = project(cam, s.x + s.w / 2, 0, s.z - s.d / 2, W, H);
      var f1 = project(cam, s.x + s.w / 2, 0, s.z + s.d / 2, W, H);
      var f0 = project(cam, s.x - s.w / 2, 0, s.z + s.d / 2, W, H);
      if (e0 && e1) drawPoly(ctx, [e0, e1, f1, f0], 'rgba(120,100,70,0.4)', null);
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

  function drawBenches(ctx, cam, W, H, R) {
    var noise = makeNoise(33);
    for (var i = 0; i < R._furn.length; i++) {
      var bn = R._furn[i];
      var p0 = project(cam, bn.x - bn.w / 2, bn.h, bn.z - bn.d / 2, W, H);
      var p1 = project(cam, bn.x + bn.w / 2, bn.h, bn.z - bn.d / 2, W, H);
      var p2 = project(cam, bn.x + bn.w / 2, bn.h, bn.z + bn.d / 2, W, H);
      var p3 = project(cam, bn.x - bn.w / 2, bn.h, bn.z + bn.d / 2, W, H);
      if (!p0 || !p1) continue;
      // столешница-фанера: тёплое дерево со шпоном
      drawPoly(ctx, [p0, p1, p2, p3], bn.s ? '#b98a52' : '#a97a44', null);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (var v = 0; v < 6; v++) {
        var l0 = project(cam, bn.x - bn.w / 2 + 0.3, bn.h + 0.02, bn.z - bn.d / 2 + v * bn.d / 6, W, H);
        var l1 = project(cam, bn.x + bn.w / 2 - 0.3, bn.h + 0.02, bn.z - bn.d / 2 + v * bn.d / 6, W, H);
        if (l0 && l1) {
          ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1]); ctx.stroke();
        }
      }
      // ноги-брусья
      var e0 = project(cam, bn.x - bn.w / 2, 0, bn.z - bn.d / 2, W, H);
      var e1 = project(cam, bn.x + bn.w / 2, 0, bn.z - bn.d / 2, W, H);
      var f1 = project(cam, bn.x + bn.w / 2, 0, bn.z + bn.d / 2, W, H);
      var f0 = project(cam, bn.x - bn.w / 2, 0, bn.z + bn.d / 2, W, H);
      if (e0 && e1) drawPoly(ctx, [e0, e1, f1, f0], 'rgba(70,46,26,0.4)', null);
      // тиски на краю столешницы
      var g0 = project(cam, bn.x - 0.5, bn.h, bn.z - bn.d / 2 + 0.2, W, H);
      var g1 = project(cam, bn.x + 0.5, bn.h, bn.z - bn.d / 2 + 0.2, W, H);
      var g2 = project(cam, bn.x + 0.5, bn.h + 0.28, bn.z - bn.d / 2 + 0.2, W, H);
      var g3 = project(cam, bn.x - 0.5, bn.h + 0.28, bn.z - bn.d / 2 + 0.2, W, H);
      if (g0 && g1) drawPoly(ctx, [g0, g1, g2, g3], '#6a5636', null);
      // заготовка-шестерёнка на столе
      var hx = project(cam, bn.x, bn.h + 0.3, bn.z, W, H);
      if (hx) {
        ctx.fillStyle = bn.s ? '#c8b48a' : '#8f8f8f';
        ctx.beginPath(); ctx.arc(hx[0], hx[1], Math.max(2.4, hx[2] * 0.013), 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.arc(hx[0], hx[1], Math.max(1, hx[2] * 0.004), 0, 7); ctx.fill();
      }
      // стружки у ножек
      ctx.strokeStyle = 'rgba(180,150,90,0.5)';
      ctx.lineWidth = 1;
      for (var w = 0; w < 3; w++) {
        var c0 = project(cam, bn.x + (noise() - 0.5) * 1.2, 0.02, bn.z + (noise() - 0.5) * 1.4, W, H);
        var c1 = project(cam, bn.x + (noise() - 0.5) * 1.2, 0.02, bn.z + (noise() - 0.5) * 1.4, W, H);
        if (c0 && c1) {
          ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.stroke();
        }
      }
    }
  }

  // ---------- МЕБЕЛЬ/ОСНАСТКА ОХВАТНЫХ ЗАЛОВ (fixture) ----------
  // kind'ы: rnd, bureau, machine, elec, rig, cpc, range, pilot, generic.
  function drawFixtures(ctx, cam, W, H, R) {
    var fi = R._furn || [];
    var noise = makeNoise(41);
    for (var i = 0; i < fi.length; i++) {
      var f = fi[i];
      var k = f.kind || 'generic';
      var p0 = project(cam, f.x - f.w / 2, f.h, f.z - f.d / 2, W, H);
      var p1 = project(cam, f.x + f.w / 2, f.h, f.z - f.d / 2, W, H);
      var p2 = project(cam, f.x + f.w / 2, f.h, f.z + f.d / 2, W, H);
      var p3 = project(cam, f.x - f.w / 2, f.h, f.z + f.d / 2, W, H);
      if (!p0 || !p1) continue;
      var top = f.s ? '#a8a39b' : '#92918d';
      if (k === 'rnd' || k === 'bureau') top = f.s ? '#b2a488' : '#a59678';
      if (k === 'elec') top = f.s ? '#7f8bb0' : '#6d7aa0';
      if (k === 'machine' || k === 'rig') top = f.s ? '#6e7a86' : '#5c6874';
      if (k === 'cpc') top = f.s ? '#5f9a6f' : '#4f865d';
      if (k === 'range') top = f.s ? '#d5c08a' : '#c4ae76';
      if (k === 'pilot') top = f.s ? '#c9a26a' : '#b99256';
      if (k === 'net') top = f.s ? '#7f9ac2' : '#6d88b0';
      drawPoly(ctx, [p0, p1, p2, p3], top, null);
      // ноги
      var e0 = project(cam, f.x - f.w / 2, 0, f.z - f.d / 2, W, H);
      var e1 = project(cam, f.x + f.w / 2, 0, f.z - f.d / 2, W, H);
      var f1 = project(cam, f.x + f.w / 2, 0, f.z + f.d / 2, W, H);
      var f0 = project(cam, f.x - f.w / 2, 0, f.z + f.d / 2, W, H);
      if (e0 && e1) drawPoly(ctx, [e0, e1, f1, f0], 'rgba(30,30,32,0.45)', null);
      // детали сверху по виду
      var cx = project(cam, f.x, f.h + 0.22, f.z, W, H);
      if (!cx) continue;
      if (k === 'rnd') {
        // прототип-куб на столе
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(cx[0], cx[1], Math.max(2.5, cx[2] * 0.016), 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(40,120,150,0.7)';
        ctx.beginPath(); ctx.arc(cx[0] + 8, cx[1] - 6, Math.max(2, cx[2] * 0.012), 0, 7); ctx.fill();
      } else if (k === 'bureau') {
        // кульман с чертежом
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(cx[0] - 10, cx[1] - 2, 20, 14);
        ctx.strokeStyle = 'rgba(60,80,140,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx[0] - 8, cx[1] + 10); ctx.lineTo(cx[0] + 8, cx[1] + 2); ctx.stroke();
      } else if (k === 'machine') {
        // станок: корпус + ось/шпиндель
        ctx.fillStyle = 'rgba(40,50,58,0.9)';
        ctx.fillRect(cx[0] - 14, cx[1] - 8, 28, 16);
        ctx.fillStyle = 'rgba(200,210,220,0.9)';
        ctx.fillRect(cx[0] + 6, cx[1] - 9, 10, 5);
      } else if (k === 'elec') {
        // осциллограф-экран + коробки деталей
        ctx.fillStyle = 'rgba(30,45,60,0.9)';
        ctx.fillRect(cx[0] - 8, cx[1] - 6, 16, 10);
        ctx.fillStyle = 'rgba(120,255,160,0.8)';
        ctx.fillRect(cx[0] - 5, cx[1] - 4, 5, 3); ctx.fillRect(cx[0] + 2, cx[1] - 1, 4, 4);
      } else if (k === 'rig' || k === 'range') {
        // испытательная рама с зажимом/мишенью
        ctx.fillStyle = 'rgba(120,40,40,0.85)';
        ctx.fillRect(cx[0] - 3, cx[1] - 14, 6, 14);
        ctx.strokeStyle = 'rgba(200,140,60,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx[0], cx[1] - 16, Math.max(3, cx[2] * 0.02), 0, 7); ctx.stroke();
      } else if (k === 'cpc') {
        // остров с приборами
        ctx.fillStyle = 'rgba(220,255,220,0.7)';
        ctx.fillRect(cx[0] - 12, cx[1] - 4, 24, 8);
        ctx.fillStyle = 'rgba(30,90,50,0.8)';
        ctx.fillRect(cx[0] - 4, cx[1] - 9, 8, 5);
      } else if (k === 'pilot') {
        // ячейка с поделкой/коробкой
        ctx.fillStyle = 'rgba(120,80,40,0.9)';
        ctx.fillRect(cx[0] - 7, cx[1] - 6, 14, 12);
        ctx.fillStyle = 'rgba(255,220,150,0.9)';
        ctx.fillRect(cx[0] - 2, cx[1] - 8, 7, 5);
      } else if (k === 'net') {
        // круглый стол сотрудничества + глобус: связь с другими универами
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.ellipse(cx[0], cx[1], Math.max(12, cx[2] * 0.07), 6, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(40,90,140,0.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(cx[0], cx[1], Math.max(12, cx[2] * 0.07), 6, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(60,140,200,0.9)';
        ctx.beginPath(); ctx.arc(cx[0] + 16, cx[1] - 10, Math.max(4, cx[2] * 0.028), 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(200,230,255,0.8)'; ctx.lineWidth = 1;
        for (var g = 0; g < 3; g++) {
          ctx.beginPath(); ctx.ellipse(cx[0] + 16, cx[1] - 10, Math.max(4, cx[2] * 0.028) * (0.4 + g * 0.3), Math.max(1.6, cx[2] * 0.012), 0, 0, 7); ctx.stroke();
        }
      }
      // блёстки-мелочь на столе
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(cx[0] - 10 + (noise() * 20), cx[1] - 2, 2, 2);
      ctx.fillRect(cx[0] - 8 + (noise() * 18), cx[1] + 4, 2, 2);
    }
    // стеллажи вдоль стен для мастерских
    if (fi.length && (fi[0].kind === 'elec' || fi[0].kind === 'pilot')) {
      ctx.fillStyle = 'rgba(40,36,45,0.85)';
      for (var s = 0; s < 4; s++) {
        var sx = 3 + s; var sz = (R.metr.d || 30) - 2;
        var q0 = project(cam, sx - 0.7, 0, sz, W, H);
        var q1 = project(cam, sx + 0.7, 0, sz, W, H);
        var q2 = project(cam, sx + 0.7, 1.6, sz, W, H);
        var q3 = project(cam, sx - 0.7, 1.6, sz, W, H);
        if (q0 && q1) drawPoly(ctx, [q0, q1, q2, q3], 'rgba(40,36,45,0.9)', null);
      }
    }
  }

  function drawFurniture(ctx, cam, W, H, R) {
    if (R.furniture === 'desks') drawDesks(ctx, cam, W, H, R);
    else if (R.furniture === 'tables') drawTables(ctx, cam, W, H, R);
    else if (R.furniture === 'seats') drawSeats(ctx, cam, W, H, R);
    else if (R.furniture === 'stands') drawStands(ctx, cam, W, H, R);
    else if (R.furniture === 'benches') drawBenches(ctx, cam, W, H, R);
    else if (R.furniture === 'fixture') drawFixtures(ctx, cam, W, H, R);
  }

  // ---------- ЛЕКТОР ----------
  function drawLecturer(ctx, cam, W, H, t, R) {
    if (!R.lecturer || !R.podium) return;
    var x = R.metr.w / 2, z = R.podium.z + R.podium.d / 2 - 0.4;
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
    // кафедра-подиум позади лектора
    var pd = R.podium;
    var k0 = project(cam, x - pd.w / 2, pd.h, pd.z, W, H);
    var k1 = project(cam, x + pd.w / 2, pd.h, pd.z, W, H);
    var k2 = project(cam, x + pd.w / 2, pd.h, pd.z + pd.d, W, H);
    var k3 = project(cam, x - pd.w / 2, pd.h, pd.z + pd.d, W, H);
    if (k0 && k1) drawPoly(ctx, [k0, k1, k2, k3], D.frame, null);
  }

  // ---------- ПОВЕРХНОСТЬ: КООРДИНАТЫ МАЗКОВ ----------
  // Мазки в плоскостных координатах: x 0..bw по ширине, y 0..(bty-bly).
  function facePx(cam, R, x, yp, W, H) {
    var s = R.surface;
    var bxc = R.metr.w / 2;
    var mx = bxc - s.bw / 2 + x;
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
        ctx.fillStyle = R.spiritColor || '#ffd966';
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
        case 'gear': {
          // шестерня: зубчатый венец, тело, ось (механика кафедры фанеры)
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          var gr = (s.r || 1.6) * scale * 40 * 6;      // внешний радиус
          var teeth = (s.teeth || 12);
          var tr = gr * 1.15;                           // вершины зубьев
          var base = gr * 0.85;                         // впадины зубьев
          ctx.beginPath();
          for (var tw = 0; tw < teeth; tw++) {
            var a0 = tw / teeth * Math.PI * 2 - Math.PI / 2;
            var a1 = (tw + 0.42) / teeth * Math.PI * 2 - Math.PI / 2;
            var a2 = (tw + 0.5) / teeth * Math.PI * 2 - Math.PI / 2;
            var a3 = (tw + 0.92) / teeth * Math.PI * 2 - Math.PI / 2;
            ctx.lineTo(sx + Math.cos(a0) * base, sy + Math.sin(a0) * base);
            ctx.lineTo(sx + Math.cos(a1) * tr, sy + Math.sin(a1) * tr);
            ctx.lineTo(sx + Math.cos(a2) * tr, sy + Math.sin(a2) * tr);
            ctx.lineTo(sx + Math.cos(a3) * base, sy + Math.sin(a3) * base);
          }
          ctx.closePath();
          ctx.fill();
          // отверстие оси
          ctx.fillStyle = ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.arc(sx, sy, gr * 0.3, 0, 7); ctx.fill();
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
    var roomKey = (ss.room && (ss.room.model || ss.room.kind)) || 'aud_math';
    var R = MODELS[roomKey] || MODELS.aud_math;

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
      drawRoom(ctx, cam, W, H, R);
      drawSurface(ctx, cam, W, H, R);
      drawCathedra(ctx, cam, W, H, R);
      drawFurniture(ctx, cam, W, H, R);
      drawLecturer(ctx, cam, W, H, t, R);
      drawStrokes(ctx, ss, cam, W, H, t, R);
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.font = '14px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#eef1f4';
      ctx.fillText(R.name + ' · ' + R.metr.w + '×' + R.metr.d + ' м · ' + sessTitle + ' · ' + Math.round(t) + 'с', 14, 24);
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
  Auditorium.MODELS = MODELS;
})(typeof window !== 'undefined' ? window : this);