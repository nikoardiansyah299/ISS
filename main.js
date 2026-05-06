import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030712);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 6);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
renderer.domElement.id = 'scene';

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1.1);
light.position.set(5, 5, 5);
scene.add(light);
scene.add(light.target);

const ambientLight = new THREE.AmbientLight(0x7f8ea3, 0.22);
scene.add(ambientLight);

// Bumi
const textureLoader = new THREE.TextureLoader();
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const backgroundPrefKey = 'iss-bg-motion';

function getBackgroundQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const connection = navigator.connection ? navigator.connection.effectiveType : '4g';
  let quality = 1;

  if (cores <= 4 || memory <= 4) quality *= 0.7;
  if (typeof connection === 'string' && /2g|3g/.test(connection)) quality *= 0.6;

  return Math.min(1, Math.max(0.35, quality));
}

function createStarfield(count, radius, spread) {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius + Math.random() * spread;

    const sinPhi = Math.sin(phi);
    const index = i * 3;
    positions[index] = r * sinPhi * Math.cos(theta);
    positions[index + 1] = r * Math.cos(phi);
    positions[index + 2] = r * sinPhi * Math.sin(theta);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

const backgroundQuality = getBackgroundQuality();
const starfield = createStarfield(Math.round(600 * backgroundQuality), 180, 140);
starfield.renderOrder = -2;
scene.add(starfield);

const spaceTexture = textureLoader.load('./image/space.jpg');
spaceTexture.colorSpace = THREE.SRGBColorSpace;
spaceTexture.anisotropy = maxAnisotropy;

const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(140, 60, 40),
  new THREE.MeshBasicMaterial({
    map: spaceTexture,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  })
);
skyDome.renderOrder = -3;
scene.add(skyDome);

function syncBackgroundToCamera() {
  skyDome.position.copy(camera.position);
  starfield.position.copy(camera.position);
}

let backgroundMotionEnabled = !prefersReducedMotion.matches;
let backgroundMotionUserOverride = false;

try {
  const savedMotion = localStorage.getItem(backgroundPrefKey);
  if (savedMotion === 'on' || savedMotion === 'off') {
    backgroundMotionEnabled = savedMotion === 'on';
    backgroundMotionUserOverride = true;
  }
} catch (error) {
  backgroundMotionUserOverride = false;
}

function setBackgroundMotion(enabled, persist = true) {
  backgroundMotionEnabled = enabled;

  if (backgroundToggle) {
    backgroundToggle.setAttribute('aria-pressed', String(!enabled));
    backgroundToggle.textContent = enabled ? 'Gerak Latar: Aktif' : 'Gerak Latar: Diam';
  }

  if (!persist) return;

  try {
    localStorage.setItem(backgroundPrefKey, enabled ? 'on' : 'off');
  } catch (error) {
    backgroundMotionUserOverride = false;
  }
}

function loadEarthTexture(path, colorSpace = THREE.SRGBColorSpace) {
  const texture = textureLoader.load(path);
  texture.colorSpace = colorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

const earthDayMap = loadEarthTexture('./image/day_bumi.jpg', THREE.SRGBColorSpace);
const earthNightMap = loadEarthTexture('./image/night_bumi.jpg', THREE.SRGBColorSpace);
const earthNormalMap = loadEarthTexture('./image/normal_bumi.jpg', THREE.NoColorSpace);
const earthSpecularMap = loadEarthTexture('./image/specular_bumi.jpg', THREE.NoColorSpace);
const earthCloudMap = loadEarthTexture('./image/cloud_bumi.jpg', THREE.SRGBColorSpace);
const sunMap = loadEarthTexture('./image/matahari.jpg', THREE.SRGBColorSpace);

const earthGeometry = new THREE.SphereGeometry(2.6, 64, 64);
const earthMaterial = new THREE.MeshPhysicalMaterial({
  map: earthDayMap,
  normalMap: earthNormalMap,
  roughness: 0.8,
  metalness: 0.0,
  specularIntensity: 0.6,
  specularIntensityMap: earthSpecularMap,
});
const earth = new THREE.Mesh(earthGeometry, earthMaterial);
const earthNightGeometry = new THREE.SphereGeometry(2.601, 64, 64);
const earthNightMaterial = new THREE.ShaderMaterial({
  uniforms: {
    nightMap: { value: earthNightMap },
    lightDirection: { value: new THREE.Vector3() },
    intensity: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    varying float vNight;
    uniform vec3 lightDirection;

    void main() {
      vUv = uv;
      vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
      float dotNL = dot(worldNormal, normalize(lightDirection));
      vNight = smoothstep(0.0, 0.25, -dotNL);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D nightMap;
    uniform float intensity;
    varying vec2 vUv;
    varying float vNight;

    void main() {
      vec3 color = texture2D(nightMap, vUv).rgb * intensity;
      gl_FragColor = vec4(color * vNight, vNight);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
earthNightMaterial.toneMapped = false;
const earthNight = new THREE.Mesh(earthNightGeometry, earthNightMaterial);
earthNight.renderOrder = 1;
earth.add(earthNight);
const cloudGeometry = new THREE.SphereGeometry(2.62, 64, 64);
const cloudMaterial = new THREE.MeshStandardMaterial({
  map: earthCloudMap,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const earthClouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
earthClouds.renderOrder = 2;
earth.add(earthClouds);
scene.add(earth);

const sunVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunFragmentShader = `
  uniform sampler2D uTexture;
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uUseTexture;
  uniform float uAlpha;
  uniform float uCorona;

  varying vec2 vUv;

  void main() {
    vec2 centered = vUv - 0.5;
    float r = length(centered) * 2.0;
    float grad = smoothstep(0.0, 1.0, r);
    float ripple = 0.015 * sin(10.0 * r - uTime * 1.2);
    grad = clamp(grad + ripple, 0.0, 1.0);

    vec3 color = mix(uInnerColor, uOuterColor, grad);
    vec3 tex = texture2D(uTexture, vUv).rgb;
    color = mix(color, color * (0.75 + tex.r * 0.6), uUseTexture);

    float edge = smoothstep(0.25, 1.0, r);
    float fade = 1.0 - smoothstep(0.7, 1.0, r);
    float coronaAlpha = edge * fade;
    float alpha = mix(1.0, coronaAlpha, uCorona) * uAlpha;

    gl_FragColor = vec4(color * uIntensity, alpha);
  }
`;

const sunTimeUniform = { value: 0 };
const sunTextureUniform = { value: sunMap };
const sunRadius = 1.6;
const sunSegments = 48;
const sunGeometry = new THREE.SphereGeometry(sunRadius, sunSegments, sunSegments);
const sunCoronaGeometry = new THREE.SphereGeometry(sunRadius * 1.12, sunSegments, sunSegments);

const sunCoreMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTexture: sunTextureUniform,
    uInnerColor: { value: new THREE.Color(0xfff1a8) },
    uOuterColor: { value: new THREE.Color(0xff7a1c) },
    uIntensity: { value: 1.25 },
    uTime: sunTimeUniform,
    uUseTexture: { value: 1.0 },
    uAlpha: { value: 1.0 },
    uCorona: { value: 0.0 },
  },
  vertexShader: sunVertexShader,
  fragmentShader: sunFragmentShader,
  transparent: true,
});
sunCoreMaterial.toneMapped = false;

const sunCoronaMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTexture: sunTextureUniform,
    uInnerColor: { value: new THREE.Color(0xffd27a) },
    uOuterColor: { value: new THREE.Color(0xff4a00) },
    uIntensity: { value: 1.0 },
    uTime: sunTimeUniform,
    uUseTexture: { value: 0.0 },
    uAlpha: { value: 0.55 },
    uCorona: { value: 1.0 },
  },
  vertexShader: sunVertexShader,
  fragmentShader: sunFragmentShader,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
sunCoronaMaterial.toneMapped = false;

const sunGroup = new THREE.Group();
const sunCore = new THREE.Mesh(sunGeometry, sunCoreMaterial);
const sunCorona = new THREE.Mesh(sunCoronaGeometry, sunCoronaMaterial);
sunCore.renderOrder = 3;
sunCorona.renderOrder = 4;
sunCore.userData.skipShading = true;
sunCorona.userData.skipShading = true;
sunGroup.add(sunCore, sunCorona);
sunGroup.position.set(12, 6, -10);
scene.add(sunGroup);

const sunHomePosition = sunGroup.position.clone();

function syncSunLight() {
  light.position.copy(sunGroup.position);
  if (earth) {
    light.target.position.copy(earth.position);
  } else {
    light.target.position.set(0, 0, 0);
  }
  light.target.updateMatrixWorld();
}

syncSunLight();

function isSunObject(object) {
  let current = object;
  while (current) {
    if (current === sunGroup) return true;
    current = current.parent;
  }
  return false;
}

const earthLightTarget = new THREE.Vector3();
const earthLightDirection = new THREE.Vector3();

function updateEarthNightLighting() {
  light.target.getWorldPosition(earthLightTarget);
  earthLightDirection.copy(light.position).sub(earthLightTarget).normalize();
  earthNightMaterial.uniforms.lightDirection.value.copy(earthLightDirection);
}

// ISS
const issOrbit = new THREE.Group();
scene.add(issOrbit);

let iss;
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/libs/draco/');
loader.setDRACOLoader(dracoLoader);
loader.setMeshoptDecoder(MeshoptDecoder);

const hud = document.getElementById('hud');
const infoPanel = document.getElementById('infoPanel');
const orbitToggle = document.getElementById('orbitToggle');
let shaderToggle = document.getElementById('shaderToggle');
if (!shaderToggle && hud) {
  shaderToggle = document.createElement('button');
  shaderToggle.id = 'shaderToggle';
  shaderToggle.type = 'button';
  shaderToggle.dataset.mode = 'default';
  shaderToggle.textContent = 'Shader: Default';
  hud.appendChild(shaderToggle);
}
let backgroundToggle = document.getElementById('backgroundToggle');
if (!backgroundToggle && hud) {
  backgroundToggle = document.createElement('button');
  backgroundToggle.id = 'backgroundToggle';
  backgroundToggle.type = 'button';
  backgroundToggle.setAttribute('aria-pressed', 'false');
  backgroundToggle.textContent = 'Gerak Latar: Aktif';
  hud.appendChild(backgroundToggle);
}
const componentHint = document.getElementById('componentHint');
const componentName = document.getElementById('componentName');
const componentDescription = document.getElementById('componentDescription');
const sunScale = document.getElementById('sunScale');
const sunScaleValue = document.getElementById('sunScaleValue');
const sunIntensity = document.getElementById('sunIntensity');
const sunIntensityValue = document.getElementById('sunIntensityValue');
const sunMoveToggle = document.getElementById('sunMoveToggle');
const sunResetButton = document.getElementById('sunResetButton');
const sunControls = document.getElementById('sunControls');

// Sidebar elements and controls (closed by default)
const sidebar = document.getElementById('sidebar');
const sidebarHandle = document.getElementById('sidebarHandle');

function showSunControls() {
  if (sunControls) sunControls.classList.add('visible');
}

function hideSunControls() {
  if (sunControls) sunControls.classList.remove('visible');
}

let sunMoveEnabled = false;
let sunDragging = false;
const sunDragPlane = new THREE.Plane();
const sunDragPoint = new THREE.Vector3();
const sunDragOffset = new THREE.Vector3();
const sunDragNormal = new THREE.Vector3();

const sunScaleDefault = 1;
const sunScaleMin = 0.2;
const sunScaleMax = 5;
const sunIntensityDefault = 1.1;
const sunIntensityMin = 0.1;
const sunIntensityMax = 3;

function formatSunScale(value) {
  return `${value.toFixed(1)}x`;
}

function setSunScale(value) {
  const scale = Number(value);
  if (!Number.isFinite(scale)) return;

  sunGroup.scale.setScalar(scale);
  if (sunScaleValue) sunScaleValue.textContent = formatSunScale(scale);
}

function setSunIntensity(value) {
  const intensity = Number(value);
  if (!Number.isFinite(intensity)) return;

  light.intensity = intensity;
  if (sunIntensityValue) sunIntensityValue.textContent = `${intensity.toFixed(1)}x`;
}

function setSunMoveEnabled(enabled) {
  sunMoveEnabled = enabled;

  if (sunMoveToggle) {
    sunMoveToggle.setAttribute('aria-pressed', String(enabled));
    sunMoveToggle.textContent = enabled ? 'Pindah Matahari: Aktif' : 'Pindah Matahari: Nonaktif';
  }

  if (enabled && currentCameraMode !== 'freecam') {
    setCameraMode('freecam');
  }

  if (!enabled) {
    sunDragging = false;
    controls.enabled = true;
  }
}

function resetSunPosition() {
  sunGroup.position.copy(sunHomePosition);
  syncSunLight();
  updateEarthNightLighting();
  
  // Reset sliders
  if (sunScale) {
    sunScale.value = String(sunScaleDefault);
    setSunScale(sunScaleDefault);
  }
  if (sunIntensity) {
    sunIntensity.value = String(sunIntensityDefault);
    setSunIntensity(sunIntensityDefault);
  }
}

if (sunScale) {
  sunScale.min = String(sunScaleMin);
  sunScale.max = String(sunScaleMax);
  sunScale.step = '0.1';
  sunScale.value = String(sunScaleDefault);
  sunScale.addEventListener('input', (event) => {
    setSunScale(event.target.value);
  });
}

if (sunIntensity) {
  sunIntensity.min = String(sunIntensityMin);
  sunIntensity.max = String(sunIntensityMax);
  sunIntensity.step = '0.1';
  sunIntensity.value = String(sunIntensityDefault);
  sunIntensity.addEventListener('input', (event) => {
    setSunIntensity(event.target.value);
  });
}

if (sunMoveToggle) {
  sunMoveToggle.addEventListener('click', () => {
    setSunMoveEnabled(!sunMoveEnabled);
    if (infoPanel) {
      infoPanel.innerText = sunMoveEnabled
        ? 'Pindah matahari aktif. Seret matahari untuk pindah.'
        : 'Pindah matahari nonaktif.';
    }
  });
}

if (sunResetButton) {
  sunResetButton.addEventListener('click', () => {
    resetSunPosition();
    if (infoPanel) infoPanel.innerText = 'Posisi matahari dikembalikan.';
  });
}

setSunScale(sunScaleDefault);
setSunIntensity(sunIntensityDefault);

function openSidebar() {
  if (!sidebar) return;
  sidebar.classList.add('open');
  sidebar.setAttribute('aria-hidden', 'false');
}

function closeSidebar() {
  if (!sidebar) return;
  sidebar.classList.remove('open');
  sidebar.setAttribute('aria-hidden', 'true');
}

function toggleSidebar() {
  if (!sidebar) return;
  sidebar.classList.toggle('open');
  sidebar.setAttribute('aria-hidden', sidebar.classList.contains('open') ? 'false' : 'true');
}

if (sidebar) closeSidebar();
if (sidebarHandle) sidebarHandle.addEventListener('click', toggleSidebar);

// Camera mode controls
const cameraEarthBtn = document.getElementById('cameraEarth');
const cameraISSBtn = document.getElementById('cameraISS');
const cameraSunBtn = document.getElementById('cameraSun');
const cameraFreecamBtn = document.getElementById('cameraFreecam');

let currentCameraMode = 'freecam';
let issFollowEnabled = false;
const issFollowPrev = new THREE.Vector3();
const issFollowDelta = new THREE.Vector3();
const freecamLookDir = new THREE.Vector3();
const cameraKeys = { w: false, a: false, s: false, d: false };
const cameraSpeed = 0.15;

function updateCameraModeButton(mode) {
  [cameraEarthBtn, cameraISSBtn, cameraSunBtn, cameraFreecamBtn].forEach((btn) => {
    if (!btn) return;
    btn.setAttribute('data-active', btn.dataset.mode === mode ? 'true' : 'false');
  });
}

function focusCameraOn(targetPos, targetDistance = 8, duration = 800, mode = 'focused', onComplete = null) {
  currentCameraMode = mode;
  updateCameraModeButton(mode);
  controls.enableRotate = false;

  const startPos = camera.position.clone();
  const direction = targetPos.clone().sub(startPos).normalize();
  const endPos = targetPos.clone().add(direction.multiplyScalar(-targetDistance));

  const startTime = performance.now();

  function animateCamera(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // easeInOutCubic
    const t = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camera.position.lerpVectors(startPos, endPos, t);
    camera.lookAt(targetPos);

    if (progress < 1) {
      requestAnimationFrame(animateCamera);
    } else {
      controls.target.copy(targetPos);
      controls.enableRotate = true;
      currentCameraMode = mode;
      updateCameraModeButton(mode);
      if (typeof onComplete === 'function') onComplete();
    }
  }

  requestAnimationFrame(animateCamera);
}

function enableISSFollow() {
  if (!iss) return;
  issFollowEnabled = true;
  issFollowPrev.copy(issOrbit.position);
  controls.target.copy(issOrbit.position);
  currentCameraMode = 'iss';
  updateCameraModeButton('iss');
}

function setCameraMode(mode) {
  issFollowEnabled = false;

  if (mode === 'earth' && earth) {
    focusCameraOn(earth.position, 6, 800, 'earth');
  } else if (mode === 'iss' && iss) {
    focusCameraOn(issOrbit.position, 5, 800, 'iss', enableISSFollow);
  } else if (mode === 'sun') {
    focusCameraOn(sunGroup.position, 5, 800, 'sun');
  } else if (mode === 'freecam') {
    currentCameraMode = 'freecam';
    updateCameraModeButton('freecam');
    controls.enableRotate = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    camera.getWorldDirection(freecamLookDir);
    controls.target.copy(camera.position).add(freecamLookDir.multiplyScalar(1.2));
  }
}

if (cameraEarthBtn) cameraEarthBtn.addEventListener('click', () => setCameraMode('earth'));
if (cameraISSBtn) cameraISSBtn.addEventListener('click', () => setCameraMode('iss'));
if (cameraSunBtn) cameraSunBtn.addEventListener('click', () => setCameraMode('sun'));
if (cameraFreecamBtn) cameraFreecamBtn.addEventListener('click', () => setCameraMode('freecam'));

// WASD movement for freecam
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'w') cameraKeys.w = true;
  if (key === 'a') cameraKeys.a = true;
  if (key === 's') cameraKeys.s = true;
  if (key === 'd') cameraKeys.d = true;
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'w') cameraKeys.w = false;
  if (key === 'a') cameraKeys.a = false;
  if (key === 's') cameraKeys.s = false;
  if (key === 'd') cameraKeys.d = false;
});

function updateFreecamMovement() {
  if (currentCameraMode !== 'freecam') return;

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up);
  right.y = 0;
  right.normalize();

  let moveDir = new THREE.Vector3();
  if (cameraKeys.w) moveDir.add(forward);
  if (cameraKeys.s) moveDir.sub(forward);
  if (cameraKeys.d) moveDir.add(right);
  if (cameraKeys.a) moveDir.sub(right);

  if (moveDir.length() > 0) {
    moveDir.normalize().multiplyScalar(cameraSpeed);
    camera.position.add(moveDir);
    controls.target.add(moveDir);
  }
}

updateCameraModeButton('freecam');

let orbitPaused = false;
let selectedObject = null;
let selectedPart = null;
let selectedMaterials = [];
let selectedMaterialSwaps = [];
const glowColor = new THREE.Color(0x64ffb0);
const glowClock = new THREE.Clock();
const sunClock = new THREE.Clock();
const SHADING_MODES = ['default', 'gouraud', 'phong'];
let shadingModeIndex = 0;
let shadingMode = 'default';
const originalMaterials = new Map();
const gouraudMaterialCache = new Map();
const phongMaterialCache = new Map();

const ISS_PARTS = [
  {
    id: 'panel-surya',
    category: 'Panel Surya',
    names: ['panel surya'],
    description: 'Panel surya ISS adalah sumber listrik utama yang mengubah cahaya matahari menjadi energi listrik. Energi ini disalurkan ke baterai dan sistem utama seperti kendali termal, komputer, komunikasi, dan eksperimen. Orientasi panel terus diatur agar daya tetap stabil di berbagai kondisi orbit.\n\nSejak awal pembangunan ISS, panel surya dipasang bertahap bersama segmen truss untuk menambah kapasitas daya. Konfigurasi panel berkembang selama era Space Shuttle untuk meningkatkan keluaran listrik dan umur operasi. Panel-panel ini menjadi ciri visual paling khas dari ISS.',
  },
  {
    id: 'p4-truss',
    category: 'Struktur Truss',
    names: ['20 P4 Truss_01', '20 P4 Truss_02'],
    description: 'Segmen P4 adalah bagian truss di sisi port yang membawa jalur distribusi daya, struktur penyangga panel, dan titik sambung peralatan eksternal. Ia menjadi penghubung penting antara rangka utama dan perangkat tenaga di sisi kiri ISS.\n\nP4 dipasang pada 2000 dalam rangkaian misi pembangunan awal ISS. Kehadirannya memperpanjang tulang punggung struktural stasiun dan menyiapkan jalur untuk panel surya besar di sisi port.',
  },
  {
    id: 'p6-truss',
    category: 'Struktur Truss',
    names: ['08 P6 Truss_01', '08 P6 Truss_02'],
    description: 'Segmen P6 berada di ujung sisi port dan menampung panel surya besar serta sistem listrik terkait. Segmen ini juga membawa struktur pendukung yang menjaga panel tetap stabil saat ISS bermanuver.\n\nP6 merupakan salah satu segmen awal yang membawa panel surya besar untuk tahap awal operasi ISS. Segmen ini pernah diposisikan sementara di atas struktur tengah sebelum dipindahkan ke lokasi permanen saat truss lengkap.',
  },
  {
    id: 's4-truss',
    category: 'Struktur Truss',
    names: ['23 S4 Truss_01', '23 S4 Truss_02'],
    description: 'Segmen S4 adalah bagian truss di sisi starboard yang membawa panel surya dan jalur distribusi daya ke sisi kanan stasiun. Struktur ini menjaga keseimbangan daya antara kedua sisi ISS.\n\nS4 dipasang pada 2002 ketika ISS berkembang menjadi kompleks yang lebih besar. Kehadirannya menambah kapasitas listrik dan memperpanjang kemampuan operasi stasiun.',
  },
  {
    id: 's6-truss',
    category: 'Struktur Truss',
    names: ['32 S6 Truss_01', '32 S6 Truss_02'],
    description: 'Segmen S6 berada di ujung sisi starboard dan menampung panel surya tambahan serta struktur pendukungnya. Segmen ini melengkapi distribusi daya pada sisi kanan ISS.\n\nS6 dipasang pada 2009 sebagai salah satu segmen terakhir dari rangkaian truss utama. Dengan pemasangan ini, kapasitas daya ISS mencapai konfigurasi puncaknya.',
  },
  {
    id: 'zarya',
    category: 'Modul Inti',
    names: ['zarya', '01 Zarya - (FGB) Funtional Cargo Block'],
    description: 'Zarya (FGB) adalah modul pertama ISS yang menyediakan daya awal, kontrol orientasi sementara, serta ruang penyimpanan. Modul ini juga menjadi titik docking awal untuk rangkaian perakitan stasiun.\n\nDiluncurkan pada 1998 sebagai kerja sama Amerika Serikat dan Rusia, Zarya menjadi fondasi awal perakitan ISS. Keberadaannya memungkinkan modul berikutnya berlabuh dan memulai operasi awal stasiun.',
  },
  {
    id: 'zvezda',
    category: 'Modul Inti',
    names: ['zvezda', '05 Zvezda (SM) Service Module'],
    description: 'Zvezda adalah Service Module yang menyediakan sistem pendukung kehidupan, ruang tinggal, dan kemampuan propulsi utama. Modul ini menjadi pusat operasi harian kru untuk jangka panjang.\n\nDiluncurkan pada 2000, Zvezda menandai transisi ISS menjadi stasiun yang dapat dihuni terus-menerus. Modul ini menjadi tulang punggung segmen Rusia dan memperkuat kemampuan bertahan di orbit.',
  },
  {
    id: 'destiny',
    category: 'Modul Inti',
    names: ['destiny', '09 Destiny Space Laboratory'],
    description: 'Destiny adalah laboratorium utama Amerika Serikat untuk riset mikrogravitasi. Di dalamnya, kru melakukan eksperimen biologi, fisika, dan pengembangan teknologi ruang angkasa.\n\nDiluncurkan pada 2001, Destiny menjadi pusat penelitian jangka panjang dan salah satu pilar ilmiah ISS. Modul ini memperluas kapasitas eksperimen internasional di orbit.',
  },
  {
    id: 'harmony',
    category: 'Modul Inti',
    names: ['harmony', '26 Harmony Node 2'],
    description: 'Harmony adalah node penghubung yang menyatukan beberapa modul besar dan menyediakan jalur utilitas di antaranya. Modul ini memastikan aliran daya, data, dan udara tetap konsisten di antara segmen ISS.\n\nDiluncurkan pada 2007, Harmony membuka ruang untuk pemasangan Columbus dan Kibo. Node ini memperluas area riset internasional dan memperkuat struktur internal stasiun.',
  },
  {
    id: 'columbus',
    category: 'Modul Inti',
    names: ['colombus', '27 Columbus Space Laboratory'],
    description: 'Columbus adalah laboratorium milik ESA yang fokus pada eksperimen sains dan teknologi di mikrogravitasi. Modul ini menyediakan rak eksperimen dan fasilitas pemantauan modern.\n\nDiluncurkan pada 2008, Columbus memperkuat kontribusi Eropa dan menambah kapasitas riset ISS. Kehadirannya menandai babak baru kolaborasi ilmiah lintas negara.',
  },
  {
    id: 'kibo-pressurized-module',
    category: 'Modul Inti',
    names: ['30 Kibo Space Laboratory (PSM) Pressurized Module'],
    description: 'Modul Pressurized Kibo adalah laboratorium utama Jepang dengan fasilitas eksperimen di lingkungan bertekanan. Di sini kru menjalankan penelitian biologi dan teknologi yang membutuhkan ruang tertutup stabil.\n\nDiluncurkan pada 2008, modul ini memperluas kemampuan penelitian JAXA dan memperkuat kerja sama internasional. Kibo menjadi salah satu laboratorium terbesar di ISS.',
  },
  {
    id: 'kibo-stowage',
    category: 'Modul Inti',
    names: ['28 Kibo Space Laboratory (PSM) Pressurized Stowage Module'],
    description: 'Pressurized Stowage Module Kibo menyediakan ruang penyimpanan bertekanan untuk peralatan, sampel, dan logistik eksperimen. Modul ini membantu menjaga alur kerja laboratorium tetap rapi dan efisien.\n\nDiluncurkan pada 2008, modul ini mendukung operasi Kibo dengan kapasitas penyimpanan yang lebih terorganisir. Ini memperpanjang durasi eksperimen tanpa sering menambah kargo baru.',
  },
  {
    id: 'kibo-exposed-platform',
    category: 'Modul Inti',
    names: ['33 Kibo Space Laboratory Exposed Platform'],
    description: 'Exposed Platform Kibo adalah area eksperimen eksternal untuk pengujian material dan instrumen yang terpapar langsung ke ruang angkasa. Platform ini memungkinkan penelitian yang tidak bisa dilakukan di dalam modul bertekanan.\n\nDiposisikan pada 2009, platform ini memungkinkan eksperimen jangka panjang di lingkungan luar ISS. Fasilitas ini menjadi salah satu kontribusi unik Jepang pada ISS.',
  },
  {
    id: 'kibo',
    category: 'Modul Inti',
    names: ['kibo'],
    description: 'Kibo adalah kompleks laboratorium Jepang di ISS yang terdiri dari modul bertekanan, modul penyimpanan, dan platform eksperimen luar. Fasilitas ini memungkinkan penelitian sains dan teknologi yang membutuhkan ruang kerja stabil sekaligus akses ke lingkungan luar ruang angkasa.\n\nKibo dirakit dan dioperasikan bertahap pada 2008-2009 sebagai kontribusi utama JAXA. Sejak itu, Kibo menjadi salah satu pusat penelitian paling aktif di ISS dan memperluas kolaborasi ilmiah internasional.',
  },
  {
    id: 'unity',
    category: 'Modul Inti',
    names: ['unity', '02 Unity Node 1'],
    description: 'Unity adalah node penghubung pertama milik Amerika Serikat yang menyatukan modul-modul awal ISS. Modul ini menjaga aliran daya, data, dan udara antarsegmen.\n\nDiluncurkan pada 1998, Unity menjadi titik pertemuan awal antara segmen Amerika dan Rusia. Perannya krusial dalam tahap perakitan awal ISS.',
  },
  {
    id: 'quest-airlock',
    category: 'Docking/Airlock',
    names: ['airlock', '12 Quest Airlock'],
    description: 'Quest Airlock adalah pintu utama untuk aktivitas EVA, tempat astronaut menyiapkan diri keluar masuk stasiun. Sistem airlock mengatur tekanan agar transisi ke vakum berlangsung aman.\n\nDiluncurkan pada 2001, Quest menjadi airlock khusus Amerika Serikat. Modul ini mempercepat operasi pemeliharaan eksternal dan mendukung banyak misi perbaikan.',
  },
  {
    id: 'tranquility',
    category: 'Modul Inti',
    names: ['traunquility', '37 Tranquility Node 3'],
    description: 'Tranquility menampung sistem penunjang kehidupan, kontrol lingkungan, dan koneksi ke Cupola. Modul ini membantu menjaga kualitas udara, air, dan kenyamanan kru.\n\nDiluncurkan pada 2010, Tranquility meningkatkan kemampuan hidup jangka panjang di ISS. Modul ini juga memperkuat area observasi dan pengawasan Bumi.',
  },
];

const PART_LOOKUP = new Map();
const PART_NAME_LIST = [];
const BOUNDARY_LOOKUP = new Set();
const BOUNDARY_PART = { id: 'boundary' };
const BOUNDARY_NAMES = [
  '16 S1 Truss',
  '14 S0 Truss',
  '17 P1 Truss',
  '16 S1 Truss_02',
];

function setOrbitPaused(paused) {
  orbitPaused = paused;
  orbitToggle.setAttribute('aria-pressed', String(paused));
  orbitToggle.innerText = paused ? 'Resume ISS Orbit' : 'Pause ISS Orbit';
  infoPanel.innerText = paused ? 'Orbit berhenti. Klik modul ISS untuk inspeksi.' : 'Orbit aktif. Pause orbit untuk inspeksi detail.';
}

orbitToggle.addEventListener('click', () => {
  setOrbitPaused(!orbitPaused);
});

if (shaderToggle) {
  setShaderToggleState(shadingMode);
  shaderToggle.addEventListener('click', () => {
    shadingModeIndex = (shadingModeIndex + 1) % SHADING_MODES.length;
    setShadingMode(SHADING_MODES[shadingModeIndex]);
  });
}

setBackgroundMotion(backgroundMotionEnabled);

if (backgroundToggle) {
  backgroundToggle.addEventListener('click', () => {
    backgroundMotionUserOverride = true;
    setBackgroundMotion(!backgroundMotionEnabled);
  });
}

prefersReducedMotion.addEventListener('change', (event) => {
  if (backgroundMotionUserOverride) return;
  setBackgroundMotion(!event.matches, false);
});

function setSidebarEmpty(hintText = 'Pilih komponen ISS atau klik matahari untuk kontrol.') {
  if (componentHint) componentHint.innerText = hintText;
  if (componentName) componentName.innerText = '-';
  if (componentDescription) componentDescription.innerText = '-';
  hideSunControls();
}

function cloneMaterialIfPossible(material) {
  if (!material || typeof material.clone !== 'function') {
    return { material, cloned: false };
  }

  return { material: material.clone(), cloned: true };
}

function trackHighlightMaterial(material) {
  if (!material || !material.emissive) return;

  selectedMaterials.push({
    material,
    emissive: material.emissive.clone(),
    emissiveIntensity: material.emissiveIntensity ?? 1,
  });
}

function normalizePartName(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s*\.\d+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

for (const part of ISS_PARTS) {
  for (const name of part.names) {
    const normalized = normalizePartName(name);
    PART_LOOKUP.set(normalized, part);
    PART_NAME_LIST.push({ name: normalized, part });
  }
}

for (const name of BOUNDARY_NAMES) {
  BOUNDARY_LOOKUP.add(normalizePartName(name));
}

function resolvePartFromLabel(text) {
  const normalized = normalizePartName(text);
  if (!normalized) return null;
  return PART_LOOKUP.get(normalized) || null;
}

function resolvePartFromLabelLoose(text) {
  const normalized = normalizePartName(text);
  if (!normalized) return null;

  const exact = PART_LOOKUP.get(normalized);
  if (exact) return exact;

  for (const entry of PART_NAME_LIST) {
    if (normalized.includes(entry.name) || entry.name.includes(normalized)) {
      return entry.part;
    }
  }

  if (BOUNDARY_LOOKUP.has(normalized)) {
    return BOUNDARY_PART;
  }

  return null;
}

function resolveSelectableTarget(meshObject) {
  let current = meshObject;

  while (current) {
    const part = resolvePartFromLabel(current.name);
    if (part) {
      return { target: current, part };
    }

    if (current === iss) break;
    current = current.parent;
  }

  return null;
}

function traverseSelectionRoot(root, selectedPart, onMesh) {
  const stack = [root];

  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;

    const nodePart = resolvePartFromLabelLoose(node.name);
    if (nodePart && nodePart.id !== selectedPart.id && node !== root) {
      continue;
    }

    if (node.isMesh) {
      onMesh(node);
    }

    const children = node.children;
    if (!children || !children.length) continue;

    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i]);
    }
  }
}

function updateSidebarForObject(target, part) {
  if (componentHint) componentHint.innerText = 'Komponen terpilih';
  if (componentName) componentName.innerText = target.name || 'Tanpa nama';
  if (componentDescription) componentDescription.innerText = part.description;
  hideSunControls();
}

function setSidebarForSun() {
  if (componentHint) componentHint.innerText = 'Matahari terpilih';
  if (componentName) componentName.innerText = 'Matahari';
  if (componentDescription) {
    componentDescription.innerText = 'Gunakan slider Matahari di atas untuk ubah ukuran (0.2x-5.0x) atau aktifkan Pindah Matahari untuk memindahkan posisi.';
  }
  showSunControls();
}

function clearSelection() {
  if (!selectedObject) return;

  for (const entry of selectedMaterials) {
    if (!entry.material || !entry.material.emissive) continue;

    entry.material.emissive.copy(entry.emissive);
    entry.material.emissiveIntensity = entry.emissiveIntensity;
  }

  for (const swap of selectedMaterialSwaps) {
    swap.mesh.material = swap.originalMaterial;
  }

  selectedObject = null;
  selectedPart = null;
  selectedMaterials = [];
  selectedMaterialSwaps = [];
}

function selectObject(target, part) {
  if (selectedObject === target) return;

  clearSelection();

  selectedObject = target;
  selectedPart = part;
  traverseSelectionRoot(target, selectedPart, (node) => {
    const originalMaterial = node.material;

    if (Array.isArray(originalMaterial)) {
      const swappedMaterials = [];
      let didSwap = false;

      for (const material of originalMaterial) {
        const { material: clonedMaterial, cloned } = cloneMaterialIfPossible(material);
        swappedMaterials.push(clonedMaterial);
        if (cloned) {
          didSwap = true;
          trackHighlightMaterial(clonedMaterial);
        }
      }

      if (!didSwap) return;

      node.material = swappedMaterials;
      selectedMaterialSwaps.push({ mesh: node, originalMaterial });
      return;
    }

    const { material: clonedMaterial, cloned } = cloneMaterialIfPossible(originalMaterial);
    if (!cloned) return;

    node.material = clonedMaterial;
    selectedMaterialSwaps.push({ mesh: node, originalMaterial });
    trackHighlightMaterial(clonedMaterial);
  });

  updateSidebarForObject(target, part);
  infoPanel.innerText = `${part.category}: ${target.name || target.type}`;
  // open sidebar when user selects a component
  openSidebar();
}

function formatShadingLabel(mode) {
  if (mode === 'gouraud') return 'Shader: Gouraud';
  if (mode === 'phong') return 'Shader: Phong';
  return 'Shader: Default';
}

function setShaderToggleState(mode) {
  if (!shaderToggle) return;
  shaderToggle.innerText = formatShadingLabel(mode);
  shaderToggle.dataset.mode = mode;
}

function shouldShadeMaterial(mesh, material) {
  if (!material) return false;
  if (mesh.userData && mesh.userData.skipShading) return false;
  if (material.isMeshBasicMaterial || material.isShaderMaterial || material.isRawShaderMaterial) return false;
  return true;
}

function cacheOriginalMaterial(mesh) {
  if (originalMaterials.has(mesh)) return;
  originalMaterials.set(mesh, mesh.material || null);
}

function copyColor(targetColor, sourceColor) {
  if (!targetColor || !sourceColor) return;
  targetColor.copy(sourceColor);
}
function copyMaterialProps(target, source) {
  if (!source || !target) return;

  // colors
  copyColor(target.color, source.color);
  copyColor(target.emissive, source.emissive);
  if (source.emissiveIntensity !== undefined) target.emissiveIntensity = source.emissiveIntensity;

  // texture maps
  const mapProps = ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'aoMap', 'lightMap', 'displacementMap', 'envMap'];
  for (const p of mapProps) {
    if (source[p] !== undefined) target[p] = source[p];
  }

  if (source.normalScale && target.normalScale) target.normalScale.copy(source.normalScale);

  // numeric intensities / scales
  const numProps = ['displacementScale', 'displacementBias', 'aoMapIntensity', 'lightMapIntensity', 'envMapIntensity'];
  for (const p of numProps) {
    if (source[p] !== undefined) target[p] = source[p];
  }

  // boolean/enum/depth/polygon/etc
  const miscProps = ['transparent', 'opacity', 'alphaTest', 'side', 'blending', 'depthWrite', 'depthTest', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'vertexColors', 'fog', 'wireframe', 'flatShading'];
  for (const p of miscProps) {
    if (source[p] !== undefined) target[p] = source[p];
  }

  if (source.name) target.name = source.name;
}

function makeGouraudMaterial(source) {
  if (gouraudMaterialCache.has(source)) return gouraudMaterialCache.get(source);

  const material = new THREE.MeshLambertMaterial();
  copyMaterialProps(material, source);

  gouraudMaterialCache.set(source, material);
  return material;
}

function makePhongMaterial(source) {
  if (phongMaterialCache.has(source)) return phongMaterialCache.get(source);

  const material = new THREE.MeshPhongMaterial();
  copyMaterialProps(material, source);

  const roughness = typeof source.roughness === 'number' ? source.roughness : 0.5;
  material.shininess = Math.max(5, (1 - roughness) * 80);

  const specularIntensity = typeof source.specularIntensity === 'number' ? source.specularIntensity : 0.3;
  material.specular = new THREE.Color(1, 1, 1).multiplyScalar(Math.min(1, Math.max(0.05, specularIntensity)));

  if (source.specularIntensityMap) {
    material.specularMap = source.specularIntensityMap;
  } else if (source.specularMap) {
    material.specularMap = source.specularMap;
  }

  phongMaterialCache.set(source, material);
  return material;
}

function convertMaterialForMode(mesh, sourceMaterial, mode) {
  const converter = mode === 'gouraud' ? makeGouraudMaterial : makePhongMaterial;

  if (Array.isArray(sourceMaterial)) {
    return sourceMaterial.map((material) => (
      shouldShadeMaterial(mesh, material) ? converter(material) : material
    ));
  }

  return shouldShadeMaterial(mesh, sourceMaterial) ? converter(sourceMaterial) : sourceMaterial;
}

function markMaterialUpdate(material) {
  if (!material) return;

  if (Array.isArray(material)) {
    for (const entry of material) {
      if (entry) entry.needsUpdate = true;
    }
    return;
  }

  material.needsUpdate = true;
}

function setShadingMode(mode) {
  if (!SHADING_MODES.includes(mode)) return;

  shadingMode = mode;
  shadingModeIndex = SHADING_MODES.indexOf(mode);
  setShaderToggleState(mode);

  const previousSelection = selectedObject;
  const previousPart = selectedPart;
  if (previousSelection) {
    clearSelection();
  }

  scene.traverse((node) => {
    if (!node.isMesh) return;

    cacheOriginalMaterial(node);
    const original = originalMaterials.get(node);
    if (!original) return;

    if (mode === 'default') {
      node.material = original;
      markMaterialUpdate(node.material);
      return;
    }

    node.material = convertMaterialForMode(node, original, mode);
    markMaterialUpdate(node.material);
  });

  if (previousSelection && previousPart) {
    selectObject(previousSelection, previousPart);
  }
}

function createFallbackISS() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.45, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xb8c2cc, metalness: 0.5, roughness: 0.45 })
  );
  body.name = 'Core Module';
  group.add(body);

  const panelGeo = new THREE.BoxGeometry(1.8, 0.04, 0.7);
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x2d5ea7, metalness: 0.2, roughness: 0.6 });
  const leftPanel = new THREE.Mesh(panelGeo, panelMat);
  const rightPanel = new THREE.Mesh(panelGeo, panelMat);
  leftPanel.name = 'Port Solar Panel';
  rightPanel.name = 'Starboard Solar Panel';
  leftPanel.position.set(-1.55, 0, 0);
  rightPanel.position.set(1.55, 0, 0);
  group.add(leftPanel, rightPanel);

  group.name = 'ISS Fallback';
  return group;
}

function mountISSModel(modelRoot) {
  clearSelection();
  setSidebarEmpty();

  iss = modelRoot;

  const box = new THREE.Box3().setFromObject(iss);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = 1.4;
  const scale = targetSize / maxDim;

  iss.scale.setScalar(scale);
  iss.position.sub(center.multiplyScalar(scale));

  issOrbit.clear();
  issOrbit.add(iss);

  setShadingMode(shadingMode);
}

let issFallbackTimer = setTimeout(() => {
  if (iss) return;
  mountISSModel(createFallbackISS());
  infoPanel.innerText = 'ISS fallback aktif (model lambat/gagal dimuat).';
}, 10000);

loader.load(
  './models/iss.glb',
  (gltf) => {
    clearTimeout(issFallbackTimer);
    mountISSModel(gltf.scene);
    infoPanel.innerText = 'ISS loaded. Pause orbit lalu klik modul.';
  },
  (progress) => {
    const total = progress.total || 0;
    if (!total) {
      infoPanel.innerText = 'Memuat ISS model...';
      return;
    }

    const pct = Math.round((progress.loaded / total) * 100);
    infoPanel.innerText = `Memuat ISS model... ${pct}%`;
  },
  (error) => {
    clearTimeout(issFallbackTimer);
    console.error('Failed to load ISS model:', error);
    if (!iss) {
      mountISSModel(createFallbackISS());
    }
    infoPanel.innerText = 'Model gagal dimuat. Menampilkan ISS fallback.';
  }
);

// Raycaster (klik objek)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function updateRayFromEvent(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
}

function beginSunDrag() {
  if (!sunMoveEnabled || !sunGroup) return false;

  camera.getWorldDirection(sunDragNormal);
  sunDragPlane.setFromNormalAndCoplanarPoint(sunDragNormal, sunGroup.position);
  const hit = raycaster.ray.intersectPlane(sunDragPlane, sunDragPoint);
  if (!hit) return false;

  sunDragOffset.copy(sunGroup.position).sub(sunDragPoint);
  sunDragging = true;
  controls.enabled = false;
  return true;
}

function updateSunDrag(event) {
  if (!sunDragging) return;
  updateRayFromEvent(event);
  const hit = raycaster.ray.intersectPlane(sunDragPlane, sunDragPoint);
  if (!hit) return;

  sunGroup.position.copy(sunDragPoint).add(sunDragOffset);
  syncSunLight();
}

function endSunDrag() {
  if (!sunDragging) return;
  sunDragging = false;
  controls.enabled = true;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  updateRayFromEvent(event);

  const targets = [];
  if (iss) targets.push(iss);
  if (sunGroup) targets.push(sunGroup);
  if (!targets.length) return;

  const intersects = raycaster.intersectObjects(targets, true);

  if (!intersects.length) {
    clearSelection();
    setSidebarEmpty('Tidak ada komponen dipilih.');
    infoPanel.innerText = 'Seleksi dilepas. Klik komponen ISS lain.';
    // close sidebar when clicking empty space
    closeSidebar();
    return;
  }

  const hit = intersects.find((item) => item.object && item.object.isMesh);
  if (!hit) return;

  if (isSunObject(hit.object)) {
    clearSelection();
    setSidebarForSun();
    infoPanel.innerText = sunMoveEnabled
      ? 'Pindah matahari aktif. Seret matahari untuk pindah.'
      : 'Matahari dipilih. Atur ukuran di sidebar.';
    openSidebar();
    if (sunMoveEnabled) beginSunDrag();
    return;
  }

  const resolved = resolveSelectableTarget(hit.object);
  if (!resolved) {
    infoPanel.innerText = 'Bagian ini tidak interaktif. Klik hanya part penting yang sudah didaftarkan.';
    return;
  }

  selectObject(resolved.target, resolved.part);
});

window.addEventListener('pointermove', updateSunDrag);
window.addEventListener('pointerup', endSunDrag);
window.addEventListener('pointercancel', endSunDrag);

// Orbit ISS
let angle = 0;

// Animasi
function animate() {
  requestAnimationFrame(animate);

  // Rotasi bumi
  earth.rotation.y += 0.001;
  syncSunLight();
  updateEarthNightLighting();

  sunTimeUniform.value = sunClock.getElapsedTime();
  sunGroup.rotation.y += 0.0006;

  if (backgroundMotionEnabled) {
    starfield.rotation.y += 0.00012;
    skyDome.rotation.y += 0.00002;
  }

  // Orbit ISS
  if (iss && !orbitPaused) {
    angle += 0.002;
    issOrbit.position.x = Math.cos(angle) * 4;
    issOrbit.position.z = Math.sin(angle) * 4;
  }

  if (issFollowEnabled && iss) {
    issFollowDelta.subVectors(issOrbit.position, issFollowPrev);
    if (issFollowDelta.lengthSq() > 0) {
      camera.position.add(issFollowDelta);
      controls.target.add(issFollowDelta);
      issFollowPrev.copy(issOrbit.position);
    }
  }

  if (selectedObject) {
    const pulse = 0.55 + 0.45 * ((Math.sin(glowClock.getElapsedTime() * 6) + 1) * 0.5);

    for (const entry of selectedMaterials) {
      if (!entry.material || !entry.material.emissive) continue;

      entry.material.emissive.copy(glowColor);
      entry.material.emissiveIntensity = 1 + pulse;
    }
  }

  controls.update();

  syncBackgroundToCamera();

  updateFreecamMovement();

  renderer.render(scene, camera);
}

animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});