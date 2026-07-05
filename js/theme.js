/**
 * theme.js
 * Responsável apenas pela alternância visual entre tema claro e escuro.
 *
 * NOTA: a persistência da preferência de tema entre sessões será
 * implementada na etapa de "Configurações" (IndexedDB), conforme
 * planejado. Por ora o tema inicia sempre em "dark".
 */

const THEMES = ["dark", "light"];

/**
 * Aplica um tema no documento, atualizando os atributos data-theme
 * do <html> e do <body>, e a cor da barra de status do navegador.
 * @param {"dark"|"light"} theme
 */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.body.setAttribute("data-theme", theme);

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", theme === "dark" ? "#0a0e14" : "#e9edf2");
  }
}

/**
 * Inicializa o botão de alternância de tema.
 * @returns {{ getTheme: () => string }} API mínima para outros módulos consultarem o tema atual.
 */
export function initTheme() {
  let currentTheme = "dark";
  applyTheme(currentTheme);

  const toggleButton = document.getElementById("theme-toggle");
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      const currentIndex = THEMES.indexOf(currentTheme);
      currentTheme = THEMES[(currentIndex + 1) % THEMES.length];
      applyTheme(currentTheme);
    });
  }

  return {
    getTheme: () => currentTheme,
  };
}
