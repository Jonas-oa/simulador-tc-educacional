/* =====================================================================
   Fantomas de TC SIMULADOS (didáticos) — gera, por região, o topograma
   (scout LAT e AP) e a pilha de cortes axiais a partir de um modelo
   geométrico simples. NÃO é imagem clínica: é uma simulação esquemática
   para treinar operação/posicionamento.

   Arquitetura preparada para troca por DICOM: o app consome esta origem
   por um contrato mínimo (has / manifest / axial(i) / scout(kind)); no
   futuro um provedor DICOM entra no mesmo lugar sem tocar no resto.

   Sem dependências, sem assets — tudo desenhado em <canvas> e devolvido
   como dataURL, com cache por região+índice.
   ===================================================================== */
(function (global) {
  "use strict";

  var CACHE = {};                 // "regiao|axial|i" / "regiao|scout|kind" -> dataURL
  var W = 512, H = 512;           // resolução dos cortes axiais

  function canvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function clamp(x) { return x < 0 ? 0 : x > 255 ? 255 : x; }
  function gray(v) { v = clamp(v | 0); return "rgb(" + v + "," + v + "," + v + ")"; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

  function ell(ctx, cx, cy, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), rot || 0, 0, Math.PI * 2);
  }
  function fillEll(ctx, cx, cy, rx, ry, v, rot) { ell(ctx, cx, cy, rx, ry, rot); ctx.fillStyle = gray(v); ctx.fill(); }

  // Ruído tipo-CT: granulado leve sobre o que não é fundo puro.
  function noise(ctx, w, h, amt) {
    var im = ctx.getImageData(0, 0, w, h), d = im.data;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i] < 5 && d[i + 1] < 5 && d[i + 2] < 5) continue;
      var n = (Math.random() - 0.5) * amt;
      d[i] = clamp(d[i] + n); d[i + 1] = clamp(d[i + 1] + n); d[i + 2] = clamp(d[i + 2] + n);
    }
    ctx.putImageData(im, 0, 0);
  }
  function fresh(w, h) {
    var c = canvas(w, h), x = c.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, w, h);
    return { c: c, x: x };
  }

  /* ---------------------- CRÂNIO ---------------------- */
  // t: 0 = base (forame magno) → 1 = vértice
  function cranioAxial(ctx, t) {
    var cx = 256, cy = 268;
    var taper = t > 0.72 ? 1 - smooth((t - 0.72) / 0.28) * 0.42 : 1;  // afina no vértice
    var baseW = t < 0.24 ? 1 + (0.24 - t) * 0.5 : 1;                  // base mais larga
    var rx = 150 * taper * baseW, ry = 176 * taper;
    var base = t < 0.26;                 // cortes baixos: órbitas/seios/mastoide

    ctx.filter = "blur(0.6px)";
    fillEll(ctx, cx, cy, rx + 8, ry + 8, 66);          // couro cabeludo / gordura
    fillEll(ctx, cx, cy, rx, ry, 232);                 // calota óssea
    fillEll(ctx, cx, cy, rx - 12, ry - 13, 112);       // encéfalo (partes moles)
    ctx.filter = "none";

    // foice inter-hemisférica (linha média A-P = vertical)
    ctx.strokeStyle = gray(150); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy - ry + 18); ctx.lineTo(cx, cy + ry - 18); ctx.stroke();

    if (t > 0.34 && t < 0.74) {                        // ventrículos laterais
      var vp = Math.sin(((t - 0.34) / 0.40) * Math.PI);
      fillEll(ctx, cx - 20, cy - 8, 8 + 4 * vp, 30, 66, -0.15);
      fillEll(ctx, cx + 20, cy - 8, 8 + 4 * vp, 30, 66, 0.15);
      fillEll(ctx, cx, cy + 20, 10 * vp, 8 * vp, 64);  // 3º/4º ventrículo aproximado
    }

    if (base) {
      var k = smooth((0.26 - t) / 0.26);
      // órbitas (anterior = topo): dois "olhos" escuros
      fillEll(ctx, cx - 62, cy - 96, 40, 30, 40);
      fillEll(ctx, cx + 62, cy - 96, 40, 30, 40);
      fillEll(ctx, cx - 62, cy - 96, 12, 12, 150);     // globo/nervo aproximado
      fillEll(ctx, cx + 62, cy - 96, 12, 12, 150);
      // seios/nasal (ar) na linha média anterior
      fillEll(ctx, cx, cy - 70, 26, 30 * k, 18);
      // rochedos/petrosos (osso) transversais
      ctx.save(); ctx.strokeStyle = gray(228); ctx.lineWidth = 12 * k; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx - 120, cy + 30); ctx.lineTo(cx - 30, cy + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 120, cy + 30); ctx.lineTo(cx + 30, cy + 4); ctx.stroke();
      ctx.restore();
      // células mastóideas (ar) póstero-laterais
      spongy(ctx, cx - 118, cy + 60, 26, 22, k);
      spongy(ctx, cx + 118, cy + 60, 26, 22, k);
      // forame magno / canal (posterior, escuro)
      fillEll(ctx, cx, cy + 96, 26 * k, 24 * k, 52);
    }
    noise(ctx, W, H, 20);
  }
  // textura esponjosa (ar em osso): mastoide / etc.
  function spongy(ctx, cx, cy, rx, ry, k) {
    ctx.save();
    fillEll(ctx, cx, cy, rx, ry, 210);
    ctx.fillStyle = gray(20);
    for (var i = 0; i < 26; i++) {
      var a = Math.random() * Math.PI * 2, r = Math.random();
      var px = cx + Math.cos(a) * rx * r * 0.8, py = cy + Math.sin(a) * ry * r * 0.8;
      ctx.beginPath(); ctx.arc(px, py, 1.6 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function cranioScoutLat(ctx, w, h) {
    // crânio de perfil: crânio (cranial) à ESQUERDA, face (anterior) p/ CIMA,
    // occipúcio (posterior) embaixo, pescoço (caudal) à direita — bate com os
    // rótulos A/P · Cabeça/Pés do topograma lateral.
    var cx = w * 0.44, cy = h * 0.47, R = h * 0.30;
    ctx.save(); ctx.filter = "blur(0.6px)";
    // silhueta de partes moles da cabeça+face (preenchida)
    ctx.fillStyle = gray(64);
    ctx.beginPath();
    ctx.moveTo(cx - R * 1.05, cy - R * 0.15);
    ctx.bezierCurveTo(cx - R * 1.1, cy - R * 1.05, cx + R * 0.35, cy - R * 1.3, cx + R * 0.85, cy - R * 0.6); // topo = anterior/testa
    ctx.bezierCurveTo(cx + R * 1.25, cy - R * 0.15, cx + R * 1.3, cy + R * 0.15, cx + R * 1.0, cy + R * 0.4);   // face
    ctx.lineTo(cx + R * 1.3, cy + R * 1.05);   // pescoço (caudal, direita)
    ctx.lineTo(cx + R * 0.78, cy + R * 1.1);
    ctx.lineTo(cx + R * 0.62, cy + R * 0.5);
    ctx.bezierCurveTo(cx + R * 0.1, cy + R * 0.95, cx - R * 1.05, cy + R * 0.85, cx - R * 1.05, cy - R * 0.15); // baixo = posterior/occipúcio
    ctx.closePath(); ctx.fill();
    // encéfalo (interior mais escuro) + calota óssea (anel claro)
    fillEll(ctx, cx - R * 0.12, cy - R * 0.1, R * 0.74, R * 0.82, 104);
    ctx.strokeStyle = gray(210); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(cx - R * 0.12, cy - R * 0.1, R * 0.82, R * 0.9, 0, Math.PI * 0.12, Math.PI * 1.75); ctx.stroke();
    ctx.filter = "none";
    // base do crânio / sela
    ctx.strokeStyle = gray(185); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - R * 0.55, cy + R * 0.3); ctx.lineTo(cx + R * 0.72, cy + R * 0.15); ctx.stroke();
    // arcada / mandíbula
    ctx.beginPath(); ctx.moveTo(cx + R * 0.55, cy + R * 0.15); ctx.quadraticCurveTo(cx + R * 1.05, cy + R * 0.45, cx + R * 0.7, cy + R * 0.6); ctx.stroke();
    // coluna cervical (caudal)
    ctx.strokeStyle = gray(205); ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(cx + R * 0.7, cy + R * 0.55); ctx.lineTo(cx + R * 1.05, cy + R * 1.0); ctx.stroke();
    ctx.restore();
    noise(ctx, w, h, 12);
  }
  function cranioScoutAP(ctx, w, h) {
    // crânio de frente: vértice em CIMA (Cabeça), coluna embaixo (Pés).
    var cx = w * 0.5, cy = h * 0.40;
    ctx.save(); ctx.globalAlpha = 0.9; ctx.strokeStyle = gray(205); ctx.lineWidth = 3; ctx.filter = "blur(0.5px)";
    ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.30, h * 0.30, 0, 0, Math.PI * 2); ctx.stroke();   // calota
    // órbitas
    ctx.beginPath(); ctx.ellipse(cx - w * 0.13, cy + h * 0.02, w * 0.09, h * 0.05, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + w * 0.13, cy + h * 0.02, w * 0.09, h * 0.05, 0, 0, Math.PI * 2); ctx.stroke();
    // seios / nasal
    ctx.beginPath(); ctx.moveTo(cx, cy + h * 0.05); ctx.lineTo(cx - w * 0.05, cy + h * 0.15); ctx.lineTo(cx + w * 0.05, cy + h * 0.15); ctx.closePath(); ctx.stroke();
    // maxila / mandíbula
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.20, w * 0.20, h * 0.10, 0, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.24, w * 0.16, h * 0.10, 0, 0, Math.PI); ctx.stroke();
    // coluna cervical (caudal)
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(cx, cy + h * 0.30); ctx.lineTo(cx, cy + h * 0.52); ctx.stroke();
    ctx.restore();
    softBody(ctx, cx, cy, w * 0.30, h * 0.30);
    noise(ctx, w, h, 14);
  }

  /* ---------------------- TÓRAX ---------------------- */
  // t: 0 = base (cúpulas diafragmáticas) → 1 = ápice pulmonar
  function toraxAxial(ctx, t) {
    var cx = 256, cy = 262;
    var apex = t;                                   // 1 = ápice
    var rx = lerp(206, 150, smooth(apex));          // afina p/ o ápice (ombros à parte)
    var ry = lerp(150, 132, smooth(apex));
    // parede torácica: pele / gordura / músculo
    ctx.filter = "blur(0.7px)";
    fillEll(ctx, cx, cy, rx + 6, ry + 6, 150);      // pele (mais densa)
    fillEll(ctx, cx, cy, rx + 2, ry + 2, 74);       // gordura subcutânea
    fillEll(ctx, cx, cy, rx - 8, ry - 8, 96);       // músculo / partes moles
    ctx.filter = "none";

    // pulmões (ar) — dois campos escuros; menores no ápice e na base
    var lungF = Math.sin(smooth(1 - Math.abs(apex - 0.55) / 0.55) * Math.PI * 0.5);
    var lrx = lerp(48, 84, lungF), lry = lerp(70, 108, lungF);
    fillEll(ctx, cx - 78, cy - 6, lrx, lry, 16);    // pulmão direito (imagem esq.)
    fillEll(ctx, cx + 78, cy - 6, lrx * 0.94, lry, 16);  // pulmão esquerdo (imagem dir.)

    // mediastino / coração (partes moles) — coração projeta p/ a ESQUERDA do
    // paciente = DIREITA da imagem; maior nos cortes baixos.
    var heart = smooth(1 - apex) * 0.9 + 0.1;
    fillEll(ctx, cx + 6, cy + 8, lerp(26, 62, heart), lerp(30, 72, heart), 108);
    fillEll(ctx, cx - 4, cy - 40, 22, 26, 104);     // grandes vasos / aorta+VCS
    // traqueia (ar) central nos cortes altos
    if (apex > 0.45) fillEll(ctx, cx - 2, cy - 30, 9, 9, 22);

    if (apex < 0.22) {                              // base: fígado à direita do pac.
      var kf = smooth((0.22 - apex) / 0.22);
      fillEll(ctx, cx - 96, cy + 44, 70 * kf, 60 * kf, 118);   // fígado (imagem esq.)
      fillEll(ctx, cx + 88, cy + 60, 40 * kf, 34 * kf, 100);   // baço/estômago (imagem dir.)
    }

    // coluna (osso) posterior central + canal
    fillEll(ctx, cx, cy + ry - 26, 26, 22, 232);
    fillEll(ctx, cx, cy + ry - 26, 11, 10, 60);
    // esterno (osso) anterior central
    fillEll(ctx, cx, cy - ry + 16, 16, 8, 226);
    // costelas (osso) — arcos curtos ao redor da parede
    ctx.save(); ctx.strokeStyle = gray(226); ctx.lineWidth = 7; ctx.lineCap = "round";
    for (var s = -1; s <= 1; s += 2) {
      for (var r = 0; r < 4; r++) {
        var a0 = -0.5 + r * 0.42;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx - 4, ry - 4, 0, s * a0, s * (a0 + 0.26), s < 0);
        ctx.stroke();
      }
    }
    ctx.restore();
    noise(ctx, W, H, 18);
  }

  function toraxScoutAP(ctx, w, h) {
    // tórax de frente (chest X-ray): Cabeça em cima, Pés embaixo; direita do
    // paciente à ESQUERDA da imagem. Campos pulmonares escuros.
    var cx = w * 0.5, cy = h * 0.46;
    var bw = w * 0.40, bh = h * 0.42;
    ctx.save(); ctx.filter = "blur(0.6px)";
    // campos pulmonares (ar, escuros)
    ctx.fillStyle = gray(30);
    ctx.beginPath(); ctx.ellipse(cx - w * 0.17, cy, w * 0.15, h * 0.30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + w * 0.17, cy, w * 0.15, h * 0.30, 0, 0, Math.PI * 2); ctx.fill();
    // mediastino / coração (claro), projetando p/ a esquerda do paciente (dir. img)
    ctx.fillStyle = gray(120);
    ctx.beginPath(); ctx.moveTo(cx - w * 0.05, cy - h * 0.24);
    ctx.quadraticCurveTo(cx + w * 0.16, cy + h * 0.06, cx + w * 0.10, cy + h * 0.20);
    ctx.lineTo(cx - w * 0.06, cy + h * 0.20);
    ctx.quadraticCurveTo(cx - w * 0.10, cy - h * 0.02, cx - w * 0.05, cy - h * 0.24); ctx.fill();
    ctx.filter = "none";
    // gradeado costal + coluna + clavículas
    ctx.strokeStyle = gray(210); ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
    for (var s = -1; s <= 1; s += 2) {
      for (var r = 0; r < 7; r++) {
        var y = cy - h * 0.26 + r * h * 0.075;
        ctx.beginPath(); ctx.moveTo(cx + s * w * 0.03, y);
        ctx.quadraticCurveTo(cx + s * w * 0.24, y + h * 0.02, cx + s * w * 0.30, y + h * 0.10); ctx.stroke();
      }
    }
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.30); ctx.lineTo(cx, cy + h * 0.28); ctx.stroke(); // coluna
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.02, cy - h * 0.30); ctx.quadraticCurveTo(cx - w * 0.16, cy - h * 0.34, cx - w * 0.26, cy - h * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w * 0.02, cy - h * 0.30); ctx.quadraticCurveTo(cx + w * 0.16, cy - h * 0.34, cx + w * 0.26, cy - h * 0.28); ctx.stroke();
    // cúpulas diafragmáticas
    ctx.beginPath(); ctx.moveTo(cx - w * 0.32, cy + h * 0.30); ctx.quadraticCurveTo(cx - w * 0.17, cy + h * 0.18, cx - w * 0.02, cy + h * 0.30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w * 0.02, cy + h * 0.32); ctx.quadraticCurveTo(cx + w * 0.16, cy + h * 0.22, cx + w * 0.30, cy + h * 0.32); ctx.stroke();
    ctx.restore();
    softBody(ctx, cx, cy, bw, bh);
    noise(ctx, w, h, 12);
  }
  function toraxScoutLat(ctx, w, h) {
    // tórax de perfil: Cabeça à ESQUERDA, Pés à direita; esterno (anterior) p/
    // CIMA, coluna (posterior) embaixo.
    var cx = w * 0.5, cy = h * 0.46, bw = w * 0.34, bh = h * 0.30;
    ctx.save(); ctx.filter = "blur(0.7px)";
    // tronco (partes moles), preenchido
    fillEll(ctx, cx, cy, bw, bh, 84);
    // pulmão (ar) — grande área escura retroesternal/retrocardíaca
    fillEll(ctx, cx - w * 0.02, cy - h * 0.03, bw * 0.82, bh * 0.72, 26);
    // coração / mediastino (claro), ântero-inferior
    fillEll(ctx, cx + w * 0.05, cy + h * 0.11, w * 0.13, h * 0.13, 116);
    ctx.filter = "none";
    // coluna (posterior = embaixo) — corpos vertebrais empilhados
    ctx.fillStyle = gray(214);
    for (var v = -3; v <= 3; v++) fillEll(ctx, cx + v * bw * 0.24, cy + bh * 0.82, bw * 0.09, bh * 0.12, 214);
    // esterno (anterior = em cima)
    ctx.strokeStyle = gray(210); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.12, cy - bh * 0.82); ctx.lineTo(cx + w * 0.06, cy - bh * 0.7); ctx.stroke();
    // diafragma / cúpula
    ctx.lineWidth = 3; ctx.strokeStyle = gray(150);
    ctx.beginPath(); ctx.moveTo(cx - bw * 0.9, cy + bh * 0.55); ctx.quadraticCurveTo(cx, cy + bh * 0.2, cx + bw * 0.85, cy + bh * 0.5); ctx.stroke();
    ctx.restore();
    noise(ctx, w, h, 12);
  }

  // contorno de partes moles suave em volta do scout (dá "corpo" à projeção)
  function softBody(ctx, cx, cy, rx, ry) {
    ctx.save();
    var g = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.2, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, "rgba(120,120,120,0.10)");
    g.addColorStop(0.8, "rgba(90,90,90,0.06)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ell(ctx, cx, cy, rx, ry); ctx.fill();
    ctx.restore();
  }

  /* ---------------------- registro de regiões ---------------------- */
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
    var t = r.cortes > 1 ? (i / (r.cortes - 1)) : 0;   // 0 = base, 1 = vértice/ápice
    var f = fresh(r.largura, r.altura);
    r.axial(f.x, t);
    return (CACHE[key] = f.c.toDataURL("image/png"));
  }

  function scout(region, kind) {
    var r = REGIONS[region]; if (!r) return null;
    var frontal = (kind === "frontal");
    var key = region + "|scout|" + (frontal ? "ap" : "lat"), hit = CACHE[key]; if (hit) return hit;
    var w = frontal ? r.apW : r.scoutW, h = frontal ? r.apH : r.scoutH;
    var f = fresh(w, h);
    (frontal ? r.ap : r.lat)(f.x, w, h);
    return (CACHE[key] = f.c.toDataURL("image/png"));
  }

  global.CTPhantom = { has: has, manifest: manifest, axial: axial, scout: scout, regions: Object.keys(REGIONS) };
})(window);
