const fs = require('fs');
const assert = require('assert');

function stripComments(source) {
    let result = '';
    let state = 'code';

    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        const next = source[i + 1];

        if (state === 'lineComment') {
            if (char === '\n' || char === '\r') {
                result += char;
                state = 'code';
            }
            continue;
        }

        if (state === 'blockComment') {
            if (char === '*' && next === '/') {
                result += ' ';
                i++;
                state = 'code';
            } else if (char === '\n' || char === '\r') {
                result += char;
            }
            continue;
        }

        if (state === 'singleQuote' || state === 'doubleQuote') {
            result += char;
            if (char === '\\') {
                result += source[++i] || '';
            } else if ((state === 'singleQuote' && char === "'") ||
                       (state === 'doubleQuote' && char === '"')) {
                state = 'code';
            }
            continue;
        }

        if (char === "'") {
            result += char;
            state = 'singleQuote';
        } else if (char === '"') {
            result += char;
            state = 'doubleQuote';
        } else if (char === '/' && next === '/') {
            result += ' ';
            i++;
            state = 'lineComment';
        } else if (char === '/' && next === '*') {
            result += ' ';
            i++;
            state = 'blockComment';
        } else {
            // Template contents include executable GLSL, so comments inside them
            // must also be removed. Quoted JS URL strings remain untouched above.
            result += char;
        }
    }

    return result;
}

const appSource = fs.readFileSync(__dirname + '/public/app.js', 'utf8');
const src = stripComments(appSource);

function assertOverviewSource(source) {
    const executableSource = stripComments(source);
    const overviewSkyMatStart = executableSource.search(/function\s+initOverviewSky\s*\(\s*\)\s*\{/);
    assert.ok(overviewSkyMatStart > -1, 'Should find executable initOverviewSky block');

    const overviewSkyMatEnd = executableSource.indexOf('overviewSky = new THREE.Points(geo, overviewSkyMaterial);', overviewSkyMatStart);
    assert.ok(overviewSkyMatEnd > overviewSkyMatStart, 'Should find executable overviewSky construction');
    const overviewSkyBlock = executableSource.substring(overviewSkyMatStart, overviewSkyMatEnd);

    assert.match(executableSource, /overviewSky\.renderOrder\s*=\s*-1\s*;/, 'overviewSky should have executable renderOrder -1 assignment');
    assert.match(overviewSkyBlock, /gl\.getParameter\s*\(\s*gl\.ALIASED_POINT_SIZE_RANGE\s*\)/, 'initOverviewSky should query ALIASED_POINT_SIZE_RANGE once during setup');
    assert.match(overviewSkyBlock, /uMaxPointSize\s*:\s*\{\s*value\s*:\s*overviewMaxPointSize\s*\}/, 'uMaxPointSize uniform should be wired to overviewMaxPointSize');
    assert.match(overviewSkyBlock, /(?:float\s+\w+\s*=\s*min\s*\([^;]*uMaxPointSize[^;]*\)[\s\S]*gl_PointSize\s*=\s*\w+|gl_PointSize\s*=\s*min\s*\([^;]*uMaxPointSize[^;]*\))\s*;/, 'gl_PointSize should use a value clamped to uMaxPointSize');
    assert.match(overviewSkyBlock, /clamp\s*\(\s*1\.0\s*\/\s*\(\s*vClampRatio\s*\*\s*vClampRatio\s*\)/, 'low-limit fallback/compensation must be finite and bounded');
    assert.match(overviewSkyBlock, /if\s*\(\s*vClampRatio\s*<\s*1\.0\s*\)/, 'companion compensation branch must remain executable');
    assert.match(overviewSkyBlock, /1\.0\s*-\s*smoothstep\s*\(\s*0\.2\s*,\s*0\.5\s*,\s*r\s*\)/, 'initOverviewSky companion shader should require ordered smoothstep equivalent');
    assert.doesNotMatch(overviewSkyBlock, /smoothstep\s*\(\s*0\.5\s*,\s*0\.2\s*,\s*r\s*\)/, 'initOverviewSky companion shader should forbid reversed smoothstep edges');
}

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

    // Shader regression must assert exactly one selected-star/finalAlpha discard branch where intended
    const discardCount = (starFrag.match(/if\s*\(\s*alpha\s*<\s*0\.01\s*\)\s*discard\s*;/g) || []).length;
    assert.strictEqual(discardCount, 1, 'Star fragment shader must have exactly one alpha < 0.01 discard branch');
    const mutatedStarFrag = starFrag.replace('if (alpha < 0.01) discard;', 'if (alpha < 0.01) discard;\nif (alpha < 0.01) discard;');
    assert.notStrictEqual((mutatedStarFrag.match(/if\s*\(\s*alpha\s*<\s*0\.01\s*\)\s*discard\s*;/g) || []).length, 1, 'Duplicate discard insertion must fail');


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

    const nMatStart = src.indexOf('const nMat =');
    const nMatEnd = src.indexOf('blending:', nMatStart);
    const nMatBlock = src.substring(nMatStart, nMatEnd);
    assert.match(nMatBlock, /uTransitionOpacity\s*:\s*\{\s*value\s*:\s*1\.0\s*\}/, 'Nebula material must declare uTransitionOpacity uniform initialized to 1.0');
    assert.match(nMatBlock, /uniform\s+float\s+uTransitionOpacity\s*;/, 'Nebula fragment shader must declare uTransitionOpacity uniform');

    const nebulaDiscardCount = (nMatBlock.match(/if\s*\(\s*finalAlpha\s*<\s*0\.005\s*\)\s*discard\s*;/g) || []).length;
    assert.strictEqual(nebulaDiscardCount, 1, 'Nebula fragment shader must have exactly one finalAlpha < 0.005 discard branch');
    const mutatedNMatBlock = nMatBlock.replace('if (finalAlpha < 0.005) discard;', 'if (finalAlpha < 0.005) discard;\nif (finalAlpha < 0.005) discard;');
    assert.notStrictEqual((mutatedNMatBlock.match(/if\s*\(\s*finalAlpha\s*<\s*0\.005\s*\)\s*discard\s*;/g) || []).length, 1, 'Duplicate nebula discard insertion must fail');

    assert.match(src, /if\s*\(\s*!options\.isFocus\s*\)\s*\{[\s\S]*?fadingMaterials\.push\(\{\s*material:\s*scene\.userData\.nebulaMesh\.material/, 'Nebula material must be pushed to fadingMaterials for runtime update only during generic map relocation (!options.isFocus)');

    assertOverviewSource(appSource);

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

    // TDD tests for spots and faculae
    assert.ok(starDetailMatSrc.includes('uActivity'), 'starDetailMat should have uActivity uniform for spots/faculae');
    assert.ok(starDetailMatSrc.includes('uSeed'), 'starDetailMat should have uSeed uniform for stable identity');
    assert.ok(starDetailMatSrc.match(/spot|magnetic/i), 'starDetailMat should have sparse darker magnetic/spot regions');

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
    // Corona/Chromosphere tests
    const coronaMatStart = src.indexOf('const coronaMat = new THREE.ShaderMaterial');
    assert.ok(coronaMatStart > -1, 'Should find coronaMat block for the corona shell');
    const coronaMatEnd = src.indexOf('});', coronaMatStart);
    const coronaMatSrc = src.substring(coronaMatStart, coronaMatEnd);

    assert.ok(coronaMatSrc.includes('uColor'), 'coronaMat should have uColor uniform');
    assert.ok(coronaMatSrc.match(/blending:\s*THREE\.AdditiveBlending/), 'coronaMat should use AdditiveBlending');

    // No dense particle halo check
    assert.ok(!src.includes('new THREE.Points(coronaGeo'), 'Corona should not be a Point cloud');

    // Sgr A* exclusion in focusHop
    const focusHopIdx = src.indexOf('function focusHop');
    assert.ok(focusHopIdx > -1, 'focusHop function must exist');
    const focusHopEnd = src.indexOf('function', focusHopIdx + 1);
    const focusHopBody = src.substring(focusHopIdx, focusHopEnd > -1 ? focusHopEnd : src.length);
    assert.ok(focusHopBody.includes('star.isSgrA'), 'focusHop should check if target is Sgr A* to hide stellar details');

    console.log('GREEN: Corona and special target exclusion tests passed.');
} catch (e) {
    console.error('RED (Corona/Exclusion):', e.message);
    process.exit(1);
}

try {
    // Ordered object renderOrder: interior first, overview second, galaxy/default afterward.
    assert.ok(src.match(/interiorSky\.renderOrder\s*=\s*-2/), 'interiorSky should have renderOrder -2');
    assert.ok(src.match(/overviewSky\.renderOrder\s*=\s*-1/), 'overviewSky should have renderOrder -1');
    assert.ok(!src.match(/galaxyMesh\.renderOrder\s*=\s*-[1-9]/), 'galaxyMesh should not have negative renderOrder (default 0 or >0)');

    assertOverviewSource(appSource);

    const overviewFixture = `
        function initOverviewSky() {
            gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
            uMaxPointSize: { value: overviewMaxPointSize };
            float clampedSize = min(reqSize, uMaxPointSize);
            gl_PointSize = clampedSize;
            intensity *= 1.0 - smoothstep(0.2, 0.5, r);
            if (vClampRatio < 1.0) {
                clamp(1.0 / (vClampRatio * vClampRatio), 1.0, 10.0);
            }
            overviewSky = new THREE.Points(geo, overviewSkyMaterial);
        }
        overviewSky.renderOrder = -1;
        const docs = "https://example.test//overview/*reference*/";
    `;
    assert.doesNotThrow(() => assertOverviewSource(overviewFixture), 'Mutation fixture should satisfy every overview assertion before mutation');

    const overviewMutations = [
        ['initialization', 'function initOverviewSky() {'],
        ['render order', 'overviewSky.renderOrder = -1;'],
        ['hardware-cap query', 'gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);'],
        ['uniform wiring', 'uMaxPointSize: { value: overviewMaxPointSize };'],
        ['point-size clamp', 'float clampedSize = min(reqSize, uMaxPointSize);'],
        ['point-size assignment', 'gl_PointSize = clampedSize;'],
        ['compensation', 'clamp(1.0 / (vClampRatio * vClampRatio), 1.0, 10.0);'],
        ['companion branch', 'if (vClampRatio < 1.0) {'],
        ['ordered companion falloff', 'intensity *= 1.0 - smoothstep(0.2, 0.5, r);'],
        ['overview construction', 'overviewSky = new THREE.Points(geo, overviewSkyMaterial);']
    ];
    for (const [name, snippet] of overviewMutations) {
        const mutatedSource = overviewFixture.replace(snippet, `/* ${snippet} */`);
        assert.throws(
            () => assertOverviewSource(mutatedSource),
            undefined,
            `Commenting out overview ${name} must fail executable-source assertions`
        );
    }
    assert.ok(
        stripComments(overviewFixture).includes('https://example.test//overview/*reference*/'),
        'Comment stripping should preserve comment-like text inside quoted URLs'
    );

    console.log('GREEN: Overview rendering regression tests passed.');
} catch (e) {
    console.error('RED (Overview Blocker):', e.message);
    process.exit(1);
}

try {
    // Selection Wiring
    function assertSelectionWiring(source) {
        const focusHopIdx = source.indexOf('function focusHop');
        assert.ok(focusHopIdx > -1, 'focusHop function must exist');
        const focusHopEnd = source.indexOf('function', focusHopIdx + 1);
        const focusHopBody = source.substring(focusHopIdx, focusHopEnd > -1 ? focusHopEnd : source.length);
        assert.ok(!focusHopBody.includes('highlightStar('), 'focusHop must NOT call highlightStar directly');

        const finishIdx = source.indexOf('function finishFlightTransition');
        assert.ok(finishIdx > -1, 'finishFlightTransition function must exist');
        const finishEnd = source.indexOf('function', finishIdx + 1);
        const finishBody = source.substring(finishIdx, finishEnd > -1 ? finishEnd : source.length);

        assert.match(finishBody, /if\s*\(\s*commitDestination\s*\)\s*\{[\s\S]*?highlightStar\s*\(/, 'finishFlightTransition must commit highlightStar');
        assert.match(finishBody, /else\s*\{[\s\S]*?currentHopIndex\s*=\s*committedHopIndex;[\s\S]*?highlightStar\s*\(/, 'finishFlightTransition must rollback highlightStar');
    }
    assertSelectionWiring(src);

    console.log('GREEN: Selection wiring tests passed.');
} catch (e) {
    console.error('RED (Selection Wiring):', e.message);
    process.exit(1);
}
