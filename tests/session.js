/*
 * Testes do núcleo puro da máquina de estados da sessão (js/session-fsm.js).
 * Roda em Node, sem navegador: node tests/session.js  (ou npm test).
 */
var core = require("../js/session-fsm.js").sessionCore;

var falhas = 0, testes = 0;
function ok(nome, cond, extra) {
  testes++;
  if (cond) { console.log("  ok   " + nome); }
  else { falhas++; console.log("  FALHA " + nome + (extra ? "\n         " + extra : "")); }
}
function cena(t) { console.log("\n=== " + t + " ==="); }

var F = function (p, pr, po) { return { patient: !!p, protocol: !!pr, positioned: !!po }; };

cena("STAGES — escada canônica");
ok("ordem correta",
  core.STAGES.join(">") === "empty>patient>protocol>positioned>topogram>acquired>reconstructed>sent",
  core.STAGES.join(">"));

cena("deriveStage — progressão contígua");
ok("vazio", core.deriveStage(F(0, 0, 0), "idle", null) === "empty");
ok("só paciente", core.deriveStage(F(1, 0, 0), "idle", null) === "patient");
ok("paciente+protocolo", core.deriveStage(F(1, 1, 0), "idle", null) === "protocol");
ok("paciente+protocolo+posição", core.deriveStage(F(1, 1, 1), "idle", null) === "positioned");
ok("posição sem protocolo NÃO avança além de paciente",
  core.deriveStage(F(1, 0, 1), "idle", null) === "patient");

cena("deriveStage — fases de aquisição sobrepõem-se");
ok("topoAcq → topogram", core.deriveStage(F(1, 1, 1), "topoAcq", null) === "topogram");
ok("plan → topogram", core.deriveStage(F(1, 1, 1), "plan", null) === "topogram");
ok("volAcq → topogram", core.deriveStage(F(1, 1, 1), "volAcq", null) === "topogram");
ok("review → acquired", core.deriveStage(F(1, 1, 1), "review", null) === "acquired");
ok("reconstructed", core.deriveStage(F(1, 1, 1), "review", "reconstructed") === "reconstructed");
ok("sent", core.deriveStage(F(1, 1, 1), "review", "sent") === "sent");

cena("nextAction — guia o aluno ao fluxo ideal");
ok("sem paciente → cadastrar", core.nextAction(F(0, 0, 0), "idle", null) === "Cadastre o paciente");
ok("com paciente, sem posição → posicionar",
  /Posicione/.test(core.nextAction(F(1, 0, 0), "idle", null)));
ok("posicionado sem protocolo → selecionar protocolo",
  /Selecione o protocolo/.test(core.nextAction(F(1, 0, 1), "idle", null)));
ok("tudo pronto → iniciar topograma",
  core.nextAction(F(1, 1, 1), "idle", null) === "Inicie o topograma");
ok("review → reconstruir", core.nextAction(F(1, 1, 1), "review", null) === "Reconstrua o exame");
ok("reconstructed → enviar PACS",
  /PACS/.test(core.nextAction(F(1, 1, 1), "review", "reconstructed")));

cena("can — permissões coarse (não endurece gates atuais)");
var sEmpty = core.build(F(0, 0, 0), "idle", null, true);
var sPac = core.build(F(1, 0, 0), "idle", null, true);
var sReady = core.build(F(1, 0, 1), "idle", null, true);   // posicionado, SEM protocolo
var sReview = core.build(F(1, 1, 1), "review", null, true);
ok("sem paciente não seleciona protocolo", core.can("selectProtocol", sEmpty) === false);
ok("com paciente seleciona protocolo", core.can("selectProtocol", sPac) === true);
ok("topograma exige paciente+posição (protocolo é recomendado, não bloqueia)",
  core.can("startTopogram", sReady) === true);
ok("sem posição não inicia topograma", core.can("startTopogram", sPac) === false);
ok("reconstruir só em review", core.can("reconstruct", sReview) === true &&
  core.can("reconstruct", sReady) === false);
ok("startVolume só em plan",
  core.can("startVolume", core.build(F(1, 1, 1), "plan", null, true)) === true &&
  core.can("startVolume", sReview) === false);

cena("build — coerência interna e assinatura");
ok("canStartTopogram do build == can()",
  sReady.canStartTopogram === core.can("startTopogram", sReady));
ok("stageIndex cresce", sReview.stageIndex > sReady.stageIndex);
ok("assinatura muda com o estado",
  core.signature(sReady) !== core.signature(sReview));
ok("assinatura estável para mesmo estado",
  core.signature(core.build(F(1, 1, 1), "idle", null, true)) ===
  core.signature(core.build(F(1, 1, 1), "idle", null, true)));

console.log("\n" + (falhas ? "✗ " + falhas + "/" + testes + " FALHARAM" : "✓ " + testes + " testes ok"));
process.exit(falhas ? 1 : 0);
