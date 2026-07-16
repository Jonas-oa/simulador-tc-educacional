# Estudo — Fluxo real da TC × Simulador × Experiência do aluno

Documento-base que **define o que o app é** e liga cada fase ao trabalho
real de um técnico de tomografia. Serve de bússola para o refactor modular
(ver `ESTUDO_FISICA_E_CONSISTENCIA.md` para a parte de física/regressão).

> **Escopo (não muda):** simulador de **OPERAÇÃO do equipamento e do fluxo
> de trabalho** — não interpreta exames, não dá laudo, não tem validade
> clínica/dosimétrica.

---

## 0. Definição: o app é o dia de trabalho do técnico, em 4 fases

As quatro divisões que você desenhou **não são telas soltas — são as quatro
etapas reais e sequenciais** do fluxo de um serviço de TC. O aluno aprende
*operação* percorrendo-as com um mesmo paciente:

```
  CADASTRO  →  PROTOCOLO  →  AQUISIÇÃO  →  RECONSTRUÇÃO
 (quem/por     (como vou     (executar na   (transformar o
  que scan)     escanear)     máquina)        volume em imagens)
      └───────────── uma "SESSÃO DE EXAME" ──────────────┘
```

O fio condutor é a **sessão de exame**: um objeto que carrega paciente +
protocolo + posicionamento + aquisição + reconstrução. Cada fase só libera
a seguinte quando seus pré-requisitos estão cumpridos (como no equipamento
real, que trava a aquisição sem protocolo e sem topograma). Isso já existe
em embrião hoje (pré-requisitos "paciente cadastrado E posicionado" antes de
iniciar) — a proposta é elevar isso a **coluna vertebral do app**.

---

## 1. Como funciona uma TC de verdade (fluxo do técnico)

Resumo operacional, na ordem em que o técnico trabalha:

1. **Recepção/preparo.** Confere a *solicitação* (região + indicação
   clínica), identifica o paciente, checa contraindicações (gestação,
   função renal/creatinina e alergia **se for usar contraste**, metformina,
   claustrofobia), retira metais (brincos, prótese dentária), pega acesso
   venoso se houver contraste, orienta jejum/hidratação.
2. **Escolha do protocolo.** A partir da pergunta clínica + região, define
   faixa de varredura, kV, mAs (ou mAs de referência com modulação), pitch,
   tempo de rotação, colimação, **fases de contraste** (sem contraste /
   arterial / portal / tardia) e o disparo (bolus tracking ou delay fixo),
   kernel(s) de reconstrução, espessura de corte, FOV. Tudo sob **ALARA**
   (dose tão baixa quanto razoável).
3. **Posicionamento.** Decúbito (dorsal/ventral/lateral), entrada (cabeça ou
   pés primeiro), braços acima na maioria dos exames de tronco. **Centraliza
   no isocentro com os lasers** — a centralização vertical é crítica: fora
   do centro, a modulação automática erra e há magnificação/erro de dose.
4. **Topograma (scout).** Imagem de planejamento de baixa dose: o tubo fica
   fixo e a **mesa translada** o paciente. Nele o técnico marca a faixa e o
   sistema calcula a modulação de dose.
5. **Aquisição helicoidal.** A mesa avança pelo gantry enquanto o tubo gira:
   `v = pitch × colimação ÷ tempo de rotação`. Comandos de **apneia**
   (tórax/abdome), **injeção de contraste** sincronizada às fases, paciente
   monitorado por vidro/câmera/interfone, sinaleiro de "radiação ligada".
6. **Reconstrução.** Dos dados brutos (projeções/sinograma) reconstroem-se
   as imagens: escolhe-se **kernel/filtro** (partes moles, osso, pulmão),
   **espessura e incremento** de corte, **FOV/matriz**. Da MESMA aquisição
   saem **várias séries** (ex.: mole + osso). Depois **reformatações**: MPR
   (coronal/sagital), MIP/MinIP, 3D VR. Ajuste de **janela (WW/WL)** para
   cada tecido. Envio ao PACS.

**Ideia-chave para o aluno:** *uma aquisição, muitas reconstruções.* O que
o paciente "recebe" (dose) acontece na fase 5; o que o radiologista "vê"
é decidido na fase 6 — e as duas são independentes. Ensinar essa separação
é metade do valor do simulador.

---

## 2. Paralelo fase a fase — real ↔ simulador (o que já existe / o que falta)

| Fase real | Módulo do app | Já implementado | A acrescentar |
|---|---|---|---|
| **Recepção/preparo** | **Cadastro** | prontuário, nome, sexo, idade, região; persistência IndexedDB (`pacientes`) | indicação clínica; **elegibilidade a contraste** (creatinina/alergia); checklist de segurança (metais, gestação); peso/altura (entra na dose) |
| **Escolha do protocolo** | **Protocolos** | CRUD de 16 protocolos por região; kV, mAs, pitch, direção, colimação, espessura, kernel, FOV, dose | **fases de contraste + disparo**; ligar kernel/espessura à reconstrução; validação "protocolo x indicação"; CTDIvol já responde a kV/mAs/pitch (rev. 07f) |
| **Posicionamento + aquisição** | **Aquisição** | 8 decúbitos, lasers por raycasting, isocentro, topograma sincronizado à mesa, helicoidal com som, relatório (CTDIvol/DLP/tempo), **PiP da sala 3D** | comandos de apneia; injeção de contraste na linha do tempo; **manter a sala 3D visível (diminuída)** em toda a fase |
| **Reconstrução** | **Reconstrução** | *nada ainda* — o "volume" são PNGs axiais pré-renderizados; kernel/espessura são só texto no protocolo | **janela WW/WL** (o de maior valor), séries por kernel, escolha de espessura, **MPR coronal/sagital** a partir da pilha axial, envio "para o PACS" (fechar o caso) |

---

## 3. Módulo a módulo: o que ensinar e como

### 3.1 Cadastro — "eu sei quem é e por que vou escanear"
- **Objetivo pedagógico:** o exame começa antes da máquina. Identificação
  correta + indicação + segurança.
- **Acrescentar:** indicação clínica (texto/lista), peso e altura (peso já
  alimenta a dose/SSDE futura), e um **checklist de segurança** que *trava*
  o avanço se algo crítico ficar em aberto — do jeito que o equipamento real
  bloqueia. Se o protocolo pedir contraste, exigir campo de creatinina/eGFR
  e alergia (didático, sem base clínica real).
- **UX:** formulário curto, um cartão de "paciente ativo" que acompanha o
  aluno nas 4 fases (identidade contínua = combate erro de paciente trocado,
  que é exatamente o que se ensina).

### 3.2 Protocolos — "eu escolho COMO escanear"
- **Objetivo:** ligar pergunta clínica → parâmetros → dose/imagem.
- **Acrescentar:** **fases de contraste** (sem/arterial/portal/tardia) com
  delay ou bolus tracking; marcar quais séries de reconstrução o protocolo
  gera (ex.: Tórax → mediastino mole + parênquima pulmão). Um aviso quando o
  parâmetro sai do razoável para a região (guard-rail didático, não bloqueio).
- **UX:** manter o catálogo fixo por região (já existe, `CATALOGO`) e deixar
  o aluno **clonar e ajustar** — errar o pitch e ver a dose/tempo mudarem no
  relatório é aprendizado imediato (já responde, rev. 07f).

### 3.3 Aquisição — "eu executo, e vejo a máquina obedecer"
- **Objetivo:** posicionar, centralizar no isocentro, planejar a faixa no
  topograma e conduzir a varredura — com feedback físico.
- **A sala 3D diminuída (seu requisito):** durante a aquisição o aluno **não
  pode perder de vista a máquina** — é o que amarra "o que eu comando no
  console" a "o que acontece na sala". Hoje isso existe como **PiP** (o
  `.viewport` real é reparentado para uma janela flutuante; `script.js:3225`)
  e como faixa 3D fixa no topo no celular. **Recomendação:** consolidar isso
  num layout de aquisição de **dois painéis**: workstation (topograma/volume)
  como foco + **um quadro persistente da sala 3D** (menor, mas sempre visível,
  mostrando a mesa avançar, o laser, o arco girando no bore). Nunca esconder
  a sala nessa fase.
- **Acrescentar:** comando de **apneia** (áudio/legenda "prenda a respiração")
  disparado quando o tempo de scan passa da apneia típica — o gancho já está
  no relatório (aviso >20 s, rev. 07f); e **contraste** como linha do tempo
  visível (injeção → delay → fase).

### 3.4 Reconstrução — "uma aquisição, muitas imagens" (o módulo novo)
- **Limite honesto:** sem dados brutos (sinograma), não há reconstrução real
  (FBP/iterativa). O acervo são **PNGs axiais** já reconstruídos. Então o
  módulo ensina as **decisões** de reconstrução, não a matemática:
  1. **Janela (WW/WL)** — o de maior valor e mais viável: aplicar
     brilho/contraste sobre a imagem (aprox. de window width/level) com
     presets por tecido (cérebro, osso, pulmão, mediastino, abdome). É a
     habilidade nº 1 do técnico e é 100% interativa.
  2. **Séries por kernel** — mesma aquisição, "mole" vs "osso/pulmão":
     ligar o campo `kernel` do protocolo a duas apresentações (pode ser um
     filtro visual diferente por série). Ensina "uma aquisição, N séries".
  3. **Espessura/incremento** — mostrar o efeito de cortes finos vs grossos
     (ruído × detalhe) navegando a pilha.
  4. **MPR coronal/sagital** — reamostrar a pilha axial (ex.: 79 cortes do
     crânio) para gerar planos coronal/sagital aproximados. Fecha a noção de
     volume 3D a partir de axiais.
  5. **Enviar ao PACS** — botão que "finaliza o caso" e devolve o aluno ao
     início (ciclo completo, senso de conclusão).
- **UX:** viewer com a pilha + slider (já existe na aquisição), presets de
  janela em botões grandes, abas de série (mole/osso), toggle axial/coronal/
  sagital.

---

## 4. A coluna vertebral: a "sessão de exame" (máquina de estados)

Para as fases não brigarem entre si (e para o refactor modular), formalizar
uma **máquina de estados** única:

```
 vazio → paciente_ok → protocolo_ok → posicionado → topograma_ok
       → adquirido → reconstruído → enviado(PACS) → [reinicia]
```

Regras (gating), espelhando o equipamento real:
- Sem **paciente** não há protocolo aplicável à sessão.
- Sem **protocolo** e sem **posicionamento** a aquisição não inicia (já é
  assim hoje — generalizar).
- Sem **aquisição** não há o que reconstruir.
- Cada transição acende/apaga os pré-requisitos no banner (já existe o banner
  paciente·protocolo·mesa·status no modo console).

Isso dá dois ganhos: (1) o aluno sempre sabe "onde estou e o que falta"; (2)
cada módulo vira uma caixa com **entrada e saída bem definidas** — que é
exatamente o que torna seguro mexer numa fase sem quebrar a outra.

---

## 5. Princípios para a melhor experiência do aluno

1. **Errar em segurança.** O simulador deve *deixar* errar (centralizar fora
   do isocentro, pitch absurdo, esquecer contraste) e **mostrar a
   consequência** (magnificação, dose/tempo, série faltando) — sem julgar
   clinicamente. O erro com feedback é o professor.
2. **Fidelidade seletiva.** Ser fiel onde ensina operação (cinemática da
   mesa, laser, isocentro, dose que responde) e **abstrair** o que não
   agrega (matemática de reconstrução). Já é a filosofia do app.
3. **Revelação progressiva.** Modo **guiado** (passo 1→2→3→4, já existe no
   console) para o iniciante; modo **livre** (painel/quadrantes) para quem
   domina. Um botão alterna — já implementado (⊞).
4. **Feedback físico imediato e visível.** A sala 3D é o diferencial: o aluno
   *vê* o comando virar movimento. Manter a sala presente em todas as fases,
   mesmo diminuída na aquisição (seu requisito) e na reconstrução.
5. **Ciclo que fecha.** Cadastro → … → PACS → recomeça. Senso de conclusão e
   de repetição deliberada (a repetição é como o técnico aprende).
6. **Avaliação opcional.** Ao fim, um resumo do que foi bem/mal (centralização,
   dose, cobertura, série correta) — o embrião já existe no relatório e no
   aviso de isocentro. Sem "nota clínica", só operação.

---

## 6. Onde a sala 3D aparece em cada fase

| Fase | Papel da sala 3D |
|---|---|
| Cadastro | ausente ou miniatura ambiente (contexto) |
| Protocolo | ausente/miniatura (o foco é o console) |
| **Aquisição** | **protagonista quando posiciona; diminuída mas SEMPRE visível durante a varredura** (PiP/quadro fixo) |
| Reconstrução | miniatura opcional (o foco vira o viewer de imagens) |

Ou seja: a sala domina o posicionamento, encolhe (mas não some) na varredura
e cede o palco ao viewer na reconstrução. É a transição natural de atenção do
técnico real: da sala → para o monitor.

---

## 7. Próximos passos coerentes (sugestão)

Alinhado com o plano de regressão do outro estudo:

1. **Máquina de estados da sessão** (seção 4) — antes de mexer em layout, ela
   organiza o gating e desacopla os módulos.
2. **Rede de segurança** (`tests/contract.js` + `tests/smoke.js`) cobrindo o
   caminho das 4 fases.
3. **`mountViewport(destino)`** único — pré-requisito para a sala 3D
   diminuída conviver com o viewer de reconstrução sem brigar pelo canvas.
4. **Módulo Reconstrução** começando por **janela WW/WL** (maior valor,
   menor custo), depois séries por kernel e MPR.
5. **Cadastro** ganha indicação + segurança + peso/altura (habilita SSDE).
6. **Contraste/apneia** na aquisição (fecha a fidelidade do fluxo).

**Resumo:** o app é *o dia de trabalho do técnico em quatro fases encadeadas
por uma sessão de exame*. O real ensina "uma aquisição, muitas reconstruções"
e "a dose acontece na máquina, a imagem se decide depois". O simulador já cobre
bem cadastro/protocolo/aquisição; o salto de experiência está em (a) amarrar
tudo numa sessão com gating claro, (b) manter a sala 3D presente e diminuída na
aquisição, e (c) criar a reconstrução como o espaço de "muitas imagens de uma
aquisição", começando pela janela WW/WL.
