// Graph view – browser side.
// Every page is a dot, every link a line. Dots push each other away, links pull
// like soft springs, everything drifts gently to the middle, then comes to rest.
(function () {
  'use strict';

  var box = document.querySelector('.graph');
  var canvas = box && box.querySelector('canvas');
  var dataEl = document.getElementById('graph-data');
  if (!box || !canvas || !dataEl) return;

  var data = JSON.parse(dataEl.textContent);
  if (!data.nodes.length) return;

  var ctx = canvas.getContext('2d');
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var from = new URLSearchParams(location.search).get('from');

  // ---------------------------------------------------------------- tuning

  var LINK_DISTANCE = 46;
  var CHARGE = -170;          // how strongly dots push each other away
  var CENTER = 0.045;         // pull towards the middle
  var CENTER_LONELY = 0.16;   // stronger pull for pages without links, so they stay close
  var THETA2 = 0.81;          // Barnes–Hut accuracy (0.9²): higher = faster, rougher
  var VELOCITY_KEEP = 0.58;   // friction: share of speed kept each step
  var ALPHA_MIN = 0.001;
  var ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / 300);
  var ZOOM_MIN = 0.15;
  var ZOOM_MAX = 6;

  // ---------------------------------------------------------------- data

  var nodes = data.nodes.map(function (n, i) {
    return { i: i, url: n.url, title: n.title, x: 0, y: 0, vx: 0, vy: 0, deg: 0, fx: null, fy: null, fade: 1, glow: 0 };
  });
  var links = data.links.map(function (l) { return { s: nodes[l[0]], t: nodes[l[1]] }; });
  var neighbors = nodes.map(function () { return []; });
  links.forEach(function (l) {
    l.s.deg++; l.t.deg++;
    neighbors[l.s.i].push(l.t); neighbors[l.t.i].push(l.s);
  });
  links.forEach(function (l) {
    l.strength = 1 / Math.min(l.s.deg, l.t.deg);
    l.bias = l.s.deg / (l.s.deg + l.t.deg);
  });
  nodes.forEach(function (n) { n.r = 3.2 + Math.sqrt(n.deg) * 1.7; });

  var current = null;
  nodes.forEach(function (n) { if (n.url === from) current = n; });

  // Start on a sunflower spiral: even spread, no overlaps, no randomness.
  var golden = Math.PI * (3 - Math.sqrt(5));
  nodes.forEach(function (n, i) {
    var r = 12 * Math.sqrt(0.5 + i);
    n.x = r * Math.cos(i * golden);
    n.y = r * Math.sin(i * golden);
  });

  // ---------------------------------------------------------------- physics

  var alpha = 1;
  var alphaTarget = 0;

  function jiggle() { return (Math.random() - 0.5) * 1e-6; }

  // Barnes–Hut quadtree: far-away groups of dots act as one heavy dot.
  function Cell(x0, y0, size) {
    this.x0 = x0; this.y0 = y0; this.size = size;
    this.kids = null; this.items = null;
    this.mass = 0; this.cx = 0; this.cy = 0;
  }
  Cell.prototype.insert = function (n) {
    if (!this.kids && !this.items) { this.items = [n]; return; }
    if (!this.kids) {
      if (this.size < 1e-2) { this.items.push(n); return; } // same spot: keep together
      var old = this.items;
      this.items = null;
      this.kids = [null, null, null, null];
      for (var k = 0; k < old.length; k++) this.place(old[k]);
    }
    this.place(n);
  };
  Cell.prototype.place = function (n) {
    var h = this.size / 2;
    var q = (n.x >= this.x0 + h ? 1 : 0) | (n.y >= this.y0 + h ? 2 : 0);
    if (!this.kids[q]) this.kids[q] = new Cell(this.x0 + (q & 1) * h, this.y0 + (q >> 1) * h, h);
    this.kids[q].insert(n);
  };
  Cell.prototype.sum = function () {
    var m = 0, x = 0, y = 0, k, c;
    if (this.items) {
      for (k = 0; k < this.items.length; k++) { x += this.items[k].x; y += this.items[k].y; }
      m = this.items.length;
    } else {
      for (k = 0; k < 4; k++) {
        c = this.kids[k];
        if (!c) continue;
        c.sum();
        m += c.mass; x += c.cx * c.mass; y += c.cy * c.mass;
      }
    }
    this.mass = m; this.cx = x / m; this.cy = y / m;
  };
  Cell.prototype.push = function (n) {
    var dx = this.cx - n.x, dy = this.cy - n.y, l = dx * dx + dy * dy, w, k;
    if (this.kids && (this.size * this.size) / THETA2 < l) {
      w = (CHARGE * alpha * this.mass) / l;
      n.vx += dx * w; n.vy += dy * w;
      return;
    }
    if (this.kids) {
      for (k = 0; k < 4; k++) if (this.kids[k]) this.kids[k].push(n);
      return;
    }
    for (k = 0; k < this.items.length; k++) {
      var o = this.items[k];
      if (o === n) continue;
      dx = o.x - n.x; dy = o.y - n.y;
      if (dx === 0) dx = jiggle();
      if (dy === 0) dy = jiggle();
      l = dx * dx + dy * dy;
      if (l < 1) l = Math.sqrt(l);
      w = (CHARGE * alpha) / l;
      n.vx += dx * w; n.vy += dy * w;
    }
  };

  function tick() {
    alpha += (alphaTarget - alpha) * ALPHA_DECAY;
    var i, n, l;

    // links pull like springs
    for (i = 0; i < links.length; i++) {
      l = links[i];
      var dx = l.t.x + l.t.vx - l.s.x - l.s.vx || jiggle();
      var dy = l.t.y + l.t.vy - l.s.y - l.s.vy || jiggle();
      var d = Math.sqrt(dx * dx + dy * dy);
      var k = ((d - LINK_DISTANCE) / d) * alpha * l.strength;
      dx *= k; dy *= k;
      l.t.vx -= dx * l.bias; l.t.vy -= dy * l.bias;
      l.s.vx += dx * (1 - l.bias); l.s.vy += dy * (1 - l.bias);
    }

    // dots push each other away
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      if (n.x < x0) x0 = n.x; if (n.x > x1) x1 = n.x;
      if (n.y < y0) y0 = n.y; if (n.y > y1) y1 = n.y;
    }
    var root = new Cell(x0, y0, Math.max(x1 - x0, y1 - y0, 1) + 1);
    for (i = 0; i < nodes.length; i++) root.insert(nodes[i]);
    root.sum();
    for (i = 0; i < nodes.length; i++) root.push(nodes[i]);

    // drift to the middle, then move
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      var c = n.deg ? CENTER : CENTER_LONELY;
      n.vx -= n.x * c * alpha;
      n.vy -= n.y * c * alpha;
      if (n.fx !== null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; continue; }
      n.x += (n.vx *= VELOCITY_KEEP);
      n.y += (n.vy *= VELOCITY_KEEP);
    }
  }

  // ---------------------------------------------------------------- view

  var dpr = 1, W = 0, H = 0;
  var view = { x: 0, y: 0, k: 1 };   // what is drawn
  var goal = { x: 0, y: 0, k: 1 };   // where the view glides to

  function resize() {
    var rect = box.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    wake();
  }

  function toWorld(px, py) {
    return { x: (px - W / 2 - view.x) / view.k, y: (py - H / 2 - view.y) / view.k };
  }

  function fitGoal() {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach(function (n) {
      x0 = Math.min(x0, n.x - n.r); x1 = Math.max(x1, n.x + n.r);
      y0 = Math.min(y0, n.y - n.r); y1 = Math.max(y1, n.y + n.r);
    });
    var pad = Math.min(W, H) < 500 ? 36 : 90;
    var k = Math.min((W - pad * 2) / Math.max(x1 - x0, 1), (H - pad * 2) / Math.max(y1 - y0, 1), 2.2);
    k = Math.max(ZOOM_MIN, k);
    goal.k = k;
    goal.x = -((x0 + x1) / 2) * k;
    goal.y = -((y0 + y1) / 2) * k;
  }

  function zoomAt(px, py, k) {
    k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, k));
    var wx = (px - W / 2 - goal.x) / goal.k;
    var wy = (py - H / 2 - goal.y) / goal.k;
    goal.k = k;
    goal.x = px - W / 2 - wx * k;
    goal.y = py - H / 2 - wy * k;
    wake();
  }

  // ---------------------------------------------------------------- colors

  var color = {};
  function readColors() {
    var s = getComputedStyle(document.documentElement);
    ['--text', '--muted', '--faint', '--line', '--bg'].forEach(function (v) {
      color[v.slice(2)] = s.getPropertyValue(v).trim() || '#888';
    });
    wake();
  }

  // ---------------------------------------------------------------- focus

  var focus = null;       // dot under the mouse (or tapped)
  var focusSet = null;    // that dot and its neighbours
  var labelFade = 0;      // labels of all dots (visible when zoomed in)

  function setFocus(n) {
    if (n === focus) return;
    focus = n;
    focusSet = null;
    if (n) {
      focusSet = new Set([n]);
      neighbors[n.i].forEach(function (m) { focusSet.add(m); });
    }
    canvas.classList.toggle('pointing', !!n && !drag);
    wake();
  }

  function hit(px, py) {
    var p = toWorld(px, py), best = null, bestD = Infinity;
    var slack = 7 / view.k;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var dx = n.x - p.x, dy = n.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < n.r + slack && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  // ---------------------------------------------------------------- drawing

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + view.x, H / 2 + view.y);
    ctx.scale(view.k, view.k);

    var hair = 1 / view.k;
    var i, l, n;

    // lines: quiet ones first, lit ones on top
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (i = 0; i < links.length; i++) {
      l = links[i];
      if (focusSet && (l.s === focus || l.t === focus)) continue;
      ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y);
    }
    ctx.strokeStyle = color.muted;
    ctx.globalAlpha = focusSet ? 0.06 : 0.28;
    ctx.lineWidth = hair;
    ctx.stroke();

    if (focusSet) {
      ctx.beginPath();
      for (i = 0; i < links.length; i++) {
        l = links[i];
        if (l.s !== focus && l.t !== focus) continue;
        ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y);
      }
      ctx.strokeStyle = color.text;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = hair * 1.3;
      ctx.stroke();
    }

    // dots
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      var lit = n === current || (focusSet && focusSet.has(n));
      ctx.globalAlpha = n.fade;
      ctx.fillStyle = lit || n.glow > 0.01 ? color.text : color.muted;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * (1 + n.glow * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }

    // the page you came from: a thin ring
    if (current) {
      ctx.globalAlpha = 0.9 * current.fade;
      ctx.strokeStyle = color.text;
      ctx.lineWidth = hair * 1.2;
      ctx.beginPath();
      ctx.arc(current.x, current.y, current.r + 3.5 / Math.sqrt(view.k), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // labels, drawn in screen space so text stays crisp and the same size
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = color.bg;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      var special = n === current || (focusSet && focusSet.has(n));
      var a = special ? n.fade : labelFade * n.fade;
      if (a < 0.02) continue;
      var sx = W / 2 + view.x + n.x * view.k;
      var sy = H / 2 + view.y + (n.y + n.r) * view.k + 5;
      if (sx < -100 || sx > W + 100 || sy < -20 || sy > H + 20) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = n === focus || n === current ? color.text : color.muted;
      ctx.strokeText(n.title, sx, sy);
      ctx.fillText(n.title, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- loop

  var raf = 0;
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }

  function ease(v, to, rate) {
    var d = to - v;
    return Math.abs(d) < 1e-3 ? to : v + d * rate;
  }

  function frame() {
    raf = 0;
    var busy = false;

    if (alpha > ALPHA_MIN || alphaTarget > 0) { tick(); busy = true; }

    var r = reduceMotion ? 1 : 0.2;
    var vx = ease(view.x, goal.x, r), vy = ease(view.y, goal.y, r), vk = ease(view.k, goal.k, r);
    if (vx !== view.x || vy !== view.y || vk !== view.k) busy = true;
    view.x = vx; view.y = vy; view.k = vk;

    var f = reduceMotion ? 1 : 0.16;
    var wantLabels = Math.max(0, Math.min(1, (view.k - 0.9) / 0.6));
    if (focusSet) wantLabels *= 0.25;
    var nl = ease(labelFade, wantLabels, f);
    if (nl !== labelFade) busy = true;
    labelFade = nl;

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var fadeTo = focusSet && !focusSet.has(n) ? 0.2 : 1;
      var glowTo = n === focus ? 1 : 0;
      var a = ease(n.fade, fadeTo, f), g = ease(n.glow, glowTo, f * 1.3);
      if (a !== n.fade || g !== n.glow) busy = true;
      n.fade = a; n.glow = g;
    }

    draw();
    if (busy) wake();
  }

  // ---------------------------------------------------------------- input

  var pointers = new Map();
  var drag = null;    // { node, moved, x, y }
  var pan = null;     // { x, y, gx, gy, moved }
  var pinch = null;   // { d, k, cx, cy }

  function local(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function touched() { box.classList.add('touched'); }

  canvas.addEventListener('pointerdown', function (e) {
    var p = local(e);
    pointers.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    touched();

    if (pointers.size === 2) {
      // second finger: stop dragging, start pinching
      if (drag) { drag.node.fx = drag.node.fy = null; alphaTarget = 0; drag = null; }
      pan = null;
      var ps = Array.from(pointers.values());
      pinch = {
        d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1,
        k: goal.k,
      };
      return;
    }

    var n = hit(p.x, p.y);
    if (n) {
      drag = { node: n, moved: false, x: p.x, y: p.y };
      n.fx = n.x; n.fy = n.y;
      alphaTarget = 0.28;
      if (alpha < 0.28) alpha = 0.28;
      if (e.pointerType === 'mouse') setFocus(n);
    } else {
      pan = { x: p.x, y: p.y, gx: goal.x, gy: goal.y, moved: false };
    }
    canvas.classList.add('grabbing');
    wake();
  });

  canvas.addEventListener('pointermove', function (e) {
    var p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);

    if (pinch && pointers.size === 2) {
      var ps = Array.from(pointers.values());
      var d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1;
      zoomAt((ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2, pinch.k * (d / pinch.d));
      return;
    }
    if (drag) {
      if (Math.hypot(p.x - drag.x, p.y - drag.y) > 4) drag.moved = true;
      var w = toWorld(p.x, p.y);
      drag.node.fx = w.x; drag.node.fy = w.y;
      wake();
      return;
    }
    if (pan) {
      if (Math.hypot(p.x - pan.x, p.y - pan.y) > 4) pan.moved = true;
      goal.x = view.x = pan.gx + (p.x - pan.x);
      goal.y = view.y = pan.gy + (p.y - pan.y);
      wake();
      return;
    }
    if (e.pointerType === 'mouse') setFocus(hit(p.x, p.y));
  });

  function end(e) {
    var p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    canvas.classList.remove('grabbing');

    if (drag) {
      var n = drag.node;
      n.fx = n.fy = null;
      alphaTarget = 0;
      if (!drag.moved && e.type === 'pointerup') {
        // mouse: click opens. touch: first tap shows, second tap opens.
        if (e.pointerType === 'mouse' || focus === n) { location.href = n.url; return; }
        setFocus(n);
      }
      drag = null;
      if (e.pointerType === 'mouse') setFocus(hit(p.x, p.y));
    } else if (pan) {
      if (!pan.moved && e.pointerType !== 'mouse') setFocus(null);
      pan = null;
    }
    wake();
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse' && !drag) setFocus(null);
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    touched();
    var p = local(e);
    var dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
    zoomAt(p.x, p.y, goal.k * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)));
  }, { passive: false });

  canvas.addEventListener('dblclick', function (e) {
    var p = local(e);
    if (!hit(p.x, p.y)) { fitGoal(); wake(); }
  });

  var fitButton = box.querySelector('.graph-fit');
  if (fitButton) fitButton.addEventListener('click', function () { fitGoal(); wake(); });

  window.addEventListener('keydown', function (e) {
    if (e.target !== document.body) return;
    if (e.key === '0') { fitGoal(); wake(); }
    else if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, goal.k * 1.25);
    else if (e.key === '-') zoomAt(W / 2, H / 2, goal.k / 1.25);
  });

  // ---------------------------------------------------------------- start

  readColors();
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);
  new ResizeObserver(resize).observe(box);
  resize();

  // Let the shape form out of sight, then show it and let it settle live.
  var warm = reduceMotion ? 400 : 140;
  for (var s = 0; s < warm && alpha > ALPHA_MIN; s++) tick();
  fitGoal();
  view.x = goal.x; view.y = goal.y;
  view.k = reduceMotion ? goal.k : goal.k * 0.94;
  requestAnimationFrame(function () { box.classList.add('ready'); });
  wake();
})();
