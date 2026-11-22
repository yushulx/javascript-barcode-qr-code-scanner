/*
 * Single-canvas renderer for the GS1 2D Retail POS Test Lab.
 * All game scenery, controls, onboarding, POS terminal and trace live here.
 */
(function () {
  'use strict';

  var BODY = '"Open Sans", "Segoe UI", Arial, sans-serif';
  var HEAD = 'Oswald, "Segoe UI", Arial, sans-serif';
  var MONO = '"Courier New", monospace';

  var C = {
    bg: '#e9efec',
    ink: '#26312d',
    muted: '#65716c',
    faint: '#98a39e',
    line: '#d6ded9',
    paper: '#fbf7ed',
    cream: '#f3ecdc',
    white: '#ffffff',
    orange: '#fe8e14',
    orangeDark: '#b85d00',
    orangeSoft: '#fff2dd',
    green: '#23734d',
    greenSoft: '#e8f5ed',
    yellow: '#8a5b08',
    yellowSoft: '#fff5d9',
    red: '#a94137',
    redSoft: '#faece9',
    slate: '#536a6a',
    slateSoft: '#edf2f1',
    dark: '#202b29',
    belt: '#394442',
    scene: '#dfe9e2',
    floor: '#d2bca0'
  };

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }
  function easeInOutCubic(t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function setFont(ctx, size, weight, family) {
    ctx.font = (weight || '400') + ' ' + size + 'px ' + (family || BODY);
  }

  function text(ctx, value, x, y, size, color, weight, family, align) {
    setFont(ctx, size, weight, family);
    ctx.fillStyle = color || C.ink;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), x, y);
    ctx.textAlign = 'left';
  }

  function ellipsis(ctx, value, maxWidth) {
    var string = String(value);
    if (ctx.measureText(string).width <= maxWidth) return string;
    var end = string.length;
    while (end > 0 && ctx.measureText(string.slice(0, end) + '…').width > maxWidth) end -= 1;
    return string.slice(0, end) + '…';
  }

  function wrapped(ctx, value, x, y, maxWidth, lineHeight, maxLines, size, color, weight, family) {
    setFont(ctx, size, weight, family);
    ctx.fillStyle = color || C.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var words = String(value).split(/\s+/);
    var line = '';
    var lines = [];
    words.forEach(function (word) {
      var trial = line ? line + ' ' + word : word;
      if (ctx.measureText(trial).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = trial;
    });
    if (line) lines.push(line);
    lines.slice(0, maxLines || 2).forEach(function (row, index) {
      ctx.fillText(row, x, y + index * lineHeight);
    });
    ctx.textBaseline = 'middle';
    return Math.min(lines.length, maxLines || 2) * lineHeight;
  }

  function rounded(ctx, x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fillRound(ctx, x, y, w, h, r, fill) {
    rounded(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function strokeRound(ctx, x, y, w, h, r, stroke, width) {
    rounded(ctx, x, y, w, h, r);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width || 1;
    ctx.stroke();
  }

  function drawContain(ctx, image, x, y, w, h, smoothing) {
    if (!image || !image.width || !image.height) return;
    var scale = Math.min(w / image.width, h / image.height);
    var dw = image.width * scale;
    var dh = image.height * scale;
    var old = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = smoothing !== false;
    ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.imageSmoothingEnabled = old;
  }

  function scannerGlyph(ctx, x, y, s, color) {
    ctx.strokeStyle = color || C.orange;
    ctx.lineWidth = Math.max(1.5, s * 0.09);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var a = s * 0.25;
    var b = s * 0.45;
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function (corner) {
      ctx.beginPath();
      ctx.moveTo(x + corner[0] * b, y + corner[1] * (b - a));
      ctx.lineTo(x + corner[0] * b, y + corner[1] * b);
      ctx.lineTo(x + corner[0] * (b - a), y + corner[1] * b);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(x - s * 0.38, y);
    ctx.lineTo(x + s * 0.38, y);
    ctx.stroke();
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.hits = [];
      this.hoverId = '';
      this.allowHits = true;
      this.mobile = false;
      this.W = 1200;
      this.H = 800;
      this.layout = null;
      this.cssWidth = 0;
      this.scale = 1;
    }

    resize(force) {
      var rect = this.canvas.getBoundingClientRect();
      var width = Math.max(280, rect.width || 1200);
      if (!force && Math.abs(width - this.cssWidth) < 1) return;
      this.cssWidth = width;
      this.mobile = width < 690;
      this.W = this.mobile ? 420 : 1200;
      this.H = this.mobile ? 948 : 800;
      this.scale = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.W * this.scale);
      this.canvas.height = Math.round(this.H * this.scale);
      this.canvas.style.aspectRatio = this.W + ' / ' + this.H;
      this.layout = this.makeLayout();
    }

    makeLayout() {
      if (this.mobile) {
        return {
          hud: { x: 16, y: 10, w: 388, h: 30 },
          tabs: { x: 16, y: 46, w: 388, h: 32 },
          mission: { x: 16, y: 88, w: 388, h: 112 },
          stage: { x: 16, y: 208, w: 388, h: 252 },
          controls: { x: 16, y: 468, w: 388, h: 48 },
          terminal: { x: 16, y: 526, w: 388, h: 300 },
          trace: { x: 16, y: 834, w: 388, h: 96 }
        };
      }
      return {
        hud: { x: 24, y: 10, w: 1152, h: 52 },
        tabs: { x: 336, y: 18, w: 394, h: 36 },
        mission: { x: 24, y: 76, w: 1152, h: 88 },
        stage: { x: 24, y: 176, w: 770, h: 450 },
        controls: { x: 24, y: 636, w: 770, h: 60 },
        terminal: { x: 812, y: 176, w: 364, h: 520 },
        trace: { x: 24, y: 706, w: 1152, h: 78 }
      };
    }

    addHit(id, x, y, w, h, disabled, cursor) {
      if (!this.allowHits) return;
      this.hits.push({ id: id, x: x, y: y, w: w, h: h, disabled: !!disabled, cursor: cursor || 'pointer' });
    }

    addOverlayHit(id, x, y, w, h) {
      this.hits.push({ id: id, x: x, y: y, w: w, h: h, disabled: false, cursor: 'pointer' });
    }

    hitTest(x, y) {
      for (var i = this.hits.length - 1; i >= 0; i--) {
        var hit = this.hits[i];
        if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) return hit;
      }
      return null;
    }

    toLogical(clientX, clientY) {
      var rect = this.canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) * this.W / rect.width,
        y: (clientY - rect.top) * this.H / rect.height
      };
    }

    draw(state, now) {
      this.resize(false);
      var ctx = this.ctx;
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      this.hits = [];
      this.allowHits = !state.tutorialOpen && !state.completeOpen;
      this.reduceMotion = state.reduceMotion;

      this.drawBackground();
      this.drawHud(state, now);
      this.drawMission(state, now);
      this.drawStage(state, now);
      this.drawControls(state, now);
      this.drawTerminal(state, now);
      this.drawTrace(state, now);

      if (state.justPassedAt && now - state.justPassedAt < 2400) this.drawPassBurst(state, now);
      if (state.toast && now < state.toast.until) this.drawToast(state, now);

      if (state.completeOpen) this.drawComplete(state, now);
      else if (state.tutorialOpen) this.drawTour(state, now);
    }

    drawBackground() {
      var ctx = this.ctx;
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, this.W, this.H);
      var grad = ctx.createRadialGradient(this.W * 0.78, 30, 20, this.W * 0.78, 30, this.W * 0.72);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = 'rgba(48,116,131,0.035)';
      for (var i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(this.W - 80 - i * 34, 70 + (i % 3) * 35, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawHud(state, now) {
      var L = this.layout.hud;
      var ctx = this.ctx;
      var brandY = L.y + (this.mobile ? 10 : 16);
      fillRound(ctx, L.x, brandY - 11, 22, 22, 6, C.dark);
      scannerGlyph(ctx, L.x + 11, brandY, 15, C.orange);
      text(ctx, 'GS1 CHECKOUT LAB', L.x + 30, brandY - 4, this.mobile ? 11 : 15, C.ink, '600', HEAD);
      text(ctx, this.mobile ? '2D RETAIL POS' : 'DUAL-MARKING · 2D RETAIL POS TEST LAB',
        L.x + 30, brandY + 11, this.mobile ? 6.5 : 8, C.muted, '600');

      var count = Object.keys(state.completed).filter(function (key) { return state.completed[key]; }).length;
      if (this.mobile) {
        text(ctx, count + '/5', L.x + L.w - 98, brandY, 11, C.ink, '700', HEAD, 'right');
        this.smallHudButton('motion', state.reduceMotion ? 'MOTION OFF' : 'MOTION ON', L.x + L.w - 88, brandY - 11, 77, 22, state);
        this.circleHudButton('help', '?', L.x + L.w - 8, brandY - 11, state);
      } else {
        var tabs = this.layout.tabs;
        this.drawTabs(state, tabs);
        var px = 746;
        text(ctx, 'LEVELS', px, L.y + 11, 7.5, C.muted, '700', HEAD);
        for (var i = 0; i < 5; i++) {
          var id = 'level-' + (i + 1);
          var x = px + 8 + i * 41;
          var active = state.mode === 'guided' && state.scenarioIndex === i;
          var done = state.completed[(i + 1)];
          fillRound(ctx, x, L.y + 22, 33, 22, 5, active ? C.dark : (done ? C.greenSoft : '#f5f8f6'));
          strokeRound(ctx, x, L.y + 22, 33, 22, 5, active ? C.dark : (done ? '#a6ceb7' : '#d7dfdb'), 1);
          text(ctx, done ? '✓' : String(i + 1), x + 16.5, L.y + 33, 9, active ? '#fff' : (done ? C.green : C.muted), '700', HEAD, 'center');
          this.addHit(id, x, L.y + 22, 33, 22, state.busy);
        }
        text(ctx, count + '/5', px + 218, L.y + 33, 12, C.ink, '600', HEAD);
        this.smallHudButton('motion', state.reduceMotion ? 'MOTION: REDUCED' : 'MOTION: ON',
          L.x + L.w - 146, L.y + 22, 113, 22, state);
        this.circleHudButton('help', '?', L.x + L.w - 21, L.y + 22, state);
      }
    }

    drawTabs(state, box) {
      var ctx = this.ctx;
      fillRound(ctx, box.x, box.y, box.w, box.h, box.h / 2, '#dfe7e3');
      var items = [
        { mode: 'guided', label: 'GUIDED' },
        { mode: 'sandbox', label: 'SANDBOX' },
        { mode: 'sdk', label: this.mobile ? 'REAL SDK' : 'REAL SDK DECODE' }
      ];
      var gap = 4;
      var tabW = (box.w - gap * 2) / 3;
      var self = this;
      items.forEach(function (item, index) {
        var x = box.x + index * (tabW + gap);
        var active = state.mode === item.mode;
        if (active) {
          ctx.save();
          ctx.shadowColor = 'rgba(27,37,34,.13)';
          ctx.shadowBlur = 5;
          ctx.shadowOffsetY = 1;
          fillRound(ctx, x, box.y, tabW, box.h, box.h / 2, C.white);
          ctx.restore();
        }
        text(ctx, item.label, x + tabW / 2, box.y + box.h / 2 + 1, self.mobile ? 9 : 10,
          active ? C.ink : C.muted, active ? '700' : '600', HEAD, 'center');
        self.addHit('tab-' + item.mode, x, box.y, tabW, box.h, state.busy);
      });
    }

    smallHudButton(id, label, x, y, w, h, state) {
      var hover = this.hoverId === id;
      fillRound(this.ctx, x, y, w, h, h / 2, hover ? '#e4ebe7' : 'rgba(255,255,255,.55)');
      strokeRound(this.ctx, x, y, w, h, h / 2, '#d5ddd8', 1);
      text(this.ctx, label, x + w / 2, y + h / 2 + 1, this.mobile ? 6 : 7, C.muted, '700', HEAD, 'center');
      this.addHit(id, x, y, w, h, state.busy);
    }

    circleHudButton(id, label, x, y, state) {
      var ctx = this.ctx;
      var hover = this.hoverId === id;
      ctx.beginPath();
      ctx.arc(x, y + 11, 11, 0, Math.PI * 2);
      ctx.fillStyle = hover ? '#e2ebe6' : '#f7faf8';
      ctx.fill();
      ctx.strokeStyle = '#d5ddd8';
      ctx.stroke();
      text(ctx, label, x, y + 12, 11, C.ink, '700', HEAD, 'center');
      this.addHit(id, x - 11, y, 22, 22, state.busy);
    }

    drawMission(state, now) {
      var box = this.layout.mission;
      var ctx = this.ctx;
      ctx.save();
      ctx.shadowColor = 'rgba(30,42,36,.055)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      fillRound(ctx, box.x, box.y, box.w, box.h, 9, C.paper);
      ctx.restore();
      fillRound(ctx, box.x, box.y + 10, 4, box.h - 20, 2, C.orange);

      var title;
      var kicker;
      var objective;
      var hint;
      var goal;
      var goalSub;

      if (state.mode === 'guided') {
        var sc = state.scenario;
        kicker = 'LEVEL ' + sc.number + ' OF 5' + (state.completed[sc.number] ? ' · COMPLETED' : '');
        title = sc.title;
        objective = sc.goal;
        hint = state.hint;
        if (sc.id === 'two-products') {
          goal = state.cartQty >= 2 ? '2 UNITS' : (state.cartQty === 1 ? '1 OF 2' : '2 UNITS');
          goalSub = state.cartQty === 1 ? 'second package waiting' : 'separate presentations';
        } else if (sc.id === 'mismatch') {
          goal = 'REVIEW';
          goalSub = 'no automatic add';
        } else {
          goal = '1 UNIT';
          goalSub = sc.carriers === 'both' ? '2 reads · 1 commit' : (sc.carriers === '1d' ? 'EAN-13 path' : 'QR path');
        }
      } else if (state.mode === 'sandbox') {
        kicker = 'FREE SANDBOX · BUILD A PASS';
        title = 'Try your own carrier combination';
        objective = 'Cycle a setting below, then send the package through the scanner.';
        hint = state.hint;
        goal = 'EXPLORE';
        goalSub = 'no fixed mission';
      } else {
        kicker = 'REAL DECODE · DYNAMSOFT SDK';
        title = 'Decode the pixels, not the fixture';
        objective = 'The current sandbox package is rendered to a real image and sent to Dynamsoft.';
        hint = state.sdkStatus || 'SDK loads only when you choose Decode Package.';
        goal = 'SDK READ';
        goalSub = 'no synthesized success';
      }

      if (!this.mobile) {
        text(ctx, kicker, box.x + 20, box.y + 16, 9, state.mode === 'guided' ? C.orangeDark : C.slate, '700', HEAD);
        text(ctx, title, box.x + 20, box.y + 37, 22, C.ink, '500', HEAD);
        if (state.mode === 'sandbox') {
          this.drawSandboxChips(state, box, true);
        } else {
          wrapped(ctx, objective, box.x + 20, box.y + 51, box.w - 330, 15, 1, 11, C.muted);
          wrapped(ctx, hint, box.x + 20, box.y + 69, box.w - 330, 14, 1, 10.5, C.slate, '600');
        }

        var gx = box.x + box.w - 288;
        fillRound(ctx, gx, box.y + 12, 266, box.h - 24, 6, '#fffdf8');
        strokeRound(ctx, gx, box.y + 12, 266, box.h - 24, 6, '#e7ddcc', 1);
        text(ctx, 'GOAL', gx + 14, box.y + 24, 7, C.muted, '700', HEAD);
        text(ctx, goal, gx + 14, box.y + 43, 16, C.ink, '600', HEAD);
        text(ctx, goalSub, gx + 14, box.y + 60, 8.5, C.muted);
        this.drawGoalIcon(goal, gx + 232, box.y + 43, state);
      } else {
        text(ctx, kicker, box.x + 14, box.y + 13, 7.2, state.mode === 'guided' ? C.orangeDark : C.slate, '700', HEAD);
        text(ctx, ellipsis(ctx, title, box.w - 100), box.x + 14, box.y + 31, 17, C.ink, '500', HEAD);
        if (state.mode !== 'sandbox') {
          text(ctx, ellipsis(ctx, objective, box.w - 100), box.x + 14, box.y + 47, 9.2, C.muted);
          text(ctx, ellipsis(ctx, hint, box.w - 28), box.x + 14, box.y + 62, 8.8, C.slate, '600');
        }
        fillRound(ctx, box.x + box.w - 79, box.y + 12, 65, 26, 5, C.orangeSoft);
        text(ctx, goal, box.x + box.w - 46, box.y + 25, 8, C.orangeDark, '700', HEAD, 'center');
        if (state.mode === 'guided') {
          for (var i = 0; i < 5; i++) {
            var lx = box.x + 14 + i * 26;
            var ly = box.y + box.h - 17;
            var done = state.completed[i + 1];
            var active = state.scenarioIndex === i;
            ctx.beginPath();
            ctx.arc(lx + 7, ly, 7, 0, Math.PI * 2);
            ctx.fillStyle = active ? C.dark : (done ? C.green : '#e8e0d2');
            ctx.fill();
            text(ctx, done ? '✓' : String(i + 1), lx + 7, ly + 1, 6, active || done ? '#fff' : C.muted, '700', HEAD, 'center');
            this.addHit('level-' + (i + 1), lx - 2, ly - 9, 18, 18, state.busy);
          }
          text(ctx, Object.keys(state.completed).filter(function (k) { return state.completed[k]; }).length + '/5 COMPLETE',
            box.x + 150, box.y + box.h - 17, 6.5, C.muted, '700', HEAD);
        } else if (state.mode === 'sandbox') {
          this.drawSandboxChips(state, box, false);
        }
      }
      this.drawBusyLight(state, now, box);
    }

    drawBusyLight(state, now, box) {
      if (!state.busy) return;
      var ctx = this.ctx;
      var x = box.x + box.w - (this.mobile ? 102 : 310);
      var y = box.y + box.h - (this.mobile ? 12 : 13);
      ctx.fillStyle = 'rgba(254,142,20,.3)';
      ctx.beginPath();
      ctx.arc(x, y, 4 + Math.sin(now / 180) * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.orange;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    drawGoalIcon(goal, x, y, state) {
      var ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      if (goal === 'REVIEW') {
        ctx.strokeStyle = C.yellow;
        ctx.fillStyle = C.yellowSoft;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -12); ctx.lineTo(13, 10); ctx.lineTo(-13, 10); ctx.closePath();
        ctx.fill(); ctx.stroke();
        text(ctx, '!', 0, 4, 11, C.yellow, '700', HEAD, 'center');
      } else {
        ctx.strokeStyle = C.green;
        ctx.fillStyle = C.greenSoft;
        ctx.lineWidth = 1.2;
        rounded(ctx, -13, -10, 26, 22, 4);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-7, 0); ctx.lineTo(-2, 5); ctx.lineTo(8, -5);
        ctx.strokeStyle = C.green; ctx.stroke();
      }
      ctx.restore();
    }

    drawSandboxChips(state, box, wide) {
      var ctx = this.ctx;
      var chips = [
        { id: 'chip-product', label: 'PRODUCT', value: state.sandboxProductLabel },
        { id: 'chip-carriers', label: 'CARRIERS', value: state.sandboxCarrierLabel },
        { id: 'chip-qr', label: 'QR DATA', value: state.sandboxQrLabel },
        { id: 'chip-dataset', label: 'DATASET', value: state.sandboxDatasetLabel }
      ];
      if (wide) {
        chips.forEach(function (chip, index) {
          var w = 194;
          var x = box.x + 20 + index * 200;
          fillRound(ctx, x, box.y + 50, w, 27, 5, '#f2eadc');
          text(ctx, chip.label + '  ›', x + 8, box.y + 59, 6.6, C.muted, '700', HEAD);
          text(ctx, ellipsis(ctx, chip.value, w - 16), x + 8, box.y + 70, 8.6, C.ink, '700');
        });
      } else {
        chips.forEach(function (chip, index) {
          var col = index % 2;
          var row = Math.floor(index / 2);
          var x = box.x + 14 + col * 142;
          var y = box.y + 70 + row * 20;
          fillRound(ctx, x, y, 134, 18, 4, '#f2eadc');
          text(ctx, chip.label + ':', x + 6, y + 9, 6.2, C.muted, '700', HEAD);
          text(ctx, ellipsis(ctx, chip.value, 78), x + 54, y + 9, 7.2, C.ink, '700');
        });
      }
    }

    chipHits(state, hitList) {
      // Sandbox chips are registered separately after their geometry is known.
      return hitList;
    }

    drawStage(state, now) {
      var box = this.layout.stage;
      var ctx = this.ctx;
      ctx.save();
      ctx.shadowColor = 'rgba(27,40,34,.12)';
      ctx.shadowBlur = 17;
      ctx.shadowOffsetY = 5;
      fillRound(ctx, box.x, box.y, box.w, box.h, 12, C.scene);
      ctx.restore();

      ctx.save();
      rounded(ctx, box.x, box.y, box.w, box.h, 12);
      ctx.clip();
      this.drawStore(box, now);
      this.drawConveyor(box, now);
      var geom = this.stageGeometry(box);
      this.drawPack(state, geom, now);
      this.drawScanner(state, geom, now);
      this.drawStageLabels(state, geom, now);
      if (state.drag.active) this.drawDragPrompt(state, geom);
      this.drawMotionLines(state, geom, now);
      ctx.restore();
      strokeRound(ctx, box.x, box.y, box.w, box.h, 12, '#ccd8d1', 1);

      // Sandbox mini controls remain live even while the scene repaints.
      if (state.mode === 'sandbox') this.registerSandboxChipHits(state);
    }

    registerSandboxChipHits(state) {
      var box = this.layout.mission;
      if (!this.mobile) {
        [0,1,2,3].forEach(function (index) {
          this.addHit(['chip-product','chip-carriers','chip-qr','chip-dataset'][index],
            box.x + 20 + index * 200, box.y + 50, 194, 27, state.busy);
        }, this);
      } else {
        [0,1,2,3].forEach(function (index) {
          var col = index % 2;
          var row = Math.floor(index / 2);
          this.addHit(['chip-product','chip-carriers','chip-qr','chip-dataset'][index],
            box.x + 14 + col * 142, box.y + 70 + row * 20, 134, 18, state.busy);
        }, this);
      }
    }

    stageGeometry(box) {
      var mobile = this.mobile;
      var beltH = mobile ? 58 : 70;
      var beltY = box.y + box.h - beltH;
      var packW = mobile ? 218 : 326;
      var packH = mobile ? 172 : 246;
      var packBaseX = box.x + (mobile ? 18 : 34);
      var packBaseY = beltY - packH + 14;
      var scannerW = mobile ? 67 : 108;
      var scannerX = box.x + box.w - (mobile ? 77 : 135);
      var scannerY = packBaseY - (mobile ? 16 : 24);
      var scannerH = packH + (mobile ? 52 : 76);
      var travel = scannerX - (packBaseX + packW) + (mobile ? 5 : 14);
      return {
        box: box, beltY: beltY, beltH: beltH,
        packW: packW, packH: packH, packBaseX: packBaseX, packBaseY: packBaseY,
        scanner: { x: scannerX, y: scannerY, w: scannerW, h: scannerH },
        travel: travel, beamY: packBaseY + packH * 0.72
      };
    }

    drawStore(box, now) {
      var ctx = this.ctx;
      var grad = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
      grad.addColorStop(0, '#e8eee8');
      grad.addColorStop(0.55, '#dbe6df');
      grad.addColorStop(0.56, '#cfb99d');
      grad.addColorStop(1, '#b99d7a');
      ctx.fillStyle = grad;
      ctx.fillRect(box.x, box.y, box.w, box.h);

      // Tiled checkout floor.
      ctx.strokeStyle = 'rgba(112,86,57,.16)';
      ctx.lineWidth = 1;
      var floorY = box.y + box.h * 0.56;
      for (var x = box.x - 30; x < box.x + box.w + 40; x += 58) {
        ctx.beginPath();
        ctx.moveTo(x, floorY);
        ctx.lineTo(x - 32, box.y + box.h);
        ctx.stroke();
      }
      for (var row = 0; row < 4; row++) {
        var y = floorY + row * 20;
        ctx.beginPath();
        ctx.moveTo(box.x, y);
        ctx.lineTo(box.x + box.w, y);
        ctx.strokeStyle = 'rgba(112,86,57,.11)';
        ctx.stroke();
      }

      // Back-wall shelving, deliberately low contrast behind the play area.
      var shelfX = box.x + 26;
      var shelfY = box.y + 18;
      var shelfW = box.w - (this.mobile ? 112 : 190);
      ctx.fillStyle = '#b7c8bd';
      ctx.fillRect(shelfX, shelfY, shelfW, 82);
      ctx.fillStyle = '#97afa2';
      ctx.fillRect(shelfX, shelfY + 40, shelfW, 3);
      ctx.fillStyle = '#c8d6ce';
      ctx.fillRect(shelfX, shelfY, shelfW, 5);
      var colors = ['#dd9660','#c7b46e','#7aa5a1','#c78b83','#8eaa76'];
      for (var i = 0; i < 10; i++) {
        var ix = shelfX + 8 + i * ((shelfW - 16) / 10);
        var ih = 14 + (i % 3) * 8;
        ctx.fillStyle = colors[i % colors.length];
        rounded(ctx, ix, shelfY + 35 - ih, 10, ih, 2);
        ctx.fill();
        rounded(ctx, ix + 12, shelfY + 75 - ih + 2, 8, ih - 2, 2);
        ctx.fill();
      }

      // Hanging lane sign.
      ctx.strokeStyle = '#707c78';
      ctx.beginPath();
      ctx.moveTo(box.x + box.w * 0.12, box.y);
      ctx.lineTo(box.x + box.w * 0.12, box.y + 16);
      ctx.moveTo(box.x + box.w * 0.2, box.y);
      ctx.lineTo(box.x + box.w * 0.2, box.y + 16);
      ctx.stroke();
      fillRound(ctx, box.x + 48, box.y + 13, 104, 19, 4, C.dark);
      text(ctx, 'CHECKOUT 04', box.x + 100, box.y + 23, 8, C.paper, '600', HEAD, 'center');

      // Small overhead lights.
      [0.42, 0.68].forEach(function (ratio) {
        var lx = box.x + box.w * ratio;
        ctx.fillStyle = 'rgba(255,241,199,.35)';
        ctx.fillRect(lx - 2, box.y, 4, 9);
        ctx.beginPath();
        ctx.arc(lx, box.y + 13, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#f9e6a4';
        ctx.fill();
      });
    }

    drawConveyor(box, now) {
      var ctx = this.ctx;
      var mobile = this.mobile;
      var y = box.y + box.h - (mobile ? 58 : 70);
      var x = box.x + 18;
      var w = box.w - (mobile ? 88 : 205);
      fillRound(ctx, x, y + 12, w, mobile ? 31 : 40, 8, C.belt);
      fillRound(ctx, x, y + 3, w, 12, 6, '#596461');
      ctx.fillStyle = '#232e2c';
      ctx.fillRect(x + 8, y + 17, w - 16, mobile ? 19 : 28);
      var shift = this.reduceMotion ? 0 : (now * 0.035) % 38;
      ctx.strokeStyle = 'rgba(185,201,194,.28)';
      ctx.lineWidth = 2;
      for (var sx = x + 10 + shift; sx < x + w - 5; sx += 38) {
        ctx.beginPath();
        ctx.moveTo(sx, y + 19);
        ctx.lineTo(sx + 8, y + (mobile ? 30 : 39));
        ctx.stroke();
      }
      // Legs and rollers.
      ctx.fillStyle = '#2b3533';
      ctx.fillRect(x + 24, y + (mobile ? 42 : 54), 7, mobile ? 8 : 12);
      ctx.fillRect(x + w - 34, y + (mobile ? 42 : 54), 7, mobile ? 8 : 12);
      for (var rx = x + 18; rx < x + w - 10; rx += 32) {
        ctx.beginPath();
        ctx.arc(rx, y + (mobile ? 49 : 62), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#7e8985';
        ctx.fill();
      }
      text(ctx, 'CONVEYOR', x + 8, y - 6, 6.5, 'rgba(49,65,59,.65)', '700', HEAD);
      // Motion cue on the belt.
      ctx.strokeStyle = 'rgba(254,142,20,.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w - 14, y - 8);
      ctx.lineTo(x + w - 3, y - 3);
      ctx.lineTo(x + w - 14, y + 2);
      ctx.stroke();
    }

    packMotion(state, geom, now) {
      var phase = state.phase;
      var elapsed = Math.max(0, now - state.phaseStart);
      var dx = 0;
      var alpha = 1;
      if (phase === 'feed') {
        var p = this.reduceMotion ? 1 : clamp(elapsed / 460, 0, 1);
        dx = geom.travel * easeOutCubic(p);
      } else if (phase === 'scan') {
        dx = geom.travel;
      } else if (phase === 'exit') {
        var q = this.reduceMotion ? 1 : clamp(elapsed / 380, 0, 1);
        dx = geom.travel + 45 * easeOutCubic(q);
        alpha = 1 - 0.72 * q;
      } else if (phase === 'done') {
        dx = geom.travel + 40;
        alpha = 0.38;
      }
      return { x: geom.packBaseX + dx, y: geom.packBaseY, alpha: alpha };
    }

    drawPack(state, geom, now) {
      var motion = this.packMotion(state, geom, now);
      var x = motion.x;
      var y = motion.y;
      var w = geom.packW;
      var h = geom.packH;
      var ctx = this.ctx;
      if (state.drag.active) {
        x = clamp(state.drag.x - w * 0.45, geom.box.x + 8, geom.box.x + geom.box.w - w - 118);
        y = clamp(state.drag.y - h * 0.35, geom.box.y + 10, geom.box.y + geom.box.h - h - 12);
      }
      state.packageRect = { x: x, y: y, w: w, h: h };
      ctx.save();
      ctx.globalAlpha = motion.alpha;
      if (state.drag.active) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(-0.025);
        ctx.translate(-(x + w / 2), -(y + h / 2));
      }
      ctx.shadowColor = 'rgba(37,35,25,.24)';
      ctx.shadowBlur = this.mobile ? 8 : 15;
      ctx.shadowOffsetY = this.mobile ? 3 : 7;
      fillRound(ctx, x, y, w, h, 7, '#fffdf6');
      ctx.shadowColor = 'transparent';
      fillRound(ctx, x, y, w, 7, 7, state.product.color);
      ctx.fillStyle = state.product.color;
      ctx.fillRect(x, y + 3, w, 5);

      var pad = this.mobile ? 10 : 15;
      text(ctx, state.product.brand, x + pad, y + (this.mobile ? 19 : 23), this.mobile ? 6.5 : 8.5, C.ink, '700', HEAD);
      // Specimen mark.
      fillRound(ctx, x + w - pad - (this.mobile ? 40 : 50), y + (this.mobile ? 11 : 13), this.mobile ? 38 : 48, this.mobile ? 12 : 15, 2, '#f1eee5');
      text(ctx, 'SYNTHETIC', x + w - pad - (this.mobile ? 21 : 25), y + (this.mobile ? 17 : 20), this.mobile ? 4.8 : 5.5, C.muted, '700', HEAD, 'center');

      var nameSize = this.mobile ? 14 : 20;
      var name = ellipsis(ctx, state.product.shortName, w - pad * 2);
      text(ctx, name, x + pad, y + (this.mobile ? 39 : 51), nameSize, C.ink, '600', HEAD);
      text(ctx, ellipsis(ctx, state.product.detail, w - pad * 2), x + pad, y + (this.mobile ? 54 : 71), this.mobile ? 5.8 : 7.5, C.muted);

      // Abstract product artwork in the corner.
      var artX = x + w - pad - (this.mobile ? 28 : 44);
      var artY = y + (this.mobile ? 37 : 47);
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(artX, artY, this.mobile ? 15 : 23, 0, Math.PI * 2);
      ctx.fillStyle = state.product.color;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(artX + (this.mobile ? 10 : 16), artY - (this.mobile ? 9 : 14), this.mobile ? 9 : 14, this.mobile ? 5 : 8, -0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#6c9c6d';
      ctx.fill();
      ctx.restore();

      var panelY = y + h - (this.mobile ? 91 : 126);
      var panelH = this.mobile ? 81 : 112;
      fillRound(ctx, x + pad, panelY, w - pad * 2, panelH, 4, '#ffffff');
      strokeRound(ctx, x + pad, panelY, w - pad * 2, panelH, 4, '#e4e2d9', 1);
      var innerPad = this.mobile ? 6 : 8;
      var qrSize = this.mobile ? 63 : 88;
      var eanW = w - pad * 2 - qrSize - innerPad * 3;
      var eanX = x + pad + innerPad;
      var qrX = x + w - pad - innerPad - qrSize;
      var codeY = panelY + (this.mobile ? 17 : 21);
      var codeH = this.mobile ? 55 : 80;

      text(ctx, 'EAN-13', eanX, panelY + (this.mobile ? 9 : 11), this.mobile ? 5 : 6.5, C.muted, '700', HEAD);
      text(ctx, state.fixture.qrType === 'marketing' ? 'URL QR' : 'GS1 DIGITAL LINK QR',
        qrX, panelY + (this.mobile ? 9 : 11), this.mobile ? 5 : 6.5, C.muted, '700', HEAD);

      if (state.assets && state.assets.ean) {
        drawContain(ctx, state.assets.ean, eanX, codeY, eanW, codeH, false);
      } else {
        fillRound(ctx, eanX, codeY, eanW, codeH, 3, '#f4f4f0');
        text(ctx, 'rendering EAN-13…', eanX + eanW / 2, codeY + codeH / 2, 6, C.muted, '400', BODY, 'center');
      }
      if (state.assets && state.assets.qr) {
        drawContain(ctx, state.assets.qr, qrX, codeY, qrSize, codeH, false);
      } else {
        fillRound(ctx, qrX, codeY, qrSize, codeH, 3, '#f4f4f0');
      }
      text(ctx, ellipsis(ctx, state.eanText || '', eanW), eanX, panelY + panelH - (this.mobile ? 5 : 7), this.mobile ? 5.5 : 7, C.ink, '400', MONO);

      var reads = state.lastReadFormats || [];
      var conflict = state.lastDecision && state.lastDecision.reason === 'GTIN_CONFLICT';
      var eanRead = reads.some(function (format) { return /EAN|UPC/.test(format); });
      var qrRead = reads.some(function (format) { return /QR|MATRIX/.test(format); });
      if (eanRead) strokeRound(ctx, eanX - 3, panelY + 3, eanW + 6, panelH - 6, 3, conflict ? C.red : C.green, 2);
      if (qrRead) strokeRound(ctx, qrX - 3, panelY + 3, qrSize + 6, panelH - 6, 3, conflict ? C.red : C.green, 2);

      // Dim the carrier that this pass did not ask the scanner to read.
      if (state.fixture.carriers === '2d') {
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.fillRect(eanX - 2, panelY + 2, eanW + 4, panelH - 4);
        text(ctx, 'NOT READ', eanX + eanW / 2, panelY + panelH / 2, 6, C.muted, '700', HEAD, 'center');
      } else if (state.fixture.carriers === '1d') {
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.fillRect(qrX - 2, panelY + 2, qrSize + 4, panelH - 4);
      }

      if (state.phase === 'scan' && !this.reduceMotion) {
        var scanY = panelY + ((now - state.phaseStart) * 0.18) % panelH;
        ctx.strokeStyle = 'rgba(254,142,20,.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(eanX, scanY);
        ctx.lineTo(qrX + qrSize, scanY);
        ctx.stroke();
      }
      ctx.restore();
      strokeRound(ctx, x, y, w, h, 7, state.drag.active ? C.orange : '#d7cdbd', state.drag.active ? 2 : 1);

      if (state.mode === 'guided' && state.scenario.id === 'two-products') {
        fillRound(ctx, x + w - (this.mobile ? 66 : 102), y - (this.mobile ? 14 : 18), this.mobile ? 64 : 100, this.mobile ? 17 : 21, 10, C.dark);
        text(ctx, 'PACKAGE ' + state.packageIndex + ' OF 2', x + w - (this.mobile ? 34 : 52), y - (this.mobile ? 5 : 7),
          this.mobile ? 5.5 : 7, C.paper, '700', HEAD, 'center');
      } else if (state.mode === 'sandbox') {
        fillRound(ctx, x + w - (this.mobile ? 66 : 98), y - (this.mobile ? 14 : 18), this.mobile ? 64 : 96, this.mobile ? 17 : 21, 10, C.slate);
        text(ctx, 'CUSTOM PASS', x + w - (this.mobile ? 34 : 50), y - (this.mobile ? 5 : 7), this.mobile ? 5.5 : 7, C.white, '700', HEAD, 'center');
      }
    }

    drawScanner(state, geom, now) {
      var ctx = this.ctx;
      var s = geom.scanner;
      ctx.save();
      ctx.shadowColor = 'rgba(21,30,27,.3)';
      ctx.shadowBlur = this.mobile ? 8 : 14;
      ctx.shadowOffsetY = 5;
      fillRound(ctx, s.x, s.y + 13, s.w, s.h - 18, this.mobile ? 9 : 13, '#34413e');
      ctx.restore();
      fillRound(ctx, s.x + 4, s.y + 2, s.w - 8, 20, 6, '#65726e');
      fillRound(ctx, s.x + 9, s.y + 27, s.w - 18, s.h - 58, 7, '#23302d');
      fillRound(ctx, s.x + 13, s.y + 33, s.w - 26, s.h - 70, 5, '#93aaa2');
      ctx.fillStyle = 'rgba(20,38,34,.62)';
      ctx.fillRect(s.x + 17, s.y + 40, s.w - 34, s.h - 84);
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.strokeRect(s.x + 17, s.y + 40, s.w - 34, s.h - 84);

      // Red scanner beam.
      if (state.phase === 'scan' && !this.reduceMotion) {
        var beamX = geom.packBaseX + geom.travel + geom.packW - 8;
        var glow = ctx.createLinearGradient(beamX, geom.beamY, s.x, geom.beamY);
        glow.addColorStop(0, 'rgba(255,67,52,.1)');
        glow.addColorStop(0.5, 'rgba(255,67,52,.78)');
        glow.addColorStop(1, 'rgba(255,67,52,.3)');
        ctx.strokeStyle = glow;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(beamX, geom.beamY);
        ctx.lineTo(s.x + s.w / 2, geom.beamY);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,80,60,.92)';
        ctx.beginPath();
        ctx.arc(s.x + s.w / 2, geom.beamY, 4 + Math.sin(now / 90) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Feet and status.
      ctx.fillStyle = '#202a28';
      ctx.fillRect(s.x + 14, s.y + s.h - 15, s.w - 28, 10);
      ctx.beginPath();
      ctx.arc(s.x + s.w - 17, s.y + 13, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = state.phase === 'scan' ? '#ff7364' : (state.busy ? C.orange : '#5fd18d');
      ctx.fill();
      text(ctx, 'SCAN', s.x + s.w / 2, s.y + 15, this.mobile ? 6.5 : 8, C.paper, '600', HEAD, 'center');

      // Drop-zone outline.
      if (state.drag.active) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = C.orange;
        ctx.lineWidth = 2;
        rounded(ctx, s.x - 8, s.y - 8, s.w + 16, s.h + 16, 12);
        ctx.stroke();
        ctx.restore();
      }
      this.scanZoneRect = { x: s.x - 18, y: s.y - 20, w: s.w + 36, h: s.h + 34 };
    }

    drawStageLabels(state, geom, now) {
      var ctx = this.ctx;
      var box = geom.box;
      var mobile = this.mobile;
      // Presentation source badge.
      var badgeW = mobile ? 104 : 137;
      fillRound(ctx, box.x + box.w - badgeW - 15, box.y + 12, badgeW, mobile ? 18 : 22, 11, 'rgba(31,43,40,.83)');
      ctx.beginPath();
      ctx.arc(box.x + box.w - badgeW + 3, box.y + 12 + (mobile ? 9 : 11), 3, 0, Math.PI * 2);
      ctx.fillStyle = state.mode === 'sdk' ? '#73c6d7' : C.orange;
      ctx.fill();
      text(ctx, state.mode === 'sdk' ? 'SDK IMAGE DECODE' : 'SIMULATED EVENT',
        box.x + box.w - badgeW + 9, box.y + 12 + (mobile ? 9 : 11), mobile ? 6.5 : 7.2, '#f7f4eb', '700', HEAD);

      // Live checkout status plate under the conveyor.
      var plateY = box.y + box.h - (mobile ? 15 : 20);
      text(ctx, state.busy ? 'READING CARRIERS…' : 'MOVE PACK → SCANNER',
        box.x + (mobile ? 20 : 34), plateY, mobile ? 6.6 : 8.2, 'rgba(255,252,243,.75)', '700', HEAD);

      if (state.phase === 'scan') {
        var label = 'READING…';
        fillRound(ctx, box.x + box.w / 2 - (mobile ? 36 : 47), box.y + box.h - (mobile ? 31 : 39), mobile ? 72 : 94, mobile ? 19 : 23, 11, C.orange);
        text(ctx, label, box.x + box.w / 2, box.y + box.h - (mobile ? 21 : 27), mobile ? 6 : 7.5, '#2c2417', '700', HEAD, 'center');
      }

      if (state.mode === 'sandbox') {
        var sandboxHintW = mobile ? 219 : 330;
        fillRound(ctx, box.x + (mobile ? 16 : 24), box.y + (mobile ? 10 : 14), sandboxHintW, mobile ? 25 : 29, 6, 'rgba(255,253,246,.94)');
        text(ctx, ellipsis(ctx, 'SANDBOX · ' + state.hint, sandboxHintW - 16), box.x + (mobile ? 24 : 34), box.y + (mobile ? 23 : 29),
          mobile ? 5.8 : 7.2, C.slate, '600');
      }

      // First-pass coach bubble, anchored above the package, only before interaction.
      if (state.started && state.scanCount === 0 && state.mode !== 'sdk' && state.mode !== 'sandbox') {
        var bw = mobile ? 154 : 222;
        var bx = box.x + (mobile ? 28 : 38);
        var by = box.y + (mobile ? 24 : 42);
        fillRound(ctx, bx, by, bw, mobile ? 38 : 44, 7, '#fffdf6');
        strokeRound(ctx, bx, by, bw, mobile ? 38 : 44, 7, '#d8cdbb', 1);
        triangle(ctx, bx + 34, by + (mobile ? 38 : 44), 6, 6, '#fffdf6');
        text(ctx, 'ONE PACKAGE · TWO CODES', bx + 10, by + 12, mobile ? 6.5 : 7.2, C.orangeDark, '700', HEAD);
        text(ctx, 'Scan it or drag it right →', bx + 10, by + (mobile ? 26 : 29), mobile ? 8.2 : 9.5, C.ink, '600');
      }

      // Conflict callout after the decision.
      if (state.lastDecision && state.lastDecision.reason === 'GTIN_CONFLICT' && state.phase !== 'feed') {
        var cw = mobile ? 156 : 226;
        var cx = box.x + box.w - cw - (mobile ? 74 : 135);
        var cy = box.y + (mobile ? 34 : 46);
        fillRound(ctx, cx, cy, cw, mobile ? 42 : 46, 7, '#fff3e0');
        strokeRound(ctx, cx, cy, cw, mobile ? 42 : 46, 7, '#e5c58e', 1);
        text(ctx, 'TWO IDENTITIES DETECTED', cx + 9, cy + 12, mobile ? 6.5 : 7.2, C.yellow, '700', HEAD);
        text(ctx, 'POS stopped for review.', cx + 9, cy + (mobile ? 27 : 29), mobile ? 8 : 9.5, C.ink, '600');
      }
    }

    drawDragPrompt(state, geom) {
      if (!this.scanZoneRect) return;
      var ctx = this.ctx;
      var z = this.scanZoneRect;
      fillRound(ctx, z.x + z.w / 2 - 44, z.y + 10, 88, 20, 10, C.orange);
      text(ctx, 'DROP TO SCAN', z.x + z.w / 2, z.y + 21, 6.5, '#2b2316', '700', HEAD, 'center');
    }

    drawMotionLines(state, geom, now) {
      if (state.phase !== 'scan' || this.reduceMotion) return;
      var ctx = this.ctx;
      var x = geom.packBaseX + geom.travel + geom.packW - 12;
      for (var i = 0; i < 3; i++) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.18 + i * 0.1) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + i * 8, geom.beamY - 18);
        ctx.lineTo(x + i * 8 - 12, geom.beamY - 18);
        ctx.stroke();
      }
    }

    drawControls(state, now) {
      var box = this.layout.controls;
      var ctx = this.ctx;
      var primary;
      var secondary;
      if (state.mode === 'sdk') {
        primary = { id: 'scan', label: state.busy ? 'DECODING…' : 'DECODE PACKAGE' };
        secondary = { id: 'upload', label: 'UPLOAD IMAGE' };
      } else {
        primary = {
          id: 'scan',
          label: state.mode === 'guided' && state.scenario.id === 'two-products' && state.cartQty === 1 ? 'SCAN PACKAGE 2' : (state.busy ? 'READING…' : 'SCAN ITEM')
        };
        secondary = state.lastPresentation
          ? { id: 'repeat', label: 'REPEAT PASS' }
          : { id: 'repeat', label: 'REPEAT PASS', disabled: true };
      }

      var gap = this.mobile ? 6 : 9;
      var x = box.x;
      var pw = this.mobile ? (state.mode === 'sdk' ? 156 : 144) : (state.mode === 'sdk' ? 178 : 176);
      this.drawActionButton(primary.id, primary.label, x, box.y + 2, pw, box.h - 4, true, state.busy, state);
      x += pw + gap;
      var sw = this.mobile ? (state.mode === 'sdk' ? 141 : 88) : (state.mode === 'sdk' ? 168 : 146);
      this.drawActionButton(secondary.id, secondary.label, x, box.y + 2, sw, box.h - 4, false,
        state.busy || (secondary.id === 'repeat' && !state.lastPresentation), state);

      var canNext = state.mode === 'guided' && state.completed[state.scenario.number] && state.scenarioIndex < 4;
      var canFinish = state.mode === 'guided' && state.completed[state.scenario.number] && state.scenarioIndex === 4;
      var rightW = this.mobile ? 48 : 76;
      var rightX = box.x + box.w - rightW;
      if (canNext || canFinish) {
        var nextW = this.mobile ? 78 : 138;
        var nextX = rightX - nextW - gap;
        this.drawActionButton(canFinish ? 'results' : 'next', canFinish ? 'RESULTS' : 'NEXT LEVEL →',
          nextX, box.y + 2, nextW, box.h - 4, false, false, state, true);
      }
      this.drawActionButton('reset', this.mobile ? '↺' : 'RESET', rightX, box.y + 2, rightW, box.h - 4, false, state.busy, state);

      if (!this.mobile) {
        text(ctx, 'SPACE  scan   R  repeat   1–5  levels   ?  help', box.x + box.w, box.y - 7, 6.3, C.faint, '600', BODY, 'right');
      }
    }

    drawActionButton(id, label, x, y, w, h, primary, disabled, state, success) {
      var ctx = this.ctx;
      var hover = this.hoverId === id && !disabled;
      var bg = primary ? (disabled ? '#e7c798' : (hover ? '#f49a2d' : C.orange)) :
        (success ? (hover ? '#1f6b49' : C.green) : (hover ? '#ffffff' : '#f5f8f6'));
      var border = primary ? 'transparent' : (success ? C.green : '#cbd5cf');
      var color = primary ? '#2c2417' : (success ? '#ffffff' : (disabled ? '#9da6a2' : C.ink));
      fillRound(ctx, x, y, w, h, 7, bg);
      strokeRound(ctx, x, y, w, h, 7, border, 1);
      var iconSpace = primary ? 20 : 0;
      if (primary) this.miniScanIcon(x + 15, y + h / 2, disabled ? '#9c7f55' : '#2c2417');
      text(ctx, label, x + (primary ? 28 : 8) + (w - iconSpace - (primary ? 28 : 8)) / 2,
        y + h / 2 + 1, this.mobile ? 8 : 9.5, color, '700', HEAD, primary ? 'center' : 'center');
      this.addHit(id, x, y, w, h, disabled, primary ? 'pointer' : 'pointer');
    }

    miniScanIcon(x, y, color) {
      var ctx = this.ctx;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 6); ctx.lineTo(x - 7, y - 6); ctx.lineTo(x - 7, y - 3);
      ctx.moveTo(x + 4, y - 6); ctx.lineTo(x + 7, y - 6); ctx.lineTo(x + 7, y - 3);
      ctx.moveTo(x - 4, y + 6); ctx.lineTo(x - 7, y + 6); ctx.lineTo(x - 7, y + 3);
      ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + 7, y + 6); ctx.lineTo(x + 7, y + 3);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.stroke();
    }

    drawTerminal(state, now) {
      var box = this.layout.terminal;
      var ctx = this.ctx;
      var mobile = this.mobile;
      ctx.save();
      ctx.shadowColor = 'rgba(22,31,28,.2)';
      ctx.shadowBlur = 17;
      ctx.shadowOffsetY = 4;
      fillRound(ctx, box.x, box.y, box.w, box.h, 12, C.dark);
      ctx.restore();

      var hh = mobile ? 30 : 44;
      var pad = mobile ? 12 : 17;
      text(ctx, 'NORTHFIELD POS', box.x + pad, box.y + hh / 2, mobile ? 9 : 11, '#f2eee3', '600', HEAD);
      text(ctx, 'TERMINAL 04 · ' + (state.mode === 'sdk' ? 'IMAGE DECODE' : 'SIMULATION'),
        box.x + box.w - pad, box.y + hh / 2, mobile ? 5.8 : 6.7, '#aebbb5', '600', HEAD, 'right');
      ctx.beginPath();
      ctx.arc(box.x + box.w - pad - (mobile ? 121 : 159), box.y + hh / 2, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = state.busy ? C.orange : '#69d798';
      ctx.fill();

      var sx = box.x + (mobile ? 8 : 10);
      var sy = box.y + hh + (mobile ? 5 : 8);
      var sw = box.w - (mobile ? 16 : 20);
      var sh = box.h - hh - (mobile ? 13 : 18);
      fillRound(ctx, sx, sy, sw, sh, 5, '#fffdf5');
      // Receipt edge detail.
      ctx.fillStyle = '#ebe4d5';
      for (var i = 0; i < 8; i++) ctx.fillRect(sx + 8 + i * ((sw - 16) / 8), sy + sh - 2, 5, 1);

      var decision = state.lastDecision;
      var status = state.busy ? 'processing' : (decision ? decision.status : 'idle');
      var palette = this.statusPalette(status);
      var statusX = sx + 8;
      var statusY = sy + 8;
      var statusW = sw - 16;
      var statusH = mobile ? 37 : 49;
      fillRound(ctx, statusX, statusY, statusW, statusH, 5, palette.bg);
      text(ctx, palette.label, statusX + 10, statusY + (mobile ? 11 : 13), mobile ? 6 : 7.5, palette.fg, '700', HEAD);
      var headline = this.statusHeadline(state, status);
      text(ctx, ellipsis(ctx, headline, statusW - 20), statusX + 10, statusY + (mobile ? 25 : 32), mobile ? 10 : 13, palette.fg, '700', HEAD);

      var infoY = statusY + statusH + (mobile ? 9 : 13);
      text(ctx, 'CURRENT ITEM', sx + 12, infoY, mobile ? 5.4 : 6.5, C.faint, '700', HEAD);
      text(ctx, ellipsis(ctx, state.product.shortName, sw - 24), sx + 12, infoY + (mobile ? 13 : 16), mobile ? 9.5 : 12, C.ink, '700');
      text(ctx, 'GTIN', sx + 12, infoY + (mobile ? 29 : 38), mobile ? 5.4 : 6.5, C.faint, '700', HEAD);
      var gtin = state.lastDecision
        ? (state.lastDecision.gtins ? state.lastDecision.gtins.join(' ≠ ') : (state.lastDecision.gtin || '—'))
        : '—';
      text(ctx, ellipsis(ctx, gtin, sw - 94), sx + 45, infoY + (mobile ? 29 : 38), mobile ? 7 : 8.5, C.ink, '400', MONO);
      text(ctx, state.lastDecision && state.lastDecision.gtin && state.productCatalogFound ? 'SKU FOUND' : 'SKU —',
        sx + sw - 12, infoY + (mobile ? 29 : 38), mobile ? 5.3 : 6.3, state.lastDecision && state.productCatalogFound ? C.green : C.muted, '700', HEAD, 'right');

      var metricY = infoY + (mobile ? 41 : 54);
      var metricH = mobile ? 32 : 42;
      var metricW = (sw - 24 - 8) / 2;
      [['READS', String(state.lastReadCount || 0)], ['IN CART', String(state.cartQty || 0)]].forEach(function (m, index) {
        var mx = sx + 12 + index * (metricW + 8);
        fillRound(ctx, mx, metricY, metricW, metricH, 4, '#f2f1e9');
        text(ctx, m[0], mx + 8, metricY + (mobile ? 9 : 11), mobile ? 6 : 7, C.muted, '700', HEAD);
        text(ctx, m[1], mx + metricW - 8, metricY + (mobile ? 18 : 25), mobile ? 17 : 20, C.ink, '600', HEAD, 'right');
      });

      var cartTitleY = metricY + metricH + (mobile ? 12 : 16);
      text(ctx, 'CART', sx + 12, cartTitleY, mobile ? 6.6 : 7.5, C.muted, '700', HEAD);
      var lineY = cartTitleY + (mobile ? 12 : 15);
      var entries = Object.keys(state.cart).filter(function (key) { return state.cart[key].quantity > 0; });
      if (!entries.length) {
        text(ctx, 'Empty — send a package through.', sx + 12, lineY + 5, mobile ? 7.5 : 9, C.faint);
        ctx.strokeStyle = '#e8e2d5';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(sx + 12, lineY + 19); ctx.lineTo(sx + sw - 12, lineY + 19); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        entries.forEach(function (gtin, index) {
          if (index > 1) return;
          var product = state.catalog[gtin];
          var qty = state.cart[gtin].quantity;
          var ry = lineY + index * (mobile ? 17 : 21);
          text(ctx, ellipsis(ctx, product.shortName, sw * 0.52), sx + 12, ry, mobile ? 8.2 : 9.5, C.ink, '600');
          text(ctx, '×' + qty, sx + sw - 70, ry, mobile ? 8.2 : 9.5, C.muted, '600', MONO, 'right');
          text(ctx, '$' + (product.price * qty).toFixed(2), sx + sw - 12, ry, mobile ? 8.2 : 9.5, C.ink, '700', MONO, 'right');
        });
      }
      var totalY = lineY + (mobile ? 24 : 30);
      ctx.strokeStyle = '#ddd5c6';
      ctx.beginPath(); ctx.moveTo(sx + 12, totalY); ctx.lineTo(sx + sw - 12, totalY); ctx.stroke();
      text(ctx, 'TOTAL', sx + 12, totalY + (mobile ? 13 : 16), mobile ? 6.8 : 7.8, C.muted, '700', HEAD);
      text(ctx, '$' + this.cartTotal(state).toFixed(2), sx + sw - 12, totalY + (mobile ? 13 : 16), mobile ? 17 : 20, C.ink, '600', HEAD, 'right');

      var narrY = totalY + (mobile ? 28 : 35);
      fillRound(ctx, sx + 10, narrY, sw - 20, sh - (narrY - sy) - 12, 4, status === 'added' ? C.greenSoft : (status === 'needs_review' ? C.yellowSoft : '#f3f4ef'));
      text(ctx, 'WHY THIS DECISION', sx + 18, narrY + 11, mobile ? 6.2 : 7, C.muted, '700', HEAD);
      wrapped(ctx, state.narrative, sx + 18, narrY + (mobile ? 18 : 22), sw - 36, mobile ? 12 : 14, mobile ? 3 : 3, mobile ? 7.6 : 9, C.ink, '400');
      if (!mobile) this.drawDecisionFlow(state, sx + 18, narrY + 92, sw - 36);
    }

    drawDecisionFlow(state, x, y, w) {
      var ctx = this.ctx;
      var d = state.lastDecision;
      var gtins = d ? (d.gtins ? d.gtins.length : (d.gtin ? 1 : 0)) : 0;
      var endLabel = d
        ? (d.quantityAdded ? '+' + d.quantityAdded + ' UNIT' : (d.status === 'needs_review' ? 'REVIEW' : 'NO ADD'))
        : 'COMMIT';
      var endColor = d ? (d.quantityAdded ? C.green : (d.status === 'needs_review' ? C.yellow : C.red)) : C.muted;
      var nodes = [
        { label: 'READS', value: d ? String(state.lastReadCount) : '—', color: d ? C.slate : C.faint },
        { label: 'UNIQUE GTIN', value: d ? String(gtins) : '—', color: gtins > 1 ? C.red : (d ? C.slate : C.faint) },
        { label: 'POS RESULT', value: endLabel, color: endColor }
      ];
      var gap = 23;
      var nw = (w - gap * 2) / 3;
      nodes.forEach(function (node, index) {
        var nx = x + index * (nw + gap);
        fillRound(ctx, nx, y, nw, 34, 4, '#fffdf7');
        strokeRound(ctx, nx, y, nw, 34, 4, '#d9d4c7', 1);
        text(ctx, node.label, nx + 8, y + 10, 6.4, C.faint, '700', HEAD);
        text(ctx, node.value, nx + nw - 8, y + 21, 10.5, node.color, '700', HEAD, 'right');
        if (index < 2) {
          var ax = nx + nw + 5;
          var ay = y + 17;
          ctx.strokeStyle = '#b7b0a1';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ax, ay); ctx.lineTo(ax + gap - 10, ay);
          ctx.lineTo(ax + gap - 14, ay - 3); ctx.moveTo(ax + gap - 10, ay); ctx.lineTo(ax + gap - 14, ay + 3);
          ctx.stroke();
        }
      });
      text(ctx, 'OBSERVATIONS → NORMALIZED IDENTITY → ONE PRESENTATION DECISION',
        x, y + 45, 6.1, C.faint, '600', HEAD);
    }

    statusPalette(status) {
      if (status === 'added') return { bg: C.greenSoft, fg: C.green, label: 'ADDED' };
      if (status === 'ignored') return { bg: C.slateSoft, fg: C.slate, label: 'IGNORED · SAME PASS' };
      if (status === 'needs_review') return { bg: C.yellowSoft, fg: C.yellow, label: 'NEEDS REVIEW' };
      if (status === 'not_added') return { bg: C.redSoft, fg: C.red, label: 'NOT ADDED' };
      if (status === 'processing') return { bg: C.orangeSoft, fg: C.orangeDark, label: 'READING PRESENTATION' };
      return { bg: '#eef1ed', fg: C.muted, label: 'READY FOR NEXT PACKAGE' };
    }

    statusHeadline(state, status) {
      if (state.busy) return state.phase === 'feed' ? 'Package approaching scanner…' : 'Reading both carriers…';
      if (status === 'added') {
        if (state.scenario && state.scenario.id === 'two-products' && state.cartQty === 1) return 'Package 1 committed — one more waiting.';
        if (state.scenario && state.scenario.id === 'two-products' && state.cartQty >= 2) return 'Two packages. Two units.';
        return 'One logical checkout acknowledgement.';
      }
      if (status === 'ignored') return 'Same pass — cart unchanged.';
      if (status === 'needs_review') return state.lastDecision && state.lastDecision.reason === 'GTIN_CONFLICT'
        ? 'Carrier identities disagree.' : 'A human must review this item.';
      if (status === 'not_added') return state.lastDecision && state.lastDecision.reason === 'NO_RESULT'
        ? 'NO_RESULT — no barcode returned.' : 'No valid item was committed.';
      return 'Tap Scan Item or drag the pack →';
    }

    cartTotal(state) {
      return Object.keys(state.cart).reduce(function (sum, gtin) {
        var product = state.catalog[gtin];
        return sum + (product ? product.price * state.cart[gtin].quantity : 0);
      }, 0);
    }

    drawTrace(state, now) {
      var box = this.layout.trace;
      var ctx = this.ctx;
      fillRound(ctx, box.x, box.y, box.w, box.h, 8, '#202b29');
      text(ctx, 'DECISION TRACE', box.x + 14, box.y + 14, this.mobile ? 7.5 : 8.3, C.paper, '700', HEAD);
      text(ctx, state.trace.length + ' EVENTS', box.x + (this.mobile ? 101 : 124), box.y + 14, this.mobile ? 6.2 : 7, '#8fa099', '600', HEAD);

      var right = box.x + box.w - 12;
      if (state.assets && state.assets.composite) {
        this.drawMiniButton('png', this.mobile ? 'PNG' : 'LABEL PNG', right - (this.mobile ? 31 : 59), box.y + 5, this.mobile ? 31 : 59, 18, state);
        right -= (this.mobile ? 37 : 65);
        if (!this.mobile) {
          this.drawMiniButton('scene', 'SCENE', right - 39, box.y + 5, 39, 18, state);
          right -= 45;
        }
      }
      if (state.reports.length) {
        this.drawMiniButton('json', 'JSON', right - 31, box.y + 5, 31, 18, state);
        right -= 37;
        if (!this.mobile) {
          this.drawMiniButton('csv', 'CSV', right - 27, box.y + 5, 27, 18, state);
        }
      }

      var rows = state.trace.slice(-3);
      if (!rows.length) {
        text(ctx, 'No reads yet. Start with the package on the belt.', box.x + 14, box.y + 36, this.mobile ? 7.3 : 8.5, '#a6b3ad');
        text(ctx, 'SIM = deterministic fixture   SDK = genuine image decode', box.x + 14, box.y + (this.mobile ? 53 : 54), this.mobile ? 6.3 : 7.2, '#74847d');
        return;
      }
      var self = this;
      rows.forEach(function (row, index) {
        var y = box.y + 29 + index * (self.mobile ? 18 : 16);
        var sourceColor = row.origin === 'sdk-image' ? '#86d0dc' : '#f7bd6d';
        text(ctx, '+' + String(row.time).padStart(3, '0') + 'ms', box.x + 14, y, self.mobile ? 6 : 6.8, '#76877f', '400', MONO);
        text(ctx, row.origin === 'sdk-image' ? 'SDK' : 'SIM', box.x + (self.mobile ? 55 : 62), y, self.mobile ? 6.1 : 7, sourceColor, '700', HEAD);
        text(ctx, ellipsis(ctx, row.event, self.mobile ? 200 : 220), box.x + (self.mobile ? 79 : 98), y, self.mobile ? 6.6 : 7.8, row.decisionStatus === 'added' ? '#9fe0b9' : (row.decisionStatus === 'needs_review' || row.decisionStatus === 'not_added' ? '#f0c68c' : '#e9efe9'), '600');
        if (!self.mobile) {
          text(ctx, ellipsis(ctx, row.detail, box.w - 470), box.x + 245, y, 7.2, '#aebbb5');
        }
      });
    }

    drawMiniButton(id, label, x, y, w, h, state) {
      var hover = this.hoverId === id;
      fillRound(this.ctx, x, y, w, h, 3, hover ? '#3b4945' : '#2b3734');
      strokeRound(this.ctx, x, y, w, h, 3, '#53625c', 1);
      text(this.ctx, label, x + w / 2, y + h / 2 + 1, this.mobile ? 5.2 : 5.8, '#dce4de', '700', HEAD, 'center');
      this.addHit(id, x, y, w, h, state.busy);
    }

    drawToast(state, now) {
      var ctx = this.ctx;
      var t = state.toast;
      var alpha = clamp((t.until - now) / 350, 0, 1);
      var w = this.mobile ? 210 : 260;
      var x = this.W / 2 - w / 2;
      var y = this.layout.stage.y + 18;
      ctx.save();
      ctx.globalAlpha = alpha;
      fillRound(ctx, x, y, w, 32, 7, C.dark);
      text(ctx, t.message, x + w / 2, y + 17, this.mobile ? 7 : 8.5, C.paper, '600', BODY, 'center');
      ctx.restore();
    }

    drawPassBurst(state, now) {
      if (this.reduceMotion) return;
      var ctx = this.ctx;
      var age = now - state.justPassedAt;
      var colors = [C.orange, '#7cb99a', '#f6c563', '#6aa8b4', '#e98e83'];
      for (var i = 0; i < 30; i++) {
        var angle = (i / 30) * Math.PI * 2 + (i % 5) * 0.13;
        var velocity = 1.7 + (i % 7) * 0.3;
        var x = this.layout.stage.x + this.layout.stage.w * 0.78 + Math.cos(angle) * velocity * age * 0.09;
        var y = this.layout.stage.y + 90 + Math.sin(angle) * velocity * age * 0.09 + age * age * 0.00018;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + age * 0.004);
        ctx.globalAlpha = clamp(1 - age / 2400, 0, 1);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(-3, -2, 7, 4);
        ctx.restore();
      }
    }

    drawTour(state, now) {
      var ctx = this.ctx;
      ctx.fillStyle = 'rgba(24,34,31,.68)';
      ctx.fillRect(0, 0, this.W, this.H);
      var mobile = this.mobile;
      var card = mobile
        ? { x: 14, y: 58, w: this.W - 28, h: 780 }
        : { x: 188, y: 72, w: 824, h: 648 };
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.3)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 10;
      fillRound(ctx, card.x, card.y, card.w, card.h, 14, C.paper);
      ctx.restore();
      fillRound(ctx, card.x, card.y, card.w, 7, 14, C.orange);
      text(ctx, 'START HERE · 60-SECOND BRIEFING', card.x + (mobile ? 20 : 36), card.y + (mobile ? 28 : 36), mobile ? 7 : 8.5, C.orangeDark, '700', HEAD);
      if (mobile) {
        text(ctx, 'One package. Two codes.', card.x + 20, card.y + 55, 21, C.ink, '600', HEAD);
        text(ctx, 'One charge.', card.x + 20, card.y + 80, 21, C.ink, '600', HEAD);
        wrapped(ctx, 'A dual-marked pack can expose an EAN-13 and a GS1 QR at the same time. Your job is to put the physical package through checkout — not to charge each barcode separately.',
          card.x + 20, card.y + 100, card.w - 40, 12, 4, 8.5, C.muted);
      } else {
        text(ctx, 'One package. Two codes. One charge.', card.x + 36, card.y + 74, 33, C.ink, '600', HEAD);
        wrapped(ctx, 'A dual-marked pack can expose an EAN-13 and a GS1 QR at the same time. Your job is to put the physical package through checkout — not to charge each barcode separately.',
          card.x + 36, card.y + 94, card.w - 72, 17, 3, 11.5, C.muted);
      }

      var cards = [
        { n: '01', title: 'A real pack', copy: 'Both printed carriers identify the same trade item. The codes are actual images.' },
        { n: '02', title: 'One motion', copy: 'Click Scan Item, press Space, or drag the package into the red scanner.' },
        { n: '03', title: 'One POS decision', copy: 'Reads are grouped inside this presentation. Matching GTINs commit one unit.' }
      ];
      if (!mobile) {
        cards.forEach(function (item, index) {
          var x = card.x + 36 + index * 252;
          var y = card.y + 200;
          fillRound(ctx, x, y, 236, 276, 8, '#f7f1e4');
          strokeRound(ctx, x, y, 236, 276, 8, '#e7ddc9', 1);
          this.drawTourIcon(index, x + 118, y + 80);
          text(ctx, item.n, x + 18, y + 18, 8, C.orangeDark, '700', HEAD);
          text(ctx, item.title, x + 18, y + 160, 19, C.ink, '500', HEAD);
          wrapped(ctx, item.copy, x + 18, y + 179, 200, 17, 4, 9.5, C.muted);
        }, this);
      } else {
        cards.forEach(function (item, index) {
          var x = card.x + 16;
          var y = card.y + 156 + index * 142;
          fillRound(ctx, x, y, card.w - 32, 130, 7, '#f7f1e4');
          strokeRound(ctx, x, y, card.w - 32, 130, 7, '#e7ddc9', 1);
          this.drawTourIcon(index, x + 52, y + 58, true);
          text(ctx, item.n, x + 96, y + 20, 6.5, C.orangeDark, '700', HEAD);
          text(ctx, item.title, x + 96, y + 40, 15, C.ink, '500', HEAD);
          wrapped(ctx, item.copy, x + 96, y + 58, card.w - 138, 13, 4, 8, C.muted);
        }, this);
      }

      var footY = mobile ? card.y + 666 : card.y + card.h - 78;
      var startW = mobile ? 214 : 220;
      var skipW = mobile ? 116 : 140;
      var startX = card.x + (mobile ? 18 : 36);
      var skipX = startX + startW + 10;
      var tutorialDone = Object.keys(state.completed).filter(function (key) { return state.completed[key]; }).length;
      var startLabel = state.scanCount === 0 && tutorialDone === 0 && state.mode === 'guided'
        ? 'START LEVEL ' + state.scenario.number
        : 'RESUME CHECKOUT';
      this.overlayButton('start-tour', startLabel, startX, footY, startW, 44, true);
      this.overlayButton('skip-tour', 'SKIP', skipX, footY, skipW, 44, false);
      text(ctx, 'ENTER to begin · ? reopens this briefing', card.x + card.w - (mobile ? 18 : 36),
        card.y + card.h - 21, mobile ? 6 : 7.5, C.faint, '600', BODY, 'right');
    }

    drawTourIcon(index, cx, cy, small) {
      var ctx = this.ctx;
      var s = small ? 0.75 : 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      if (index === 0) {
        fillRound(ctx, -48, -48, 96, 96, 6, '#fffdf6');
        fillRound(ctx, -48, -48, 96, 8, 6, C.orange);
        text(ctx, 'JUICE', 0, -21, 12, C.ink, '600', HEAD, 'center');
        fillRound(ctx, -38, 1, 48, 34, 3, '#fff'); strokeRound(ctx, -38, 1, 48, 34, 3, '#bbb', 1);
        for (var i = 0; i < 8; i++) ctx.fillRect(-33 + i * 5, 7, i % 3 === 0 ? 2 : 1, 22);
        fillRound(ctx, 18, 1, 28, 28, 3, '#fff'); strokeRound(ctx, 18, 1, 28, 28, 3, '#bbb', 1);
        ctx.fillStyle = '#333';
        ctx.fillRect(22, 5, 5, 5); ctx.fillRect(33, 5, 8, 5); ctx.fillRect(22, 14, 10, 4); ctx.fillRect(36, 14, 5, 8);
      } else if (index === 1) {
        fillRound(ctx, -64, -42, 128, 50, 8, C.orange);
        this.miniScanIcon(-34, -17, '#2a2417');
        text(ctx, 'SCAN ITEM', 12, -16, 10, '#2a2417', '700', HEAD, 'center');
        fillRound(ctx, -35, 20, 70, 24, 5, '#f2ecdf'); strokeRound(ctx, -35, 20, 70, 24, 5, '#d3c8b5', 1);
        text(ctx, 'SPACE', 0, 32, 8, C.muted, '700', HEAD, 'center');
        ctx.beginPath();
        ctx.moveTo(0, 44); ctx.quadraticCurveTo(-14, 34, 0, 22);
        ctx.strokeStyle = C.slate; ctx.lineWidth = 2; ctx.stroke();
      } else {
        fillRound(ctx, -43, -48, 86, 96, 5, '#fffdf6');
        strokeRound(ctx, -43, -48, 86, 96, 5, '#cfc5b4', 1);
        ctx.strokeStyle = '#ddd6c8';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(-33, -28); ctx.lineTo(33, -28); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, 'POS', -33, -37, 8, C.muted, '700', HEAD);
        text(ctx, '1 UNIT', -33, -12, 15, C.ink, '600', HEAD);
        fillRound(ctx, -33, 6, 66, 17, 9, C.greenSoft);
        text(ctx, 'ADDED', 0, 15, 7, C.green, '700', HEAD, 'center');
        ctx.beginPath(); ctx.moveTo(-26, 35); ctx.lineTo(26, 35);
        ctx.strokeStyle = '#d8d0c1'; ctx.stroke();
      }
      ctx.restore();
    }

    overlayButton(id, label, x, y, w, h, primary) {
      var ctx = this.ctx;
      var hover = this.hoverId === id;
      fillRound(ctx, x, y, w, h, 7, primary ? (hover ? '#f39a2a' : C.orange) : (hover ? '#efe8da' : '#f5efe3'));
      strokeRound(ctx, x, y, w, h, 7, primary ? 'transparent' : '#d8cdbb', 1);
      text(ctx, label, x + w / 2, y + h / 2 + 1, this.mobile ? 8 : 9, primary ? '#2c2417' : C.ink, '700', HEAD, 'center');
      this.addOverlayHit(id, x, y, w, h);
    }

    drawComplete(state, now) {
      var ctx = this.ctx;
      ctx.fillStyle = 'rgba(24,34,31,.72)';
      ctx.fillRect(0, 0, this.W, this.H);
      var mobile = this.mobile;
      var card = mobile ? { x: 14, y: 100, w: this.W - 28, h: this.H - 180 } : { x: 250, y: 106, w: 700, h: 590 };
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetY = 12;
      fillRound(ctx, card.x, card.y, card.w, card.h, 14, C.paper);
      ctx.restore();
      fillRound(ctx, card.x, card.y, card.w, 8, 14, C.green);
      text(ctx, 'LAB COMPLETE', card.x + card.w / 2, card.y + (mobile ? 39 : 50), mobile ? 8 : 10, C.green, '700', HEAD, 'center');
      text(ctx, '5 / 5', card.x + card.w / 2, card.y + (mobile ? 88 : 112), mobile ? 56 : 82, C.ink, '600', HEAD, 'center');
      text(ctx, 'You can now read a dual-marked checkout.', card.x + card.w / 2, card.y + (mobile ? 129 : 164), mobile ? 15 : 20, C.ink, '500', HEAD, 'center');

      var lessons = [
        ['1 package + 2 matching codes', '1 unit'],
        ['2 packages + the same GTIN', '2 units'],
        ['1 package + 2 different GTINs', 'review']
      ];
      var startY = card.y + (mobile ? 156 : 198);
      lessons.forEach(function (lesson, index) {
        var y = startY + index * (mobile ? 34 : 42);
        fillRound(ctx, card.x + (mobile ? 22 : 54), y, card.w - (mobile ? 44 : 108), mobile ? 28 : 34, 5, index === 2 ? C.yellowSoft : C.greenSoft);
        text(ctx, lesson[0], card.x + (mobile ? 34 : 68), y + (mobile ? 14 : 17), mobile ? 8 : 10, C.ink, '600');
        text(ctx, lesson[1], card.x + card.w - (mobile ? 34 : 68), y + (mobile ? 14 : 17), mobile ? 8 : 10,
          index === 2 ? C.yellow : C.green, '700', HEAD, 'right');
      });

      var noteY = startY + 3 * (mobile ? 34 : 42) + (mobile ? 22 : 28);
      text(ctx, 'THE TEST THAT CATCHES BAD POS LOGIC', card.x + card.w / 2, noteY,
        mobile ? 7 : 8.5, C.orangeDark, '700', HEAD, 'center');
      text(ctx, 'Two packages with the same GTIN must scan twice.',
        card.x + card.w / 2, noteY + (mobile ? 17 : 21), mobile ? 10 : 13, C.ink, '600', HEAD, 'center');
      text(ctx, 'A permanent GTIN cache cannot tell those two cases apart.',
        card.x + card.w / 2, noteY + (mobile ? 32 : 39), mobile ? 8 : 10.5, C.muted, '400', BODY, 'center');

      var footY = card.y + card.h - 68;
      var closeW = mobile ? 130 : 176;
      var jsonW = mobile ? 164 : 176;
      this.overlayButton('close-complete', 'REVIEW LAB', card.x + (mobile ? 16 : 54), footY, closeW, 44, false);
      this.overlayButton('json', 'DOWNLOAD REPORT', card.x + (mobile ? 154 : 240), footY, jsonW, 44, true);
      text(ctx, 'Reports include expected vs. actual, origin, rule and verdict.',
        card.x + card.w / 2, card.y + card.h - 14, mobile ? 5.8 : 7, C.faint, '400', BODY, 'center');
    }
  }

  function triangle(ctx, x, y, w, h, color) {
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  window.POSCanvasRenderer = Renderer;
})();
