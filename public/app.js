// Scene Setup
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.00002); // Reduced fog density for galactic scales

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50000); // Increased far plane to see galaxy
camera.position.set(0, 100, 300);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// Important for additive blending glow
renderer.setClearColor(0x000000, 1);
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Variables
let starsGeometry;
let starsPoints;
let pathLine;
let pathNodes; // HUD overlay for path nodes
let starData = [];
let galacticCenter = new THREE.Vector3();
let focusRing; // Tactical ring to highlight selected star

// Initialize the Milky Way Macro-Structure
function initGalaxy() {
    const dist = 8178; // Parsecs to Sagittarius A*
    const ra = 17.761 * 15 * (Math.PI / 180);
    const dec = -29.007 * (Math.PI / 180);
    
    galacticCenter.x = dist * Math.cos(dec) * Math.cos(ra);
    galacticCenter.y = dist * Math.cos(dec) * Math.sin(ra);
    galacticCenter.z = dist * Math.sin(dec);

    // True Galactic North Pole (to orient the galactic plane)
    const ngpRA = 12.85 * 15 * (Math.PI / 180);
    const ngpDec = 27.13 * (Math.PI / 180);
    const galacticNorth = new THREE.Vector3(
        Math.cos(ngpDec) * Math.cos(ngpRA),
        Math.cos(ngpDec) * Math.sin(ngpRA),
        Math.sin(ngpDec)
    );

    // 1. Black Hole Accretion Disk (Plane with Shader)
    const bhGeometry = new THREE.PlaneGeometry(1500, 1500);
    const bhMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 },
            color: { value: new THREE.Color(0xff8833) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 color;
            varying vec2 vUv;
            void main() {
                vec2 uv = vUv - 0.5;
                float r = length(uv);
                if (r > 0.5) discard;
                
                // Vortex twisting
                float angle = atan(uv.y, uv.x) + r * 30.0 - time * 5.0;
                float spiral = sin(angle * 12.0) * 0.5 + 0.5;
                
                // Event horizon
                if (r < 0.03) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // True Black Hole core
                } else {
                    // Accretion disk intensity
                    float intensity = pow(1.0 - (r * 2.0), 3.0) * spiral;
                    gl_FragColor = vec4(color * intensity * 2.5, intensity);
                }
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    const blackHole = new THREE.Mesh(bhGeometry, bhMaterial);
    blackHole.position.copy(galacticCenter);
    // Align black hole disk to the galactic plane
    blackHole.lookAt(galacticCenter.clone().add(galacticNorth));
    scene.add(blackHole);
    scene.userData.blackHoleMat = bhMaterial;

    // 2. Galaxy Spiral Arms (Massive Particle System)
    const particleCount = 200000;
    const gGeo = new THREE.BufferGeometry();
    const gPos = new Float32Array(particleCount * 3);
    const gCol = new Float32Array(particleCount * 3);
    const gSize = new Float32Array(particleCount);

    const arms = 4;
    const armSpread = 0.6;
    const radius = 15000; // Milky way radius ~15k pc

    for (let i = 0; i < particleCount; i++) {
        // Bias heavily towards the core
        const d = Math.pow(Math.random(), 2.5) * radius; 
        const angle = d * 0.0006;
        const armOffset = (i % arms) * ((Math.PI * 2) / arms);
        const scatter = (Math.random() - 0.5) * (d * armSpread + 50); // noise
        const finalAngle = angle + armOffset + scatter;
        
        // Thickness of the galactic disk
        const thickness = (1.0 - (d / radius)) * 600;
        const z = (Math.random() - 0.5) * thickness;

        // Generated at 0,0,0 so rotation works easily later
        gPos[i * 3] = Math.cos(finalAngle) * d;
        gPos[i * 3 + 1] = Math.sin(finalAngle) * d;
        gPos[i * 3 + 2] = z;

        // Core is yellow/white, outer arms are blue
        const mix = d / radius;
        gCol[i * 3]     = 1.0 - mix * 0.6; // R
        gCol[i * 3 + 1] = 0.8 + mix * 0.2; // G
        gCol[i * 3 + 2] = 0.5 + mix * 0.5; // B
        
        gSize[i] = Math.random() * 2.0;
    }
    
    gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    gGeo.setAttribute('customColor', new THREE.BufferAttribute(gCol, 3));
    gGeo.setAttribute('size', new THREE.BufferAttribute(gSize, 1));

    const gMat = new THREE.ShaderMaterial({
        vertexShader: `
            attribute float size;
            attribute vec3 customColor;
            varying vec3 vColor;
            void main() {
                vColor = customColor;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float distance = -mvPosition.z;
                gl_PointSize = size * (3000.0 / distance); 
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                vec2 uv = gl_PointCoord.xy - vec2(0.5);
                float dist = length(uv);
                if (dist > 0.5) discard;
                float glow = pow(1.0 - (dist * 2.0), 1.5);
                gl_FragColor = vec4(vColor * glow, glow * 0.6); 
            }
        `,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
    });

    const galaxyMesh = new THREE.Points(gGeo, gMat);
    galaxyMesh.position.copy(galacticCenter);
    // Align galaxy plane perfectly with the real Milky Way orientation
    galaxyMesh.lookAt(galacticCenter.clone().add(galacticNorth));
    
    scene.add(galaxyMesh);
    scene.userData.galaxyMesh = galaxyMesh;

    // Initialize tactical focus ring
    const ringGeo = new THREE.RingGeometry(1.5, 2.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        side: THREE.DoubleSide, 
        transparent: true, 
        opacity: 0.9, 
        depthTest: false 
    });
    focusRing = new THREE.Mesh(ringGeo, ringMat);
    focusRing.visible = false;
    scene.add(focusRing);
}

// GLSL Procedural Sun Shader replaces static canvas texture
const vertexShader = `
    attribute float size;
    attribute vec3 customColor;
    varying vec3 vColor;
    varying vec3 vPosition;
    void main() {
        vColor = customColor;
        vPosition = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        
        // Scale down size so stars don't look overly huge
        float distance = -mvPosition.z;
        float scaledSize = size * (200.0 / distance);
        gl_PointSize = clamp(scaledSize, 1.5, 120.0);
        
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform vec3 color;
    varying vec3 vColor;
    varying vec3 vPosition;

    // Fast GLSL Pseudo-Random Noise
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0,0.0)), u.x),
                   mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
        float f = 0.0;
        f += 0.5000 * noise(p); p = p * 2.02;
        f += 0.2500 * noise(p); p = p * 2.03;
        f += 0.1250 * noise(p); p = p * 2.01;
        f += 0.0625 * noise(p);
        return f;
    }

    void main() {
        vec2 uv = gl_PointCoord.xy - vec2(0.5);
        float dist = length(uv);
        if (dist > 0.5) discard;
        
        float bodyRadius = 0.35;
        vec3 finalColor = vec3(0.0);
        float alpha = 1.0;

        if (dist < bodyRadius) {
            // Solar Granulation Surface
            // Use vPosition to offset noise so every star looks unique!
            vec2 p = (uv * 15.0) + vPosition.xy * 0.1; 
            float n = fbm(p);
            
            // Limb darkening
            float limb = 1.0 - (dist / bodyRadius);
            limb = pow(limb, 0.4); 
            
            finalColor = color * vColor * (0.5 + n * 0.8) * limb;
        } else {
            // Corona Glow
            float glow = 1.0 - ((dist - bodyRadius) / (0.5 - bodyRadius));
            glow = pow(glow, 2.5);
            finalColor = color * vColor * glow;
            alpha = glow;
            if (alpha < 0.02) discard;
        }
        
        gl_FragColor = vec4(finalColor, alpha);
    }
`;

// Map Spectral class to RGB Color
function getSpectralColor(spectrum) {
    if (!spectrum || spectrum.length === 0) return new THREE.Color(0xffffff);
    const cls = spectrum.charAt(0).toUpperCase();
    switch(cls) {
        case 'O': return new THREE.Color(0x9bb0ff); // Hot blue
        case 'B': return new THREE.Color(0xaabfff); // Blue white
        case 'A': return new THREE.Color(0xcad7ff); // White
        case 'F': return new THREE.Color(0xf8f7ff); // Yellow white
        case 'G': return new THREE.Color(0xfff4ea); // Yellow (Sun)
        case 'K': return new THREE.Color(0xffd2a1); // Orange
        case 'M': return new THREE.Color(0xffcc6f); // Red dwarf
        default: return new THREE.Color(0xffffff);
    }
}



// Load Stars
async function loadStars() {
    try {
        initGalaxy(); // Spawn the Milky Way
        
        const res = await fetch('/api/stars');
        starData = await res.json();
        
        starsGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starData.length * 3);
        const colors = new Float32Array(starData.length * 3);
        const sizes = new Float32Array(starData.length);

        for (let i = 0; i < starData.length; i++) {
            const s = starData[i];
            positions[i * 3] = s.x;
            positions[i * 3 + 1] = s.y;
            positions[i * 3 + 2] = s.z;

            let col = getSpectralColor(s.s);
            if (s.n === "Sol") {
                col = new THREE.Color(0xffff00); // Highlight sol
            }

            colors[i * 3] = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;

            // Absolute Magnitude mapping: Lower magnitude = brighter/larger
            // Typical ranges: -10 (super bright) to +20 (faint)
            let mag = s.m;
            if (mag === undefined || mag === 0) mag = 5.0; 
            
            // Inverse mapping so smaller mag gives larger size
            let size = Math.max(1.0, 10.0 - mag);
            if (s.n === "Sol") size = 15.0; // Make Sol prominent
            sizes[i] = size;
        }

        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starsGeometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
        starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0xffffff) }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            blending: THREE.NormalBlending,
            depthTest: true,                
            depthWrite: true,
            transparent: true
        });

        starsPoints = new THREE.Points(starsGeometry, shaderMaterial);
        scene.add(starsPoints);

        controls.target.set(0, 0, 0);

        // Auto-select a valid star for routing since the 10,000 DB is randomly sampled
        if (starData.length > 1) {
            let valid = false;
            while (!valid) {
                let r = starData[Math.floor(Math.random() * starData.length)];
                if (r.n && r.n !== "Sol") {
                    document.getElementById('end').value = r.n;
                    valid = true;
                }
            }
        }

    } catch (e) {
        console.error("Failed to load stars:", e);
    }
}

// Draw Path
function drawPath(hops) {
    if (pathLine) {
        scene.remove(pathLine);
        pathLine.geometry.dispose();
        pathLine.material.dispose();
    }
    if (pathNodes) {
        scene.remove(pathNodes);
        pathNodes.geometry.dispose();
        pathNodes.material.dispose();
    }

    const points = [];
    for (let hop of hops) {
        const star = starData.find(s => s.n === hop.name || s.n.startsWith(hop.name + " ") || hop.name.startsWith(s.n + " "));
        if (star) {
            points.push(new THREE.Vector3(star.x, star.y, star.z));
        }
    }

    if (points.length < 2) return;

    // A white dashed/dotted line fits the wireframe tactical aesthetic
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({ 
        color: 0xffffff, 
        linewidth: 2,
        dashSize: 5,
        gapSize: 3,
        transparent: true,
        opacity: 0.8
    });

    pathLine = new THREE.Line(geometry, material);
    pathLine.computeLineDistances(); // Required for dashed material
    scene.add(pathLine);

    // Add HUD nodes so the trajectory remains visible from galactic scale
    const nodesGeo = new THREE.BufferGeometry().setFromPoints(points);
    const nodesMat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0x00ffff) } },
        vertexShader: `
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float distance = -mvPosition.z;
                // Clamping min size to 8.0px ensures the route is ALWAYS visible from the edge of the galaxy!
                gl_PointSize = clamp(2000.0 / distance, 8.0, 50.0); 
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            void main() {
                vec2 uv = gl_PointCoord.xy - vec2(0.5);
                float dist = length(uv);
                if (dist > 0.5) discard;
                float glow = pow(1.0 - (dist * 2.0), 1.5);
                gl_FragColor = vec4(color * glow, glow);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false // Render on top of everything
    });
    pathNodes = new THREE.Points(nodesGeo, nodesMat);
    scene.add(pathNodes);

    if (points.length > 0) {
        const p = points[0];
        camera.position.set(p.x + 50, p.y + 50, p.z + 50);
        controls.target.copy(p);
    }
}

// Form Handling
document.getElementById('nav-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const start = document.getElementById('start').value;
    const end = document.getElementById('end').value;
    const dist = document.getElementById('dist').value;
    const speed = document.getElementById('speed').value;

    const resDiv = document.getElementById('results');
    const errDiv = document.getElementById('error-message');
    const sucDiv = document.getElementById('success-message');
    
    resDiv.classList.remove('hidden');
    errDiv.classList.add('hidden');
    sucDiv.classList.add('hidden');

    try {
        const res = await fetch(`/api/path?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&dist=${dist}&speed=${speed}`);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
        }

        const data = await res.json();
        
        document.getElementById('res-dist').innerText = data.total_dist_pc.toFixed(2);
        document.getElementById('res-obs').innerText = data.total_obs_time.toFixed(2);
        document.getElementById('res-ship').innerText = data.total_ship_time.toFixed(2);

        const list = document.getElementById('hop-list');
        list.innerHTML = '';
        data.hops.forEach((hop, i) => {
            const li = document.createElement('li');
            li.style.cursor = 'pointer';
            li.title = "Click to Lock Camera";
            li.innerHTML = `<span>[${String(i+1).padStart(2, '0')}] ${hop.name.toUpperCase()}</span> <span>${hop.dist_pc > 0 ? '+' + hop.dist_pc.toFixed(2) + ' PC' : ''}</span>`;
            li.onclick = () => {
                const s = starData.find(x => x.n === hop.name || x.n.startsWith(hop.name) || hop.name.startsWith(x.n));
                if (s) flyToStar(s.x, s.y, s.z);
            };
            list.appendChild(li);
        });

        sucDiv.classList.remove('hidden');
        drawPath(data.hops);
        
        // Fly to start node
        if (data.hops.length > 0) {
            const s = starData.find(x => x.n === data.hops[0].name || x.n.startsWith(data.hops[0].name));
            if (s) flyToStar(s.x, s.y, s.z);
        }

    } catch (e) {
        errDiv.innerText = "ERROR: " + (e.message || "ROUTE CALCULATION FAILED");
        errDiv.classList.remove('hidden');
    }
});

// Sidebar Toggle Logic
const toggleBtn = document.getElementById('toggle-panel');
const panel = document.getElementById('ui-panel');
toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    toggleBtn.innerText = panel.classList.contains('collapsed') ? 'O' : '_';
});

// Drag Logic
const header = document.getElementById('panel-header');
let isDragging = false;
let offsetX = 0;
let offsetY = 0;

header.addEventListener('mousedown', (e) => {
    if(e.target === toggleBtn) return;
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    // Keep panel within screen bounds mostly
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});

// Star Interaction and Flight Logic
let targetNode = new THREE.Vector3(0, 0, 0);
let camTargetNode = new THREE.Vector3(0, 100, 300);
let isFlying = false;

function flyToStar(x, y, z) {
    targetNode.set(x, y, z);
    camTargetNode.set(x + 20, y + 20, z + 40);
    isFlying = true;
    
    if (focusRing) {
        focusRing.position.set(x, y, z);
        focusRing.visible = true;
    }
}

// Raycaster Tooltip
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 1.5;

const tooltip = document.createElement('div');
tooltip.style.position = 'absolute';
tooltip.style.background = 'rgba(10, 10, 15, 0.9)';
tooltip.style.border = '1px solid var(--neon-cyan)';
tooltip.style.color = '#fff';
tooltip.style.padding = '10px';
tooltip.style.pointerEvents = 'none';
tooltip.style.display = 'none';
tooltip.style.fontFamily = 'var(--font-mono)';
tooltip.style.zIndex = '1000';
tooltip.style.textTransform = 'uppercase';
document.body.appendChild(tooltip);

window.addEventListener('click', (e) => {
    if (e.target.closest('#ui-panel')) return;
    
    const mouse = new THREE.Vector2();
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(starsPoints);
    if (intersects.length > 0) {
        const idx = intersects[0].index;
        const star = starData[idx];
        
        tooltip.style.display = 'block';
        tooltip.style.left = e.clientX + 15 + 'px';
        tooltip.style.top = e.clientY + 15 + 'px';
        tooltip.innerHTML = `<strong style="color:var(--neon-cyan)">${star.n || 'UNKNOWN'}</strong><br>Spec: ${star.s}<br>Mag: ${star.m}`;

        flyToStar(star.x, star.y, star.z);
    } else {
        tooltip.style.display = 'none';
    }
});

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    
    if (scene.userData.blackHoleMat) {
        scene.userData.blackHoleMat.uniforms.time.value += 0.01;
    }
    if (scene.userData.galaxyMesh) {
        scene.userData.galaxyMesh.rotation.z -= 0.0002;
    }
    
    if (isFlying) {
        controls.target.lerp(targetNode, 0.05);
        camera.position.lerp(camTargetNode, 0.05);
        if (controls.target.distanceTo(targetNode) < 1.0) {
            isFlying = false;
        }
    }
    
    // Scale focus ring dynamically so it acts as a permanent HUD locator beacon when zoomed out
    if (focusRing && focusRing.visible) {
        focusRing.lookAt(camera.position);
        let dist = camera.position.distanceTo(focusRing.position);
        let scale = Math.max(1.0, dist / 80.0);
        focusRing.scale.set(scale, scale, scale);
    }
    
    controls.update();
    renderer.render(scene, camera);
}

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Init
loadStars();
animate();
