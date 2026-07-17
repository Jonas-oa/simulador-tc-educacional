/*
 * acq-geom.js — geometria PURA do planejamento da aquisição.
 *
 * Separa os dois conceitos que o app confundia:
 *   • RANGE (faixa) = extensão no eixo Z (crânio-caudal). É o par de linhas
 *     esquerda/direita do topograma e define QUANTOS cortes são adquiridos.
 *   • FOV = diâmetro no plano do corte axial (zoom/pixel) — conceito de
 *     RECONSTRUÇÃO, NÃO deste mapa. A cobertura A-P (linhas cima/baixo) é
 *     apenas a extensão anteroposterior do campo, medida à parte.
 *
 * Só funções puras (sem DOM/estado) → testável em Node (tests/acq-geom.js).
 * Exposto em window.SimTC.acqGeom; também em module.exports p/ teste.
 * Premissa didática: axial_000 = corte mais INFERIOR (base do crânio).
 */
(function (root) {
  "use strict";

  // Fração CC da imagem (%) → índice de corte axial.
  // verticePct = onde está o VÉRTICE (topo) na imagem; basePct = a BASE.
  // Vértice ↦ índice máximo (superior); base ↦ 0 (inferior). Satura fora.
  function pctToSlice(pct, maxN, verticePct, basePct) {
    var span = basePct - verticePct;
    if (span <= 0) return 0;
    var frac = (basePct - pct) / span;   // base→0, vértice→1
    var n = Math.round(frac * maxN);
    return Math.max(0, Math.min(maxN, n));
  }

  // Janela de cortes adquirida a partir da FAIXA [leftPct, rightPct].
  // Faixa curta ⇒ menos cortes (sub-volume), como no equipamento real.
  function sliceWindow(leftPct, rightPct, total, verticePct, basePct) {
    var maxN = total - 1;
    var a = pctToSlice(leftPct, maxN, verticePct, basePct);   // lado do vértice (n alto)
    var b = pctToSlice(rightPct, maxN, verticePct, basePct);  // lado da base (n baixo)
    var lo = Math.min(a, b), hi = Math.max(a, b);
    return { lo: lo, hi: hi, count: hi - lo + 1 };
  }

  // Índice do corte para um progresso k∈[0,1] da varredura, respeitando a
  // direção. caudo-cranial varre base→vértice (n sobe); crânio-caudal inverte.
  function sliceAtProgress(win, k, direcao) {
    var span = win.hi - win.lo;
    var off = Math.round(Math.max(0, Math.min(1, k)) * span);
    return direcao === "craniocaudal" ? (win.hi - off) : (win.lo + off);
  }

  root.SimTC = root.SimTC || {};
  root.SimTC.acqGeom = {
    pctToSlice: pctToSlice,
    sliceWindow: sliceWindow,
    sliceAtProgress: sliceAtProgress
  };
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : global).SimTC;
}
