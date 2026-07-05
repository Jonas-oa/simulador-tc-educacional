/**
 * scene.js
 * Responsável por toda a configuração da cena 3D do equipamento de TC:
 * câmera, iluminação, chão de referência, e os grupos 3D do gantry
 * (equipamento) e da mesa de exame.
 *
 * Nesta etapa (1) os modelos do gantry e da mesa são geometrias
 * primitivas estilizadas — servem para validar o pipeline de
 * renderização, iluminação e responsividade. Nas próximas etapas,
 * essas geometrias serão substituídas/aprimoradas e ganharão as
 * animações de movimento, física e interatividade.
 */

import * as THREE from "three";
import { OrbitControls } from "./vendor/three/examples/jsm/controls/OrbitControls.js";

// Paleta usada nos materiais 3D, alinhada aos tokens de cor do CSS
// (mantida aqui em JS pois materiais Three.js não leem variáveis CSS).
const COLORS = {
  gantryBody: 0xd8dde3,
  gantryBodyDark: 0xb0b7c0,
  gantryBore: 0x11151c,
  tablePedestal: 0x9aa3ad,
  tableTop: 0xeef1f4,
  floor: 0x11161f,
  accentCyan: 0x35c5e0,
};

/**
 * Cria e configura a cena 3D completa, anexando-a ao elemento <canvas> fornecido.
 * @param {HTMLCanvasElement} canvas
 * @returns {{
 *   scene: THREE.Scene,
 *   camera: THREE.PerspectiveCamera,
 *   renderer: THREE.WebGLRenderer,
 *   controls: OrbitControls,
 *   gantryGroup: THREE.Group,
 *   tableGroup: THREE.Group,
 *   tabletopMesh: THREE.Mesh,
 *   dispose: () => void
 * }}
 */
export function initScene(canvas) {
  const container = canvas.parentElement;

  // ---------------------------------------------------------------
  // Cena, câmera e renderizador
  // ---------------------------------------------------------------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(4.2, 2.6, 5.2);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ---------------------------------------------------------------
  // Controles de órbita (uso educacional: permitir ao estudante
  // observar o equipamento de vários ângulos, com limites para não
  // "atravessar" o chão nem afastar/aproximar demais).
  // ---------------------------------------------------------------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.5;
  controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI / 2 - 0.03; // impede ir abaixo do chão
  controls.update();

  // ---------------------------------------------------------------
  // Iluminação
  // ---------------------------------------------------------------
  const hemiLight = new THREE.HemisphereLight(0xbfd4e8, 0x11151c, 0.6);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(5, 8, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 25;
  keyLight.shadow.camera.left = -8;
  keyLight.shadow.camera.right = 8;
  keyLight.shadow.camera.top = 8;
  keyLight.shadow.camera.bottom = -8;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x88c0d9, 0.35);
  fillLight.position.set(-6, 3, -4);
  scene.add(fillLight);

  // ---------------------------------------------------------------
  // Chão de referência (sala de exame)
  // ---------------------------------------------------------------
  const floorGeometry = new THREE.PlaneGeometry(20, 20);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.floor,
    roughness: 0.95,
    metalness: 0.05,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(20, 40, 0x2a3342, 0x1a222c);
  grid.position.y = 0.002;
  scene.add(grid);

  // ---------------------------------------------------------------
  // Gantry (placeholder estilizado — cilindro "tambor" com um bore
  // central escuro simulando a abertura por onde a mesa entra).
  // ---------------------------------------------------------------
  const gantryGroup = new THREE.Group();
  gantryGroup.name = "gantryGroup";

  const gantryBodyGeometry = new THREE.CylinderGeometry(1.35, 1.35, 1.1, 48);
  const gantryBodyMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.gantryBody,
    roughness: 0.35,
    metalness: 0.15,
  });
  const gantryBody = new THREE.Mesh(gantryBodyGeometry, gantryBodyMaterial);
  gantryBody.rotation.z = Math.PI / 2; // eixo do "tambor" alinhado ao eixo da mesa (Z)
  gantryBody.castShadow = true;
  gantryBody.receiveShadow = true;
  gantryBody.position.y = 1.5;
  gantryGroup.add(gantryBody);

  const gantryBoreGeometry = new THREE.CylinderGeometry(0.62, 0.62, 1.3, 32);
  const gantryBoreMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.gantryBore,
    roughness: 0.7,
    metalness: 0.0,
  });
  const gantryBore = new THREE.Mesh(gantryBoreGeometry, gantryBoreMaterial);
  gantryBore.rotation.z = Math.PI / 2;
  gantryBore.position.y = 1.5;
  gantryGroup.add(gantryBore);

  // Anel de acento (referência visual do "rotor" interno do gantry)
  const gantryRingGeometry = new THREE.TorusGeometry(0.62, 0.035, 16, 64);
  const gantryRingMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.accentCyan,
    emissive: COLORS.accentCyan,
    emissiveIntensity: 0.4,
    roughness: 0.4,
  });
  const gantryRingFront = new THREE.Mesh(gantryRingGeometry, gantryRingMaterial);
  gantryRingFront.position.set(0, 1.5, 0.68);
  gantryGroup.add(gantryRingFront);

  // Base/pedestal do gantry (fixação ao piso)
  const gantryBaseGeometry = new THREE.BoxGeometry(1.9, 0.9, 1.9);
  const gantryBaseMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.gantryBodyDark,
    roughness: 0.6,
    metalness: 0.1,
  });
  const gantryBase = new THREE.Mesh(gantryBaseGeometry, gantryBaseMaterial);
  gantryBase.position.y = 0.45;
  gantryBase.castShadow = true;
  gantryBase.receiveShadow = true;
  gantryGroup.add(gantryBase);

  gantryGroup.position.set(0, 0, -1.2);
  scene.add(gantryGroup);

  // ---------------------------------------------------------------
  // Mesa de exame (placeholder — pedestal fixo + tampo móvel).
  // O tampo (tabletopMesh) é o objeto que será animado nas próximas
  // etapas (subir/descer/entrar/sair do gantry).
  // ---------------------------------------------------------------
  const tableGroup = new THREE.Group();
  tableGroup.name = "tableGroup";

  const pedestalGeometry = new THREE.BoxGeometry(0.5, 0.75, 0.7);
  const pedestalMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.tablePedestal,
    roughness: 0.5,
    metalness: 0.2,
  });
  const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
  pedestal.position.set(0, 0.375, 1.6);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  tableGroup.add(pedestal);

  const tabletopGeometry = new THREE.BoxGeometry(0.62, 0.08, 3.6);
  const tabletopMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.tableTop,
    roughness: 0.3,
    metalness: 0.1,
  });
  const tabletopMesh = new THREE.Mesh(tabletopGeometry, tabletopMaterial);
  tabletopMesh.name = "tabletopMesh";
  // Posição de referência: mesa retraída, fora do gantry, na altura de repouso.
  tabletopMesh.position.set(0, 0.78, 1.6);
  tabletopMesh.castShadow = true;
  tabletopMesh.receiveShadow = true;
  tableGroup.add(tabletopMesh);

  scene.add(tableGroup);

  // ---------------------------------------------------------------
  // Redimensionamento responsivo
  // ---------------------------------------------------------------
  function handleResize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  const resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(container);
  handleResize();

  // ---------------------------------------------------------------
  // Loop de renderização
  // ---------------------------------------------------------------
  let animationFrameId = null;

  function renderLoop() {
    controls.update();
    renderer.render(scene, camera);
    animationFrameId = requestAnimationFrame(renderLoop);
  }
  renderLoop();

  /**
   * Libera recursos da cena (usado se o simulador precisar ser
   * reinicializado completamente, por exemplo em testes).
   */
  function dispose() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
    resizeObserver.disconnect();
    controls.dispose();
    renderer.dispose();
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    gantryGroup,
    tableGroup,
    tabletopMesh,
    dispose,
  };
}
