/**
 * script.js
 * Simulador Educacional de Tomografia Computadorizada — lógica principal.
 *
 * Script CLÁSSICO (sem "type=module", sem bundler). Depois de testar em
 * dispositivos reais, esta abordagem provou ser a mais confiável — ES
 * modules e import maps falhavam silenciosamente em alguns
 * navegadores/redes. THREE.js é carregado antes deste arquivo via
 * <script src="js/vendor/three.min.js"> (build vendorizado, variável
 * global `THREE`), então cada edição futura pode ser feita direto
 * neste arquivo, sem passo de build.
 *
 * Organização interna (tudo dentro de uma única IIFE para não vazar
 * variáveis globais):
 *   1) Tema claro/escuro
 *   2) Painel de mensagens
 *   3) Cena 3D (sala, gantry, mesa, paciente, laser)
 *   4) Câmera orbital manual (arrastar/zoom, sem dependências externas)
 *   5) Controles do console (mesa, laser, simulação) + física/intertravamento
 *   6) Loop de animação e atualização do HUD/display
 */
(function () {
  "use strict";

  // =================================================================
  // 1) TEMA CLARO/ESCURO
  // =================================================================
  var THEMES = ["dark", "light"];
  var currentTheme = "dark";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
    var metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", theme === "dark" ? "#0a0e14" : "#e9edf2");
    }
  }

  function initTheme() {
    applyTheme(currentTheme);
    var toggleButton = document.getElementById("theme-toggle");
    if (toggleButton) {
      toggleButton.addEventListener("click", function () {
        var idx = THEMES.indexOf(currentTheme);
        currentTheme = THEMES[(idx + 1) % THEMES.length];
        applyTheme(currentTheme);
      });
    }
  }

  // =================================================================
  // 2) PAINEL DE MENSAGENS
  // =================================================================
  var MESSAGE_ICONS = { info: "ℹ", warning: "⚠", error: "⛔", success: "✔" };

  function showMessage(text, type) {
    type = type || "info";
    var el = document.getElementById("message-text");
    if (!el) return;
    var panel = el.closest(".message-panel");
    var icon = panel ? panel.querySelector(".message-panel__icon") : null;
    el.textContent = text;
    el.style.color = ""; // limpa eventual cor de erro de diagnóstico anterior
    if (icon) icon.textContent = MESSAGE_ICONS[type] || MESSAGE_ICONS.info;
    if (panel) panel.setAttribute("data-message-type", type);
  }

  function setIndicator(name, on) {
    var el = document.querySelector('[data-indicator="' + name + '"]');
    if (el) el.setAttribute("data-state", on ? "on" : "off");
  }

  // =================================================================
  // 3-6) CENA 3D E LÓGICA DO SIMULADOR
  // =================================================================
  function bootstrap() {
    var canvas = document.getElementById("scene-canvas");
    var container = canvas ? canvas.parentElement : null;
    var loadingOverlay = document.getElementById("viewport-loading");

    if (!canvas || !container || typeof THREE === "undefined") {
      showMessage("Erro ao inicializar: elementos da cena ou THREE.js não encontrados.", "error");
      window.__ctSimulatorErrorReported = true;
      return;
    }

    try {
      var testGl =
        canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!testGl) {
        throw new Error("WebGL não disponível neste navegador/dispositivo.");
      }

      // -----------------------------------------------------------
      // Cena, câmera, renderizador
      // -----------------------------------------------------------
      var scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0d1013);
      scene.fog = new THREE.Fog(0x0d1013, 9, 22);

      var camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.05, 100);

      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;

      function handleResize() {
        var w = container.clientWidth;
        var h = container.clientHeight;
        if (w === 0 || h === 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
      var resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      handleResize();

      // -----------------------------------------------------------
      // Câmera orbital manual — sem dependências externas (mais
      // compatível do que o addon OrbitControls em alguns navegadores).
      // -----------------------------------------------------------
      var target = new THREE.Vector3(0, 1.0, -0.6);
      var radius = 5.2, azimuth = 0.78, polar = 1.05;
      var MIN_RADIUS = 2.2, MAX_RADIUS = 9, MIN_POLAR = 0.25, MAX_POLAR = 1.5;

      function updateCamera() {
        var sp = Math.sin(polar), cp = Math.cos(polar);
        camera.position.set(
          target.x + radius * sp * Math.sin(azimuth),
          target.y + radius * cp,
          target.z + radius * sp * Math.cos(azimuth)
        );
        camera.lookAt(target);
      }
      updateCamera();

      var dragging = false, lastX = 0, lastY = 0;
      function pointerDown(x, y) { dragging = true; lastX = x; lastY = y; }
      function pointerMove(x, y) {
        if (!dragging) return;
        var dx = x - lastX, dy = y - lastY;
        lastX = x; lastY = y;
        azimuth -= dx * 0.006;
        polar = Math.min(MAX_POLAR, Math.max(MIN_POLAR, polar - dy * 0.006));
        updateCamera();
      }
      function pointerUp() { dragging = false; }

      canvas.addEventListener("mousedown", function (e) { pointerDown(e.clientX, e.clientY); });
      window.addEventListener("mousemove", function (e) { pointerMove(e.clientX, e.clientY); });
      window.addEventListener("mouseup", pointerUp);

      // Toque com 1 dedo = girar; toque com 2 dedos = zoom por pinça.
      // "touch-action: none" no CSS garante que o navegador não capture
      // esses gestos para zoom/pan da página inteira.
      var pinchStartDist = null, pinchStartRadius = radius;

      function touchDistance(touches) {
        var dx = touches[0].clientX - touches[1].clientX;
        var dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
      }

      canvas.addEventListener("touchstart", function (e) {
        e.preventDefault();
        if (e.touches.length === 1) {
          pointerDown(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2) {
          dragging = false;
          pinchStartDist = touchDistance(e.touches);
          pinchStartRadius = radius;
        }
      }, { passive: false });

      canvas.addEventListener("touchmove", function (e) {
        e.preventDefault();
        if (e.touches.length === 1) {
          pointerMove(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2 && pinchStartDist) {
          var newDist = touchDistance(e.touches);
          var scale = pinchStartDist / newDist; // dedos afastando = diminui radius (aproxima)
          radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, pinchStartRadius * scale));
          updateCamera();
        }
      }, { passive: false });

      canvas.addEventListener("touchend", function (e) {
        pointerUp();
        if (e.touches.length < 2) pinchStartDist = null;
      });
      canvas.addEventListener("touchcancel", function () {
        pointerUp();
        pinchStartDist = null;
      });

      canvas.addEventListener("wheel", function (e) {
        e.preventDefault();
        radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius + e.deltaY * 0.0035));
        updateCamera();
      }, { passive: false });

      // -----------------------------------------------------------
      // Iluminação
      // -----------------------------------------------------------
      scene.add(new THREE.AmbientLight(0x556270, 0.55));
      var key = new THREE.DirectionalLight(0xdfe9f5, 0.9);
      key.position.set(3, 6, 2);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 20;
      key.shadow.camera.left = -6; key.shadow.camera.right = 6;
      key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
      scene.add(key);

      var fill = new THREE.DirectionalLight(0x88a0c0, 0.25);
      fill.position.set(-4, 3, -3);
      scene.add(fill);

      // -----------------------------------------------------------
      // Sala (piso, paredes, teto)
      // -----------------------------------------------------------
      var ROOM_W = 6.2, ROOM_D = 6.2, ROOM_H = 3.2;

      function checkerTexture(c1, c2, size, rep) {
        var cnv = document.createElement("canvas");
        cnv.width = cnv.height = size;
        var ctx = cnv.getContext("2d");
        ctx.fillStyle = c1; ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = c2; ctx.fillRect(0, 0, size / 2, size / 2); ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
        var tex = new THREE.CanvasTexture(cnv);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(rep, rep);
        return tex;
      }

      var floor = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_W, ROOM_D),
        new THREE.MeshStandardMaterial({ map: checkerTexture("#c9d2da", "#bcc6cf", 256, ROOM_W * 2), roughness: 0.55, metalness: 0.05 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      var wallMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ec, roughness: 0.9 });
      var wallMatAccent = new THREE.MeshStandardMaterial({ color: 0xc7d3dc, roughness: 0.9 });

      var backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_H), wallMatAccent);
      backWall.position.set(0, ROOM_H / 2, -ROOM_D / 2);
      scene.add(backWall);

      var leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), wallMat);
      leftWall.rotation.y = Math.PI / 2;
      leftWall.position.set(-ROOM_W / 2, ROOM_H / 2, 0);
      scene.add(leftWall);

      var rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), wallMat);
      rightWall.rotation.y = -Math.PI / 2;
      rightWall.position.set(ROOM_W / 2, ROOM_H / 2, 0);
      scene.add(rightWall);

      var ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 1 }));
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = ROOM_H;
      scene.add(ceiling);

      // -----------------------------------------------------------
      // Gantry (com furo real via ExtrudeGeometry)
      // -----------------------------------------------------------
      var gantryGroup = new THREE.Group();
      scene.add(gantryGroup);

      var GW = 2.0, GH = 1.9, GDEPTH = 0.85, BORE_R = 0.40; // bore de 80cm de diâmetro
      var ISO_Y = 0.80; // altura do isocentro
      var GANTRY_FACE_Z = -0.6 + GDEPTH / 2 + 0.005; // Z do plano de entrada (face do gantry / lasers)

      var gShape = new THREE.Shape();
      gShape.moveTo(-GW / 2, -GH / 2);
      gShape.lineTo(GW / 2, -GH / 2);
      gShape.lineTo(GW / 2, GH / 2);
      gShape.lineTo(-GW / 2, GH / 2);
      gShape.lineTo(-GW / 2, -GH / 2);
      var holePath = new THREE.Path();
      holePath.absarc(0, 0, BORE_R, 0, Math.PI * 2, false);
      gShape.holes.push(holePath);

      var gGeo = new THREE.ExtrudeGeometry(gShape, {
        depth: GDEPTH, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 48,
      });
      gGeo.translate(0, 0, -GDEPTH / 2);
      var gantryBody = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.35, metalness: 0.15 }));
      gantryBody.position.set(0, ISO_Y, -0.6);
      gantryBody.castShadow = true;
      gantryBody.receiveShadow = true;
      gantryGroup.add(gantryBody);

      var liner = new THREE.Mesh(
        new THREE.CylinderGeometry(BORE_R, BORE_R, GDEPTH * 0.98, 48, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xd9dee3, roughness: 0.5, side: THREE.BackSide })
      );
      liner.rotation.x = Math.PI / 2;
      liner.position.copy(gantryBody.position);
      gantryGroup.add(liner);

      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(BORE_R + 0.045, 0.02, 12, 64),
        new THREE.MeshStandardMaterial({ color: 0x35c5e0, emissive: 0x0c5866, emissiveIntensity: 0.6, roughness: 0.4 })
      );
      ring.position.set(0, ISO_Y, -0.6 + GDEPTH / 2 + 0.01);
      gantryGroup.add(ring);

      // -----------------------------------------------------------
      // Mesa de exame — limites físicos (valores conferidos com a
      // especificação clínica):
      //   • Altura do isocentro: 80 cm do piso
      //   • Altura máxima da mesa: 100 cm
      //   • Altura mínima da mesa: 50 cm
      //   • Curso longitudinal total: ~200 cm
      //
      // O furo do gantry (bore) é PASSANTE — um túnel aberto dos dois
      // lados. O tampo atravessa o furo livremente; o limite de inserção
      // é definido para que a região anatômica de interesse alcance o
      // isocentro (centro do gantry, Z ≈ -0.60), não por colisão com
      // parede traseira (que não existe).
      //   - Isocentro em Z ≈ -0.60 ; face frontal do bore em Z ≈ -0.175.
      //   - Paciente: abdome ~z+0.15, tórax ~z+0.36, cabeça ~z+0.75.
      //   - tableZ = -0.96 leva o tórax ao isocentro; -1.35 leva a cabeça.
      // -----------------------------------------------------------
      var TABLE_Y_MIN = 0.50;   // altura mínima mecânica FORA do gantry (m)
      var TABLE_Y_MAX = 0.88;   // altura máxima geral (dentro e fora do gantry) — 88 cm
      var GANTRY_Y_MIN = 0.64;  // altura mínima permitida DENTRO do gantry — 64 cm
      var GANTRY_Y_MAX = 0.88;  // altura máxima permitida DENTRO do gantry — 88 cm
      var TABLE_Z_MAX = 0.90;                        // totalmente retraída (paciente fora, à frente do gantry)
      var TABLE_Z_MIN = -1.10;                       // inserção máxima — permite tórax/abdome/cabeça no isocentro
      var BORE_SAFE_Z = 0.20;                        // ponto (m) em que a ponta da mesa cruza a face do gantry
      // Faixa de altura segura para permanecer/entrar no bore. O furo do
      // gantry (raio 40 cm / diâmetro 80 cm, em torno do isocentro de
      // 80 cm) comporta com folga toda a faixa mecânica da mesa, então a
      // faixa segura é a própria faixa completa de altura (50–100 cm).
      // Faixa de altura permitida DENTRO do gantry: 64 a 88 cm.
      var SAFE_Y_MIN = GANTRY_Y_MIN, SAFE_Y_MAX = GANTRY_Y_MAX;

      // Meia-espessura do paciente (do topo do tampo ao centro do corpo).
      // Usada para calcular o alinhamento do isocentro.
      var PATIENT_HALF_THICKNESS = 0.12; // 12 cm (espessura média ~24 cm)

      var tableY = 0.80; // inicia na altura do isocentro
      var tableZ = TABLE_Z_MAX; // inicia totalmente retraída (fora do gantry)

      // -----------------------------------------------------------
      // Suporte da mesa — estilo Somatom (base retangular escalonada):
      //   • Base fixa no piso: blocos escalonados que se afinam para cima.
      //   • Coluna-pistão móvel: sobe e desce com a mesa (movimento
      //     vertical), como um elevador de coluna. O tampo sai em balanço
      //     (cantilever) do topo dessa coluna.
      // A base fica atrás do gantry (lado de embarque do paciente).
      // -----------------------------------------------------------
      var baseGroup = new THREE.Group();
      baseGroup.position.set(0, 0, 0.9);
      scene.add(baseGroup);

      var baseMatDark = new THREE.MeshStandardMaterial({ color: 0x8b929b, roughness: 0.5, metalness: 0.25 });
      var baseMatLight = new THREE.MeshStandardMaterial({ color: 0xd9dee3, roughness: 0.4, metalness: 0.2 });
      var columnMat = new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.35, metalness: 0.25 });

      // --- Base fixa: três degraus retangulares (largo → estreito) ---
      // Altura total da parte fixa mantida abaixo da altura mínima da mesa
      // (50 cm) para que a coluna-pistão sempre tenha comprimento positivo.
      // Degrau inferior (mais largo, apoiado no piso)
      var baseStep1 = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.14, 0.95), baseMatDark);
      baseStep1.position.set(0, 0.07, 0);
      baseStep1.castShadow = true; baseStep1.receiveShadow = true;
      baseGroup.add(baseStep1);

      // Degrau intermediário
      var baseStep2 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.8), baseMatLight);
      baseStep2.position.set(0, 0.14 + 0.08, 0);
      baseStep2.castShadow = true; baseStep2.receiveShadow = true;
      baseGroup.add(baseStep2);

      // Degrau superior (base da coluna, fixo)
      var baseStep3 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.10, 0.66), baseMatLight);
      baseStep3.position.set(0, 0.30 + 0.05, 0);
      baseStep3.castShadow = true; baseStep3.receiveShadow = true;
      baseGroup.add(baseStep3);

      var BASE_FIXED_TOP = 0.30 + 0.10; // topo da parte fixa (0.40 m — abaixo da mesa mínima de 0.50)

      // --- Coluna-pistão móvel: sobe/desce com a mesa ---
      // É um bloco vertical que se estende do topo da base fixa até o
      // tampo. Seu comprimento varia com a altura da mesa (efeito pistão).
      var column = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1, 0.6), columnMat);
      column.castShadow = true; column.receiveShadow = true;
      baseGroup.add(column);

      // --- Berço/trilho de suporte sob o tampo ---
      // Estrutura horizontal logo abaixo do tampo, presa ao topo da
      // coluna (parte do suporte, NÃO da mesa). Estende-se para frente
      // (em direção ao gantry) preenchendo o vão que aparece quando o
      // tampo avança para dentro do bore. Sua posição vertical acompanha
      // a altura da mesa; sua posição/comprimento em Z acompanham o
      // avanço do tampo, sem alterar a geometria da mesa/paciente/laser.
      var carriage = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.12, 1.0),
        new THREE.MeshStandardMaterial({ color: 0xc4cad1, roughness: 0.4, metalness: 0.3 })
      );
      carriage.castShadow = true; carriage.receiveShadow = true;
      baseGroup.add(carriage);

      var tableGroup = new THREE.Group();
      scene.add(tableGroup);

      var topPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.04, 1.95),
        new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.3, metalness: 0.5 })
      );
      topPlate.castShadow = true;
      topPlate.receiveShadow = true;
      tableGroup.add(topPlate);

      var cushion = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.07, 1.85),
        new THREE.MeshStandardMaterial({ color: 0x2f3b46, roughness: 0.85 })
      );
      cushion.position.set(0, 0.055, 0);
      cushion.castShadow = true;
      cushion.receiveShadow = true;
      tableGroup.add(cushion);

      // Paciente — figura simplificada (apenas para referência visual de
      // posicionamento; decúbitos serão selecionáveis em etapa futura).
      // Comprimento total ~1.7 m, da cabeça (+) aos pés (-), cabendo
      // inteira dentro do tampo da mesa (1.95 m).
      //
      // Espessura considerada: adulto médio em decúbito dorsal ≈ 24 cm
      // (raio do torso ~0.12 m). O paciente repousa SOBRE o tampo: as
      // costas tocam o tampo e o corpo se estende para cima. Assim o
      // centro do corpo fica ~12 cm acima do tampo — por isso, para
      // centralizar o paciente no isocentro (80 cm), o operador desce a
      // mesa até o tampo ficar em ~66 cm (comportamento realista).
      var patient = new THREE.Group();
      var skin = new THREE.MeshStandardMaterial({ color: 0xe3b993, roughness: 0.7 });
      var scrub = new THREE.MeshStandardMaterial({ color: 0x4f7d8c, roughness: 0.85 });

      var TORSO_R = 0.12; // raio do torso — espessura ~24 cm

      var head = new THREE.Mesh(new THREE.SphereGeometry(0.10, 20, 16), skin);
      head.position.set(0, TORSO_R, 0.75);
      patient.add(head);

      var torso = new THREE.Mesh(new THREE.CylinderGeometry(TORSO_R, TORSO_R + 0.02, 0.55, 16), scrub);
      torso.rotation.x = Math.PI / 2;
      torso.position.set(0, TORSO_R, 0.36);
      patient.add(torso);

      function limb(r, l, x, y, z, mat) {
        var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, l, 12), mat);
        m.rotation.x = Math.PI / 2;
        m.position.set(x, y, z);
        return m;
      }
      // Braços — ao lado do tronco, mesma região em Z.
      patient.add(limb(0.04, 0.5, -0.15, TORSO_R * 0.75, 0.36, scrub));
      patient.add(limb(0.04, 0.5, 0.15, TORSO_R * 0.75, 0.36, scrub));
      // Coxas — entre o quadril e os joelhos.
      patient.add(limb(0.05, 0.45, -0.08, TORSO_R * 0.8, -0.15, scrub));
      patient.add(limb(0.05, 0.45, 0.08, TORSO_R * 0.8, -0.15, scrub));
      // Pernas/pés — do joelho aos pés.
      patient.add(limb(0.04, 0.4, -0.08, TORSO_R * 0.8, -0.6, skin));
      patient.add(limb(0.04, 0.4, 0.08, TORSO_R * 0.8, -0.6, skin));
      // O paciente repousa sobre o topo do tampo (tampo tem 0.04 de
      // espessura, então topo em +0.02 em relação ao centro da mesa).
      // As costas ficam nesse plano; o corpo se estende para cima.
      patient.position.set(0, 0.02, 0);
      tableGroup.add(patient);

      function applyTablePose() {
        tableGroup.position.set(0, tableY, tableZ);

        // Coluna-pistão: liga o topo da base fixa (BASE_FIXED_TOP, em
        // coordenadas do baseGroup, cuja origem está no piso) ao nível do
        // tampo (tableY, em coordenadas do mundo). Como o baseGroup está
        // no piso (y=0), a altura do topo da coluna deve ser tableY.
        // A coluna vai de BASE_FIXED_TOP até tableY; seu comprimento e
        // centro são recalculados a cada movimento (efeito pistão).
        var columnBottom = BASE_FIXED_TOP;
        var columnTop = tableY - 0.02; // encosta logo abaixo do tampo
        var columnLen = Math.max(0.05, columnTop - columnBottom);
        column.scale.y = columnLen;
        column.position.y = columnBottom + columnLen / 2;

        // Berço de suporte: fica logo abaixo do tampo (acompanha a altura)
        // e se estende de cima da coluna até a face do gantry, preenchendo
        // o vão conforme o tampo avança. Coordenadas em relação ao
        // baseGroup (origem em Z=0.9 no mundo).
        //   - Face do gantry no mundo ≈ GANTRY_FACE_Z (-0.20). Em coords
        //     do baseGroup: GANTRY_FACE_Z - 0.9.
        //   - A frente do berço deve alcançar a face do gantry; a traseira
        //     fica sobre a coluna (Z≈0 no baseGroup).
        var carriageBackZ = 0.0;                       // sobre a coluna
        var carriageFrontZ = (GANTRY_FACE_Z - 0.9);    // até a face do gantry
        var carriageLen = Math.max(0.3, carriageBackZ - carriageFrontZ);
        carriage.scale.z = carriageLen / 1.0; // geometria base tem 1.0 de profundidade
        carriage.position.set(0, tableY - 0.10, carriageBackZ - carriageLen / 2);
      }
      applyTablePose();

      // -----------------------------------------------------------
      // Laser de posicionamento — FIXO no gantry, projetado sobre as
      // superfícies (paciente / colchão / tampo) via raycasting, para
      // se comportar como luz real: reto sobre superfície plana, seguindo
      // as ondulações sobre o corpo, e SEM atravessar o paciente (cada
      // raio marca apenas o primeiro ponto de impacto = face iluminada).
      //
      // Pontos de origem (na face de entrada do gantry, ao redor do bore):
      //   • 12h (topo): feixe LONGITUDINAL central (linha média sagital,
      //     no topo do corpo) + feixe TRANSVERSAL (cruza o corpo, marca
      //     o início do exame).
      //   • 3h e 9h (laterais): feixes LONGITUDINAIS laterais (planos
      //     sagitais nas laterais do corpo).
      //
      // Cobertura longitudinal de cada feixe: ~20 cm para fora do gantry
      // e ~50 cm para dentro (total ~70 cm em Z).
      // -----------------------------------------------------------
      var LASER_COLOR = 0xff2222;

      // Extensão longitudinal dos feixes (em Z, relativo à face do gantry).
      var LASER_LONG_OUT = 0.20;  // 20 cm para fora (em direção +Z, saída)
      var LASER_LONG_IN = 0.50;   // 50 cm para dentro (em direção -Z)
      // Extensão transversal do feixe (em X), cobrindo a largura do corpo.
      var LASER_TRANS_HALF = 0.30; // 30 cm para cada lado do centro

      var LASER_SEGMENTS = 64;    // resolução das linhas projetadas
      var LASER_LIFT = 0.004;     // pequeno "levantamento" sobre a superfície p/ evitar z-fighting

      // Origem dos raios: bem acima/ao lado, na borda do bore, apontando
      // para o centro (isocentro). Y de referência do isocentro.
      var laserOriginTop = new THREE.Vector3(0, ISO_Y + BORE_R, GANTRY_FACE_Z);
      var laserOriginRight = new THREE.Vector3(BORE_R, ISO_Y, GANTRY_FACE_Z);
      var laserOriginLeft = new THREE.Vector3(-BORE_R, ISO_Y, GANTRY_FACE_Z);

      // Material das linhas do laser (LineBasicMaterial: linha fina e nítida).
      var laserLineMat = new THREE.LineBasicMaterial({
        color: LASER_COLOR,
        transparent: true,
        opacity: 0.95,
        depthTest: true,   // respeita a profundidade: não atravessa o corpo
        depthWrite: false,
      });

      var laserGroup = new THREE.Group();
      scene.add(laserGroup);

      // Cria uma linha (THREE.Line) com N segmentos, adicionada ao grupo.
      function makeLaserLine(nPoints) {
        var positions = new Float32Array(nPoints * 3);
        var geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        var line = new THREE.Line(geom, laserLineMat);
        line.frustumCulled = false;
        line.renderOrder = 999;
        laserGroup.add(line);
        return line;
      }

      var longCentralLine = makeLaserLine(LASER_SEGMENTS + 1);
      var longRightLine = makeLaserLine(LASER_SEGMENTS + 1);
      var longLeftLine = makeLaserLine(LASER_SEGMENTS + 1);
      var transversalLine = makeLaserLine(LASER_SEGMENTS + 1);

      // Raycaster reutilizável e alvos de projeção.
      var laserRaycaster = new THREE.Raycaster();
      var laserTargets = [];   // preenchido após a criação de paciente/mesa
      var _rayDir = new THREE.Vector3();
      var _rayFallback = new THREE.Vector3();

      // Projeta um ponto: lança um raio da origem em direção ao alvo
      // aproximado (x,z no plano do isocentro) e retorna o ponto de
      // impacto na primeira superfície. Se nada for atingido, cai no
      // plano do tampo (yFallback).
      function projectLaserPoint(origin, x, z, yFallback, out) {
        // Alvo aproximado no plano do isocentro (levemente abaixo, para o
        // raio "descer" sobre as superfícies).
        _rayFallback.set(x, yFallback, z);
        _rayDir.copy(_rayFallback).sub(origin).normalize();
        laserRaycaster.set(origin, _rayDir);
        var hits = laserRaycaster.intersectObjects(laserTargets, true);
        if (hits.length > 0) {
          out.copy(hits[0].point);
          out.y += LASER_LIFT;
        } else {
          out.set(x, yFallback + LASER_LIFT, z);
        }
        return out;
      }

      var _p = new THREE.Vector3();

      // Atualiza a geometria de uma linha longitudinal (varre em Z).
      function updateLongitudinalLine(line, origin, xFixed, yFallback) {
        var pos = line.geometry.attributes.position.array;
        var zStart = GANTRY_FACE_Z + LASER_LONG_OUT;   // 20 cm para fora
        var zEnd = GANTRY_FACE_Z - LASER_LONG_IN;      // 50 cm para dentro
        for (var i = 0; i <= LASER_SEGMENTS; i++) {
          var t = i / LASER_SEGMENTS;
          var z = zStart + (zEnd - zStart) * t;
          projectLaserPoint(origin, xFixed, z, yFallback, _p);
          pos[i * 3] = _p.x;
          pos[i * 3 + 1] = _p.y;
          pos[i * 3 + 2] = _p.z;
        }
        line.geometry.attributes.position.needsUpdate = true;
        line.geometry.computeBoundingSphere();
      }

      // Atualiza a geometria da linha transversal (varre em X, Z fixo).
      function updateTransversalLine(line, origin, zFixed, yFallback) {
        var pos = line.geometry.attributes.position.array;
        for (var i = 0; i <= LASER_SEGMENTS; i++) {
          var t = i / LASER_SEGMENTS;
          var x = -LASER_TRANS_HALF + (2 * LASER_TRANS_HALF) * t;
          projectLaserPoint(origin, x, zFixed, yFallback, _p);
          pos[i * 3] = _p.x;
          pos[i * 3 + 1] = _p.y;
          pos[i * 3 + 2] = _p.z;
        }
        line.geometry.attributes.position.needsUpdate = true;
        line.geometry.computeBoundingSphere();
      }

      function updateLasers() {
        if (!laserGroup.visible) return;
        var yFallback = tableY + 0.02; // topo do tampo como piso do laser
        updateLongitudinalLine(longCentralLine, laserOriginTop, 0, yFallback);
        updateLongitudinalLine(longRightLine, laserOriginRight, 0.12, yFallback);
        updateLongitudinalLine(longLeftLine, laserOriginLeft, -0.12, yFallback);
        updateTransversalLine(transversalLine, laserOriginTop, GANTRY_FACE_Z, yFallback);
      }

      // Superfícies onde o laser é projetado (paciente, colchão, tampo).
      // Definidas aqui pois todas já foram criadas acima.
      laserTargets = [patient, cushion, topPlate];

      laserGroup.visible = false;

      // -----------------------------------------------------------
      // Controles do console — pressionar e segurar (mouse + touch)
      // -----------------------------------------------------------
      var SPEED_Y = 0.15; // m/s
      var SPEED_Z = 0.50; // m/s
      var moveUp = false, moveDown = false, moveIn = false, moveOut = false;
      var laserOn = false;
      var alertStatus = "";
      var simulationRunning = false;
      // Referência de "zero" da posição da mesa (definida pelo botão Zerar
      // com o laser transversal). A leitura de posição passa a ser relativa
      // a esse ponto — é o marco zero para a futura aquisição do exame.
      // Inicia em null: enquanto não zerado, a posição é medida a partir da
      // retração total (comportamento anterior).
      var tableZeroRef = null;

      function setHeld(el, setter) {
        if (!el) return;
        function on(e) {
          e.preventDefault();
          setter(true);
          // Captura o ponteiro: garante que o "soltar" seja detectado
          // mesmo que o dedo deslize para fora do botão durante o toque
          // (evita a mesa "grudar" em um movimento contínuo).
          if (el.setPointerCapture && e.pointerId !== undefined) {
            try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
          }
        }
        function off() { setter(false); }
        el.addEventListener("pointerdown", on);
        el.addEventListener("pointerup", off);
        el.addEventListener("pointercancel", off);
        el.addEventListener("pointerleave", off);
        // Rede de segurança adicional: se por algum motivo o ponteiro for
        // solto fora do elemento sem capturar corretamente.
        window.addEventListener("pointerup", off);
        window.addEventListener("blur", off);
      }

      var btnUp = document.getElementById("btn-table-up");
      var btnDown = document.getElementById("btn-table-down");
      var btnIn = document.getElementById("btn-table-in");
      var btnOut = document.getElementById("btn-table-out");
      var btnLaser = document.getElementById("btn-laser");
      var btnZero = document.getElementById("btn-zero");
      var btnStart = document.getElementById("btn-start");
      var btnReset = document.getElementById("btn-reset");
      var btnStop = document.getElementById("btn-stop");

      setHeld(btnUp, function (v) { moveUp = v; });
      setHeld(btnDown, function (v) { moveDown = v; });
      setHeld(btnIn, function (v) { moveIn = v; });
      setHeld(btnOut, function (v) { moveOut = v; });

      if (btnLaser) {
        btnLaser.addEventListener("click", function () {
          laserOn = !laserOn;
          laserGroup.visible = laserOn;
          btnLaser.setAttribute("aria-pressed", String(laserOn));
          setIndicator("laser", laserOn);
          if (laserOn) updateLasers();
          showMessage(laserOn ? "Laser de posicionamento ligado." : "Laser de posicionamento desligado.", "info");
        });
      }

      if (btnZero) {
        btnZero.addEventListener("click", function () {
          // Define a posição atual da mesa como o ponto zero de referência
          // para a aquisição. O laser transversal marca esse plano.
          tableZeroRef = tableZ;
          updateReadouts(0);
          showMessage("Posição da mesa zerada neste ponto (marco zero para a aquisição). Este é um ponto de controle — não é obrigatório para adquirir o exame.", "success");
        });
      }

      if (btnStart) {
        btnStart.addEventListener("click", function () {
          simulationRunning = true;
          showMessage("Simulação iniciada. Ajuste a altura da mesa para alinhar o centro do paciente ao isocentro (o status indica: DESCER / SUBIR MESA / ISOCENTRO OK).", "success");
        });
      }

      if (btnReset) {
        btnReset.addEventListener("click", function () {
          tableY = 0.80;
          tableZ = TABLE_Z_MAX;
          tableZeroRef = null;
          applyTablePose();
          laserOn = false;
          laserGroup.visible = false;
          if (btnLaser) btnLaser.setAttribute("aria-pressed", "false");
          setIndicator("laser", false);
          simulationRunning = false;
          var statusEl = document.getElementById("display-status");
          if (statusEl) statusEl.textContent = "AGUARDANDO";
          showMessage("Simulador reiniciado para a posição inicial.", "info");
        });
      }

      if (btnStop) {
        btnStop.addEventListener("click", function () {
          moveUp = moveDown = moveIn = moveOut = false;
          var statusEl = document.getElementById("display-status");
          if (statusEl) statusEl.textContent = "PARADO";
          showMessage("PARADA DE EMERGÊNCIA acionada. Todos os movimentos foram interrompidos.", "warning");
        });
      }

      // Atalhos de teclado (úteis em desktop; não interferem no touch)
      window.addEventListener("keydown", function (e) {
        if (e.key === "ArrowUp") moveUp = true;
        if (e.key === "ArrowDown") moveDown = true;
        if (e.key === "ArrowRight") moveIn = true;
        if (e.key === "ArrowLeft") moveOut = true;
      });
      window.addEventListener("keyup", function (e) {
        if (e.key === "ArrowUp") moveUp = false;
        if (e.key === "ArrowDown") moveDown = false;
        if (e.key === "ArrowRight") moveIn = false;
        if (e.key === "ArrowLeft") moveOut = false;
      });

      // -----------------------------------------------------------
      // HUD e display digital
      // -----------------------------------------------------------
      var hudPositionEl = document.getElementById("hud-table-position");
      var hudSpeedEl = document.getElementById("hud-table-speed");
      var hudHeightEl = document.getElementById("hud-table-height");
      var displayTableEl = document.getElementById("display-table");
      var displayHeightEl = document.getElementById("display-height");
      var displayStatusEl = document.getElementById("display-status");

      function updateReadouts(currentSpeedMmS) {
        // Posição longitudinal em mm. Se o operador zerou a mesa (botão
        // Zerar), a leitura é relativa a esse ponto (pode ser negativa);
        // caso contrário, 0 mm = totalmente retraída.
        var refZ = (tableZeroRef !== null) ? tableZeroRef : TABLE_Z_MAX;
        var posMm = (refZ - tableZ) * 1000;
        var posText = (posMm >= 0 ? "" : "-") + Math.abs(posMm).toFixed(1).padStart(5, "0");
        if (hudPositionEl) hudPositionEl.innerHTML = posText + " <small>mm</small>";
        if (displayTableEl) displayTableEl.textContent = posText + " mm";
        if (hudSpeedEl) hudSpeedEl.innerHTML = currentSpeedMmS.toFixed(1) + " <small>mm/s</small>";

        // Altura da mesa em cm (útil para calibrar/verificar os limites).
        var heightCm = tableY * 100;
        var heightText = heightCm.toFixed(1);
        if (hudHeightEl) hudHeightEl.innerHTML = heightText + " <small>cm</small>";
        if (displayHeightEl) displayHeightEl.textContent = heightText + " cm";

        // Alinhamento no isocentro: o centro do corpo do paciente fica
        // ~12 cm (metade da espessura) acima do topo do tampo. O tampo
        // (tableY) precisa estar ~14 cm abaixo do isocentro para que o
        // centro do paciente coincida com os 80 cm. Isso ensina o aluno
        // a "descer a mesa" para centralizar o paciente.
        var patientCenterY = tableY + 0.02 + PATIENT_HALF_THICKNESS;
        var isoDelta = Math.abs(patientCenterY - ISO_Y);
        if (displayStatusEl && simulationRunning) {
          if (isoDelta <= 0.01) {
            displayStatusEl.textContent = "ISOCENTRO OK";
          } else if (patientCenterY > ISO_Y) {
            displayStatusEl.textContent = "DESCER MESA";
          } else {
            displayStatusEl.textContent = "SUBIR MESA";
          }
        }
      }

      // -----------------------------------------------------------
      // Loop de animação, física e intertravamento de segurança
      // -----------------------------------------------------------
      var last = performance.now();

      function animate(now) {
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        var nextY = tableY, nextZ = tableZ;
        alertStatus = "";

        // Contexto: a mesa está (ou vai ficar) dentro do gantry?
        var isInsideBore = tableZ < BORE_SAFE_Z;

        // Limites de altura dependem do contexto:
        //   • Dentro do gantry: 64–88 cm (GANTRY_Y_MIN/MAX)
        //   • Fora do gantry:   50–88 cm (TABLE_Y_MIN / TABLE_Y_MAX)
        var yMin = isInsideBore ? GANTRY_Y_MIN : TABLE_Y_MIN;
        var yMax = isInsideBore ? GANTRY_Y_MAX : TABLE_Y_MAX;

        if (moveUp) nextY = Math.min(yMax, tableY + SPEED_Y * dt);
        if (moveDown) nextY = Math.max(yMin, tableY - SPEED_Y * dt);
        if (moveIn) nextZ = Math.max(TABLE_Z_MIN, tableZ - SPEED_Z * dt);
        if (moveOut) nextZ = Math.min(TABLE_Z_MAX, tableZ + SPEED_Z * dt);

        // Intertravamento de entrada: só permite entrar no gantry se a
        // altura estiver dentro da faixa segura (64–88 cm), evitando
        // colisão com a estrutura do bore.
        var willEnterBore = nextZ < BORE_SAFE_Z && tableZ >= BORE_SAFE_Z;
        var isHeightSafe = nextY >= GANTRY_Y_MIN && nextY <= GANTRY_Y_MAX;

        if (willEnterBore && !isHeightSafe) {
          nextZ = tableZ;
          alertStatus = "ALTURA INCOMPATÍVEL para entrada no gantry (ajuste para 64–88 cm)";
        }

        var moved = tableY !== nextY || tableZ !== nextZ;
        if (moved) {
          tableY = nextY;
          tableZ = nextZ;
          applyTablePose();
        }

        var anyMoveFlag = moveUp || moveDown || moveIn || moveOut;
        setIndicator("motion", anyMoveFlag && moved);

        if (alertStatus) {
          showMessage(alertStatus, "warning");
        }

        var speedMmS = 0;
        if (moveIn || moveOut) speedMmS = SPEED_Z * 1000;
        else if (moveUp || moveDown) speedMmS = SPEED_Y * 1000;
        updateReadouts(speedMmS);

        if (laserOn) {
          var pulse = 0.8 + Math.sin(now * 0.006) * 0.2;
          laserLineMat.opacity = pulse;
          updateLasers();
        }

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }

      updateReadouts(0);
      window.__ctSimulator = {
        scene: scene, camera: camera, renderer: renderer,
        gantryGroup: gantryGroup, tableGroup: tableGroup,
      };

      requestAnimationFrame(function () {
        if (loadingOverlay) loadingOverlay.setAttribute("data-hidden", "true");
      });
      requestAnimationFrame(animate);

      showMessage(
        "Simulador carregado (largura da janela: " + window.innerWidth + "px). Este ambiente é exclusivamente educacional e não deve ser utilizado para qualquer finalidade clínica ou diagnóstica.",
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

  // =================================================================
  // INICIALIZAÇÃO
  // =================================================================
  function main() {
    initTheme();
    bootstrap();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
