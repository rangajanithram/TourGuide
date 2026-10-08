'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';

interface TravelWorldProps {
  progress: MutableRefObject<number>;
  night: boolean;
  paused: boolean;
  rotation: number;
  motionSpeed?: number;
}

// Everything in this miniature is original procedural geometry. No model,
// texture, map, or third-party asset requests are needed to render it.
export default function TravelWorld({ progress, night, paused, rotation, motionSpeed = 6 }: TravelWorldProps) {
  const host = useRef<HTMLDivElement>(null);
  const settings = useRef({ night, paused, rotation });
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { settings.current = { night, paused, rotation }; }, [night, paused, rotation]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    scene.add(world);
    const camera = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 100);
    camera.position.set(14, 17, 21);
    camera.lookAt(0, 0, 0);
    const hemi = new THREE.HemisphereLight(0xfff7e9, 0x61725c, 2.6);
    const sun = new THREE.DirectionalLight(0xffedcd, 3.4);
    sun.position.set(-8, 17, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, far: 60 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    scene.add(hemi, sun);

    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const material = (color: string, roughness = 0.85) => {
      const value = new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
      materials.push(value);
      return value;
    };
    const sand = material('#dcc8a0');
    const earth = material('#c09f76');
    const grass = material('#9cba88');
    const leaf = material('#416957');
    const lightLeaf = material('#77956b');
    const trunk = material('#8d6748');
    const cream = material('#f4e8cf');
    const peach = material('#dba27c');
    const pink = material('#d28b75');
    const blue = material('#76b9b8', 0.35);
    const dark = material('#284d43');
    const orange = material('#eb703f');
    const gold = material('#edb964');
    const windowMat = material('#6f9e9b', 0.3);
    const railMat = material('#6c776b');

    function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Group | THREE.Scene = world) {
      geometries.push(geometry);
      const object = new THREE.Mesh(geometry, mat);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    }
    function box(parent: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) {
      const object = mesh(new THREE.BoxGeometry(w, h, d), mat, parent);
      object.position.set(x, y, z);
      return object;
    }
    function cylinder(parent: THREE.Group, x: number, y: number, z: number, r: number, h: number, mat: THREE.Material, top = r, segments = 16) {
      const object = mesh(new THREE.CylinderGeometry(top, r, h, segments), mat, parent);
      object.position.set(x, y, z);
      return object;
    }
    function dome(parent: THREE.Group, x: number, y: number, z: number, r: number, mat: THREE.Material) {
      const object = mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, parent);
      object.position.set(x, y, z);
    }
    function arch(parent: THREE.Group, x: number, y: number, z: number, width: number, height: number, depth: number, mat: THREE.Material) {
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, 0);
      shape.lineTo(-width / 2, height);
      shape.lineTo(width / 2, height);
      shape.lineTo(width / 2, 0);
      shape.lineTo(width * 0.27, 0);
      shape.lineTo(width * 0.27, height * 0.45);
      shape.absarc(0, height * 0.45, width * 0.27, 0, Math.PI, false);
      shape.lineTo(-width * 0.27, 0);
      shape.closePath();
      const object = mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 }), mat, parent);
      object.position.set(x, y, z - depth / 2);
    }

    // A floating, faceted island with inset lake and small landscaped gardens.
    cylinder(world, 0, -0.65, 0, 10.1, 1.2, earth, 10.55, 9);
    cylinder(world, 0, -0.08, 0, 10.55, 0.24, sand, 10.55, 9);
    const lake = cylinder(world, 5.7, 0.075, 1.5, 3.7, 0.09, blue, 3.7, 48);
    lake.scale.z = 1.7;
    for (let i = 0; i < 4; i++) {
      const bank = cylinder(world, -6 + i * 3.7, 0.075, -4.6 + (i % 2) * 6.5, 2.4, 0.12, grass);
      bank.scale.z = 0.8;
    }
    // Five stylized landmarks: Charminar, Hawa Mahal, India Gate,
    // a botanical pavilion, and Gateway of India.
    const locations = [[-6, 2.7], [-5.2, -3.5], [0, -4.1], [4.2, -2.2], [3.5, 4.6]];
    locations.forEach(([x, z], i) => {
      const landmark = new THREE.Group();
      landmark.position.set(x, 0.18, z);
      world.add(landmark);
      box(landmark, 0, 0.03, 0, 3.1, 0.17, 2.55, cream);
      if (i === 0) {
        arch(landmark, 0, 0.1, 0.3, 2, 1.85, 0.6, cream);
        box(landmark, 0, 1.93, 0, 2.2, 0.24, 1.8, peach);
        for (const tx of [-0.95, 0.95]) for (const tz of [-0.75, 0.75]) {
          cylinder(landmark, tx, 1.3, tz, 0.22, 2.5, cream);
          cylinder(landmark, tx, 2.35, tz, 0.3, 0.15, peach);
          dome(landmark, tx, 2.65, tz, 0.3, gold);
          cylinder(landmark, tx, 3.02, tz, 0.055, 0.25, gold);
        }
        for (let j = -2; j <= 2; j++) box(landmark, j * 0.36, 1.67, 0.62, 0.16, 0.24, 0.07, dark);
      } else if (i === 1) {
        for (let tier = 0; tier < 4; tier++) {
          const w = 2.4 - tier * 0.35;
          box(landmark, 0, 0.4 + tier * 0.53, 0, w, 0.52, 0.85, pink);
          box(landmark, 0, 0.67 + tier * 0.53, 0.03, w + 0.16, 0.08, 1.0, cream);
          for (let j = -2; j <= 2; j++) {
            const wx = j * 0.38;
            if (Math.abs(wx) < w / 2 - 0.1) {
              box(landmark, wx, 0.42 + tier * 0.53, 0.46, 0.14, 0.22, 0.03, dark);
              dome(landmark, wx, 0.53 + tier * 0.53, 0.46, 0.075, dark);
            }
          }
        }
        dome(landmark, 0, 2.36, 0, 0.3, gold);
      } else if (i === 2) {
        arch(landmark, 0, 0.1, 0, 2.15, 2.45, 0.8, peach);
        box(landmark, 0, 2.55, 0, 2.45, 0.24, 1.04, cream);
        box(landmark, 0, 2.76, 0, 1.6, 0.2, 0.88, peach);
        for (const tx of [-0.88, 0.88]) box(landmark, tx, 1.08, 0.46, 0.18, 2.0, 0.17, cream);
      } else if (i === 3) {
        box(landmark, 0, 0.72, 0, 2.1, 1.2, 1.2, windowMat);
        for (let j = -2; j <= 2; j++) box(landmark, j * 0.45, 0.7, 0.64, 0.065, 1.2, 0.08, cream);
        for (const tz of [-0.65, 0.65]) box(landmark, 0, 1.34, tz, 2.3, 0.1, 0.1, cream);
        const roof = cylinder(landmark, 0, 1.63, 0, 1.56, 0.6, dark, 0, 4);
        roof.rotation.y = Math.PI / 4;
        roof.scale.z = 0.68;
        dome(landmark, 0, 1.9, 0, 0.43, windowMat);
      } else {
        arch(landmark, 0, 0.1, 0, 2.3, 1.9, 0.75, cream);
        for (const tx of [-1.04, 1.04]) {
          cylinder(landmark, tx, 1.07, 0, 0.28, 1.9, peach);
          dome(landmark, tx, 2.07, 0, 0.34, gold);
        }
        box(landmark, 0, 2.02, 0, 2.7, 0.18, 1.12, peach);
        dome(landmark, 0, 2.13, 0, 0.48, cream);
        box(landmark, 0, -0.01, 0.75, 3.7, 0.1, 0.48, peach);
      }
    });

    // Seeded placement is deterministic and keeps scenery clear of the railway.
    const trees = [[-8,-1],[-7,-5],[-3,-6.5],[-1,-6.8],[2,-6.4],[6,-4.3],[7,-2.2],[-8,4],[-5,6.5],[-3,7],[0,7.2],[2,7.5],[-2,1.4],[0.3,0.1],[2.2,0.3],[-1.5,-1.2]];
    trees.forEach(([x, z], i) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0.13, z);
      world.add(tree);
      cylinder(tree, 0, 0.35, 0, 0.09, 0.7, trunk, 0.07, 6);
      const crown = mesh(new THREE.IcosahedronGeometry(0.55 + (i % 3) * 0.13, 0), i % 2 ? lightLeaf : leaf, tree);
      crown.position.y = 1.04;
      crown.scale.y = 1.35;
    });
    for (let i = 0; i < 7; i++) {
      const x = -2.5 + (i % 4) * 1.05;
      const z = i < 4 ? 3 : -2.1;
      box(world, x, 0.44, z, 0.7, 0.6, 0.7, i % 2 ? cream : peach);
      const roof = cylinder(world, x, 0.87, z, 0.57, 0.3, i % 2 ? dark : pink, 0, 4);
      roof.rotation.y = Math.PI / 4;
    }
    // A winding railway links the miniature stations, not real rail services.
    const route = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-7.9, 0.24, 5.7), new THREE.Vector3(-7.7, 0.24, 1.1),
      new THREE.Vector3(-6.5, 0.24, -1.5), new THREE.Vector3(-3, 0.24, -2),
      new THREE.Vector3(0, 0.24, -2.45), new THREE.Vector3(2, 0.24, -1.5),
      new THREE.Vector3(3.4, 0.24, 1.5), new THREE.Vector3(1.6, 0.24, 4.3),
      new THREE.Vector3(1.9, 0.24, 6.3), new THREE.Vector3(6.2, 0.24, 6.2),
    ], false, 'catmullrom', 0.25);
    for (const offset of [-0.25, 0.25]) {
      const points = Array.from({ length: 121 }, (_, i) => {
        const p = route.getPointAt(i / 120);
        const t = route.getTangentAt(i / 120);
        return p.add(new THREE.Vector3(t.z, 0, -t.x).multiplyScalar(offset));
      });
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 150, 0.045, 5, false), railMat);
    }
    for (let i = 0; i < 105; i++) {
      const t = i / 104;
      const p = route.getPointAt(t);
      const tangent = route.getTangentAt(t);
      const sleeper = box(world, p.x, 0.17, p.z, 0.78, 0.09, 0.13, trunk);
      sleeper.rotation.y = Math.atan2(tangent.x, tangent.z);
    }
    const carriages: THREE.Group[] = [];
    const wheels: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const car = new THREE.Group();
      world.add(car);
      carriages.push(car);
      box(car, 0, 0.27, 0, 0.75, 0.16, 1.45, dark);
      box(car, 0, 0.63, 0, 0.76, 0.6, 1.33, i === 0 ? orange : cream);
      box(car, 0, 0.97, 0, 0.87, 0.17, 1.5, i === 0 ? cream : orange);
      for (const side of [-1, 1]) {
        for (const z of [-0.43, 0, 0.43]) box(car, side * 0.386, 0.71, z, 0.018, 0.25, 0.25, dark);
        for (const z of [-0.46, 0.46]) {
          const wheel = cylinder(car, side * 0.4, 0.19, z, 0.19, 0.09, dark, 0.19, 12);
          wheel.rotation.z = Math.PI / 2;
          wheels.push(wheel);
        }
      }
      box(car, 0, 0.71, 0.674, 0.49, 0.24, 0.02, dark);
      if (i === 0) {
        box(car, 0, 0.37, 0.83, 0.65, 0.23, 0.3, orange);
        cylinder(car, 0, 1.17, 0.43, 0.13, 0.3, dark);
        const lamp = new THREE.MeshStandardMaterial({ color: '#ffeac3', emissive: '#ffd391', emissiveIntensity: 1.1 });
        materials.push(lamp);
        box(car, 0, 0.53, 0.999, 0.16, 0.13, 0.025, lamp);
      }
    }
    const clouds: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const puff = mesh(new THREE.IcosahedronGeometry(0.5 + (j % 2) * 0.18, 1), cream, cloud);
        puff.position.set(j * 0.58, (j % 2) * 0.15, 0);
        puff.scale.set(1.3, 0.65, 0.8);
        puff.castShadow = false;
      }
      cloud.position.set(-6 + i * 5, 4 + i * 0.65, -5 - (i % 2));
      world.add(cloud);
      clouds.push(cloud);
    }
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = reducedQuery.matches;
    const onReduced = () => { reduced = reducedQuery.matches; };
    reducedQuery.addEventListener('change', onReduced);
    let visible = true;
    let disposed = false;
    let lost = false;
    let currentProgress = progress.current;
    let currentRotation = 0;
    let lastTime = 0;
    let clock = 0;
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      const aspect = width / height;
      const span = aspect < 1 ? 12.2 / aspect : 12.2;
      camera.left = -span * aspect;
      camera.right = span * aspect;
      camera.top = span;
      camera.bottom = -span;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { rootMargin: '100px' });
    visibilityObserver.observe(container);
    const onContextLost = (event: Event) => { event.preventDefault(); lost = true; setUnavailable(true); };
    const onContextRestored = () => { lost = false; setUnavailable(false); };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
    resize();
    const forward = new THREE.Vector3();
    renderer.setAnimationLoop((time) => {
      if (disposed || lost || !visible || document.hidden) { lastTime = time; return; }
      // Render at 30fps and cap pixel density to keep the guide light on laptops.
      if (time - lastTime < 32) return;
      const delta = Math.min((time - lastTime) / 1000, 0.08);
      lastTime = time;
      const config = settings.current;
      const still = reduced || config.paused;
      if (!still) clock += delta;
      const p = Math.max(0, Math.min(1, progress.current));
      currentProgress = still ? p : THREE.MathUtils.damp(currentProgress, p, motionSpeed, delta);
      currentRotation = still ? config.rotation : THREE.MathUtils.damp(currentRotation, config.rotation, 5, delta);
      world.rotation.y = currentRotation;
      carriages.forEach((car, i) => {
        const t = Math.max(0.005, 0.125 + currentProgress * 0.86 - i * 0.058);
        car.position.copy(route.getPointAt(t));
        car.position.y += still ? 0 : Math.sin(clock * 5 + i) * 0.008;
        forward.copy(route.getTangentAt(t));
        car.rotation.y = Math.atan2(forward.x, forward.z);
      });
      wheels.forEach(wheel => { wheel.rotation.y = -currentProgress * 140; });
      clouds.forEach((cloud, i) => { cloud.position.x = -6 + i * 5 + Math.sin(clock * 0.2 + i) * 0.32; });
      const lightTarget = config.night ? 0.85 : 2.6;
      hemi.intensity = THREE.MathUtils.damp(hemi.intensity, lightTarget, 5, delta);
      sun.intensity = config.night ? 0.7 : 3.4;
      sun.color.set(config.night ? '#a4c2eb' : '#ffedcd');
      renderer.render(scene, camera);
    });
    setReady(true);
    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      reducedQuery.removeEventListener('change', onReduced);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [progress, motionSpeed]);

  return (
    <div className="travel-world" ref={host} role="img" aria-label="A miniature 3D landscape with five Indian landmarks and an orange train following the guide as you scroll.">
      {(!ready || unavailable) && <div className="world-fallback">
        <span className="fallback-mountains" aria-hidden="true">△ &nbsp; △ &nbsp; △</span>
        <span className="fallback-train" aria-hidden="true">▰▰▰</span>
        <strong>{unavailable ? 'Your journey continues below' : 'Building your little world…'}</strong>
        <span>{unavailable ? 'The full guide works even when 3D is unavailable.' : 'Five destinations. One curious traveler.'}</span>
      </div>}
    </div>
  );
}
