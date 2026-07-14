const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/public/app.js', 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

try {
    // 1. Verify rotation is absent
    assert.ok(!/^\s*scene\.userData\.galaxyMesh\.rotation\.z \-= 0\.0002;/m.test(src), 'Galaxy rotation should be disabled');
    assert.ok(!/^\s*scene\.userData\.nebulaMesh\.rotation\.z \-= 0\.00015;/m.test(src), 'Nebula rotation should be disabled');

    // RED: Prove current shaders expose macro layers locally
    // The current per-particle fade is smoothstep(150, 500, vCameraDist).
    // Locally, particles > 500 units away evaluate to 1 (fully visible).
    const oldLocalParticleVisible = smoothstep(150, 500, 600);
    assert.strictEqual(oldLocalParticleVisible, 1, 'RED PROOF: old per-particle fade exposes particles > 500 units away locally.');

    // Check Star Shader (vertex)
    const starVertexMatch = src.match(/const vertexShader = `([^`]+)`/);
    assert.ok(starVertexMatch, 'Should find vertexShader block');
    const starVert = starVertexMatch[1];

    assert.ok(starVert.includes('attribute float isProcedural;'), 'Should declare isProcedural attribute');
    assert.ok(starVert.includes('attribute float isSelected;'), 'Should declare isSelected attribute');
    assert.ok(starVert.includes('uniform vec3 uGalacticCenter;'), 'Should declare uGalacticCenter uniform');
    assert.ok(starVert.includes('varying float vIsProcedural;'), 'Should pass isProcedural to fragment');
    assert.ok(starVert.includes('varying float vIsSelected;'), 'Should pass isSelected to fragment');
    assert.ok(starVert.includes('varying float vGalacticDist;'), 'Should pass vGalacticDist to fragment');
    assert.ok(starVert.includes('vGalacticDist = length(cameraPosition - uGalacticCenter);'), 'Should compute distance from uGalacticCenter, not modelMatrix origin');
    assert.ok(!starVert.match(/120\.0/), 'Should remove 120px inverse-distance scaling clamp');
    assert.ok(!starVert.match(/200\.0 \/ distance/), 'Should remove inverse-distance multiplier');


    // Check Star Shader (fragment)
    const starFragMatch = src.match(/const fragmentShader = `([^`]+)`/);
    assert.ok(starFragMatch, 'Should find fragmentShader block');
    const starFrag = starFragMatch[1];

    assert.ok(!starFrag.includes('fbm('), 'Should not use FBM granulation');
    assert.ok(!starFrag.includes('noise('), 'Should not use noise');
    assert.ok(starFrag.includes('vIsProcedural'), 'Fragment should use vIsProcedural');
    assert.ok(starFrag.match(/smoothstep\(\s*12000\.0\s*,\s*25000\.0\s*,\s*vGalacticDist\s*\)/), 'Fragment should compute macro LOD for procedurals');
    assert.ok(starFrag.includes('vIsSelected'), 'Fragment should use vIsSelected for highlight');
    assert.ok(!starFrag.includes('vec3(1.0)'), 'Fragment should not mix selected star with white');
    assert.ok(!starFrag.includes('vec3(0.0, 1.0, 1.0)'), 'Fragment should not mix selected star with cyan');


    // GREEN: New Galactocentric LOD thresholds
    const localRadius = 8178; // Sol galactocentric distance
    const edgeRadius = 49142; // Actual map edge galactocentric distance
    const fadeLocal = smoothstep(12000.0, 25000.0, localRadius);
    const fadeEdge = smoothstep(12000.0, 25000.0, edgeRadius);
    assert.strictEqual(fadeLocal, 0, 'New LOD must evaluate to 0 (invisible) at local radius');
    assert.strictEqual(fadeEdge, 1, 'New LOD must evaluate to 1 (visible) at edge radius');

    const macroShaders = ['gMat', 'dMat', 'nMat'];
    for (let mat of macroShaders) {
        const matBlockStart = src.indexOf(`const ${mat} =`);
        const matBlockEnd = src.indexOf('blending:', matBlockStart);
        const matBlock = src.substring(matBlockStart, matBlockEnd);

        assert.ok(matBlock.includes('varying float vGalacticDist;'), `${mat} should declare vGalacticDist`);
        assert.ok(matBlock.includes('length(cameraPosition - modelMatrix[3].xyz)'), `${mat} should compute galactocentric camera distance`);
        assert.ok(!matBlock.match(/1\.0\s*-\s*smoothstep/), `${mat} should not use reversed smoothstep edges or inverse`);
        assert.ok(matBlock.match(/smoothstep\(\s*12000\.0\s*,\s*25000\.0\s*,\s*vGalacticDist\s*\)/), `${mat} should use defined smoothstep on vGalacticDist`);
    }


    console.log('GREEN: Shader regression tests passed.');
} catch (e) {
    console.error('RED:', e.message);
    process.exit(1);
}

try {
    // Check Inferred Photosphere Shader
    const starDetailMatStart = src.indexOf('const starDetailMat = new THREE.ShaderMaterial');
    assert.ok(starDetailMatStart > -1, 'Should find starDetailMat block');
    const starDetailMatEnd = src.indexOf('});', starDetailMatStart);
    const starDetailMatSrc = src.substring(starDetailMatStart, starDetailMatEnd);

    assert.ok(starDetailMatSrc.includes('uLimbDarkening'), 'starDetailMat should have uLimbDarkening uniform');
    assert.ok(starDetailMatSrc.includes('uGranulationContrast'), 'starDetailMat should have uGranulationContrast uniform');
    assert.ok(starDetailMatSrc.includes('uGranulationScale'), 'starDetailMat should have uGranulationScale uniform');

    assert.ok(!starDetailMatSrc.includes('dot(n, l)'), 'Should forbid Lambert terminology (dot(n, l)) in photosphere');
    assert.ok(!starDetailMatSrc.match(/\b(directionalLight|directional-light)\b/i), 'Should forbid directional light terminology');

    assert.ok(starDetailMatSrc.includes('noise(') || starDetailMatSrc.includes('cellular') || starDetailMatSrc.includes('fBm'), 'Should require multi-octave or cellular/convective structure');
    assert.ok(starDetailMatSrc.includes('smoothstep') || starDetailMatSrc.includes('pow'), 'Should require intergranular-lane shaping');

    assert.ok(starDetailMatSrc.includes('vPosition') || starDetailMatSrc.includes('vNormal'), 'Should use object-space 3D coordinates for procedural texture');

    // RED: Prove fragment shader does not use matrices
    const fragShaderStart = starDetailMatSrc.indexOf('fragmentShader:');
    const fragShaderSrc = starDetailMatSrc.substring(fragShaderStart);
    assert.ok(!fragShaderSrc.includes('modelViewMatrix'), 'Photosphere fragment shader should not reference modelViewMatrix');
    assert.ok(!fragShaderSrc.includes('modelMatrix'), 'Photosphere fragment shader should not reference modelMatrix');
    assert.ok(!fragShaderSrc.includes('normalMatrix'), 'Photosphere fragment shader should not reference normalMatrix');

    // RED: Prove vertex shader passes view-space position
    const vertShaderStart = starDetailMatSrc.indexOf('vertexShader:');
    const vertShaderSrc = starDetailMatSrc.substring(vertShaderStart, fragShaderStart);
    assert.ok(vertShaderSrc.includes('varying vec3 vViewPosition;'), 'Vertex shader should declare varying vViewPosition');
    assert.ok(fragShaderSrc.includes('varying vec3 vViewPosition;'), 'Fragment shader should declare varying vViewPosition');

    assert.ok(vertShaderSrc.includes('vViewPosition = -mvPosition.xyz;') || vertShaderSrc.includes('vViewPosition = -(modelViewMatrix * vec4(position, 1.0)).xyz;'), 'Vertex shader should compute vViewPosition');
    assert.ok(fragShaderSrc.includes('normalize(vViewPosition)'), 'Fragment shader should use normalized vViewPosition');

    console.log('GREEN: Inferred photosphere shader tests passed.');
} catch (e) {
    console.error('RED (Photosphere):', e.message);
    process.exit(1);
}

try {
    // 1. ordered object renderOrder: interior first, galaxy/default afterward;
    assert.ok(src.match(/interiorSky\.renderOrder\s*=\s*-2/), 'interiorSky should have renderOrder -2');
    assert.ok(!src.match(/galaxyMesh\.renderOrder\s*=\s*-[1-9]/), 'galaxyMesh should not have negative renderOrder (default 0 or >0)');

    console.log('GREEN: Interior rendering regression tests passed.');
} catch (e) {
    console.error('RED (Interior Blocker):', e.message);
    process.exit(1);
}

try {
    // Selection Wiring
    const pickStarIdx = src.indexOf('function pickStar');
    assert.ok(pickStarIdx > -1, 'pickStar function must exist');
    const pickStarEnd = src.indexOf('function', pickStarIdx + 1);
    const pickStarBody = src.substring(pickStarIdx, pickStarEnd > -1 ? pickStarEnd : src.length);
    assert.ok(pickStarBody.includes('highlightStar('), 'pickStar must call highlightStar');

    const focusHopIdx = src.indexOf('function focusHop');
    assert.ok(focusHopIdx > -1, 'focusHop function must exist');
    const focusHopEnd = src.indexOf('function', focusHopIdx + 1);
    const focusHopBody = src.substring(focusHopIdx, focusHopEnd > -1 ? focusHopEnd : src.length);
    assert.ok(focusHopBody.includes('highlightStar('), 'focusHop must call highlightStar');

    console.log('GREEN: Selection wiring tests passed.');
} catch (e) {
    console.error('RED (Selection Wiring):', e.message);
    process.exit(1);
}
