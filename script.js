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
      canvas.addEventListener("touchstart", function (e) {
        if (e.touches.length === 1) pointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      canvas.addEventListener("touchmove", function (e) {
        if (e.touches.length === 1) pointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      canvas.addEventListener("touchend", pointerUp);
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

      var GW = 2.0, GH = 1.9, GDEPTH = 0.85, BORE_R = 0.36;
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
      //     (o restante do curso, ~30 cm, é a aproximação antes do bore)
      // -----------------------------------------------------------
      var TABLE_Y_MIN = 0.50, TABLE_Y_MAX = 1.00;   // altura (m) — 50 a 100 cm
      var TABLE_Z_MAX = 1.10, TABLE_Z_MIN = -0.90;  // curso longitudinal (m) — 200 cm de curso total
      var BORE_SAFE_Z = 0.80;                        // ponto (m) em que a ponta da mesa cruza a face do gantry
      var SAFE_Y_MIN = 0.70, SAFE_Y_MAX = 0.90;      // faixa de altura segura para entrar no bore

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
      var patient = new THREE.Group();
      var skin = new THREE.MeshStandardMaterial({ color: 0xe3b993, roughness: 0.7 });
      var scrub = new THREE.MeshStandardMaterial({ color: 0x4f7d8c, roughness: 0.85 });

      var head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), skin);
      head.position.set(0, 0.14, 0.72);
      patient.add(head);

      var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.62, 16), scrub);
      torso.rotation.x = Math.PI / 2;
      torso.position.set(0, 0.13, 0.3);
      patient.add(torso);

      function limb(r, l, x, y, z, mat) {
        var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, l, 12), mat);
        m.rotation.x = Math.PI / 2;
        m.position.set(x, y, z);
        return m;
      }
      patient.add(limb(0.045, 0.75, -0.075, 0.1, -0.65, scrub));
      patient.add(limb(0.045, 0.75, 0.075, 0.1, -0.65, scrub));
      patient.add(limb(0.05, 0.32, -0.16, 0.12, 0.18, scrub));
      patient.add(limb(0.05, 0.32, 0.16, 0.12, 0.18, scrub));
      patient.add(limb(0.04, 0.42, -0.13, 0.12, 0.55, skin));
      patient.add(limb(0.04, 0.42, 0.13, 0.12, 0.55, skin));
      patient.position.set(0, 0.09, -0.05);
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
      // Laser de posicionamento — duas linhas grossas e nítidas
      // (longitudinal/sagital + transversal/coronal), sem efeito de luz
      // difusa. Usamos blending aditivo só para dar um leve "brilho" de
      // linha de laser, sem parecer uma lâmpada acesa.
      // -----------------------------------------------------------
      var laserGroup = new THREE.Group();
      scene.add(laserGroup);

      var LASER_THICKNESS = 0.012; // 12 mm — linha grossa e bem visível
      var laserMat = new THREE.MeshBasicMaterial({
        color: 0xff2222,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      // Linha longitudinal (sagital) — acompanha o eixo Z, ao longo do
      // corpo do paciente.
      var sagittalLine = new THREE.Mesh(new THREE.PlaneGeometry(LASER_THICKNESS, 2.4), laserMat);
      sagittalLine.rotation.x = -Math.PI / 2;
      sagittalLine.position.set(0, ISO_Y + 0.001, 0.2);
      laserGroup.add(sagittalLine);

      // Linha transversal (coronal) — marca o ponto de entrada no gantry.
      var coronalLine = new THREE.Mesh(new THREE.PlaneGeometry(GW * 0.9, LASER_THICKNESS), laserMat);
      coronalLine.rotation.x = -Math.PI / 2;
      coronalLine.position.set(0, ISO_Y + 0.001, -0.6 + GDEPTH / 2);
      laserGroup.add(coronalLine);

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
        var on = function () { setter(true); };
        var off = function () { setter(false); };
        el.addEventListener("mousedown", on);
        el.addEventListener("touchstart", function (e) { e.preventDefault(); on(); }, { passive: false });
        ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach(function (ev) {
          el.addEventListener(ev, off);
        });
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
          var statusEl = document.getElementById("display-status");
          if (statusEl) statusEl.textContent = "EM ANDAMENTO";
          showMessage("Simulação iniciada. Use os controles da mesa para posicionar o paciente.", "success");
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
      var displayTableEl = document.getElementById("display-table");

      function updateReadouts(currentSpeedMmS) {
        // Posição longitudinal exibida em mm, com 0 mm = totalmente retraída.
        var posMm = (TABLE_Z_MAX - tableZ) * 1000;
        var posText = posMm.toFixed(1).padStart(5, "0");
        if (hudPositionEl) hudPositionEl.innerHTML = posText + " <small>mm</small>";
        if (displayTableEl) displayTableEl.textContent = posText + " mm";
        if (hudSpeedEl) hudSpeedEl.innerHTML = currentSpeedMmS.toFixed(1) + " <small>mm/s</small>";
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

        // Regras de intertravamento (Regra Absoluta: nunca permitir
        // colisão entre a mesa e o gantry).
        var isInsideBore = tableZ < BORE_SAFE_Z;
        var willEnterBore = nextZ < BORE_SAFE_Z && tableZ >= BORE_SAFE_Z;
        var isHeightSafe = nextY >= SAFE_Y_MIN && nextY <= SAFE_Y_MAX;

        if (isInsideBore && nextY !== tableY) {
          nextY = tableY;
          alertStatus = "BLOQUEADO — risco de colisão (altura)";
        }
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
        "Simulador carregado. Este ambiente é exclusivamente educacional e não deve ser utilizado para qualquer finalidade clínica ou diagnóstica.",
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
