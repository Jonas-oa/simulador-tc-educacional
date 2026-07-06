# Simulador Educacional de Tomografia Computadorizada (TC)

Simulador web para **treinamento de operação de equipamento e posicionamento
de paciente**. Não interpreta exames e não oferece orientação clínica.

## Estrutura do projeto

```
index.html          → estrutura da interface (viewport 3D, console, status bar, mensagens)
script.js            → TODO o código JS do simulador (script clássico, sem módulos/bundler)
manifest.json         → metadados do PWA (ícones, cores, modo standalone)
css/
  style.css           → tokens de design, tema claro/escuro, layout, componentes
js/
  vendor/three.min.js  → Three.js r128 (build global/UMD), 100% offline
assets/               → (reservado) recursos gerais
models/               → (reservado) modelos 3D (paciente, peças do equipamento)
textures/             → (reservado) texturas
sounds/               → (reservado) efeitos sonoros dos botões/movimentos
icons/                → ícones do PWA
```

### Arquitetura: por que script clássico (sem módulos)?

Testamos com ES modules + import maps e com um bundle único (esbuild) —
ambos falharam de forma silenciosa em alguns navegadores/redes reais.
A solução mais robusta foi eliminar toda dependência de recursos
"modernos" de carregamento de JS: `script.js` é um único arquivo
JavaScript clássico, carregado depois do Three.js vendorizado
(`js/vendor/three.min.js`, versão r128 com build global `THREE`).
Isso funciona em praticamente qualquer navegador/dispositivo, sem passo
de build — você pode editar `script.js` direto e recarregar a página.

## Etapa 1+2 — concluídas (com adiantamentos)

Depois de testar em dispositivo real e ajustar a arquitetura, aproveitamos
para já adiantar boa parte da Etapa 2 (movimento da mesa) e da física
(Etapa 6), usando como base um protótipo 3D mais completo:

- Estrutura completa de pastas.
- Interface completa: barra de status com indicadores dinâmicos (sistema,
  pronto, laser, movimento), viewport 3D, console de operação com botões
  **funcionais**, display digital, painel de mensagens.
- Tema claro/escuro funcional.
- Cena 3D completa: sala (piso, paredes, teto), gantry com furo real
  (via `ExtrudeGeometry`), mesa com base telescópica, paciente
  simplificado, iluminação com sombras, câmera orbital manual
  (arrastar para girar, scroll/pinça para zoom).
- **Mesa de exame funcional**: botões Mesa +/−, Entrar/Sair com
  pressionar-e-segurar (mouse e touch), limites físicos reais (altura
  50–100 cm, curso longitudinal de 2 m).
- **Intertravamento de segurança**: não permite mudar a altura da mesa
  enquanto ela estiver dentro do gantry; não permite entrar no gantry se
  a altura não estiver na faixa seguindo o isocentro — com aviso claro
  no painel de mensagens.
- **Laser de posicionamento funcional**: liga/desliga, com linhas
  sagital e coronal com efeito de brilho aditivo.
- **Iniciar/Reiniciar/STOP funcionais**: Iniciar marca o status como "em
  andamento"; Reiniciar volta a mesa à posição inicial; STOP interrompe
  qualquer movimento imediatamente (parada de emergência).
- HUD com posição (mm) e velocidade (mm/s) atualizados em tempo real.

## Próximas etapas (aguardando confirmação)

1. **Painel de controle — detalhes finos** — sons opcionais de clique,
   feedback visual mais rico nos botões.
2. **Laser transversal completo** — já existe sagital/coronal; falta o
   terceiro plano e alinhamento visual fino.
3. **Decúbitos do paciente** — seleção entre dorsal, ventral, lateral D/E.
4. **Física refinada** — aceleração/desaceleração suave (hoje a mesa se
   move em velocidade constante ao segurar o botão).
5. **Configurações + IndexedDB** — idioma, tema, velocidade de animação,
   volume, preferências (persistentes entre sessões).
6. **PWA completo** — service worker, cache offline, atualização
   controlada, instalação.
7. **Testes e otimização** finais.

<!-- deploy trigger 20260705T201213Z -->
