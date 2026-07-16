/*
 * session-fsm.js — NÚCLEO PURO da máquina de estados da "sessão de exame".
 *
 * Uma sessão atravessa as 4 fases do app (Cadastro → Protocolo → Aquisição →
 * Reconstrução). Este arquivo contém só LÓGICA PURA (sem DOM, sem estado
 * mutável, sem depender do resto do app): recebe flags cruas e devolve o
 * estágio, a próxima ação e as permissões. Assim dá para testar em Node
 * (tests/session.js) e o wrapper vivo (initSessionFSM em script.js) só liga
 * essas funções aos leitores reais (paciente/protocolo/mesa) e aos eventos.
 *
 * Script clássico (sem módulos/bundler), coerente com o resto do projeto.
 * Exposto em window.SimTC.sessionCore; também exporta em module.exports p/ teste.
 */
(function (root) {
  "use strict";

  // Escada canônica de estágios (contígua). Os dois últimos são dirigidos
  // pelo (futuro) módulo de reconstrução via setRecon().
  var STAGES = ["empty", "patient", "protocol", "positioned", "topogram", "acquired", "reconstructed", "sent"];

  // Deriva o estágio contíguo mais avançado.
  //  flags     = { patient, protocol, positioned }  (booleans)
  //  acqPhase  = fase do evento ct:phase: idle|topoAcq|plan|moving|volAcq|review
  //  reconStage= null | "reconstructed" | "sent"  (módulo futuro)
  function deriveStage(flags, acqPhase, reconStage) {
    var f = flags || {};
    var stage = "empty";
    if (f.patient) stage = "patient";
    if (f.patient && f.protocol) stage = "protocol";
    if (f.patient && f.protocol && f.positioned) stage = "positioned";
    // Fases de aquisição em curso sobrepõem-se ao estágio.
    if (acqPhase === "topoAcq" || acqPhase === "plan" || acqPhase === "moving" || acqPhase === "volAcq") stage = "topogram";
    if (acqPhase === "review") stage = "acquired";
    if (reconStage === "reconstructed") stage = "reconstructed";
    if (reconStage === "sent") stage = "sent";
    return stage;
  }

  // Próxima ação sugerida (texto curto) — guia o aluno ao fluxo ideal sem
  // bloquear. Protocolo é RECOMENDADO antes do topograma, não obrigatório
  // (espelha a regra atual do onStart, que exige só paciente + posição).
  function nextAction(flags, acqPhase, reconStage) {
    var f = flags || {};
    if (!f.patient) return "Cadastre o paciente";
    if (reconStage === "sent") return "Exame enviado — inicie um novo";
    if (reconStage === "reconstructed") return "Envie as imagens (PACS)";
    if (acqPhase === "review") return "Reconstrua o exame";
    if (acqPhase === "volAcq") return "Aquisição do volume em curso…";
    if (acqPhase === "topoAcq") return "Topograma em curso…";
    if (acqPhase === "plan" || acqPhase === "moving") return "Planeje a faixa e inicie o volume";
    if (!f.positioned) return "Posicione o paciente na mesa (Decúbito)";
    if (!f.protocol) return "Selecione o protocolo do exame";
    return "Inicie o topograma";
  }

  function stageIndex(stage) { var i = STAGES.indexOf(stage); return i < 0 ? 0 : i; }

  // Permissões coarse do backbone. `state` = objeto de build(). Reflete as
  // regras HOJE aplicadas — NÃO endurece gates existentes.
  function can(action, state) {
    var s = state || {};
    var idle = (s.acqPhase === "idle" || !s.acqPhase);
    switch (action) {
      case "selectProtocol": return !!s.patient;
      case "position":       return !!s.patient;
      case "startTopogram":  return !!(s.patient && s.positioned && idle);
      case "startVolume":    return s.acqPhase === "plan"; // fine-gating fica na aquisição
      case "reconstruct":    return s.acqPhase === "review";
      default: return false;
    }
  }

  // Monta o objeto de estado completo a partir de entradas cruas.
  function build(flags, acqPhase, reconStage, hasTable) {
    var f = {
      patient: !!(flags && flags.patient),
      protocol: !!(flags && flags.protocol),
      positioned: !!(flags && flags.positioned)
    };
    var ap = acqPhase || "idle";
    var rs = reconStage || null;
    var st = {
      stage: deriveStage(f, ap, rs),
      patient: f.patient,
      protocol: f.protocol,
      positioned: f.positioned,
      acqPhase: ap,
      reconStage: rs,
      hasTable: !!hasTable,
      protocolPending: f.patient && !f.protocol,
      nextAction: nextAction(f, ap, rs)
    };
    st.stageIndex = stageIndex(st.stage);
    st.canStartTopogram = can("startTopogram", st);
    st.canStartVolume = can("startVolume", st);
    st.canReconstruct = can("reconstruct", st);
    return st;
  }

  // Assinatura estável p/ detectar mudança (evita eventos redundantes).
  function signature(st) {
    return [st.stage, st.patient ? 1 : 0, st.protocol ? 1 : 0, st.positioned ? 1 : 0, st.acqPhase, st.reconStage || "-"].join("|");
  }

  root.SimTC = root.SimTC || {};
  root.SimTC.sessionCore = {
    STAGES: STAGES.slice(),
    deriveStage: deriveStage,
    nextAction: nextAction,
    stageIndex: stageIndex,
    can: can,
    build: build,
    signature: signature
  };
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

// Export p/ Node (testes). Em navegador, `module` não existe e isto é ignorado.
if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : global).SimTC;
}
