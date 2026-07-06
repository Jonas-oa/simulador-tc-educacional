# Simulador Educacional de Tomografia Computadorizada (TC)

Simulador web para **treinamento de operação de equipamento e posicionamento
de paciente**. Não interpreta exames e não oferece orientação clínica.

## Estrutura do projeto

```
index.html          → estrutura da interface (viewport 3D, console, status bar, mensagens)
app.entry.js         → CÓDIGO-FONTE do ponto de entrada (usa import/export, ES modules)
script.js            → BUNDLE gerado a partir de app.entry.js + js/*.js (NÃO editar direto)
manifest.json         → metadados do PWA (ícones, cores, modo standalone)
css/
  style.css           → tokens de design, tema claro/escuro, layout, componentes
js/
  scene.js            → (fonte) cena 3D: câmera, luzes, gantry e mesa
  theme.js            → (fonte) alternância de tema claro/escuro
  messages.js          → (fonte) utilitário do painel de mensagens
  vendor/three/        → Three.js e OrbitControls vendorizados (usados só no build)
assets/               → (reservado) recursos gerais
models/               → (reservado) modelos 3D (paciente, peças do equipamento)
textures/             → (reservado) texturas
sounds/               → (reservado) efeitos sonoros dos botões/movimentos
icons/                → ícones do PWA
```

### ⚠️ Sobre o `script.js` (bundle)

Depois de vários testes, descobrimos que módulos ES nativos
(`<script type="module">` + import maps) não funcionavam de forma
confiável no seu dispositivo/rede (falha silenciosa, sem erro
capturável). Para resolver isso definitivamente, o projeto passou a usar
um **bundle único**: todo o código-fonte modular (`app.entry.js` +
`js/theme.js` + `js/scene.js` + `js/messages.js` + Three.js vendorizado)
é compilado com **esbuild** num único arquivo `script.js` clássico
(sem `type="module"`), que funciona em qualquer navegador.

Isso significa que, a partir de agora, **sempre que eu (ou você) editar
algo em `app.entry.js` ou em `js/*.js`, é preciso gerar o bundle de
novo** antes de publicar:

```bash
npx esbuild app.entry.js --bundle --outfile=script.js --format=iife --target=es2018 --minify
```

Eu (Claude) já faço isso automaticamente antes de cada push nas próximas
etapas — só estou documentando aqui para você entender por que existem
dois arquivos parecidos (`app.entry.js` fonte, `script.js` gerado).

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
