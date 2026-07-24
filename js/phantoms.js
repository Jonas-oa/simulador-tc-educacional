/* =====================================================================
   Fantomas de TC SIMULADOS (didáticos) — gera, por região, o topograma
   (scout LAT e AP) e a pilha de cortes axiais a partir de um modelo
   geométrico. NÃO é imagem clínica: é uma simulação para treinar
   operação/posicionamento.

   Arquitetura preparada para troca por DICOM: o app consome esta origem
   por um contrato mínimo (has / manifest / axial(i) / scout(kind)); no
   futuro um provedor DICOM entra no mesmo lugar sem tocar no resto.

   Realismo (didático): contornos orgânicos (não elipses perfeitas),
   tecidos com gradiente, osso em camadas, ruído em duas escalas
   (mottle de baixa frequência + grão fino) e leve borrão, imitando a
   textura de uma TC. Tudo em <canvas>, devolvido como dataURL, com cache.
   ===================================================================== */
(function (global) {
  "use strict";

  var CACHE = {};
  var W = 512, H = 512;

  function canvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function clamp(x) { return x < 0 ? 0 : x > 255 ? 255 : x; }
  function gray(v) { v = clamp(v | 0); return "rgb(" + v + "," + v + "," + v + ")"; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

  function ell(ctx, cx, cy, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), rot || 0, 0, Math.PI * 2); }
  function fillEll(ctx, cx, cy, rx, ry, v, rot) { ell(ctx, cx, cy, rx, ry, rot); ctx.fillStyle = gray(v); ctx.fill(); }

  // contorno "orgânico": elipse com ondulação suave determinística
  function wob(a, amp, k) { return 1 + amp * (Math.sin(a * 3 + k) * 0.5 + Math.sin(a * 5 + k * 1.7) * 0.3 + Math.sin(a * 2 + k * 0.6) * 0.2); }
  function blob(ctx, cx, cy, rx, ry, amp, k, rot) {
    rot = rot || 0; var N = 64, cs = Math.cos(rot), sn = Math.sin(rot);
    ctx.beginPath();
    for (var i = 0; i <= N; i++) {
      var a = i / N * Math.PI * 2, r = wob(a, amp, k);
      var px = Math.cos(a) * rx * r, py = Math.sin(a) * ry * r;
      var x = cx + px * cs - py * sn, y = cy + px * sn + py * cs;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function fillBlob(ctx, cx, cy, rx, ry, v, amp, k, rot) { blob(ctx, cx, cy, rx, ry, amp || 0.03, k || 0, rot); ctx.fillStyle = gray(v); ctx.fill(); }
  // órgão com gradiente radial (centro→borda)
  function organ(ctx, cx, cy, rx, ry, vc, ve, amp, k, rot) {
    var g = ctx.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, gray(vc)); g.addColorStop(1, gray(ve));
    blob(ctx, cx, cy, rx, ry, amp || 0.03, k || 0, rot); ctx.fillStyle = g; ctx.fill();
  }

  // grão fino (preserva fundo puro-preto)
  function grain(ctx, w, h, amt) {
    var im = ctx.getImageData(0, 0, w, h), d = im.data;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i] < 4) continue;
      var n = (Math.random() - 0.5) * amt;
      d[i] = clamp(d[i] + n); d[i + 1] = clamp(d[i + 1] + n); d[i + 2] = clamp(d[i + 2] + n);
    }
    ctx.putImageData(im, 0, 0);
  }
  // mottle de baixa frequência (granulado correlacionado da TC)
  function mottle(ctx, w, h, cell, amt, alpha) {
    var nw = Math.max(2, Math.ceil(w / cell)), nh = Math.max(2, Math.ceil(h / cell));
    var nc = canvas(nw, nh), nx = nc.getContext("2d"), id = nx.createImageData(nw, nh), d = id.data;
    for (var i = 0; i < d.length; i += 4) { var v = clamp(128 + (Math.random() - 0.5) * amt); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    nx.putImageData(id, 0, 0);
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = "soft-light";
    ctx.imageSmoothingEnabled = true; ctx.drawImage(nc, 0, 0, nw, nh, 0, 0, w, h);
    ctx.restore();
  }
  // vinheta suave (leve escurecimento nas bordas)
  function vignette(ctx, w, h, strength) {
    var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.62);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0," + strength + ")");
    ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  function fresh(w, h) { var c = canvas(w, h), x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, w, h); return { c: c, x: x }; }
  function finishAxial(ctx) { mottle(ctx, W, H, 5, 120, 0.55); grain(ctx, W, H, 16); vignette(ctx, W, H, 0.22); }

  /* ---------------------- CRÂNIO ---------------------- */
  function cranioAxial(ctx, t) {
    var cx = 256, cy = 266;
    var taper = t > 0.72 ? 1 - smooth((t - 0.72) / 0.28) * 0.44 : 1;
    var baseW = t < 0.24 ? 1 + (0.24 - t) * 0.5 : 1;
    var rx = 150 * taper * baseW, ry = 176 * taper;
    var base = t < 0.27;

    ctx.filter = "blur(0.7px)";
    fillBlob(ctx, cx, cy, rx + 9, ry + 9, 118, 0.012, 3.1);   // pele (fina, densa)
    fillBlob(ctx, cx, cy, rx + 6, ry + 6, 58, 0.012, 3.1);    // gordura subgaleal
    // crânio em 3 camadas (tábua externa / díploe / tábua interna)
    fillBlob(ctx, cx, cy, rx, ry, 242, 0.02, 1.4);
    fillBlob(ctx, cx, cy, rx - 4, ry - 4, 168, 0.02, 1.4);    // díploe (esponjoso)
    fillBlob(ctx, cx, cy, rx - 8, ry - 8, 236, 0.02, 1.4);
    // encéfalo: substância branca (base) + fita cortical (cinzenta)
    organ(ctx, cx, cy, rx - 12, ry - 13, 104, 96, 0.03, 2.2); // SB
    ctx.filter = "none";
    ctx.save(); ctx.lineWidth = 9; ctx.strokeStyle = gray(120); ctx.globalAlpha = 0.6; // córtex
    blob(ctx, cx, cy, rx - 15, ry - 16, 0.03, 2.2); ctx.stroke(); ctx.restore();
    // sulcos (LCR) — riscos finos escuros a partir do córtex
    ctx.save(); ctx.strokeStyle = gray(60); ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
    for (var s = 0; s < 12; s++) {
      var a = (s / 12) * Math.PI * 2 + 0.3, r0 = (rx - 16);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (rx - 16), cy + Math.sin(a) * (ry - 17));
      ctx.lineTo(cx + Math.cos(a) * (rx - 34), cy + Math.sin(a) * (ry - 35));
      ctx.stroke();
    }
    ctx.restore();
    // foice inter-hemisférica (linha média A-P, discreta)
    ctx.strokeStyle = gray(128); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy - ry + 20); ctx.lineTo(cx, cy + ry - 20); ctx.stroke();

    if (t > 0.34 && t < 0.74) {                              // ventrículos laterais (LCR)
      var vp = Math.sin(((t - 0.34) / 0.40) * Math.PI);
      ctx.filter = "blur(0.6px)";
      fillBlob(ctx, cx - 17, cy - 6, 7 + 5 * vp, 24 + 6 * vp, 55, 0.08, 5, -0.35);
      fillBlob(ctx, cx + 17, cy - 6, 7 + 5 * vp, 24 + 6 * vp, 55, 0.08, 9, 0.35);
      fillEll(ctx, cx, cy + 14, 6 * vp, 12 * vp, 58);        // 3º ventrículo aprox.
      ctx.filter = "none";
    }
    if (base) {
      var k = smooth((0.27 - t) / 0.27);
      ctx.filter = "blur(0.6px)";
      fillBlob(ctx, cx - 60, cy - 92, 40, 30, 34, 0.05, 4);  // órbita (gordura/ar)
      fillBlob(ctx, cx + 60, cy - 92, 40, 30, 34, 0.05, 7);
      fillEll(ctx, cx - 60, cy - 92, 13, 13, 118);           // globo
      fillEll(ctx, cx + 60, cy - 92, 13, 13, 118);
      fillEll(ctx, cx, cy - 66, 24, 30 * k, 20);             // seios/nasal (ar)
      ctx.filter = "none";
      ctx.save(); ctx.strokeStyle = gray(232); ctx.lineWidth = 13 * k; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx - 118, cy + 34); ctx.lineTo(cx - 28, cy + 6); ctx.stroke();  // rochedos
      ctx.beginPath(); ctx.moveTo(cx + 118, cy + 34); ctx.lineTo(cx + 28, cy + 6); ctx.stroke();
      ctx.restore();
      spongy(ctx, cx - 120, cy + 62, 26, 22, k);             // mastoides (ar em osso)
      spongy(ctx, cx + 120, cy + 62, 26, 22, k);
      fillEll(ctx, cx, cy + 92, 26 * k, 24 * k, 96);         // tronco/forame
      fillEll(ctx, cx, cy + 92, 12 * k, 11 * k, 60);
    }
    finishAxial(ctx);
  }
  function spongy(ctx, cx, cy, rx, ry, k) {
    ctx.save(); fillEll(ctx, cx, cy, rx, ry, 214); ctx.fillStyle = gray(18);
    for (var i = 0; i < 30; i++) {
      var a = Math.random() * Math.PI * 2, r = Math.random();
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rx * r * 0.8, cy + Math.sin(a) * ry * r * 0.8, 1.4 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------------- TÓRAX ---------------------- */
  function toraxAxial(ctx, t) {
    var cx = 256, cy = 262, apex = t;
    var rx = lerp(208, 150, smooth(apex)), ry = lerp(150, 132, smooth(apex));
    ctx.filter = "blur(0.8px)";
    fillBlob(ctx, cx, cy, rx + 6, ry + 6, 150, 0.02, 2.0);   // pele
    fillBlob(ctx, cx, cy, rx + 2, ry + 2, 62, 0.02, 2.0);    // gordura subcutânea
    organ(ctx, cx, cy, rx - 6, ry - 6, 96, 88, 0.03, 2.4);   // músculo/partes moles
    ctx.filter = "none";

    var lungF = Math.sin(smooth(1 - Math.abs(apex - 0.55) / 0.55) * Math.PI * 0.5);
    var lrx = lerp(50, 86, lungF), lry = lerp(72, 110, lungF);
    // pulmões (ar) com marcas vasculares ramificadas a partir do hilo
    lung(ctx, cx - 80, cy - 6, lrx, lry, 5, -1);
    lung(ctx, cx + 80, cy - 6, lrx * 0.94, lry, 9, 1);

    // mediastino / coração — projeta p/ a ESQUERDA do paciente = DIREITA da imagem
    var heart = smooth(1 - apex) * 0.9 + 0.1;
    ctx.filter = "blur(0.7px)";
    organ(ctx, cx + 10, cy + 10, lerp(26, 60, heart), lerp(30, 70, heart), 112, 100, 0.05, 6);   // coração
    fillEll(ctx, cx - 8, cy - 34, 18, 20, 118);             // aorta ascendente/arco
    fillEll(ctx, cx + 14, cy - 30, 12, 13, 112);            // VCS / a. pulmonar
    if (apex > 0.45) fillEll(ctx, cx - 2, cy - 26, 9, 9, 20); // traqueia/carina (ar)
    ctx.filter = "none";

    if (apex < 0.24) {                                       // base: fígado/baço/estômago
      var kf = smooth((0.24 - apex) / 0.24);
      ctx.filter = "blur(0.8px)";
      organ(ctx, cx - 92, cy + 42, 74 * kf, 62 * kf, 122, 110, 0.04, 3);   // fígado (imagem esq.)
      organ(ctx, cx + 86, cy + 58, 42 * kf, 36 * kf, 104, 96, 0.05, 8);    // baço (imagem dir.)
      fillEll(ctx, cx + 40, cy + 48, 22 * kf, 18 * kf, 22);                // bolha gástrica (ar)
      ctx.filter = "none";
    }

    // coluna: corpo vertebral (cortical + trabecular) + canal + apófises
    vertebra(ctx, cx, cy + ry - 24);
    // esterno
    fillEll(ctx, cx, cy - ry + 16, 15, 8, 226);
    // costelas — arcos corticais curtos ao redor
    ctx.save(); ctx.strokeStyle = gray(232); ctx.lineWidth = 7; ctx.lineCap = "round";
    for (var sgn = -1; sgn <= 1; sgn += 2) for (var r = 0; r < 4; r++) {
      var a0 = -0.55 + r * 0.42;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx - 3, ry - 3, 0, sgn * a0, sgn * (a0 + 0.24), sgn < 0); ctx.stroke();
    }
    ctx.restore();
    finishAxial(ctx);
  }
  function lung(ctx, cx, cy, rx, ry, k, side) {
    ctx.save(); ctx.filter = "blur(0.7px)"; fillBlob(ctx, cx, cy, rx, ry, 14, 0.05, k); ctx.filter = "none";
    // marcas vasculares: linhas ramificadas do hilo (lado do mediastino) p/ fora
    var hx = cx - side * rx * 0.7, hy = cy + ry * 0.1;
    ctx.strokeStyle = gray(70); ctx.globalAlpha = 0.55; ctx.lineCap = "round";
    for (var i = 0; i < 7; i++) {
      var a = -0.9 + i * 0.28, len = rx * (0.7 + Math.random() * 0.5);
      ctx.lineWidth = 2.4 - i * 0.1;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      var mx = hx + side * Math.cos(a) * len * 0.6, my = hy + Math.sin(a) * len * 0.6;
      var ex = hx + side * Math.cos(a) * len, ey = hy + Math.sin(a) * len;
      ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    }
    ctx.restore();
  }
  function vertebra(ctx, cx, cy) {
    ctx.save();
    fillBlob(ctx, cx, cy, 30, 24, 236, 0.03, 1);            // cortical
    fillBlob(ctx, cx, cy, 24, 18, 150, 0.04, 2);            // trabecular
    ctx.fillStyle = gray(120);
    for (var i = 0; i < 40; i++) { var a = Math.random() * 6.28, r = Math.random(); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 22 * r, cy + Math.sin(a) * 16 * r, 0.9 + Math.random(), 0, 6.28); ctx.fill(); }
    fillEll(ctx, cx, cy + 22, 12, 9, 40);                   // canal medular
    ctx.strokeStyle = gray(228); ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx, cy + 30); ctx.lineTo(cx, cy + 48); ctx.stroke();   // apófise espinhosa
    ctx.beginPath(); ctx.moveTo(cx - 26, cy + 14); ctx.lineTo(cx - 46, cy + 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 26, cy + 14); ctx.lineTo(cx + 46, cy + 22); ctx.stroke();
    ctx.restore();
  }

  /* ---------------------- SCOUTS (projeções tipo raio-X) ---------------------- */
  function bg(ctx, w, h) {                                   // fundo com leve gradiente
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#050607"); g.addColorStop(1, "#0a0c0e");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function finishScout(ctx, w, h) { mottle(ctx, w, h, 6, 90, 0.4); grain(ctx, w, h, 12); vignette(ctx, w, h, 0.28); }

  function cranioScoutLat(ctx, w, h) {
    // crânio de perfil: cranial à ESQUERDA, anterior p/ CIMA.
    bg(ctx, w, h);
    var cx = w * 0.44, cy = h * 0.47, R = h * 0.30;
    ctx.save(); ctx.filter = "blur(0.8px)";
    // partes moles da cabeça+face (silhueta orgânica preenchida)
    ctx.fillStyle = gray(60);
    ctx.beginPath();
    ctx.moveTo(cx - R * 1.05, cy - R * 0.15);
    ctx.bezierCurveTo(cx - R * 1.1, cy - R * 1.05, cx + R * 0.35, cy - R * 1.3, cx + R * 0.85, cy - R * 0.6);
    ctx.bezierCurveTo(cx + R * 1.25, cy - R * 0.15, cx + R * 1.3, cy + R * 0.15, cx + R * 1.0, cy + R * 0.4);
    ctx.lineTo(cx + R * 1.3, cy + R * 1.05); ctx.lineTo(cx + R * 0.78, cy + R * 1.1); ctx.lineTo(cx + R * 0.62, cy + R * 0.5);
    ctx.bezierCurveTo(cx + R * 0.1, cy + R * 0.95, cx - R * 1.05, cy + R * 0.85, cx - R * 1.05, cy - R * 0.15);
    ctx.closePath(); ctx.fill();
    // encéfalo + calota (com díploe)
    organ(ctx, cx - R * 0.12, cy - R * 0.1, R * 0.74, R * 0.82, 96, 84, 0.03, 2);
    ctx.filter = "none";
    ctx.strokeStyle = gray(210); ctx.lineWidth = 7; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.ellipse(cx - R * 0.12, cy - R * 0.1, R * 0.82, R * 0.9, 0, Math.PI * 0.12, Math.PI * 1.75); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = gray(185); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - R * 0.55, cy + R * 0.3); ctx.lineTo(cx + R * 0.72, cy + R * 0.15); ctx.stroke(); // base
    ctx.beginPath(); ctx.moveTo(cx + R * 0.55, cy + R * 0.15); ctx.quadraticCurveTo(cx + R * 1.05, cy + R * 0.45, cx + R * 0.7, cy + R * 0.6); ctx.stroke();
    ctx.strokeStyle = gray(205); ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx + R * 0.7, cy + R * 0.55); ctx.lineTo(cx + R * 1.05, cy + R * 1.0); ctx.stroke(); // cervical
    finishScout(ctx, w, h);
  }
  function cranioScoutAP(ctx, w, h) {
    bg(ctx, w, h);
    var cx = w * 0.5, cy = h * 0.40;
    ctx.save(); ctx.filter = "blur(0.8px)";
    organ(ctx, cx, cy, w * 0.30, h * 0.30, 78, 58, 0.02, 1);       // massa craniana
    ctx.filter = "none";
    ctx.strokeStyle = gray(208); ctx.lineWidth = 7; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.30, h * 0.30, 0, 0, Math.PI * 2); ctx.stroke();     // calota
    ctx.restore();
    ctx.save(); ctx.filter = "blur(0.6px)"; ctx.fillStyle = gray(40);
    fillEll(ctx, cx - w * 0.13, cy + h * 0.02, w * 0.085, h * 0.05, 40);  // órbitas
    fillEll(ctx, cx + w * 0.13, cy + h * 0.02, w * 0.085, h * 0.05, 40);
    fillEll(ctx, cx, cy + h * 0.11, w * 0.05, h * 0.05, 30);              // seios
    ctx.filter = "none"; ctx.restore();
    ctx.strokeStyle = gray(190); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.20, w * 0.20, h * 0.10, 0, 0, Math.PI); ctx.stroke();   // maxila
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.24, w * 0.16, h * 0.10, 0, 0, Math.PI); ctx.stroke();   // mandíbula
    ctx.lineWidth = 7; ctx.strokeStyle = gray(205);
    ctx.beginPath(); ctx.moveTo(cx, cy + h * 0.30); ctx.lineTo(cx, cy + h * 0.52); ctx.stroke();        // cervical
    finishScout(ctx, w, h);
  }
  function toraxScoutAP(ctx, w, h) {
    bg(ctx, w, h);
    var cx = w * 0.5, cy = h * 0.46;
    // partes moles do tronco
    ctx.save(); ctx.filter = "blur(1px)"; fillBlob(ctx, cx, cy, w * 0.40, h * 0.42, 66, 0.03, 2); ctx.filter = "none"; ctx.restore();
    // campos pulmonares (ar, escuros) com trama vascular
    scoutLungAP(ctx, cx - w * 0.17, cy, w * 0.155, h * 0.30, 1);
    scoutLungAP(ctx, cx + w * 0.17, cy, w * 0.155, h * 0.30, -1);
    // mediastino/coração (claro) projetando p/ a esquerda do paciente (dir. img)
    ctx.save(); ctx.filter = "blur(0.8px)"; ctx.fillStyle = gray(120);
    ctx.beginPath(); ctx.moveTo(cx - w * 0.05, cy - h * 0.24);
    ctx.bezierCurveTo(cx + w * 0.18, cy + h * 0.02, cx + w * 0.13, cy + h * 0.16, cx + w * 0.02, cy + h * 0.22);
    ctx.lineTo(cx - w * 0.06, cy + h * 0.22);
    ctx.bezierCurveTo(cx - w * 0.12, cy - h * 0.02, cx - w * 0.05, cy - h * 0.24, cx - w * 0.05, cy - h * 0.24);
    ctx.fill();
    fillEll(ctx, cx - w * 0.08, cy - h * 0.20, w * 0.05, h * 0.03, 150);   // botão aórtico
    ctx.filter = "none"; ctx.restore();
    // gradeado costal + coluna + clavículas
    ctx.strokeStyle = gray(205); ctx.globalAlpha = 0.8; ctx.lineWidth = 3;
    for (var sgn = -1; sgn <= 1; sgn += 2) for (var r = 0; r < 8; r++) {
      var y = cy - h * 0.27 + r * h * 0.07;
      ctx.beginPath(); ctx.moveTo(cx + sgn * w * 0.03, y);
      ctx.quadraticCurveTo(cx + sgn * w * 0.24, y + h * 0.02, cx + sgn * w * 0.31, y + h * 0.11); ctx.stroke();
    }
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.30); ctx.lineTo(cx, cy + h * 0.28); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.02, cy - h * 0.30); ctx.quadraticCurveTo(cx - w * 0.16, cy - h * 0.35, cx - w * 0.27, cy - h * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w * 0.02, cy - h * 0.30); ctx.quadraticCurveTo(cx + w * 0.16, cy - h * 0.35, cx + w * 0.27, cy - h * 0.28); ctx.stroke();
    // cúpulas diafragmáticas
    ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.33, cy + h * 0.30); ctx.quadraticCurveTo(cx - w * 0.17, cy + h * 0.17, cx - w * 0.02, cy + h * 0.30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w * 0.02, cy + h * 0.33); ctx.quadraticCurveTo(cx + w * 0.16, cy + h * 0.22, cx + w * 0.30, cy + h * 0.32); ctx.stroke();
    finishScout(ctx, w, h);
  }
  function scoutLungAP(ctx, cx, cy, rx, ry, side) {
    ctx.save(); ctx.filter = "blur(0.9px)"; fillBlob(ctx, cx, cy, rx, ry, 28, 0.05, side * 3); ctx.filter = "none";
    ctx.strokeStyle = gray(70); ctx.globalAlpha = 0.5; ctx.lineCap = "round";
    var hx = cx + side * rx * 0.55, hy = cy;
    for (var i = 0; i < 6; i++) {
      var a = -0.8 + i * 0.32; ctx.lineWidth = 2.2 - i * 0.15;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(hx - side * rx * 0.4, hy + Math.sin(a) * ry * 0.5, hx - side * rx * (0.8 + Math.random() * 0.4), hy + Math.sin(a) * ry * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }
  function toraxScoutLat(ctx, w, h) {
    bg(ctx, w, h);
    var cx = w * 0.5, cy = h * 0.46, bw = w * 0.34, bh = h * 0.30;
    ctx.save(); ctx.filter = "blur(1px)";
    fillBlob(ctx, cx, cy, bw, bh, 66, 0.03, 2);                       // tronco
    organ(ctx, cx - w * 0.02, cy - h * 0.02, bw * 0.82, bh * 0.74, 30, 20, 0.05, 4);  // pulmão retroesternal
    organ(ctx, cx + w * 0.05, cy + h * 0.11, w * 0.13, h * 0.13, 118, 104, 0.05, 6);  // coração
    ctx.filter = "none"; ctx.restore();
    ctx.fillStyle = gray(214);                                        // corpos vertebrais (posterior=baixo)
    for (var v = -3; v <= 3; v++) fillBlob(ctx, cx + v * bw * 0.24, cy + bh * 0.82, bw * 0.1, bh * 0.13, 214, 0.05, v);
    ctx.strokeStyle = gray(208); ctx.lineWidth = 5;                  // esterno (anterior=cima)
    ctx.beginPath(); ctx.moveTo(cx - w * 0.12, cy - bh * 0.82); ctx.lineTo(cx + w * 0.06, cy - bh * 0.7); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = gray(150);                  // diafragma
    ctx.beginPath(); ctx.moveTo(cx - bw * 0.9, cy + bh * 0.55); ctx.quadraticCurveTo(cx, cy + bh * 0.2, cx + bw * 0.85, cy + bh * 0.5); ctx.stroke();
    finishScout(ctx, w, h);
  }

  /* ---------------------- registro ---------------------- */
  var REGIONS = {
    cranio: {
      nome: "Crânio (simulado)", cortes: 60, largura: W, altura: H,
      esp: { x: 0.43, y: 0.43, z: 3.0 }, janela: { wl: 40, ww: 400 },
      axial: cranioAxial, lat: cranioScoutLat, ap: cranioScoutAP, scoutW: 640, scoutH: 560, apW: 520, apH: 640
    },
    torax: {
      nome: "Tórax (simulado)", cortes: 64, largura: W, altura: H,
      esp: { x: 0.70, y: 0.70, z: 5.0 }, janela: { wl: -600, ww: 1500 },
      axial: toraxAxial, lat: toraxScoutLat, ap: toraxScoutAP, scoutW: 680, scoutH: 520, apW: 560, apH: 680
    }
  };

  function has(region) { return !!REGIONS[region]; }
  function manifest(region) {
    var r = REGIONS[region]; if (!r) return null;
    return {
      id: region, nome: r.nome, modalidade: "CT", plano: "axial",
      cortes: r.cortes, largura: r.largura, altura: r.altura,
      padrao: "sintetico", sintetico: true,
      espacamento_mm: { x: r.esp.x, y: r.esp.y, z: r.esp.z },
      janela_exibicao: { wl: r.janela.wl, ww: r.janela.ww, obs: "Imagem SIMULADA (fantoma didático)." },
      fonte: { nome: "Fantoma sintético (simulador)", licenca: "Imagem gerada — não é dado clínico; substituir por DICOM em atualização futura." }
    };
  }
  function axial(region, i) {
    var r = REGIONS[region]; if (!r) return null;
    var key = region + "|axial|" + i, hit = CACHE[key]; if (hit) return hit;
    var t = r.cortes > 1 ? (i / (r.cortes - 1)) : 0;
    var f = fresh(r.largura, r.altura); r.axial(f.x, t);
    return (CACHE[key] = f.c.toDataURL("image/png"));
  }
  function scout(region, kind) {
    var r = REGIONS[region]; if (!r) return null;
    var frontal = (kind === "frontal");
    var key = region + "|scout|" + (frontal ? "ap" : "lat"), hit = CACHE[key]; if (hit) return hit;
    var w = frontal ? r.apW : r.scoutW, h = frontal ? r.apH : r.scoutH;
    var f = fresh(w, h); (frontal ? r.ap : r.lat)(f.x, w, h);
    return (CACHE[key] = f.c.toDataURL("image/png"));
  }

  global.CTPhantom = { has: has, manifest: manifest, axial: axial, scout: scout, regions: Object.keys(REGIONS) };
})(window);
