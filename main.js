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

light.position.copy(sunGroup.position);

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
dracoLoader.setDecoderPath('./node_modules/three/examples/jsm/libs/draco/');
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
const componentCategory = document.getElementById('componentCategory');
const componentType = document.getElementById('componentType');
const componentPath = document.getElementById('componentPath');
const componentPosition = document.getElementById('componentPosition');
const componentDescription = document.getElementById('componentDescription');

let orbitPaused = false;
let selectedObject = null;
let selectedCategory = null;
let selectedMaterials = [];
const glowColor = new THREE.Color(0x64ffb0);
const glowClock = new THREE.Clock();
const sunClock = new THREE.Clock();
const SHADING_MODES = ['default', 'gouraud', 'phong'];
let shadingModeIndex = 0;
let shadingMode = 'default';
const originalMaterials = new Map();
const gouraudMaterialCache = new Map();
const phongMaterialCache = new Map();

const CLICKABLE_CATEGORIES = [
  {
    id: 'core-modules',
    label: 'Modul Inti',
    keywords: [
      'module', 'modul', 'node', 'zarya', 'zvezda', 'unity', 'harmony',
      'tranquility', 'destiny', 'columbus', 'kibo', 'cupola', 'nauka',
      'poisk', 'pirs', 'rasvet', 'prichal', 'leonardo', 'lab',
    ],
  },
  {
    id: 'solar-arrays',
    label: 'Panel Surya',
    keywords: ['solar', 'array', 'panel', 'sarj', 'bga'],
  },
  {
    id: 'truss',
    label: 'Struktur Truss',
    keywords: ['truss', 'its', 's0', 's1', 's3', 's4', 's5', 's6', 'p1', 'p3', 'p4', 'p5', 'p6'],
  },
  {
    id: 'docking-airlock',
    label: 'Docking/Airlock',
    keywords: ['dock', 'docking', 'port', 'hatch', 'airlock', 'ida', 'pma', 'cbm', 'berthing'],
  },
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

function setSidebarEmpty(hintText = 'Pilih komponen ISS untuk lihat detail.') {
  componentHint.innerText = hintText;
  componentName.innerText = '-';
  componentCategory.innerText = '-';
  componentType.innerText = '-';
  componentPath.innerText = '-';
  componentPosition.innerText = '-';
  componentDescription.innerText = '-';
}

function describeComponent(categoryId) {
  if (categoryId === 'solar-arrays') {
    return 'Bagian ini termasuk panel surya ISS yang menangkap energi matahari untuk menjadi listrik utama stasiun. Daya ini dipakai untuk sistem pendukung kehidupan, komputer penerbangan, komunikasi, dan eksperimen ilmiah. Saat orientasi panel disesuaikan, efisiensi suplai daya bisa ditingkatkan sesuai posisi ISS terhadap Matahari. Tanpa panel surya, operasi harian stasiun akan sangat terbatas.';
  }

  if (categoryId === 'truss') {
    return 'Bagian ini termasuk struktur truss, yaitu rangka panjang yang menjadi tulang punggung eksternal ISS. Truss menahan beban penting seperti panel surya, radiator, kabel daya, serta jalur distribusi data dan termal. Stabilitas truss sangat menentukan keseimbangan struktur saat stasiun bermanuver di orbit. Karena itu, truss berperan besar dalam menjaga integritas mekanik seluruh stasiun.';
  }

  if (categoryId === 'docking-airlock') {
    return 'Bagian ini termasuk area docking atau airlock untuk pertemuan wahana, transfer kru, dan aktivitas keluar-masuk bertekanan. Docking port menjadi titik sambung aman untuk kapsul logistik maupun kendaraan berawak. Airlock memungkinkan astronaut melakukan EVA dengan prosedur tekanan yang terkontrol. Komponen ini penting untuk rotasi kru, suplai misi, dan pemeliharaan eksternal.';
  }

  return 'Bagian ini termasuk modul inti ISS yang menjadi ruang bertekanan tempat kru tinggal, bekerja, dan melakukan riset. Di dalam modul terdapat sistem penting seperti kontrol lingkungan, komputer penerbangan, dan antarmuka utilitas antarmodul. Modul inti juga menghubungkan banyak jalur internal sehingga mobilitas kru tetap efisien. Secara operasional, area ini adalah pusat aktivitas harian stasiun.';
}

function normalizeText(text) {
  return String(text || '').toLowerCase();
}

function resolveCategoryFromLabel(text) {
  const value = normalizeText(text);
  if (!value) return null;

  for (const category of CLICKABLE_CATEGORIES) {
    for (const keyword of category.keywords) {
      if (value.includes(keyword)) {
        return category;
      }
    }
  }

  return null;
}

function resolveSelectableTarget(meshObject) {
  let current = meshObject;

  while (current) {
    const category = resolveCategoryFromLabel(current.name || current.type);
    if (category) {
      return { target: current, category };
    }

    if (current === iss) break;
    current = current.parent;
  }

  return null;
}

function formatVector(vec) {
  return `${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)}`;
}

function getObjectPath(target, root) {
  const nodes = [];
  let current = target;

  while (current) {
    nodes.push(current.name || current.type);
    if (current === root) break;
    current = current.parent;
  }

  return nodes.reverse().join(' > ');
}

function updateSidebarForObject(target, category) {
  componentHint.innerText = 'Komponen terpilih';
  componentName.innerText = target.name || 'Tanpa nama';
  componentCategory.innerText = category.label;
  componentType.innerText = target.type;
  componentPath.innerText = getObjectPath(target, iss);
  componentPosition.innerText = formatVector(target.position);
  componentDescription.innerText = describeComponent(category.id);
}

function clearSelection() {
  if (!selectedObject) return;

  for (const entry of selectedMaterials) {
    if (!entry.material || !entry.material.emissive) continue;

    entry.material.emissive.copy(entry.emissive);
    entry.material.emissiveIntensity = entry.emissiveIntensity;
  }

  selectedObject = null;
  selectedCategory = null;
  selectedMaterials = [];
}

function selectObject(target, category) {
  if (selectedObject === target) return;

  clearSelection();

  selectedObject = target;
  selectedCategory = category;
  const trackedMaterials = new Set();

  target.traverse((node) => {
    if (!node.isMesh) return;

    const materialList = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materialList) {
      if (!material || !material.emissive || trackedMaterials.has(material)) continue;

      trackedMaterials.add(material);
      selectedMaterials.push({
        material,
        emissive: material.emissive.clone(),
        emissiveIntensity: material.emissiveIntensity ?? 1,
      });
    }
  });

  updateSidebarForObject(target, category);
  infoPanel.innerText = `${category.label}: ${target.name || target.type}`;
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

  copyColor(target.color, source.color);
  copyColor(target.emissive, source.emissive);

  if (source.emissiveIntensity !== undefined) target.emissiveIntensity = source.emissiveIntensity;

  if (source.map !== undefined) target.map = source.map;
  if (source.alphaMap !== undefined) target.alphaMap = source.alphaMap;
  if (source.emissiveMap !== undefined) target.emissiveMap = source.emissiveMap;
  if (source.normalMap !== undefined) target.normalMap = source.normalMap;
  if (source.aoMap !== undefined) target.aoMap = source.aoMap;
  if (source.lightMap !== undefined) target.lightMap = source.lightMap;
  if (source.displacementMap !== undefined) target.displacementMap = source.displacementMap;
  if (source.envMap !== undefined) target.envMap = source.envMap;

  if (source.normalScale && target.normalScale) target.normalScale.copy(source.normalScale);
  if (source.displacementScale !== undefined) target.displacementScale = source.displacementScale;
  if (source.displacementBias !== undefined) target.displacementBias = source.displacementBias;
  if (source.aoMapIntensity !== undefined) target.aoMapIntensity = source.aoMapIntensity;
  if (source.lightMapIntensity !== undefined) target.lightMapIntensity = source.lightMapIntensity;
  if (source.envMapIntensity !== undefined) target.envMapIntensity = source.envMapIntensity;

  if (source.transparent !== undefined) target.transparent = source.transparent;
  if (source.opacity !== undefined) target.opacity = source.opacity;
  if (source.alphaTest !== undefined) target.alphaTest = source.alphaTest;
  if (source.side !== undefined) target.side = source.side;
  if (source.blending !== undefined) target.blending = source.blending;
  if (source.depthWrite !== undefined) target.depthWrite = source.depthWrite;
  if (source.depthTest !== undefined) target.depthTest = source.depthTest;
  if (source.polygonOffset !== undefined) target.polygonOffset = source.polygonOffset;
  if (source.polygonOffsetFactor !== undefined) target.polygonOffsetFactor = source.polygonOffsetFactor;
  if (source.polygonOffsetUnits !== undefined) target.polygonOffsetUnits = source.polygonOffsetUnits;
  if (source.vertexColors !== undefined) target.vertexColors = source.vertexColors;
  if (source.fog !== undefined) target.fog = source.fog;
  if (source.wireframe !== undefined) target.wireframe = source.wireframe;
  if (source.flatShading !== undefined) target.flatShading = source.flatShading;
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
  const previousCategory = selectedCategory;
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

  if (previousSelection && previousCategory) {
    selectObject(previousSelection, previousCategory);
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

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!iss) return;

  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(iss.children, true);

  if (!intersects.length) {
    clearSelection();
    setSidebarEmpty('Tidak ada komponen dipilih.');
    infoPanel.innerText = 'Seleksi dilepas. Klik komponen ISS lain.';
    return;
  }

  const hit = intersects.find((item) => item.object && item.object.isMesh);
  if (!hit) return;

  const resolved = resolveSelectableTarget(hit.object);
  if (!resolved) {
    infoPanel.innerText = 'Bagian ini tidak interaktif. Klik modul inti, panel surya, truss, atau docking/airlock.';
    return;
  }

  selectObject(resolved.target, resolved.category);
});

// Orbit ISS
let angle = 0;

// Animasi
function animate() {
  requestAnimationFrame(animate);

  // Rotasi bumi
  earth.rotation.y += 0.001;
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