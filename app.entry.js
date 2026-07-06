/**
 * script.js
 * Ponto de entrada do simulador educacional de TC.
 *
 * Responsabilidade única deste arquivo: inicializar os módulos
 * (tema, cena 3D, mensagens) e conectar o mínimo de estado global
 * necessário na Etapa 1. Controles de mesa, laser, física e paciente
 * serão adicionados nas próximas etapas, cada um em seu próprio módulo.
 */

import { initTheme } from "./js/theme.js";
import { initScene } from "./js/scene.js";
import { showMessage } from "./js/messages.js";

/**
 * Inicializa a aplicação após o DOM estar pronto.
 */
function bootstrap() {
  initTheme();

  const canvas = document.getElementById("scene-canvas");
  const loadingOverlay = document.getElementById("viewport-loading");

  if (!canvas) {
    console.error("Elemento #scene-canvas não encontrado no DOM.");
    showMessage("Erro ao inicializar a visualização 3D.", "error");
    return;
  }

  try {
    // Verificação explícita de suporte a WebGL — evita uma exceção genérica
    // do Three.js e dá um diagnóstico direto se o dispositivo/navegador
    // não suportar (ou tiver desabilitado) aceleração de hardware.
    const testGl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (!testGl) {
      throw new Error(
        "WebGL não disponível neste navegador/dispositivo (verifique se a aceleração de hardware está ativada)."
      );
    }

    // A cena é inicializada e exposta em window.__ctSimulator para que
    // as próximas etapas (mesa, laser, física, paciente) possam acessar
    // seus objetos (gantryGroup, tabletopMesh etc.) sem recriar a cena.
    const sceneContext = initScene(canvas);
    window.__ctSimulator = sceneContext;

    // Assim que o primeiro frame é garantido (próximo quadro de animação),
    // removemos o overlay de carregamento.
    requestAnimationFrame(() => {
      if (loadingOverlay) {
        loadingOverlay.setAttribute("data-hidden", "true");
      }
    });

    showMessage(
      "Simulador carregado. Este ambiente é exclusivamente educacional e não deve ser utilizado para qualquer finalidade clínica ou diagnóstica.",
      "info"
    );
  } catch (error) {
    console.error("Falha ao inicializar a cena 3D:", error);
    window.__ctSimulatorErrorReported = true;
    showMessage(
      "Não foi possível inicializar a visualização 3D: " + (error && error.message ? error.message : String(error)),
      "error"
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
