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

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);

scene.add(new THREE.AmbientLight(0x7f8ea3, 0.7));

// Bumi
const earthGeometry = new THREE.SphereGeometry(2, 32, 32);
const earthMaterial = new THREE.MeshStandardMaterial({
  color: 0x1f5ea8,
  roughness: 0.9,
  metalness: 0.0
});
const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);

// ISS
const issOrbit = new THREE.Group();
scene.add(issOrbit);

let iss;
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./node_modules/three/examples/jsm/libs/draco/');
loader.setDRACOLoader(dracoLoader);
loader.setMeshoptDecoder(MeshoptDecoder);

const infoPanel = document.getElementById('infoPanel');
const orbitToggle = document.getElementById('orbitToggle');
const componentHint = document.getElementById('componentHint');
const componentName = document.getElementById('componentName');
const componentCategory = document.getElementById('componentCategory');
const componentType = document.getElementById('componentType');
const componentPath = document.getElementById('componentPath');
const componentPosition = document.getElementById('componentPosition');
const componentDescription = document.getElementById('componentDescription');

let orbitPaused = false;
let selectedObject = null;
let selectedMaterials = [];
const glowColor = new THREE.Color(0x64ffb0);
const glowClock = new THREE.Clock();

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
  selectedMaterials = [];
}

function selectObject(target, category) {
  if (selectedObject === target) return;

  clearSelection();

  selectedObject = target;
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

  renderer.render(scene, camera);
}

animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});