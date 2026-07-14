function calculateSkyOpacity(galDist, out) {
    // MathUtils.smoothstep equivalent
    let x = (galDist - 12000) / (25000 - 12000);
    x = Math.max(0, Math.min(1, x));
    const macroFade = x * x * (3 - 2 * x);

    let skyAlpha = 1.0 - macroFade;

    // Background sky must gain spatial-frequency LOD.
    // At the outer blend edge (macroFade=1), only coarse low-frequency structure may appear.
    // Progressively reduce bias toward full resolution (lodBias=0) while moving inward (macroFade=0).
    const lodBias = macroFade * 5.0; // max ~5 mip levels at map edge

    if (out) {
        out.opacity = skyAlpha;
        out.lodBias = lodBias;
        return out;
    }
    return { opacity: skyAlpha, lodBias: lodBias };
}

function calculateDetailLOD(dist, fovDegrees, viewportHeight) {
    // Transition band: distance 18.0 (far, morph starts) down to 8.0 (close, morph ends)
    const distFar = 18.0;
    const distClose = 8.0;

    let t = (distFar - dist) / (distFar - distClose);
    t = Math.max(0.0, Math.min(1.0, t));

    // Detail opacity continuous 0->1
    const detailOpacity = t * t * (3 - 2 * t); // smoothstep

    // Detail mesh scale begins at an apparent unresolved-point-compatible size
    // Calculate projected size of physical scale 1 at distFar:
    const fovRad = (fovDegrees * Math.PI) / 180;
    const viewHeightAtFar = 2 * distFar * Math.tan(fovRad / 2);
    const projPxAtFar = (2.0 / viewHeightAtFar) * viewportHeight;

    // We want the starting apparent size to be ~4px
    const targetStartPx = 4.0;
    const startScale = Math.min(1.0, targetStartPx / projPxAtFar);

    // Smoothly grow scale from startScale to 1.0
    const detailScale = startScale + detailOpacity * (1.0 - startScale);

    // Selected point remains during early morph and fades complementarily only as the photosphere becomes legible
    // We fade the point opacity in the latter half of the transition (t=0.3 to 1.0)
    let pt = (t - 0.3) / 0.7;
    pt = Math.max(0.0, Math.min(1.0, pt));
    const pointOpacity = 1.0 - pt * pt * (3 - 2 * pt);

    return {
        detailOpacity: detailOpacity,
        detailScale: detailScale,
        pointOpacity: pointOpacity,
        visible: detailOpacity > 0.0 // imperceptible optimization
    };
}

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

function getProvenance(isSol, isProcedural) {
    if (isProcedural) return null;
    if (isSol) return 'Observed: <a href="https://svs.gsfc.nasa.gov/3712/" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">NASA/GSFC/SDO HMI</a>';
    return 'Inferred photosphere &middot; normalized inspection scale';
}

function getSpectralColorHex(spectrum) {
    if (!spectrum || spectrum.length === 0) return 0xffffff;
    const cls = spectrum.charAt(0).toUpperCase();
    switch(cls) {
        case 'O': return 0x9bb0ff;
        case 'B': return 0xaabfff;
        case 'A': return 0xcad7ff;
        case 'F': return 0xf8f7ff;
        case 'G': return 0xfff4ea;
        case 'K': return 0xffd2a1;
        case 'M': return 0xffcc6f;
        default: return 0xffffff;
    }
}

function getPhotosphereParams(spectrum) {
    if (!spectrum) spectrum = 'G';
    const cls = spectrum.charAt(0).toUpperCase();
    const baseColor = getSpectralColorHex(cls);

    // Default F/G like params
    let limbDarkening = 0.6; // Coefficient for center-to-limb
    let granulationContrast = 0.2; // Contrast of granules
    let granulationScale = 30.0; // Base frequency

    // Vary based on class
    switch(cls) {
        case 'O':
        case 'B':
            limbDarkening = 0.3; // Hot stars have less limb darkening
            granulationContrast = 0.05; // Less convective envelope
            granulationScale = 15.0;
            break;
        case 'A':
            limbDarkening = 0.4;
            granulationContrast = 0.1;
            granulationScale = 20.0;
            break;
        case 'F':
            limbDarkening = 0.5;
            granulationContrast = 0.25;
            granulationScale = 25.0;
            break;
        case 'G':
            limbDarkening = 0.6;
            granulationContrast = 0.35;
            granulationScale = 35.0;
            break;
        case 'K':
            limbDarkening = 0.7;
            granulationContrast = 0.45;
            granulationScale = 45.0;
            break;
        case 'M':
            limbDarkening = 0.8;
            granulationContrast = 0.6; // Cool stars have deep convection and huge contrast
            granulationScale = 10.0; // Giant granules on dwarfs/giants
            break;
    }

    return {
        baseColor,
        limbDarkening,
        granulationContrast,
        granulationScale
    };
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
        calculateSkyOpacity,
        calculateDetailLOD,
        getSpectralColorHex,
        applyMaterialOpacity,
        calculateReticleScale,
        calculateReticleOpacity,
        calculateRouteOpacity,
        getProvenance,
        getPhotosphereParams
    };
}
