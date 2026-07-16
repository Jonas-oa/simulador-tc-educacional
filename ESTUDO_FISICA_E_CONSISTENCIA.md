# Estudo aprofundado — Simulador Educacional de TC

Análise da física de aquisição da Tomografia Computadorizada, das
inconsistências do código e de melhorias que aproximam o simulador da
operação real do equipamento. Referência: `script.js` (geometria/mesa
~470–1050; aquisição/protocolo ~1920–2650) e `README.md`.

> **Escopo:** o app treina **operação do equipamento e posicionamento** —
> não interpreta exames. Este estudo respeita esse escopo: foca em física
> de aquisição e ergonomia do console, não em diagnóstico.

---

## 1. O que o simulador modela hoje (e está correto)

A física de aquisição está **correta** nos pontos centrais:

| Item | Código | Correto? |
|---|---|---|
| Altura do isocentro | `ISO_Y = 0.80` m | ✅ 80 cm (Siemens Somatom) |
| Bore | `BORE_R = 0.40` → Ø 80 cm | ✅ |
| Limites da mesa | `50` (fora) / `64–88` (dentro) cm | ✅ coerente com intertravamento real |
| Velocidade helicoidal | `v = pitch × colimação ÷ rotação` | ✅ fórmula exata |
| Largura de feixe | `"64 × 0,6 mm" → 38,4 mm` | ✅ N_cortes × espessura |
| Velocidade do scout | `TOPO_SPEED_MMS = 100` mm/s | ✅ faixa real do topograma |
| DLP | `DLP = CTDIvol × comprimento(cm)` | ✅ definição AAPM |
| Aviso de isocentro | desvio > 4 cm → magnificação | ✅ conceito correto (didático) |

A escolha de mover a **mesa** (paciente) enquanto o tubo gira, revelando os
cortes em sincronia com a posição real da mesa, é fisicamente fiel e
pedagogicamente valiosa.

---

## 2. Inconsistências e incoerências encontradas

### 2.1 🟠 A dose (CTDIvol) é desacoplada dos parâmetros que a geram

`dose` é um **campo de texto livre** do protocolo (`script.js:1924‑1955`),
digitado à mão, e o relatório só o repassa:
`DLP = CTDIvol × comprimento` (`script.js:2531,2544`).

Consequência física-incoerente: **mudar `mAs`, `kV` ou `pitch` não muda a
dose exibida.** No equipamento real:

- CTDIvol ∝ **mAs** (quase linear);
- CTDIvol cresce fortemente com **kV** (~kV^2,5 a 3);
- CTDIvol ∝ **1/pitch** (helicoidal).

Ou seja, o aluno pode dobrar o mAs e o "DLP didático" não se move — o
oposto do que o console real ensina. É a maior incoerência física do app.

### 2.2 🟡 Velocidade exibida ≠ fórmula exibida (quando satura)

`speed = clamp(10, 120, pitch·colim/ROT_S)` (`script.js:2625`). O relatório
imprime o valor **saturado** mas rotula como
"(pitch × colimação ÷ rotação)" (`script.js:2542`). Se o cálculo cair fora
de 10–120 mm/s, o número mostrado não fecha com a conta ao lado — confunde
o aluno. Sugerido: mostrar o valor real e sinalizar a saturação, ou remover
o clamp e limitar apenas a animação.

### 2.3 🟡 Tempo de rotação é constante oculta, mas kV/mAs/pitch são editáveis

`ROT_S = 1.0` s é fixo no código (`script.js:2166`), enquanto kV, mAs,
pitch e colimação são campos de protocolo. Nível de fidelidade desigual: o
tempo de rotação (0,28–0,5 s nos aparelhos modernos; 1,0 s é antigo) é tão
"protocolo" quanto o pitch e deveria ser editável — inclusive porque entra
direto na velocidade da mesa e no tempo de scan.

### 2.4 🟢 Tempo de aquisição não é mostrado

Já há `scanLen` e `speed`; falta `t_scan = scanLen / speed`. É um número que
o operador real sempre olha (viabilidade da apneia, contraste). Trivial de
adicionar e didático.

### 2.5 🟢 Premissa de ordem dos cortes fixa

`axial_000 = corte mais inferior` (`script.js:2607`) é premissa hard-coded;
a inversão por direção depende dela. Documentado no código, mas frágil se
novos volumes vierem com convenção diferente — vale um metadado por volume
(`assets/volumes/<regiao>/manifest`) em vez de premissa global.

---

## 3. Física de um serviço real que pode ser acrescentada

Ordenado por relação valor/esforço, respeitando o escopo (operação).

1. **CTDIvol derivado de kV/mAs/pitch (resolve 2.1).** Uma tabela de
   referência CTDIvol(kV, 100 mAs) por fantoma (16/32 cm) × (mAs/100) ÷
   pitch entrega uma dose que **responde aos parâmetros** — que é o que o
   console real faz (estilo CARE Dose). Mantém o rótulo "didático, sem
   validade dosimétrica".

2. **SSDE (Size-Specific Dose Estimate).** Corrigir o CTDIvol pelo diâmetro
   efetivo do paciente (fator de conversão AAPM 204). Ensina por que o
   mesmo protocolo dá dose diferente em paciente magro × obeso.

3. **Tempo de scan e apneia (resolve 2.4).** Mostrar `t = faixa/velocidade`
   e sinalizar quando excede uma apneia típica (~15–20 s) — gatilho natural
   para os **comandos de respiração** já previstos no roadmap.

4. **Modulação de corrente (tube current modulation).** Variar mAs efetivo
   ao longo do eixo Z conforme a "espessura" do paciente — conecta
   posicionamento (centralização no isocentro) com dose, reforçando o
   aviso de magnificação já existente (2.1 do README).

5. **Relação pitch → ruído/dose.** Um indicador qualitativo: pitch alto →
   scan rápido, menos dose, mais ruído; pitch baixo → o contrário. Fecha o
   entendimento físico do parâmetro que o aluno já edita.

6. **Bólus de contraste (roadmap).** Atraso de disparo (bolus tracking) e
   fase (arterial/portal) amarrados ao tempo de scan calculado em (3).

7. **Dose efetiva por região.** `E ≈ DLP × k` (fator k por região, ICRP)
   como número final "didático" — conecta o DLP já calculado a algo
   tangível para o aluno.

---

## 4. Resumo executivo

| # | Achado | Severidade | Ação sugerida |
|---|---|---|---|
| 2.1 | Dose não responde a kV/mAs/pitch | 🟠 Média | Derivar CTDIvol dos parâmetros |
| 2.2 | Velocidade exibida ≠ fórmula (clamp) | 🟡 Baixa | Mostrar valor real + flag |
| 2.3 | Tempo de rotação fixo e oculto | 🟡 Baixa | Tornar `ROT_S` campo de protocolo |
| 2.4 | Tempo de scan ausente | 🟢 Fácil | `t = faixa/velocidade` |
| 2.5 | Ordem dos cortes hard-coded | 🟢 Baixa | Metadado por volume |
| 3.x | SSDE / modulação / apneia / contraste | 🟢 Evolução | Roadmap priorizado |

**Conclusão:** a geometria e a cinemática (isocentro, bore, limites da mesa,
`v = pitch·colimação/rotação`, DLP) estão **corretas** e bem fiéis a um
Somatom real. A incoerência física de maior valor pedagógico é a **dose
desacoplada dos parâmetros (2.1)**: ligar CTDIvol a kV/mAs/pitch (e depois
SSDE) transforma o campo de dose de um texto estático no comportamento que o
console real ensina — sem sair do escopo de "operação do equipamento".
