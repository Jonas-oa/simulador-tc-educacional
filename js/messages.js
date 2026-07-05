/**
 * messages.js
 * Utilitário central para exibir mensagens no painel de mensagens do
 * simulador. Centralizar aqui evita duplicação de código nas etapas
 * futuras (mesa, laser, física, paciente etc.).
 */

const messageElement = () => document.getElementById("message-text");

/**
 * Tipos de mensagem suportados e o prefixo/ícone associado.
 * Mantido simples propositalmente: apenas texto, sem lógica clínica.
 */
const MESSAGE_ICONS = {
  info: "ℹ",
  warning: "⚠",
  error: "⛔",
  success: "✔",
};

/**
 * Exibe uma mensagem no painel inferior.
 * @param {string} text - Texto da mensagem (em português, linguagem operacional, não clínica).
 * @param {"info"|"warning"|"error"|"success"} [type="info"]
 */
export function showMessage(text, type = "info") {
  const el = messageElement();
  if (!el) return;

  const panel = el.closest(".message-panel");
  const icon = panel ? panel.querySelector(".message-panel__icon") : null;

  el.textContent = text;
  if (icon) {
    icon.textContent = MESSAGE_ICONS[type] || MESSAGE_ICONS.info;
  }
  if (panel) {
    panel.setAttribute("data-message-type", type);
  }
}
