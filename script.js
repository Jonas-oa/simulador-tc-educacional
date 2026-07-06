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
      //   • Entrada máxima no gantry (além da face do bore): ~170 cm
      //
      // Geometria do gantry (para referência do limite de inserção):
      //   face frontal do bore em Z ≈ -0.175 ; face traseira em Z ≈ -1.025.
      //   O tampo tem 1.95 m de comprimento, centrado em tableZ; sua ponta
      //   frontal fica em (tableZ - 0.975). Para a ponta parar ~5 cm antes
      //   da face traseira do gantry (-1.025), tableZ mínimo ≈ -0.10.
      // -----------------------------------------------------------
      var TABLE_Y_MIN = 0.50, TABLE_Y_MAX = 1.00;   // altura (m) — 50 a 100 cm
      var TABLE_Z_MAX = 1.10;                        // totalmente retraída (fora do gantry)
      var TABLE_Z_MIN = 0.03;                        // inserção máxima — ponta da mesa para ~8cm antes da parede traseira do túnel
      var BORE_SAFE_Z = 0.80;                        // ponto (m) em que a ponta da mesa cruza a face do gantry
      // Faixa de altura segura para permanecer/entrar no bore. O furo do
      // gantry (raio 40 cm / diâmetro 80 cm, em torno do isocentro de
      // 80 cm) comporta com folga toda a faixa mecânica da mesa, então a
      // faixa segura é a própria faixa completa de altura (50–100 cm).
      var SAFE_Y_MIN = TABLE_Y_MIN, SAFE_Y_MAX = TABLE_Y_MAX;

      // Meia-espessura do paciente (do topo do tampo ao centro do corpo).
      // Usada para calcular o alinhamento do isocentro.
      var PATIENT_HALF_THICKNESS = 0.12; // 12 cm (espessura média ~24 cm)

      var tableY = 0.80; // inicia na altura do isocentro
      var tableZ = TABLE_Z_MAX; // inicia totalmente retraída (fora do gantry)

      var baseGroup = new THREE.Group();
      baseGroup.position.set(0, 0, 0.9);
      scene.add(baseGroup);

      var pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.34, 0.12, 24),
        new THREE.MeshStandardMaterial({ color: 0xb7bec5, roughness: 0.4, metalness: 0.4 })
      );
      pedestal.position.set(0, 0.06, 0);
      pedestal.castShadow = true;
      baseGroup.add(pedestal);

      var sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.13, 0.35, 20),
        new THREE.MeshStandardMaterial({ color: 0xcdd3d8, roughness: 0.3, metalness: 0.6 })
      );
      sleeve.position.set(0, 0.12 + 0.175, 0);
      baseGroup.add(sleeve);

      var shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 1, 16),
        new THREE.MeshStandardMaterial({ color: 0xe7eaee, roughness: 0.25, metalness: 0.7 })
      );
      shaft.castShadow = true;
      baseGroup.add(shaft);

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
      cushion.position.y = 0.055;
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
        var t = (tableY - TABLE_Y_MIN) / (TABLE_Y_MAX - TABLE_Y_MIN);
        var shaftLen = 0.10 + t * 0.60;
        shaft.scale.y = shaftLen;
        shaft.position.y = 0.12 + 0.35 + shaftLen / 2 - 0.1;
      }
      applyTablePose();

      // -----------------------------------------------------------
      // Laser de posicionamento — FIXO no gantry (não acompanha a mesa).
      // Assim como no equipamento real, o paciente é que se desloca
      // através da cruz de laser, que marca o plano de corte atual.
      //   • Transversal: liga 3h a 9h (linha horizontal)
      //   • Longitudinal: liga 12h a 6h (linha vertical)
      // Ambas ficam no plano de entrada do gantry (fixo em X/Y/Z).
      // -----------------------------------------------------------
      var laserGroup = new THREE.Group();
      var GANTRY_FACE_Z = -0.6 + GDEPTH / 2 + 0.005;
      laserGroup.position.set(0, ISO_Y, GANTRY_FACE_Z);
      scene.add(laserGroup);

      var LASER_THICKNESS = 0.014; // 14 mm — linha grossa e bem visível
      var LASER_SPAN = BORE_R * 1.9; // cobre quase todo o diâmetro do bore
      var laserMat = new THREE.MeshBasicMaterial({
        color: 0xff2222,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false, // sempre desenha por cima — "reflete" visualmente sobre o paciente em qualquer ângulo
        side: THREE.DoubleSide,
      });

      // Transversal (3h ↔ 9h): linha horizontal, parada no eixo X.
      var transversalLine = new THREE.Mesh(new THREE.PlaneGeometry(LASER_SPAN, LASER_THICKNESS), laserMat);
      transversalLine.renderOrder = 999;
      laserGroup.add(transversalLine);

      // Longitudinal (12h ↔ 6h): linha vertical, parada no eixo Y.
      var longitudinalLine = new THREE.Mesh(new THREE.PlaneGeometry(LASER_THICKNESS, LASER_SPAN), laserMat);
      longitudinalLine.renderOrder = 999;
      laserGroup.add(longitudinalLine);

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
          showMessage(laserOn ? "Laser de posicionamento ligado." : "Laser de posicionamento desligado.", "info");
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
        // Posição longitudinal exibida em mm, com 0 mm = totalmente retraída.
        var posMm = (TABLE_Z_MAX - tableZ) * 1000;
        var posText = posMm.toFixed(1).padStart(5, "0");
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

        if (moveUp) nextY = Math.min(TABLE_Y_MAX, tableY + SPEED_Y * dt);
        if (moveDown) nextY = Math.max(TABLE_Y_MIN, tableY - SPEED_Y * dt);
        if (moveIn) nextZ = Math.max(TABLE_Z_MIN, tableZ - SPEED_Z * dt);
        if (moveOut) nextZ = Math.min(TABLE_Z_MAX, tableZ + SPEED_Z * dt);

        // Regras de intertravamento. Como o furo do gantry comporta toda
        // a faixa mecânica de altura da mesa (50–100 cm), a altura pode
        // ser ajustada livremente mesmo com a mesa inserida — os únicos
        // limites são os mecânicos (TABLE_Y_MIN/MAX), já aplicados acima.
        // Mantemos a estrutura de verificação para regras futuras.
        var isInsideBore = tableZ < BORE_SAFE_Z;
        var willEnterBore = nextZ < BORE_SAFE_Z && tableZ >= BORE_SAFE_Z;
        var isHeightSafe = nextY >= SAFE_Y_MIN && nextY <= SAFE_Y_MAX;

        if (willEnterBore && !isHeightSafe) {
          nextZ = tableZ;
          alertStatus = "ALTURA INCOMPATÍVEL para entrada no gantry";
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
          var pulse = 0.85 + Math.sin(now * 0.006) * 0.15;
          laserMat.opacity = 0.95 * pulse;
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
