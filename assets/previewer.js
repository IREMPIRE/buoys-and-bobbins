/* The free "your name in signal flags" previewer: the page around previewer-core.js.
 * Runs entirely in the browser from assets/flag-data.js: nothing is sent anywhere, nothing is stored. */
(function () {
  "use strict";
  var data = window.FLAG_DATA;
  var root = document.getElementById("pv");
  if (!data || !root || !window.FlagPreview) return;
  var engine = new window.FlagPreview.Engine(data);
  var $ = function (id) { return document.getElementById(id); };
  var nameInput = $("pv-name");
  var canvas = $("pv-canvas");
  var status = $("pv-status"), facts = $("pv-facts"), legend = $("pv-legend"), threadsEl = $("pv-threads"), order = $("pv-order");
  var PIECE_NAMES = { strip: "flags", key_fob: "key fob", ornament: "round ornament" };
  var LABEL = "Digital preview";
  var LABEL_BAND = 40;

  root.classList.add("pv-ready");

  function picked(name) {
    var el = root.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function inches(stitches, mesh) { return (stitches / mesh).toFixed(1) + '"'; }

  function hexToRgb(hex) {
    var h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function mix(rgb, to, t) {
    return "rgb(" + rgb.map(function (v, i) { return Math.round(v + (to[i] - v) * t); }).join(",") + ")";
  }

  var shades = {};
  function shade(id) {
    if (!shades[id]) {
      var rgb = hexToRgb(engine.threads[id].hex);
      shades[id] = { base: "rgb(" + rgb.join(",") + ")", hole: mix(rgb, [40, 36, 30], 0.55), light: mix(rgb, [255, 255, 255], 0.38), dark: mix(rgb, [0, 0, 0], 0.22) };
    }
    return shades[id];
  }

  /* One cell = one tent stitch, slanting from lower left to upper right as tent stitch does; or the chart's flat square. */
  function draw(cv, grid, cell, mode, x0, w) {
    x0 = x0 || 0;
    w = w || grid.w;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = w * cell, H = grid.h * cell + LABEL_BAND;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var top = LABEL_BAND;
    for (var y = 0; y < grid.h; y++) {
      for (var x = x0; x < x0 + w; x++) {
        var v = grid.get(x, y);
        if (v < 0) continue;
        var px = (x - x0) * cell, py = top + y * cell, s = shade(v);
        if (mode === "chart" || cell < 5) {
          ctx.fillStyle = s.base;
          ctx.fillRect(px, py, cell, cell);
          continue;
        }
        ctx.fillStyle = s.hole;
        ctx.fillRect(px, py, cell, cell);
        ctx.lineCap = "round";
        ctx.strokeStyle = s.dark;
        ctx.lineWidth = cell * 0.74;
        ctx.beginPath();
        ctx.moveTo(px + cell * 0.24, py + cell * 0.8);
        ctx.lineTo(px + cell * 0.8, py + cell * 0.24);
        ctx.stroke();
        ctx.strokeStyle = s.base;
        ctx.lineWidth = cell * 0.6;
        ctx.beginPath();
        ctx.moveTo(px + cell * 0.22, py + cell * 0.76);
        ctx.lineTo(px + cell * 0.76, py + cell * 0.22);
        ctx.stroke();
        ctx.strokeStyle = s.light;
        ctx.lineWidth = Math.max(1, cell * 0.16);
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(px + cell * 0.24, py + cell * 0.6);
        ctx.lineTo(px + cell * 0.6, py + cell * 0.24);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    if (mode === "chart" && cell >= 5) {
      for (var gx = 0; gx <= w; gx++) {
        var heavy = (gx + x0) % 10 === 0;
        ctx.fillStyle = heavy ? "rgba(28,34,48,0.55)" : "rgba(28,34,48,0.16)";
        ctx.fillRect(gx * cell - (heavy ? 0.75 : 0.25), top, heavy ? 1.5 : 0.5, grid.h * cell);
      }
      for (var gy = 0; gy <= grid.h; gy++) {
        var heavyY = gy % 10 === 0;
        ctx.fillStyle = heavyY ? "rgba(28,34,48,0.55)" : "rgba(28,34,48,0.16)";
        ctx.fillRect(0, top + gy * cell - (heavyY ? 0.75 : 0.25), w * cell, heavyY ? 1.5 : 0.5);
      }
    }
    // the label travels with the picture: drawn into the image itself, in a band above the stitches
    ctx.font = "600 15px Inter, system-ui, sans-serif";
    var tw = ctx.measureText(LABEL).width, pillW = tw + 24, pillH = 26;
    ctx.fillStyle = "#1F2D4F";
    roundRect(ctx, 0, 6, pillW, pillH, 13);
    ctx.fill();
    ctx.fillStyle = "#F8F4EC";
    ctx.textBaseline = "middle";
    ctx.fillText(LABEL, 12, 6 + pillH / 2 + 1);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fitCell(gridW, gridH, maxW, maxH) {
    var c = Math.floor(Math.min(maxW / gridW, maxH / gridH));
    return Math.max(2, Math.min(22, c));
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function sizeLines(res, piece) {
    var meshes = data.meshes.slice().sort(function (a, b) { return b - a; });
    return meshes.map(function (m) {
      return "<li><strong>" + m + " mesh:</strong> " + inches(res.width, m) + " x " + inches(res.height, m) + "</li>";
    }).join("");
  }

  function pieceInfo(piece) { return (data.pieces || {})[piece] || null; }

  function render() {
    var read = engine.read(nameInput.value);
    var piece = picked("pv-piece") || "strip";
    var palette = picked("pv-color") || data.palette_order[0];
    var mode = picked("pv-view") || "stitch";
    var notes = [];
    if (read.unsupported.length) {
      notes.push("No signal flag for " + read.unsupported.map(function (c) { return "“" + esc(c) + "”"; }).join(", ") +
        ". Signal flags cover the letters A to Z and the numbers 0 to 9, so the preview leaves " +
        (read.unsupported.length === 1 ? "it" : "them") + " out.");
    }
    if (read.hasSpace && read.flags.length) notes.push("A space has no flag, so the flags run on without a gap.");
    if (!read.flags.length) {
      status.innerHTML = "<p>" + (notes.length ? notes.join(" ") + " " : "") + "Type a name or a word to see it in signal flags.</p>";
      canvas.hidden = true;
      facts.innerHTML = legend.innerHTML = threadsEl.innerHTML = "";
      renderOrder(piece, null);
      return;
    }
    canvas.hidden = false;
    var info = pieceInfo(piece), res = null, shown = piece;
    if (piece !== "strip") {
      if (info && info.max_chars && read.text.length > info.max_chars) {
        notes.push("The " + esc(info.noun) + " pattern takes up to " + info.max_chars + " characters (its order box's limit), so here are the flags on their own.");
      } else {
        if (piece === "key_fob") res = engine.keyFob(read.flags, palette);
        else res = engine.ornament(read.flags, palette);
        if (!res.ok) {
          notes.push(esc(read.text) + " doesn't fit a " + PIECE_NAMES[piece] + ": try fewer letters. Here are the flags on their own.");
          res = null;
        }
      }
      if (!res) shown = "strip";
    }
    if (!res) res = engine.strip(read.flags, palette);
    var wrapW = canvas.parentNode.clientWidth || 600;
    var maxH = shown === "key_fob" ? 620 : 460;
    draw(canvas, res.grid, fitCell(res.width, res.height, wrapW, maxH), mode);
    var what = shown === "strip" ? "signal flags" : "signal flags on a " + PIECE_NAMES[shown];
    canvas.setAttribute("aria-label", LABEL + ": " + read.flags.join("") + " in " + what + ", " + data.palettes[palette].label.toLowerCase() + " colors");
    status.innerHTML = notes.length ? "<p>" + notes.join(" ") + "</p>" : "";
    var lines = [];
    var stitched = engine.stitchCount(res.grid);
    if (shown === "strip") {
      lines.push("<li><strong>" + plural(read.flags.length, "flag", "flags") + "</strong>, " + res.flagHeight + " stitches tall, in a row: " +
        res.width + " x " + res.height + " stitches with the ground around them.</li>");
    } else {
      var how = res.flagHeight + " stitches tall";
      if (shown === "ornament") how += ", " + plural(res.columns, "column", "columns") + (res.withName ? ", the name below in block letters" : ", no room for the name below");
      lines.push("<li><strong>" + res.width + " x " + res.height + " stitches</strong> (" + stitched.toLocaleString("en-US") + " stitched). Flags " + how + ".</li>");
    }
    facts.innerHTML = "<h3>Size</h3><ul>" + lines.join("") + sizeLines(res, shown) + "</ul>";
    legend.innerHTML = "<h3>Your flags</h3><ol class=\"pv-chips\">" + read.flags.map(function (c) {
      var name = data.phonetic[c] || ("Pennant " + c);
      return "<li><b>" + esc(c) + "</b> " + esc(name) + "</li>";
    }).join("") + "</ol>";
    var list = engine.threadList(res.grid);
    threadsEl.innerHTML = "<h3>" + plural(list.length, "thread", "threads") + " (DMC six-strand floss)</h3><ul class=\"pv-threads\">" +
      list.map(function (t) {
        return "<li><span class=\"sw\" style=\"background:" + esc(t.hex) + "\"></span><span><b>DMC " + esc(t.dmc) + "</b> " + esc(t.name) +
          "</span><span class=\"n\">" + t.stitches.toLocaleString("en-US") + "</span></li>";
      }).join("") + "</ul><p class=\"note\">Colors on screen are approximate; check them against a DMC color card.</p>";
    renderOrder(piece === "strip" ? null : piece, read);
  }

  function renderOrder(piece, read) {
    var pieces = data.pieces || {}, keys = piece ? [piece] : ["key_fob", "ornament"];
    var rows = keys.filter(function (k) { return pieces[k]; }).map(function (k) {
      var p = pieces[k];
      if (p.url) {
        return "<li><a class=\"btn\" href=\"" + esc(p.url) + "\">Order the " + esc(p.noun) + " on Etsy</a></li>";
      }
      var page = p.page ? " <a href=\"" + esc(p.page) + "\">About this pattern</a>." : "";
      return "<li>The " + esc(p.noun) + " pattern is not yet in the Etsy shop." + page + "</li>";
    });
    var live = keys.some(function (k) { return pieces[k] && pieces[k].url; });
    order.innerHTML = (rows.length ? "<ul>" + rows.join("") + "</ul>" : "") +
      (live ? "" : "<p><a class=\"btn btn-ghost\" href=\"" + esc(data.shop_url) + "\">Visit the shop on Etsy</a></p>");
  }

  // a name or a piece in the address (?name=EMMA&piece=key_fob) starts the previewer with it
  try {
    var params = new URLSearchParams(window.location.search);
    var q = params.get("name"), pc = params.get("piece");
    if (q) nameInput.value = q.slice(0, 40);
    var radio = pc && root.querySelector('input[name="pv-piece"][value="' + pc.replace(/[^a-z_]/g, "") + '"]');
    if (radio) radio.checked = true;
  } catch (e) { /* old browser: keep the defaults */ }

  root.addEventListener("input", render);
  root.addEventListener("change", render);
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 120);
  });
  render();
})();
