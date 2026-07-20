# Estudo de viabilidade — modo celular em paisagem (uso horizontal)

Documento de apoio à etapa **"Layout horizontal (paisagem)"** já prevista no
README. Analisa uma foto de um console real, mapeia a estrutura no projeto e
registra a primeira adaptação implementada e o que ainda falta.

## 1. A foto estudada — console Siemens SOMATOM Perspective

A foto é a *workstation* de aquisição de um tomógrafo Siemens SOMATOM
Perspective (software `syngo` / `CT VC30 easyIQ`), em **orientação paisagem**.
Sua estrutura tem três faixas horizontais:

| Região da foto | Conteúdo |
|---|---|
| **Barra de menu (topo)** | Patient · Applications · Edit · Insert · View · Setup · Image · Options · System · Help |
| **Metade superior — 2 quadros de imagem** | Esquerda: **topograma/scout** com a caixa de planejamento (linhas de faixa). Direita: **corte axial** reconstruído. Cada quadro tem *overlays* nos cantos (nome/ID do paciente, hospital, kV/mAs, régua "10 cm", "SEM CONTRASTE"). |
| **Metade inferior — painel de controle** | Esquerda: **lista de passos do protocolo** (Tx Abd S/C, Pause, PreMonitoring, I.V. Bolus, Monitoring, Arterial Abd, Venoso Tx Ab…) com botões Load / Cancel Move / Recon. Centro: **parâmetros de varredura** (mAs, kV, scan time, delay, slice, nº de scans/imagens, tilt, comments, Range Begin/End, Table Position, Height). Direita: **esquema 3D do paciente na mesa** com setas de navegação. |
| **Banner persistente** | `TORAX_ABDOME_CC_2022` · nome do paciente · ID `1845410` · **Total mAs 1312** |
| **Abas inferiores** | Routine · Scan · Recon · Auto Tasking · eRatio |

Aprendizado central: **um console de TC real é essencialmente horizontal e
multiquadrante** — imagem em cima, comandos embaixo, com um banner de contexto
sempre visível e uma lista de passos à lateral.

## 2. Como isso se encaixa no projeto

O simulador **já foi construído nessa direção** — a adaptação é de layout, não
de arquitetura. Correspondência direta:

| Elemento da foto | Já existe no projeto |
|---|---|
| 2 quadros de imagem (topograma + axial) | Painel **Aquisição** (`#pane-acq`): `#ws-topo` (topograma com caixa/linhas de faixa) e `#ws-slice-img` (cortes axiais) |
| Lista de passos do protocolo | Painel **Protocolos** (`#pane-proto`): mapa do corpo + `#proto-list` |
| Parâmetros de varredura (kV, mAs, pitch, FOV…) | Editor de protocolo (`.ws-params`) |
| Esquema 3D do paciente na mesa | **Cena 3D** Three.js (`#pane-sim`) — supera o esquema estático da foto |
| Banner persistente (protocolo · paciente · mesa · status) | `#console-banner` (modo console do desktop) |
| Abas de modo (Routine/Scan/Recon) | Etapas do console (`.console-steps`) / abas do celular (`.mobile-switch`) |
| Metadados de canto na imagem | `.ws-overlay--top` (nome do paciente sobre a imagem) |

O desktop já roda em **modo console guiado** (etapas em cima, quadrante em tela
cheia) e em **modo painel de 4 quadrantes** — exatamente a lógica da foto. O
que faltava era a versão **celular em paisagem** aproveitar esse mesmo conceito.

## 3. Estado anterior em paisagem (diagnóstico com evidência)

Capturas do modo celular a 812×375 (iPhone paisagem) **antes** da adaptação
revelaram três problemas, todos derivados da navegação inferior herdada do
retrato:

1. **A barra de abas inferior consumia ~30% da altura** (~110 px de 375). Em
   paisagem a altura é o recurso escasso — foi o pior lugar para a navegação.
2. **Cadastro de Paciente**: campos em coluna única e altos demais; o campo
   "Região a examinar" e o botão caíam **abaixo do fold**, atrás da barra.
3. **Protocolos**: mapa do corpo centralizado com **toda a largura
   desperdiçada** em preto; a lista de protocolos nem aparecia.

## 4. Veredito de viabilidade

**Altamente viável e de baixo risco.** A adaptação é **CSS puro**, escopada a
`body.is-mobile` **+** `@media (orientation: landscape)`; não toca em cena 3D,
física, IndexedDB, nem em uma linha de JavaScript. Retrato e desktop ficam
intocados (as regras não se aplicam a eles).

## 5. Primeira etapa implementada (Etapa B)

Adicionada ao final de `css/mobile-tabs.css`, dentro de um único bloco
`@media (orientation: landscape)`:

- **Navegação inferior → faixa lateral esquerda vertical** (~64 px), como a
  lista de passos do console Siemens. Libera toda a altura para o conteúdo.
- **Botão Sair (✕)** reposicionado no topo da faixa (a faixa tem
  `backdrop-filter`, o que a torna bloco de contenção do `position:fixed` — daí
  a necessidade de tratar o ✕ explicitamente para não sobrepor "Sala").
- **Paciente** em **grid de 2 colunas** (Sexo/Idade lado a lado; campos longos
  ocupam a linha inteira) — o formulário inteiro cabe sem rolar.
- **Protocolos** em **2 colunas**: mapa do corpo à esquerda, lista de
  protocolos à direita — usa a largura como no console real.
- **Sala** e **Exame** ganham **altura total** (sem barra inferior); o painel
  flutuante de comandos passa a encostar na base.

Validação: capturas *antes/depois* nas 4 telas em paisagem, além de checagem de
não-regressão em **retrato** (barra inferior preservada) e **desktop** (console
guiado preservado). Nenhum erro de console em nenhuma execução.

## 6. Próximos passos sugeridos (fora desta etapa)

Evoluções para aproximar ainda mais do console da foto — cada uma em etapa
própria, com confirmação:

- **Banner de contexto persistente no topo em paisagem** (paciente · protocolo
  · mesa · status), reaproveitando `#console-banner`. Exige um mínimo de JS.
- **Modo biquadrante na tela Exame** (topograma + axial lado a lado), como os
  dois quadros de imagem da foto, quando a largura permitir.
- **Metadados de canto** no viewer (kV/mAs/FOV) sobre a imagem, ao estilo dos
  *overlays* do SOMATOM.
- Trava/gesto opcional sugerindo paisagem ao entrar na aba Exame.
- Calibração fina em telas estreitas (≈ 568–667 px de largura) e com *notch*
  (`safe-area-inset-left`).
