// The benchmark scene: ground, trees, towers with glowing orbs, and wandering units.
// Layout, sizes, colours and movement rules match godot/scripts/world.gd.
// Every object is its own mesh (no InstancedMesh) because that is how a first
// version of a real game is usually built; both engines get the same draw calls.
import * as THREE from 'three';
import { makeRng } from './rng.js';

const SEED = 1337;
const TREE_COUNT = 150;
const TOWER_COLS = 6;
const TOWER_ROWS = 4;
const UNIT_X = 30;
const UNIT_Z = 18;
const TEAM_COLORS = ['#e07a5f', '#3d85c6', '#f2cc8f'];

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });

export class World {
  constructor() {
    this.rng = makeRng(SEED);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9fc6e0');
    this.turrets = [];
    this.units = [];

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 200);
    this.camera.position.set(0, 38, 30);
    this.camera.lookAt(0, 0, 2);

    this.scene.add(new THREE.AmbientLight('#cfe3ff', 0.6));
    this.light = new THREE.DirectionalLight('#ffffff', 2.5);
    this.light.position.set(20, 40, 15);
    this.light.castShadow = true;
    // One 2048 shadow map covering the field, like Godot's orthogonal shadow mode.
    this.light.shadow.mapSize.set(2048, 2048);
    Object.assign(this.light.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
    this.scene.add(this.light);

    this.#buildGround();
    this.#buildTrees();
    this.#buildTowers();
    this.unitGeo = new THREE.ConeGeometry(0.5, 1.2, 8, 1);
    this.teamMats = TEAM_COLORS.map(mat);
  }

  setUnitCount(n) {
    while (this.units.length > n) this.scene.remove(this.units.pop().mesh);
    while (this.units.length < n) {
      const mesh = this.#add(this.unitGeo, this.teamMats[this.units.length % TEAM_COLORS.length], 0, 0, 0);
      const r = this.rng;
      this.units.push({
        mesh,
        x: r.range(-UNIT_X, UNIT_X),
        z: r.range(-UNIT_Z, UNIT_Z),
        tx: r.range(-UNIT_X, UNIT_X),
        tz: r.range(-UNIT_Z, UNIT_Z),
        speed: r.range(2, 5),
        phase: r.range(0, Math.PI * 2),
      });
    }
  }

  update(dt, timeS) {
    for (const t of this.turrets) t.rotation.y += dt * 0.8;
    for (const u of this.units) {
      const dx = u.tx - u.x;
      const dz = u.tz - u.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.5) {
        u.tx = this.rng.range(-UNIT_X, UNIT_X);
        u.tz = this.rng.range(-UNIT_Z, UNIT_Z);
      } else {
        const step = Math.min(u.speed * dt, d);
        u.x += (dx / d) * step;
        u.z += (dz / d) * step;
      }
      u.mesh.position.set(u.x, 0.6 + Math.sin(timeS * 8 + u.phase) * 0.1, u.z);
      u.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }

  #buildGround() {
    const ground = this.#add(new THREE.PlaneGeometry(120, 90), mat('#8fb573'), 0, 0, 0);
    ground.rotation.x = -Math.PI / 2;
  }

  #buildTrees() {
    const geo = new THREE.ConeGeometry(1, 2.6, 6, 1);
    const m = mat('#5b8c5a');
    for (let i = 0; i < TREE_COUNT; i++) {
      const x = this.rng.range(-34, 34);
      const z = this.rng.range(-22, 22);
      const s = this.rng.range(0.7, 1.4);
      const r = this.rng.range(0, Math.PI * 2);
      const tree = this.#add(geo, m, x, 1.3 * s, z);
      tree.scale.setScalar(s);
      tree.rotation.y = r;
    }
  }

  #buildTowers() {
    const baseGeo = new THREE.CylinderGeometry(1.1, 1.3, 2, 6, 1);
    const turretGeo = new THREE.BoxGeometry(1, 0.6, 1.6);
    const orbGeo = new THREE.SphereGeometry(0.35, 8, 4);
    const baseMat = mat('#c9c2b6');
    const turretMat = mat('#4a4e69');
    const orbMat = mat('#7fdbff');
    orbMat.emissive.set('#7fdbff');
    orbMat.emissiveIntensity = 4;
    for (let col = 0; col < TOWER_COLS; col++) {
      for (let row = 0; row < TOWER_ROWS; row++) {
        const x = -25 + col * 10;
        const z = -13.5 + row * 9;
        this.#add(baseGeo, baseMat, x, 1, z);
        const turret = this.#add(turretGeo, turretMat, x, 2.3, z);
        turret.rotation.y = this.rng.range(0, Math.PI * 2);
        this.turrets.push(turret);
        this.#add(orbGeo, orbMat, x, 3, z);
      }
    }
  }

  #add(geo, material, x, y, z) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
}
