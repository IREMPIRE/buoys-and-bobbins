/* Signal-flag previewer: the layout engine, without the page.
 *
 * A line-for-line port of the studio's made-to-order planner for signal-flag names (studio/personalize.py plan_recipe,
 * studio/generators/compose.py compose and stack, studio/engine/cleanup.py cleanup_confetti), working on the flag
 * stitches the studio exported at build time (assets/flags.json). tests/test_site.py runs this file in Node and checks
 * its charts against the studio's, stitch for stitch. Plain ES5-style code, no dependencies, no network.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.FlagPreview = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var T = -1; // an unstitched cell

  function Grid(w, h, fill) {
    this.w = w;
    this.h = h;
    this.cells = new Array(w * h);
    var v = fill === undefined ? T : fill;
    for (var i = 0; i < this.cells.length; i++) this.cells[i] = v;
  }
  Grid.prototype.get = function (x, y) { return this.cells[y * this.w + x]; };
  Grid.prototype.set = function (x, y, v) { this.cells[y * this.w + x] = v; };
  Grid.prototype.copy = function () {
    var g = new Grid(this.w, this.h);
    g.cells = this.cells.slice();
    return g;
  };
  Grid.prototype.rows = function () {
    var out = [];
    for (var y = 0; y < this.h; y++) out.push(this.cells.slice(y * this.w, (y + 1) * this.w));
    return out;
  };

  /* Python's round(): halves go to the even neighbour. */
  function pyRound(x) {
    var f = Math.floor(x);
    var diff = x - f;
    if (diff > 0.5) return f + 1;
    if (diff < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }

  function stitchesFor(inches, mesh) {
    if (!(inches > 0) || !(mesh > 0)) throw new Error("inches and mesh must be positive");
    return pyRound(inches * mesh);
  }

  function floorDiv(a, b) { return Math.floor(a / b); }

  function Engine(data) {
    this.data = data;
    this.ids = {};
    this.threads = {};
    var sym;
    for (sym in data.threads) {
      if (Object.prototype.hasOwnProperty.call(data.threads, sym)) {
        this.ids[sym] = data.threads[sym].id;
        this.threads[data.threads[sym].id] = data.threads[sym];
      }
    }
    this.flagChars = data.letters + data.digits;
    this._tiles = {};
  }

  Engine.prototype.decode = function (rows) {
    var h = rows.length, w = h ? rows[0].length : 0, g = new Grid(w, h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var c = rows[y].charAt(x);
        g.set(x, y, c === this.data.transparent ? T : this.ids[c]);
      }
    }
    return g;
  };

  Engine.prototype.colorId = function (sym) { return this.ids[sym]; };

  /* One flag or pennant, as studio.generators.flags.flag(ch, h, None, outline, cloth=True) draws it. */
  Engine.prototype.tile = function (ch, h, outline) {
    var key = outline + "/" + h + "/" + ch;
    if (!this._tiles[key]) {
      var byOutline = this.data.tiles[outline];
      if (!byOutline || !byOutline[String(h)] || !byOutline[String(h)][ch]) throw new Error("no exported flag " + key);
      this._tiles[key] = this.decode(byOutline[String(h)][ch]);
    }
    return this._tiles[key];
  };

  /* What the buyer typed, as studio/personalize.py clean_text("flags") reads it: spaces collapsed, capitals. Characters
   * without a flag are reported (the planner refuses them), never dropped in silence. */
  Engine.prototype.read = function (raw) {
    var t = String(raw || "").trim().split(/\s+/).filter(function (s) { return s.length; }).join(" ").toUpperCase();
    var flags = [], bad = [], seen = {};
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (c === " ") continue;
      if (this.flagChars.indexOf(c) >= 0) flags.push(c);
      else if (!seen[c]) { seen[c] = true; bad.push(c); }
    }
    return { text: t, flags: flags, unsupported: bad, hasSpace: t.indexOf(" ") >= 0 };
  };

  /* compose.stack: blocks top to bottom (column) or left to right (row), centred on the other axis unless align is
   * "start". */
  function stack(blocks, direction, gap, align) {
    if (!blocks.length) return new Grid(0, 0);
    var col = direction === "column";
    var along = blocks.map(function (b) { return col ? b.h : b.w; });
    var across = blocks.map(function (b) { return col ? b.w : b.h; });
    var total = along.reduce(function (a, b) { return a + b; }, 0) + gap * (blocks.length - 1);
    var span = Math.max.apply(null, across);
    var out = col ? new Grid(span, total) : new Grid(total, span);
    var pos = 0;
    for (var i = 0; i < blocks.length; i++) {
      var off = align === "start" ? 0 : floorDiv(span - across[i], 2);
      paste(out, blocks[i], col ? off : pos, col ? pos : off);
      pos += along[i] + gap;
    }
    return out;
  }

  /* grid.paste: copy the stitched cells of src onto dst with its top-left at (x, y), clipped at the edges. */
  function paste(dst, src, x, y) {
    for (var sy = 0; sy < src.h; sy++) {
      var dy = y + sy;
      if (dy < 0 || dy >= dst.h) continue;
      for (var sx = 0; sx < src.w; sx++) {
        var dx = x + sx, v = src.cells[sy * src.w + sx];
        if (dx < 0 || dx >= dst.w || v < 0) continue;
        dst.cells[dy * dst.w + dx] = v;
      }
    }
  }

  function crop(g) {
    var x0 = g.w, y0 = g.h, x1 = -1, y1 = -1;
    for (var y = 0; y < g.h; y++) {
      for (var x = 0; x < g.w; x++) {
        if (g.cells[y * g.w + x] >= 0) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return g;
    var out = new Grid(x1 - x0 + 1, y1 - y0 + 1);
    for (var yy = y0; yy <= y1; yy++) {
      for (var xx = x0; xx <= x1; xx++) out.cells[(yy - y0) * out.w + (xx - x0)] = g.cells[yy * g.w + xx];
    }
    return out;
  }

  /* text.render(text, "block5x7", ink): the glyphs side by side, `spacing` empty columns between them, trimmed. */
  Engine.prototype.text = function (chars, ink) {
    var f = this.data.font, parts = [], width = 0, i;
    for (i = 0; i < chars.length; i++) {
      var rows = f.glyphs[chars[i]];
      if (!rows) throw new Error("font " + f.name + " has no glyph " + chars[i]);
      if (i) width += f.spacing;
      parts.push({ x: width, rows: rows });
      width += rows[0].length;
    }
    if (f.slant) throw new Error("slanted fonts are not exported");
    var g = new Grid(width, f.height);
    parts.forEach(function (p) {
      for (var y = 0; y < f.height; y++) {
        for (var x = 0; x < p.rows[y].length; x++) if (p.rows[y].charAt(x) === "#") g.set(p.x + x, y, ink);
      }
    });
    return crop(g);
  };

  /* compose.flags_block */
  Engine.prototype.flagsBlock = function (chars, h, outline, layout, gap, cols) {
    var self = this;
    var tiles = chars.map(function (c) { return self.tile(c, h, outline); });
    if (layout === "row") return stack(tiles, "row", gap);
    if (layout === "column") return stack(tiles, "column", gap);
    var rows = [];
    for (var i = 0; i < tiles.length; i += cols) rows.push(stack(tiles.slice(i, i + cols), "row", gap, "start"));
    return stack(rows, "column", gap, "center");
  };

  /* cleanup.cleanup_confetti(min_size=2): each stitch with no 8-neighbour of its own colour takes its neighbours' most
   * common colour (the lowest colour id on a tie), up to 4 passes. Only `region` cells keep the change (clean_region). */
  function cleanRegion(g, region) {
    var res = g.copy(), w = g.w, h = g.h, pass, x, y, k;
    for (pass = 1; pass <= 4; pass++) {
      var lone = [];
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          var v = res.cells[y * w + x];
          if (v < 0) continue;
          var alone = true;
          for (var dy = -1; dy <= 1 && alone; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              var nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < w && ny < h && res.cells[ny * w + nx] === v) { alone = false; break; }
            }
          }
          if (alone) lone.push([v, x, y]);
        }
      }
      // components in colour order, then in reading order (scipy's labels)
      lone.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2] || a[1] - b[1]; });
      var changed = 0;
      for (k = 0; k < lone.length; k++) {
        var colour = lone[k][0], cx = lone[k][1], cy = lone[k][2], counts = {}, any = false;
        for (var yy = cy - 1; yy <= cy + 1; yy++) {
          for (var xx = cx - 1; xx <= cx + 1; xx++) {
            if ((xx === cx && yy === cy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            var n = res.cells[yy * w + xx];
            if (n < 0 || n === colour) continue;
            counts[n] = (counts[n] || 0) + 1;
            any = true;
          }
        }
        if (!any) continue;
        var best = null;
        Object.keys(counts).map(Number).sort(function (a, b) { return a - b; }).forEach(function (c) {
          if (best === null || counts[c] > counts[best]) best = c;
        });
        res.cells[cy * w + cx] = best;
        changed++;
      }
      if (!changed) break;
    }
    for (k = 0; k < g.cells.length; k++) if (region[k] && res.cells[k] !== g.cells[k]) g.cells[k] = res.cells[k];
  }

  function rectMasks(W, H, border, margin) {
    var mask = [], ring = [], safe = [], inset = border + margin;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var d = Math.min(x, y, W - 1 - x, H - 1 - y);
        mask.push(true);
        ring.push(d < border);
        safe.push(d >= inset);
      }
    }
    return { mask: mask, ring: ring, safe: safe };
  }

  function rowsMask(rows) {
    var out = [];
    rows.forEach(function (r) { for (var i = 0; i < r.length; i++) out.push(r.charAt(i) === "#"); });
    return out;
  }

  /* compose(): lay the content on the piece, refuse it if any stitch falls outside the safe area, then paint. */
  function place(W, H, m, bg, border, content, cx, cy) {
    var x, y;
    for (y = 0; y < content.h; y++) {
      for (x = 0; x < content.w; x++) {
        if (content.cells[y * content.w + x] < 0) continue;
        var px = x + cx, py = y + cy;
        if (px < 0 || py < 0 || px >= W || py >= H) return null;
        if (!m.safe[py * W + px]) return null;
      }
    }
    var canvas = new Grid(W, H), i;
    for (i = 0; i < W * H; i++) if (m.mask[i]) canvas.cells[i] = m.ring[i] ? border : bg;
    cleanRegion(canvas, m.mask);
    paste(canvas, content, cx, cy);
    var placed = new Array(W * H), region = new Array(W * H);
    for (i = 0; i < W * H; i++) {
      if (!m.mask[i]) canvas.cells[i] = T;
      placed[i] = false;
    }
    for (y = 0; y < content.h; y++) {
      for (x = 0; x < content.w; x++) {
        var qx = x + cx, qy = y + cy;
        if (qx >= 0 && qy >= 0 && qx < W && qy < H && content.cells[y * content.w + x] >= 0) placed[qy * W + qx] = true;
      }
    }
    for (i = 0; i < W * H; i++) region[i] = m.mask[i] && !placed[i];
    cleanRegion(canvas, region);
    return canvas;
  }

  Engine.prototype.palette = function (name) {
    var p = this.data.palettes[name];
    if (!p) throw new Error("no colour choice " + name);
    return { bg: this.ids[p.bg], border: this.ids[p.border], ink: this.ids[p.ink], outline: p.outline };
  };

  function result(grid, extra) {
    var out = { ok: true, grid: grid, width: grid.w, height: grid.h };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
    return out;
  }

  /* plan_recipe(fmt="key_fob", style="flags"): the flags in a column, the largest height that fits. */
  Engine.prototype.keyFob = function (chars, paletteName) {
    var f = this.data.formats.key_fob, p = this.palette(paletteName), W = f.width, H = f.height;
    var inner = W - 2 * (f.border + 1), m = rectMasks(W, H, f.border, f.margin);
    for (var i = 0; i < this.data.heights.length; i++) {
      var h = this.data.heights[i];
      if (h + (p.outline !== "none" ? 2 : 0) > inner) continue;
      var content = this.flagsBlock(chars, h, p.outline, "column", f.flag_gap);
      var g = place(W, H, m, p.bg, p.border, content, floorDiv(W - content.w, 2), floorDiv(H - content.h, 2));
      if (g) return result(g, { flagHeight: h });
    }
    return { ok: false, reason: "too-long" };
  };

  /* plan_recipe(fmt="ornament_round", style="flags"): the flags in a grid with the name below in block letters; every
   * size with the name is tried before any without it. */
  Engine.prototype.ornament = function (chars, paletteName) {
    var f = this.data.formats.ornament, p = this.palette(paletteName), D = f.diameter, n = chars.length;
    var m = this._roundMasks || (this._roundMasks = { mask: rowsMask(f.mask), ring: rowsMask(f.ring), safe: rowsMask(f.safe) });
    var seen = {}, cand = [];
    [2, 3, 4, n].forEach(function (c) { var v = Math.min(n, c); if (!seen[v]) { seen[v] = true; cand.push(v); } });
    cand.sort(function (a, b) { return a - b; });
    var root = Math.sqrt(n);
    cand.sort(function (a, b) { return Math.abs(a - root) - Math.abs(b - root); });
    var names = [true, false];
    for (var w = 0; w < names.length; w++) {
      for (var i = 0; i < this.data.heights.length; i++) {
        var h = this.data.heights[i];
        for (var c = 0; c < cand.length; c++) {
          var items = [this.flagsBlock(chars, h, p.outline, "grid", f.flag_gap, cand[c])];
          if (names[w]) items.push(this.text(chars, p.ink));
          var content = stack(items, "column", f.item_gap);
          var g = place(D, D, m, p.bg, p.border, content, floorDiv(D - content.w, 2), floorDiv(D - content.h, 2));
          if (g) return result(g, { flagHeight: h, columns: cand[c], withName: names[w] });
        }
      }
    }
    return { ok: false, reason: "too-long" };
  };

  /* Not a product: the flags in a row on the chosen ground, for reading the code. */
  Engine.prototype.strip = function (chars, paletteName) {
    var f = this.data.formats.strip, p = this.palette(paletteName);
    var content = this.flagsBlock(chars, f.height, p.outline, "row", f.flag_gap);
    var W = content.w + 2 * f.pad, H = content.h + 2 * f.pad, m = rectMasks(W, H, 0, f.pad);
    var g = place(W, H, m, p.bg, p.bg, content, f.pad, f.pad);
    return g ? result(g, { flagHeight: f.height }) : { ok: false, reason: "too-long" };
  };

  /* Threads used, most stitches first, with their stitch counts. */
  Engine.prototype.threadList = function (grid) {
    var counts = {}, out = [], self = this;
    grid.cells.forEach(function (v) { if (v >= 0) counts[v] = (counts[v] || 0) + 1; });
    Object.keys(counts).forEach(function (k) {
      var t = self.threads[Number(k)];
      out.push({ id: Number(k), dmc: t.dmc, name: t.name, hex: t.hex, stitches: counts[k] });
    });
    out.sort(function (a, b) { return b.stitches - a.stitches || a.id - b.id; });
    return out;
  };

  Engine.prototype.stitchCount = function (grid) {
    var n = 0;
    grid.cells.forEach(function (v) { if (v >= 0) n++; });
    return n;
  };

  return { Engine: Engine, Grid: Grid, pyRound: pyRound, stitchesFor: stitchesFor, T: T };
});
