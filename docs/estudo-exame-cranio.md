# Estudo — exame de crânio: do protocolo à aquisição, o mais próximo do real

Objetivo: aproximar a experiência do simulador de um exame de TC de crânio
**real de console** (Somatom/IACI), da **criação do protocolo** até a
**realização e revisão do exame**. Escopo mantido: treinamento de
**operação e posicionamento** — **sem qualquer finalidade clínica ou
diagnóstica**. Este documento é um mapa de decisões e etapas; nada aqui
foi implementado ainda.

---

## 1. Como é o exame de crânio real (fluxo do console + física)

Sequência típica de um crânio sem contraste num equipamento moderno:

1. **Registro do paciente** (RIS/worklist): nome, ID, sexo, idade, exame
   solicitado.
2. **Seleção do protocolo** por região → carrega parâmetros técnicos
   (kV, mAs, rotação, colimação, pitch/modo, kernels, FOV, janelas).
3. **Posicionamento**: paciente **decúbito dorsal, cabeça primeiro**,
   cabeça no apoio, alinhamento dos **lasers** à **linha órbito-meatal /
   glabela**; imobilização.
4. **Topograma (scout)**: geralmente **duas incidências — lateral (LAT) e
   ântero-posterior (AP)**. No crânio a incidência LAT é a que guia o
   planejamento e a **angulação do gantry**.
5. **Planejamento na scout**:
   - **Faixa de varredura** (do **forame magno/base** ao **vértice**).
   - **Angulação do gantry (tilt)** paralela à **linha supra-órbito-meatal
     / base do crânio** — reduz dose ao cristalino e evita artefato de
     fossa posterior. É um gesto clássico e definidor do crânio.
   - **FOV**, centralização, número de séries/reconstruções.
6. **Confirmação** ("Confirm"/"Move + Scan"): a mesa vai à posição inicial,
   o operador confirma e dispara.
7. **Aquisição**: crânio de rotina costuma ser **axial sequencial
   (step-and-shoot)** angulado, ou **helicoidal com pitch < 1** (0,55–0,9)
   para conter ruído/dose. Fixed mAs (sem modulação angular agressiva pela
   simetria quase circular do crânio).
8. **Reconstrução**: **duas séries** da mesma aquisição —
   **kernel de partes moles/encéfalo (liso)** e **kernel de osso (nítido)** —
   cada uma reconstruída e revista em sua **janela** (encéfalo WL≈40/WW≈80;
   osso WL≈500/WW≈2000+; às vezes janela de AVC/subdural).
9. **Revisão**: navegação dos cortes, **janela ajustável (WL/WW)**,
   **reformatações MPR** (coronal/sagital), medições. Dose exibida
   (**CTDIvol** no **fantoma de cabeça 16 cm**, **DLP**, e conversão a
   dose efetiva por fator *k* de cabeça).
10. **Envio ao PACS** / encerramento.

Elementos fisiológicos: no **crânio** não há comando de respiração (é do
tórax/abdome). O elemento "fisiológico" só aparece em estudos **com
contraste** (AVC/CTA/tumor) — fora do escopo do crânio de rotina.

---

## 2. O que o simulador faz hoje (mapeado no código)

Fluxo real do motor (`initWorkstationViewer`, `script.js`):
`idle → topoAcq → plan → moving → volAcq → review`.

| Etapa real | No simulador hoje | Referência |
|---|---|---|
| Registro | `initPatients` — prontuário, nome, sexo, idade, região; 1 exame por vez | `script.js:1776` |
| Protocolo | `initWorkstationProtocols` — CRUD por região; catálogo fixo; crânio semeado com valores **didáticos em texto livre** | `script.js:1907` |
| Posicionamento | Cena 3D: decúbito/entrada, altura, laser, intertravamento 64–88 cm; `getIsoOffsetCm` avisa desvio do isocentro | `script.js:1543`, `:1580` |
| Scout | **1 topograma LATERAL** revelado em sincronia com a mesa real; tubo parado, mesa translada | `toTopoAcq` `script.js:2443` |
| Planejamento | 4 linhas (faixa CC + FOV A-P) sobre a scout; zonas-alvo didáticas; `MOVER` leva a mesa ao início | `toPlan` `:2499`, `onMove` `:2556` |
| Aquisição | **Só helicoidal**: `v = pitch × colimação ÷ rotação`; mesa 3D avança; cortes revelados em sincronia | `toVolAcq` `:2611` |
| Reconstrução | **Inexistente** (não há passo de "reconstruindo"; uma única série) | — |
| Revisão | Navegação de 76 cortes axiais; **janela fixa** (PNG assado WL40/WW400); sem WL/WW, sem MPR | `show` `:2309`, `manifest.json` |
| Dose | Relatório didático: `DLP = CTDIvol × comprimento`; aviso de isocentro | `buildReport` `:2520` |
| Envio | **Inexistente** | — |

Parâmetros de física reais e presentes: isocentro 80 cm, bore 80 cm,
intertravamento de altura, rotação 1,0 s, cálculo de velocidade da mesa.
Áudio sintetizado (WebAudio) e arco de varredura no bore.

---

## 3. Lacunas para "parecer real" (crânio)

Ordenadas por **impacto didático × esforço**.

**A. Janela ajustável (WL/WW) e as duas séries (encéfalo × osso).**
É *a* diferença sensorial que faz "parecer TC". Hoje o PNG está **assado em
8 bits, janela fixa WL40/WW400** (`manifest.json`), então osso e encéfalo
não podem ser reavaliados. Sem dados de HU não há janela real.
→ **Decisão de dados** (ver §5, item A): reprocessar o volume guardando HU
(16 bits) e aplicar janela ao vivo por shader **ou** pré-renderizar 2–3
presets de janela como conjuntos de PNG.

**B. Modelo de protocolo estruturado dirigindo a física.**
Hoje os campos são **texto livre** ("120", "1,2", "64 × 0,6 mm") e o motor
faz *parsing* tolerante (`protocolParams` `:2227`). Para "protocolo →
exame" determinístico, os campos técnicos precisam ser **numéricos com
unidade e validação** (kV, mAs, rotação, pitch, colimação N×mm, espessura,
**modo de aquisição**, **tilt**, FOV, faixa-padrão). O texto continua na
exibição; o motor lê os números.

**C. Modo de aquisição: sequencial axial × helicoidal + tilt do gantry.**
Crânio real é classicamente **axial sequencial angulado**. Hoje só há
helicoidal e o gantry **não inclina**. Adicionar `modo` e `tilt` ao
protocolo, refletir no 3D (mesa step-and-shoot; gantry inclinado) e na
scout (linhas de corte anguladas).

**D. Reconstrução como passo explícito + MPR (coronal/sagital).**
Falta o passo "**Reconstruindo…**" e as **reformatações**. As MPR podem ser
**geradas no navegador a partir da pilha axial** (amostrar colunas/linhas
ao longo dos 76 cortes) — alto valor, viável offline, sem novos assets.

**E. Scout dupla (LAT + AP) e mesmo paciente scout↔volume.**
Hoje há só a LAT e o topograma é **de outro paciente** (dito na legenda).
Geometria é didática, não física. Ideal: scout LAT+AP do **mesmo** volume,
com a caixa de planejamento mapeando **índices reais de corte**
(z = 2,528 mm × 76 ≈ 192 mm).

**F. Realismo de dose do crânio.**
Explicitar **fantoma de cabeça (16 cm)**, **DLP → dose efetiva** por fator
*k* de cabeça (≈0,0021 mSv/mGy·cm) e **alerta de pitch > 1** no crânio.

**G. Confirmação e checklist de console.**
Passo "**Confirmar aquisição**" (resumo paciente + protocolo + faixa +
dose estimada) antes de disparar, e checklist de posicionamento
(orientação, altura, laser) — os passos já existem no painel de sequência
(`initAcqQuadrants` `:3295`), falta torná-los **interativos/gated**.

---

## 4. Plano por etapas (proposto)

> **Status (implementado nesta rodada):** ✅ A, C, D, E, F já entregues e
> verificados no navegador (headless). ⏳ B (janela WL/WW) e G (scout dupla)
> seguem pendentes — dependem das decisões de dados/assets do §5.

Cada etapa é autocontida e commitável; respeita "sem bundler, script
clássico, edições cirúrgicas".

- **✅ Etapa A — Protocolo estruturado do crânio (base de tudo).**
  Campos `modo` (sequencial/helicoidal), `tilt` (°) e `rotacao` (s) no
  editor; `protocolParams` passa a expor `modo`/`tiltDeg`/`rotacaoS` e a
  física usa `rotacaoS` (antes fixo). Migração dos protocolos salvos; seed
  do crânio → sequencial, pitch 0,55. *Sem novos assets.*

- **⏳ Etapa B — Janela WL/WW + série osso/encéfalo.**
  Depende da **decisão de dados** (§5-A). Entrega: controle de janela
  (presets encéfalo/osso/AVC + arraste WL/WW) e alternância de série no
  viewer. Maior salto de realismo. **Pendente.**

- **✅ Etapa C — Modo sequencial + tilt do gantry.**
  Gantry 3D inclina pelo `tilt` (rotação em torno do isocentro, com o
  isocentro fixo); linhas de corte anguladas na scout; aquisição axial
  **sequencial** (step-and-shoot: adquire com a mesa parada, avança entre
  passos). *Sem novos assets.*

- **✅ Etapa D — Reconstrução + MPR coronal/sagital.**
  Passo "Reconstruindo…" monta o volume da pilha axial (canvas); seletor
  Axial/Coronal/Sagital com reformatações geradas no navegador. *Sem assets.*

- **✅ Etapa E — Confirmação de aquisição + checklist.**
  Modal "Confirmar aquisição" (resumo + checklist de segurança) antes de
  irradiar; o volume só dispara no "Confirmar". *Sem novos assets.*

- **✅ Etapa F — Dose realista do crânio.**
  CTDIvol no fantoma de cabeça 16 cm; DLP→dose efetiva (k≈0,0021); alertas
  de DLP acima do DRL didático e de pitch>1. *Sem assets.*

- **⏳ Etapa G — Scout dupla LAT+AP, mesmo paciente.**
  Depende de assets novos (§5-B). Fecha a coerência geométrica scout↔volume.
  **Pendente.**

Sugestão de ordem: **A → C → E → F** (tudo sem assets, alto ganho de
fluxo) e, em paralelo às decisões de dados, **B → D → G**.

---

## 5. Decisões que preciso de você (bloqueiam B, D, G)

**A. Estratégia de dados para janela WL/WW (crítico p/ Etapa B).**
- **(A1) HU ao vivo (o "correto"):** reprocessar o volume para guardar HU
  em 16 bits (ex.: HU+1024 empacotado em 2 canais de PNG) e aplicar janela
  por shader WebGL (o three.js já está carregado). Vantagem: **WL/WW real**,
  qualquer janela, base para MPR fiel. Custo: reprocessar assets (~2× o
  tamanho) e um shader pequeno.
- **(A2) Presets pré-renderizados (rápido):** gerar 2–3 pastas de PNG
  (encéfalo/osso/AVC). Vantagem: sem shader, simples. Limite: janelas
  **fixas** (sem arraste WL/WW), ~3× assets.
- Observação honesta: **kernel** (liso × nítido) é diferença de
  *reconstrução*, não só de janela; com um único volume só dá para
  **aproximar** "osso" por **janela óssea** (+ realce leve opcional).
  Janela nós simulamos fielmente; kernel, apenas aproximamos.

**B. Assets de scout do mesmo paciente (Etapa G).** Você consegue gerar
uma **scout LAT e AP do mesmo volume** de crânio? Sem isso, a scout segue
didática (paciente distinto) — funciona para treino, mas a geometria não é
fisicamente fiel.

**C. Modo padrão do crânio.** Adoto **axial sequencial angulado** como
padrão do protocolo de crânio (mais fiel ao real), mantendo helicoidal
como opção? E ajusto o *seed* (hoje pitch 1,2, caudo-cranial) para valores
mais típicos de crânio?

**D. Janelas-alvo e faixa-padrão.** Confirmação dos valores didáticos
(encéfalo WL40/WW80; osso WL500/WW2200; faixa base→vértice ~150–180 mm) —
você é o responsável técnico pelos números finais.

---

## 6. Fora de escopo (registrado para não confundir)

- Comando de respiração: é de **tórax/abdome**, não do crânio.
- Interpretação/laudo: proibido por escopo — o simulador **opera**, não lê.
- Contraste/CTA de crânio: possível numa etapa futura dedicada, não aqui.
