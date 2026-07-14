

function calculateReticleScale(dist, fov, viewportHeight, targetCssPx, baseReticleSize) {
    const fovRad = (fov * Math.PI) / 180;
    const viewHeightAtDist = 2 * dist * Math.tan(fovRad / 2);
    const scale = (targetCssPx / viewportHeight) * (viewHeightAtDist / baseReticleSize);
    return Math.max(0.001, scale);
}

function calculateReticleOpacity(dist) {
    // Fade to <=0.08 once detail is visible (dist < 5-10 ish)
    // E.g. at dist < 4 opacity is 0, at dist > 15 opacity is 1
    let x = (dist - 4.0) / (15.0 - 4.0);
    x = Math.max(0.0, Math.min(1.0, x));
    return x * x * (3 - 2 * x); // smoothstep
}

function calculateRouteOpacity(dist) {
    // Fully visible >= 16
    // Effectively zero <= 13 (inspection entry threshold)
    let x = (dist - 13.0) / (16.0 - 13.0);
    x = Math.max(0.0, Math.min(1.0, x));
    return x * x * (3 - 2 * x); // smoothstep
}


function applyMaterialOpacity(material, opacityValue) {
    if (!material) return;
    if (material.uniforms && material.uniforms.uTransitionOpacity) {
        material.uniforms.uTransitionOpacity.value = opacityValue;
    } else if (material.opacity !== undefined) {
        material.opacity = opacityValue;
        if (!material.transparent) {
            material.transparent = true;
        }
    }
}

if (typeof module !== 'undefined') {
    module.exports = {
        applyMaterialOpacity,
        calculateReticleScale,
        calculateReticleOpacity,
        calculateRouteOpacity
    };
}
