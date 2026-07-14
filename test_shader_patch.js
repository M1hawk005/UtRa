const fs = require('fs');
const assert = require('assert');

const appJsSource = fs.readFileSync(__dirname + '/public/app.js', 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');

const match = appJsSource.match(/function patchSkyShader\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
if (!match) {
    console.error('RED: Could not find patchSkyShader helper in app.js');
    process.exit(1);
}

const patchSkyShaderStr = match[0];
const patchSkyShader = new Function('shader', patchSkyShaderStr + '\npatchSkyShader(shader);');

const shader = {
    uniforms: {},
    fragmentShader: `
#include <map_pars_fragment>
void main() {
#include <map_fragment>
}
`
};

try {
    patchSkyShader(shader);

    assert.ok(shader.fragmentShader.includes('texture2D( map, vUv, uLodBias )'), 'Shader must inject uLodBias into sampling path');
    assert.ok(!shader.fragmentShader.includes('#include <map_fragment>'), 'Shader must replace map_fragment include');
    console.log('GREEN: Shader patch successful.');
} catch (e) {
    console.error('RED:', e.message);
    process.exit(1);
}
