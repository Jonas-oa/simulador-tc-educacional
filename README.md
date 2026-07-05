# Simulador Educacional de Tomografia Computadorizada (TC)

Simulador web para **treinamento de operação de equipamento e posicionamento
de paciente**. Não interpreta exames e não oferece orientação clínica.

## Estrutura do projeto

```
index.html          → estrutura da interface (viewport 3D, console, status bar, mensagens)
script.js            → ponto de entrada; orquestra os módulos
manifest.json         → metadados do PWA (ícones, cores, modo standalone)
css/
  style.css           → tokens de design, tema claro/escuro, layout, componentes
js/
  scene.js            → cena 3D (Three.js): câmera, luzes, gantry e mesa
  theme.js            → alternância de tema claro/escuro
  messages.js          → utilitário do painel de mensagens
  vendor/three/        → Three.js e OrbitControls vendorizados (funciona 100% offline)
assets/               → (reservado) recursos gerais
models/               → (reservado) modelos 3D (paciente, peças do equipamento)
textures/             → (reservado) texturas
sounds/               → (reservado) efeitos sonoros dos botões/movimentos
icons/                → ícones do PWA
```

## Etapa 1 — concluída

- Estrutura completa de pastas.
- Interface base: barra de status com indicadores, viewport 3D, console de
  operação com botões (ainda não funcionais), display digital, painel de
  mensagens.
- Tema claro/escuro funcional (alternância visual; persistência via
  IndexedDB será adicionada na etapa de Configurações).
- Cena 3D funcional com Three.js: gantry e mesa como geometrias
  estilizadas (placeholders), iluminação, chão de referência, controles de
  órbita limitados (para o estudante observar o equipamento de ângulos
  diferentes) e redimensionamento responsivo.
- Three.js vendorizado localmente (sem dependência de CDN), compatível com
  o requisito de funcionamento offline (PWA).

## Próximas etapas (aguardando confirmação)

1. **Modelagem e materiais do gantry/mesa** — refinar geometria, texturas,
   iluminação da "sala".
2. **Movimento da mesa** — subir/descer/entrar/sair com animação
   progressiva, limites mecânicos, sem atravessar objetos.
3. **Painel de controle funcional** — ligar os botões (Mesa +/-, Entrar,
   Sair, Laser, Stop, Iniciar, Reiniciar), feedback visual e sons opcionais.
4. **Lasers de posicionamento** — longitudinal e transversal, com
   alinhamento visual.
5. **Paciente 3D** — modelo humano simplificado e decúbitos (dorsal,
   ventral, lateral D/E).
6. **Física do movimento** — aceleração, desaceleração, velocidade
   constante, colisões simples.
7. **Configurações + IndexedDB** — idioma, tema, velocidade de animação,
   volume, preferências.
8. **PWA completo** — service worker, cache offline, atualização
   controlada.
9. **Testes e otimização** finais.

<!-- deploy trigger 20260705T201213Z -->
