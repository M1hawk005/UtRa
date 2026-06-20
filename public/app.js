// Scene Setup
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.001);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
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
let starData = [];

// Create a procedural shaded sphere texture with noise
function createCircleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    
    // Base circle
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(64, 64, 60, 0, Math.PI * 2);
    context.fill();

    // 3D Spherical Shading (lighter top-left, darker bottom-right)
    const gradient = context.createRadialGradient(40, 40, 10, 64, 64, 60);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');    // Highlight
    gradient.addColorStop(0.6, 'rgba(200,200,200,1)');  // Mid-tone
    gradient.addColorStop(0.95, 'rgba(80,80,80,1)');    // Shadow edge
    gradient.addColorStop(1, 'rgba(0,0,0,0)');          // Outer edge
    
    // Apply shading over the circle
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    // Add subtle noise for "texture"
    const imgData = context.getImageData(0, 0, 128, 128);
    for (let i = 0; i < imgData.data.length; i += 4) {
        if (imgData.data[i+3] > 0) { // If inside circle
            let noise = (Math.random() - 0.5) * 20; 
            imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
            imgData.data[i+1] = Math.min(255, Math.max(0, imgData.data[i+1] + noise));
            imgData.data[i+2] = Math.min(255, Math.max(0, imgData.data[i+2] + noise));
        }
    }
    context.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

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

// Custom Shader for per-point sizing and custom coloring
const vertexShader = `
    attribute float size;
    attribute vec3 customColor;
    varying vec3 vColor;
    void main() {
        vColor = customColor;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        
        // Scale size by distance, but clamp to avoid massive blobs
        float distance = -mvPosition.z;
        float scaledSize = size * (400.0 / distance);
        gl_PointSize = clamp(scaledSize, 1.5, 120.0);
        
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform vec3 color;
    uniform sampler2D pointTexture;
    varying vec3 vColor;
    void main() {
        gl_FragColor = vec4(color * vColor, 1.0);
        gl_FragColor = gl_FragColor * texture2D(pointTexture, gl_PointCoord);
    }
`;

// Load Stars
async function loadStars() {
    try {
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
                color: { value: new THREE.Color(0xffffff) },
                pointTexture: { value: createCircleTexture() }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            blending: THREE.NormalBlending, // Solid occlusion instead of additive
            depthTest: true,                // Enable depth testing
            depthWrite: true,               // Write to depth buffer
            transparent: true,
            alphaTest: 0.1                  // Discard fragments with near-zero alpha to ensure sharp edges
        });

        starsPoints = new THREE.Points(starsGeometry, shaderMaterial);
        scene.add(starsPoints);

        controls.target.set(0, 0, 0);

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
            li.innerHTML = `<span>[${String(i+1).padStart(2, '0')}] ${hop.name.toUpperCase()}</span> <span>${hop.dist_pc > 0 ? '+' + hop.dist_pc.toFixed(2) + ' PC' : ''}</span>`;
            list.appendChild(li);
        });

        sucDiv.classList.remove('hidden');
        drawPath(data.hops);

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

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
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
