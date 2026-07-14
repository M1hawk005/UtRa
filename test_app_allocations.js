const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/public/app.js', 'utf8');

try {
    // Check no new THREE.Vector3 or .clone() in getGalaxyFrame
    const getGalaxyFrameMatch = src.match(/function getGalaxyFrame\(\) \{([\s\S]*?)\n\}/);
    assert.ok(getGalaxyFrameMatch, 'Should find getGalaxyFrame function');
    const getGalaxyFrameBody = getGalaxyFrameMatch[1];
    assert.ok(getGalaxyFrameBody.includes('_galaxyDiskX.set'), 'getGalaxyFrame should contain expected logic');
    assert.ok(!getGalaxyFrameBody.includes('new THREE.Vector3'), 'getGalaxyFrame should not contain new THREE.Vector3');
    assert.ok(!getGalaxyFrameBody.includes('.clone('), 'getGalaxyFrame should not contain .clone()');

    // Check no new THREE.Vector3 or .clone() in animate loop
    const animateMatch = src.match(/function animate\(\) \{([\s\S]*?)\n\}/);
    assert.ok(animateMatch, 'Should find animate function');
    const animateBody = animateMatch[1];
    assert.ok(animateBody.includes('requestAnimationFrame'), 'animate should contain requestAnimationFrame');
    assert.ok(animateBody.includes('renderer.render'), 'animate should contain renderer.render');
    assert.ok(!animateBody.includes('new THREE.Vector3'), 'animate should not contain new THREE.Vector3');
    assert.ok(!animateBody.includes('.clone('), 'animate should not contain .clone()');

    // Integration assertion for blocker 1: baseReticleSize passed to calculateReticleScale must match actual diameter 4.0
    const reticleScaleMatch = animateBody.match(/calculateReticleScale\([^)]+,\s*([\d.]+)\)/);
    assert.ok(reticleScaleMatch, 'Should find calculateReticleScale call in animate');
    assert.strictEqual(reticleScaleMatch[1], '4.0', 'calculateReticleScale should be called with 4.0 matching 4.0 geometry diameter');

    // Check wheel listener for object allocations
    const wheelStart = src.indexOf("addEventListener('wheel'");
    const wheelEnd = src.indexOf("passive: false", wheelStart);
    const callbackStart = src.indexOf('{', src.indexOf('=>', wheelStart));
    const callbackEnd = src.lastIndexOf('}, {', wheelEnd);
    assert.ok(callbackStart > wheelStart && callbackEnd > callbackStart, 'Should extract the wheel callback body only');
    const wheelBody = src.substring(callbackStart + 1, callbackEnd);
    assert.ok(wheelBody.includes('calculateZoom'), 'Should find wheel event listener');
    assert.ok(!wheelBody.includes('getBoundingClientRect'), 'Wheel listener should not call getBoundingClientRect (allocates DOMRect)');
    assert.ok(!wheelBody.includes('new '), 'Wheel listener should not contain new object allocations');
    assert.ok(!wheelBody.match(/:\s*\[/g), 'Wheel listener should not contain array literals');
    assert.ok(!wheelBody.match(/:\s*\{/g), 'Wheel listener should not contain object literals');
    assert.ok(!wheelBody.includes('function'), 'Wheel listener should not allocate functions');
    assert.ok(!wheelBody.includes('=>'), 'Wheel listener should not allocate arrow functions');


    console.log('GREEN: Allocations tests passed.');
} catch (e) {
    console.error('RED:', e.message);
    process.exit(1);
}
