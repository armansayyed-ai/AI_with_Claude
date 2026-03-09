import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Constants ---
const ARENA_SIZE = 24;
const WALL_HEIGHT = 6;
const MOVE_SPEED = 0.18;
const TURN_SPEED = 0.04;
const HEALTH_DAMAGE = 0.15;
const HIT_ALERT_DURATION_MS = 800;
const AI_SHOOT_COOLDOWN_MS = 1200;
const AI_MOVE_INTERVAL_MS = 400;
const BULLET_RANGE = 30;

// --- State ---
let scene, camera, renderer, controls;
let player1, player2;
let p1Health = 1, p2Health = 1;
let keys = {};
let lastShot = 0;
let aiLastShot = 0;
let aiTargetDir = new THREE.Vector3(1, 0, 0);
let gameOver = false;

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a12);
  scene.fog = new THREE.Fog(0x0a0a12, 15, 45);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 8, 12);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // Controls: orbit around a target (we'll update target to player1 position)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 6;
  controls.maxDistance = 25;
  controls.maxPolarAngle = Math.PI / 2 - 0.1;

  buildArena();
  player1 = createPlayer(0x3b82f6, new THREE.Vector3(-6, 0, -6));
  player2 = createPlayer(0xef4444, new THREE.Vector3(6, 0, 6));

  scene.add(player1.group);
  scene.add(player2.group);

  addLights();

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space') shootPlayer1(); });

  document.getElementById('restart-btn').addEventListener('click', restart);

  animate();
}

function addLights() {
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(10, 20, 10);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 50;
  dir.shadow.camera.left = -ARENA_SIZE;
  dir.shadow.camera.right = ARENA_SIZE;
  dir.shadow.camera.top = ARENA_SIZE;
  dir.shadow.camera.bottom = -ARENA_SIZE;
  scene.add(dir);
}

function buildArena() {
  const half = ARENA_SIZE / 2;
  const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE + 4, ARENA_SIZE + 4);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.9,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Grid lines on floor
  const gridHelper = new THREE.GridHelper(ARENA_SIZE, 24, 0x2a2a4a, 0x252540);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x16213e,
    roughness: 0.8,
    metalness: 0.2,
  });
  const wallGeo = new THREE.BoxGeometry(ARENA_SIZE + 2, WALL_HEIGHT, 1);
  const walls = [
    [0, WALL_HEIGHT / 2, -half - 0.5],
    [0, WALL_HEIGHT / 2, half + 0.5],
  ];
  walls.forEach(([x, y, z]) => {
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(x, y, z);
    w.castShadow = true;
    w.receiveShadow = true;
    scene.add(w);
  });
  const wallGeoZ = new THREE.BoxGeometry(1, WALL_HEIGHT, ARENA_SIZE + 2);
  [
    [-half - 0.5, WALL_HEIGHT / 2, 0],
    [half + 0.5, WALL_HEIGHT / 2, 0],
  ].forEach(([x, y, z]) => {
    const w = new THREE.Mesh(wallGeoZ, wallMat);
    w.position.set(x, y, z);
    w.castShadow = true;
    w.receiveShadow = true;
    scene.add(w);
  });
}

function createPlayer(color, position) {
  const group = new THREE.Group();
  group.position.copy(position);

  // Body (capsule-like: cylinder + half spheres)
  const bodyGeo = new THREE.CylinderGeometry(0.4, 0.45, 1.2, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.7;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.35, 12, 12);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.5;
  head.castShadow = true;
  group.add(head);

  // Red alert overlay (invisible until hit)
  const alertGeo = new THREE.SphereGeometry(0.38, 8, 8);
  const alertMat = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0,
  });
  const alertMesh = new THREE.Mesh(alertGeo, alertMat);
  alertMesh.position.y = 1.5;
  alertMesh.name = 'alert';
  group.add(alertMesh);

  // Gun
  const gunGroup = new THREE.Group();
  gunGroup.position.set(0.5, 1.1, 0.3);
  const gunBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.12, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  gunBody.castShadow = true;
  gunGroup.add(gunBody);
  const gunBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.z = 0.4;
  gunGroup.add(gunBarrel);
  group.add(gunGroup);

  return {
    group,
    head,
    alertMesh,
    gunGroup,
    body,
    health: 1,
    hitUntil: 0,
  };
}

function getForwardVector(obj) {
  const v = new THREE.Vector3(0, 0, -1);
  v.applyQuaternion(obj.quaternion);
  v.y = 0;
  v.normalize();
  return v;
}

function getGunWorldPosition(player) {
  const dir = new THREE.Vector3();
  player.gunGroup.getWorldDirection(dir); // positive Z in world = where gun points
  const pos = new THREE.Vector3();
  player.gunGroup.getWorldPosition(pos);
  return { pos, dir };
}

function updatePlayer1(dt) {
  if (gameOver) return;
  const g = player1.group;
  const forward = getForwardVector(g);
  const right = new THREE.Vector3(forward.z, 0, -forward.x);

  if (keys['ArrowUp']) g.position.addScaledVector(forward, MOVE_SPEED);
  if (keys['ArrowDown']) g.position.addScaledVector(forward, -MOVE_SPEED);
  if (keys['ArrowLeft']) g.rotation.y += TURN_SPEED;
  if (keys['ArrowRight']) g.rotation.y -= TURN_SPEED;

  // Clamp to arena
  const h = ARENA_SIZE / 2 - 1;
  g.position.x = THREE.MathUtils.clamp(g.position.x, -h, h);
  g.position.z = THREE.MathUtils.clamp(g.position.z, -h, h);
}

function shootPlayer1() {
  if (gameOver || p1Health <= 0) return;
  const now = performance.now();
  if (now - lastShot < 400) return;
  lastShot = now;

  const { pos, dir } = getGunWorldPosition(player1);
  const raycaster = new THREE.Raycaster(pos, dir, 0, BULLET_RANGE);
  raycaster.ray.origin.copy(pos);
  raycaster.ray.direction.copy(dir);

  const hits = raycaster.intersectObject(player2.group, true);
  if (hits.length > 0) {
    const hit = hits[0];
    if (hit.distance < BULLET_RANGE) {
      hitOpponent(player2);
    }
  }
}

function hitOpponent(target) {
  if (target === player2) {
    p2Health = Math.max(0, p2Health - HEALTH_DAMAGE);
    updateHealthUI();
    showHeadAlert(player2);
    if (p2Health <= 0) endGame('You win!');
  } else {
    p1Health = Math.max(0, p1Health - HEALTH_DAMAGE);
    updateHealthUI();
    showHeadAlert(player1);
    if (p1Health <= 0) endGame('Computer wins!');
  }
}

function showHeadAlert(player) {
  player.alertMesh.material.opacity = 0.9;
  player.hitUntil = performance.now() + HIT_ALERT_DURATION_MS;
}

function updateHealthUI() {
  document.querySelector('#p1-health .health-bar').style.width = (p1Health * 100) + '%';
  document.querySelector('#p2-health .health-bar').style.width = (p2Health * 100) + '%';
}

function endGame(message) {
  gameOver = true;
  document.getElementById('winner-text').textContent = message;
  document.getElementById('game-over').classList.add('show');
}

function restart() {
  p1Health = 1;
  p2Health = 1;
  gameOver = false;
  player1.group.position.set(-6, 0, -6);
  player2.group.position.set(6, 0, 6);
  player1.alertMesh.material.opacity = 0;
  player2.alertMesh.material.opacity = 0;
  updateHealthUI();
  document.getElementById('game-over').classList.remove('show');
}

// --- AI ---
function updatePlayer2(dt) {
  if (gameOver || p2Health <= 0) return;

  const g = player2.group;
  const now = performance.now();

  // Face and move toward player1 sometimes, else wander
  const toPlayer = new THREE.Vector3().subVectors(player1.group.position, g.position);
  toPlayer.y = 0;
  toPlayer.normalize();

  const dist = player1.group.position.distanceTo(g.position);
  if (dist < 12 && now - aiLastShot > AI_SHOOT_COOLDOWN_MS) {
    // Face player and shoot
    g.lookAt(player1.group.position.x, g.position.y, player1.group.position.z);
    aiLastShot = now;
    // Raycast from AI gun to player1
    const { pos, dir } = getGunWorldPosition(player2);
    const raycaster = new THREE.Raycaster(pos, dir, 0, BULLET_RANGE);
    const hits = raycaster.intersectObject(player1.group, true);
    if (hits.length > 0 && hits[0].distance < BULLET_RANGE) {
      hitOpponent(player1);
    }
  } else {
    // Move: alternate between toward player and random
    aiTargetDir.lerp(toPlayer, 0.02);
    aiTargetDir.normalize();
    g.position.addScaledVector(aiTargetDir, MOVE_SPEED * 0.7);
    g.lookAt(g.position.x + aiTargetDir.x, g.position.y, g.position.z + aiTargetDir.z);
  }

  const h = ARENA_SIZE / 2 - 1;
  g.position.x = THREE.MathUtils.clamp(g.position.x, -h, h);
  g.position.z = THREE.MathUtils.clamp(g.position.z, -h, h);
}

function updateAlerts() {
  const now = performance.now();
  [player1, player2].forEach((p) => {
    if (p.hitUntil > 0 && now > p.hitUntil) {
      p.alertMesh.material.opacity = Math.max(0, p.alertMesh.material.opacity - 0.02);
      if (p.alertMesh.material.opacity <= 0) p.hitUntil = 0;
    }
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const t = performance.now() * 0.001;
  const dt = 1 / 60;

  updatePlayer1(dt);
  updatePlayer2(dt);
  updateAlerts();

  // Camera follows player1
  controls.target.lerp(player1.group.position, 0.08);
  controls.update();

  renderer.render(scene, camera);
}

init();
