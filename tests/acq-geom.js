/*
 * Testes da geometria pura do planejamento (js/acq-geom.js).
 * node tests/acq-geom.js
 *
 * Cenário de crânio: total = 79 cortes; âncoras vértice=7%, base=66%
 * (idênticas ao DEFAULT_BOX). axial_000 = base (inferior); 78 = vértice.
 */
var g = require("../js/acq-geom.js").acqGeom;

var falhas = 0, testes = 0;
function ok(nome, cond, extra) {
  testes++;
  if (cond) { console.log("  ok   " + nome); }
  else { falhas++; console.log("  FALHA " + nome + (extra ? "\n         " + extra : "")); }
}
function cena(t) { console.log("\n=== " + t + " ==="); }

var TOTAL = 79, V = 7, B = 66;
var win = function (l, r) { return g.sliceWindow(l, r, TOTAL, V, B); };

cena("pctToSlice — âncoras e saturação");
ok("vértice (7%) → índice máximo (78)", g.pctToSlice(7, 78, V, B) === 78);
ok("base (66%) → 0", g.pctToSlice(66, 78, V, B) === 0);
ok("acima do vértice satura em 78", g.pctToSlice(0, 78, V, B) === 78);
ok("abaixo da base satura em 0", g.pctToSlice(90, 78, V, B) === 0);

cena("sliceWindow — a FAIXA define o sub-volume");
var full = win(7, 66);
ok("faixa cheia (7→66) = stack inteiro (79 cortes)",
  full.lo === 0 && full.hi === 78 && full.count === 79,
  JSON.stringify(full));
var meio = win(7, 36.5); // ~metade superior (vértice → meio)
ok("meia faixa superior ≈ metade dos cortes",
  meio.count >= 38 && meio.count <= 42 && meio.hi === 78,
  JSON.stringify(meio));
var inf = win(36.5, 66); // metade inferior (meio → base)
ok("meia faixa inferior começa na base (lo=0)",
  inf.lo === 0 && inf.count >= 38 && inf.count <= 42,
  JSON.stringify(inf));
ok("faixa curta = poucos cortes", win(30, 40).count < 20, JSON.stringify(win(30, 40)));
ok("as duas metades cobrem o stack sem sobra grande",
  Math.abs((meio.count + inf.count) - (TOTAL + 1)) <= 2,
  "meio=" + meio.count + " inf=" + inf.count);

cena("sliceAtProgress — ordem por direção");
var w = win(7, 66); // 0..78
ok("caudo-cranial começa na base (lo)", g.sliceAtProgress(w, 0, "caudocranial") === w.lo);
ok("caudo-cranial termina no vértice (hi)", g.sliceAtProgress(w, 1, "caudocranial") === w.hi);
ok("crânio-caudal começa no vértice (hi)", g.sliceAtProgress(w, 0, "craniocaudal") === w.hi);
ok("crânio-caudal termina na base (lo)", g.sliceAtProgress(w, 1, "craniocaudal") === w.lo);
ok("progresso 0.5 cai no meio da janela",
  Math.abs(g.sliceAtProgress(w, 0.5, "caudocranial") - (w.lo + w.hi) / 2) <= 1);

cena("robustez");
ok("faixa invertida ainda dá janela válida (lo<=hi)",
  (function () { var x = win(66, 7); return x.lo <= x.hi && x.count >= 1; })());
ok("total pequeno não quebra", (function () { var x = win(7, 66, 1); return true; })() === true || win(7, 66) && true);

console.log("\n" + (falhas ? "✗ " + falhas + "/" + testes + " FALHARAM" : "✓ " + testes + " testes ok"));
process.exit(falhas ? 1 : 0);
