'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';

interface Props { progress: MutableRefObject<number>; night: boolean; paused: boolean; rotation: number; weather?: string }

/** A continuous miniature valley, viewed from above. Scroll drives distance, not time. */
export default function NatureRailway({ progress, night, paused, rotation, weather = "clear" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef({ night, paused, rotation, weather });
  const [fallback, setFallback] = useState(false);
  useEffect(() => { controls.current = { night, paused, rotation, weather }; }, [night, paused, rotation, weather]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch { setFallback(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setClearColor('#e4ead8', 1);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-27, 27, 20, -20, .1, 160);
    const ambient = new THREE.HemisphereLight('#f1f6ff', '#627d56', 2);
    const sun = new THREE.DirectionalLight('#fff3de', 1.5);
    sun.position.set(-20, 40, 15);
    scene.add(ambient, sun);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const mat = (color: string) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }); materials.push(m); return m; };
    const grass = mat('#b9cda0'), moss = mat('#9bb78a'), pine = mat('#416b51'), lightPine = mat('#73905c');
    const stone = mat('#879883'), rock = mat('#a6ae97'), cream = mat('#f8e9c9'), dark = mat('#294738');
    const wood = mat('#8b7153'), copper = mat('#d97745'), water = mat('#91c4b8'), rail = mat('#6e7866');
    const geometry = <T extends THREE.BufferGeometry,>(g: T): T => { geometries.push(g); return g; };
    const cube = geometry(new THREE.BoxGeometry(1, 1, 1));
    const cone = geometry(new THREE.ConeGeometry(1, 1, 7));
    const boulder = geometry(new THREE.IcosahedronGeometry(1, 0));
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, parent: THREE.Object3D = scene) => {
      const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
    };
    add(cube, grass, 0, -1, 70, 120, 1.8, 240);
    const points = [[-22,0],[-7,4],[9,8],[15,15],[11,22],[2,27],[-10,34],[-13,45],[-4,54],[11,60],[15,72],[6,82],[-8,89],[-13,101],[-3,111],[12,119],[17,132]];
    const route = new THREE.CatmullRomCurve3(points.map(([x,z]) => new THREE.Vector3(x, .18, z)));
    const trackLength = route.getLength();
    const count = Math.ceil(trackLength * 2.3);
    const sleepers = new THREE.InstancedMesh(cube, wood, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1), p = route.getPointAt(t), tangent = route.getTangentAt(t);
      dummy.position.copy(p); dummy.position.y = .06; dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0); dummy.scale.set(1.6, .13, .19); dummy.updateMatrix(); sleepers.setMatrixAt(i, dummy.matrix);
    }
    scene.add(sleepers);
    for (const side of [-1, 1]) {
      const line = Array.from({ length: 600 }, (_, i) => { const t = i / 599, p = route.getPointAt(t), v = route.getTangentAt(t); return p.add(new THREE.Vector3(v.z, 0, -v.x).multiplyScalar(.48 * side)); });
      add(geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line), 600, .055, 5, false)), rail, 0, 0, 0);
    }
    // Seeded placement keeps hydration-independent scenery stable between visits.
    let seed = 137;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const sampled = route.getPoints(450);
    // Shared, vertex-colored triangular terrain: detail without image downloads.
    const terrain = geometry(new THREE.PlaneGeometry(120, 240, 48, 96).toNonIndexed());
    terrain.rotateX(-Math.PI / 2);
    const vertices = terrain.getAttribute('position');
    const colors = new Float32Array(vertices.count * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < vertices.count; i += 3) {
      tint.setHSL(.24 + random() * .035, .22, .48 + random() * .12);
      for (let j = 0; j < 3; j++) tint.toArray(colors, (i + j) * 3);
    }
    terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    materials.push(terrainMaterial);
    add(terrain, terrainMaterial, 0, -.08, 70);
    const flowers = new THREE.InstancedMesh(boulder, cream, 350);
    for (let i=0;i<350;i++) {
      dummy.position.set(random()*70-35,.12,random()*155-8);
      dummy.scale.set(.1,.15,.1); dummy.updateMatrix(); flowers.setMatrixAt(i,dummy.matrix);
    }
    scene.add(flowers);
    const cloudMaterial = new THREE.MeshStandardMaterial({color:'#edf5f2',transparent:true,opacity:.52,roughness:1});
    materials.push(cloudMaterial);
    const clouds = new THREE.Group(); scene.add(clouds);
    for(let i=0;i<15;i++) add(boulder,cloudMaterial,random()*65-32,12,random()*70-35,3+random()*3,.4,1.5+random()*2,clouds);
    const rainGeometry = geometry(new THREE.BufferGeometry());
    const rainPositions = new Float32Array(500*3);
    for(let i=0;i<500;i++){rainPositions[i*3]=random()*65-32;rainPositions[i*3+1]=random()*16;rainPositions[i*3+2]=random()*70-35;}
    rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
    const rainMaterial = new THREE.PointsMaterial({color:'#d8eef5',size:.12,transparent:true,opacity:.7}); materials.push(rainMaterial);
    const rain = new THREE.Points(rainGeometry,rainMaterial);scene.add(rain);

    const trees: {x:number;z:number;s:number}[] = [];
    for (let i = 0; i < 630; i++) {
      const x = random() * 76 - 38, z = random() * 160 - 12;
      if (sampled.some(p => Math.hypot(p.x - x, p.z - z) < 2.4)) continue;
      if (Math.abs(x - 23) < 5 && z > 35 && z < 95) continue;
      trees.push({ x, z, s: .65 + random() * .9 });
    }
    for (let layer = 0; layer < 2; layer++) {
      const forest = new THREE.InstancedMesh(cone, layer ? lightPine : pine, trees.length);
      trees.forEach(({x,z,s}, i) => { dummy.position.set(x, (layer ? 2.05 : 1.35) * s, z); dummy.scale.set(s * (layer ? .72 : 1), 2.6 * s, s * (layer ? .72 : 1)); dummy.rotation.set(0, i * .7, 0); dummy.updateMatrix(); forest.setMatrixAt(i, dummy.matrix); });
      scene.add(forest);
    }
    // A river and banks create a continuous second line through the valley.
    const river = new THREE.CatmullRomCurve3(Array.from({length:18}, (_,i) => new THREE.Vector3(24 + Math.sin(i*.6)*4, -.05, i*10 - 15)));
    add(geometry(new THREE.TubeGeometry(river, 160, 3.2, 8, false)), water, 0, -2.85, 0);
    for (let i = 0; i < 35; i++) {
      const x=random()*60-30, z=random()*145;
      if (sampled.some(p => Math.hypot(p.x-x,p.z-z)<4)) continue;
      add(boulder, i%2 ? moss : rock, x, .25, z, 1+random()*2, .5+random(), 1+random()*2);
    }
    // The track passes beneath raised mountain geometry. Open portals mark both ends.
    for (const t of [.16, .53, .82]) {
      const p = route.getPointAt(t), v = route.getTangentAt(t);
      const mountain = new THREE.Group(); mountain.position.copy(p); mountain.rotation.y = Math.atan2(v.x,v.z); scene.add(mountain);
      add(boulder, stone, 0, 4.5, 0, 5, 3.2, 4.8, mountain);
      add(boulder, rock, -1.8, 6.2, -.3, 3.8, 3.9, 3.6, mountain);
      add(boulder, cream, -1.8, 9.1, -.3, 1.8, 1.1, 1.6, mountain);
      for (const end of [-1,1]) {
        add(cube, stone, -1.05, 1.1, end*3.8, .5, 2.2, .8, mountain);
        add(cube, stone, 1.05, 1.1, end*3.8, .5, 2.2, .8, mountain);
        add(cube, stone, 0, 2.35, end*3.8, 2.6, .6, .8, mountain);
      }
    }
    const cars: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const car = new THREE.Group(); scene.add(car); cars.push(car);
      add(cube,dark,0,.25,0,1,.3,2,car);
      add(cube,i ? cream : copper,0,.8,0,1.1,.9,1.9,car);
      add(cube,copper,0,1.3,0,1.18,.17,2.05,car);
      for (const side of [-1,1]) for (const z of [-.6,0,.6]) add(cube,dark,side*.557,.9,z,.025,.35,.35,car);
      if (!i) add(cube,dark,0,1.65,.6,.3,.6,.3,car);
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 1, height = 1, dirty = true, visible = true, lost = false;
    const resize = () => { width = el.clientWidth; height = el.clientHeight; if (!width || !height) return; const span = width < 700 ? 24 : 26; camera.left=-span; camera.right=span; camera.top=span*height/width; camera.bottom=-camera.top; camera.updateProjectionMatrix(); renderer.setSize(width,height,false); dirty=true; };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    const intersection = new IntersectionObserver(([entry]) => { visible=entry.isIntersecting; dirty=true; }); intersection.observe(el);
    const lostContext = (event:Event) => { event.preventDefault(); lost=true; setFallback(true); };
    const restored = () => { lost=false; dirty=true; setFallback(false); };
    renderer.domElement.addEventListener('webglcontextlost',lostContext);
    renderer.domElement.addEventListener('webglcontextrestored',restored);
    let last=0, current=progress.current, previousNight=false, previousRotation=0, previousWeather="", elapsed=0;
    renderer.setAnimationLoop(time => {
      if (lost || !visible || document.hidden || time-last<40) return;
      const dt=Math.min((time-last)/1000,.1); last=time;
      const config=controls.current;
      const target=THREE.MathUtils.clamp(progress.current,0,1);
      const movingWeather = config.weather !== "clear" && !config.paused && !reduced.matches;
      if (!dirty && !movingWeather && Math.abs(current-target)<.00001 && previousNight===config.night && previousRotation===config.rotation && previousWeather===config.weather) return;
      current=reduced.matches || config.paused ? target : THREE.MathUtils.damp(current,target,5,dt);
      const t=.12+current*.825;
      const position=route.getPointAt(t);
      cars.forEach((car,i) => { const fraction=Math.max(0,t-i*2.2/trackLength); car.position.copy(route.getPointAt(fraction)); const direction=route.getTangentAt(fraction); car.rotation.y=Math.atan2(direction.x,direction.z); });
      const centerZ=position.z;
      camera.position.set(Math.sin(config.rotation)*6,55,centerZ+17);
      camera.lookAt(0,0,centerZ);
      ambient.intensity=config.night ? .3 : config.weather === 'rain' ? 1.1 : 2;
      ambient.color.set(config.night ? '#698fca' : '#f1f6ff');
      sun.intensity=config.night ? .2 : config.weather === 'rain' ? .4 : 1.5;
      sun.color.set(config.night ? '#759fdd' : '#fff3de');
      copper.emissive.set(config.night ? '#a45620' : '#000000'); copper.emissiveIntensity=.3;
      water.color.set(config.night ? '#173650' : '#73b7b1');
      clouds.visible=config.weather !== 'clear'; clouds.position.z=centerZ;
      if(movingWeather) elapsed+=dt;
      clouds.position.x=Math.sin(elapsed*.08)*4;
      rain.visible=config.weather === 'rain'; rain.position.z=centerZ;
      if(movingWeather && rain.visible) {
        for(let i=0;i<500;i++){rainPositions[i*3+1]-=dt*8;if(rainPositions[i*3+1]<0)rainPositions[i*3+1]=16;}
        rainGeometry.getAttribute('position').needsUpdate=true;
      }
      renderer.setClearColor(config.night ? '#526f61' : '#e4ead8');
      renderer.render(scene,camera);
      previousWeather=config.weather; previousNight=config.night; previousRotation=config.rotation; dirty=false;
    });
    return () => { renderer.setAnimationLoop(null); observer.disconnect(); intersection.disconnect(); renderer.domElement.removeEventListener('webglcontextlost',lostContext); renderer.domElement.removeEventListener('webglcontextrestored',restored); scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); }); geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); renderer.dispose(); renderer.domElement.remove(); };
  }, [progress]);

  return <div className="nature-railway" ref={host} role="img" aria-label="Overhead miniature forest railway. A copper train winds through a green valley and disappears beneath mountain tunnels as you scroll.">{fallback && <div className="nature-fallback">The scenic route continues in the guide below.<small>3D is unavailable on this device.</small></div>}</div>;
}
