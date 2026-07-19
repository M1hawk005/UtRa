function calculateSkyOpacity(galDist, transitionOpacity, isActive, opacityFloor, out) {
    // MathUtils.smoothstep equivalent
    let x = (galDist - 12000) / (25000 - 12000);
    x = Math.max(0, Math.min(1, x));
    const macroFade = x * x * (3 - 2 * x);

    let skyAlpha = 1.0 - macroFade;
    if (isActive) {
        skyAlpha = Math.max(skyAlpha * transitionOpacity, opacityFloor * (1.0 - macroFade));
    }

    // Background sky must gain spatial-frequency LOD.
    // At the outer blend edge (macroFade=1), only coarse low-frequency structure may appear.
    // Progressively reduce bias toward full resolution (lodBias=0) while moving inward (macroFade=0).
    const lodBias = macroFade * 5.0; // max ~5 mip levels at far overview

    if (out) {
        out.opacity = skyAlpha;
        out.lodBias = lodBias;
        return out;
    }
    return { opacity: skyAlpha, lodBias: lodBias };
}

function calculateOverviewOpacity(galDist, transitionOpacity, isActive, opacityFloor) {
    let x = (galDist - 12000) / (25000 - 12000);
    x = Math.max(0, Math.min(1, x));
    const macroFade = x * x * (3 - 2 * x);

    let overviewAlpha = macroFade;
    if (isActive) {
        overviewAlpha *= transitionOpacity;
    }

    return overviewAlpha;
}



function calculateDetailLOD(dist, fovDegrees, viewportHeight) {
    // Continuous LOD morph across a camera-distance band wider than one wheel step.
    // Transition band: distance 32.0 (far, morph starts) down to 21.0 (close, morph ends)
    const distFar = 32.0;
    const distClose = 21.0;

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

function calculateMinDistance(modelRadius, maxFraction, fovDegrees) {
    const maxRad = maxFraction * fovDegrees * Math.PI / 180;
    return modelRadius / Math.tan(maxRad / 2);
}

function calculateInspectionScale(cameraDist, fovDegrees, viewportWidth, viewportHeight, targetFraction) {
    if (!Number.isFinite(cameraDist) || !Number.isFinite(fovDegrees) || !Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || !Number.isFinite(targetFraction)) {
        return 1.0;
    }
    if (cameraDist <= 0 || fovDegrees <= 0 || viewportWidth <= 0 || viewportHeight <= 0 || targetFraction <= 0) {
        return 1.0;
    }

    const shortDim = Math.min(viewportWidth, viewportHeight);
    const targetPhysicalHeight = (shortDim * targetFraction) / viewportHeight;
    const fovRad = (fovDegrees * Math.PI) / 180;
    const viewHeightAtDist = 2 * cameraDist * Math.tan(fovRad / 2);

    const targetDiameterWorld = targetPhysicalHeight * viewHeightAtDist;
    const scale = targetDiameterWorld / 2.0;

    return Number.isFinite(scale) && scale > 0 ? scale : 1.0;
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
        case 'K': return 0xffb56c;
        case 'M': return 0xff5522;
        default: return 0xffffff;
    }
}

function getPhotosphereParams(spectrum, identityStr) {
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

    // Hash the spectrum string for a stable deterministic seed
    let hash = 0;
    const safeSpec = spectrum || 'Unknown';
    const safeId = (identityStr !== undefined && identityStr !== null) ? String(identityStr) : '';
    const combined = safeSpec + '|' + safeId;
    for (let i = 0; i < combined.length; i++) {
        hash = (hash << 5) - hash + combined.charCodeAt(i);
        hash |= 0;
    }
    const seed = (Math.abs(hash) % 1000) / 1000.0;

    // Derived deterministic activity profile based on seed
    const activity = 0.5 + 0.5 * Math.sin(seed * Math.PI * 2.0);

    return {
        baseColor,
        limbDarkening,
        granulationContrast,
        granulationScale,
        seed,
        activity
    };
}

function calculateReducedMotionTime(time, reducedMotion) {
    if (reducedMotion) {
        // Slow down time by a factor of 100 to reduce motion drastically
        return time * 0.01;
    }
    return time;
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

function updateRouteMarkerVisibility(hideAttrArray, activeIndex) {
    if (!hideAttrArray) return false;
    let changed = false;
    for (let i = 0; i < hideAttrArray.length; i++) {
        const expected = i === activeIndex ? 1.0 : 0.0;
        if (hideAttrArray[i] !== expected) {
            hideAttrArray[i] = expected;
            changed = true;
        }
    }
    return changed;
}



if (typeof module !== 'undefined') {
    module.exports = {
        calculateSkyOpacity,
        calculateOverviewOpacity,
        calculateDetailLOD,
        getSpectralColorHex,
        applyMaterialOpacity,
        calculateReticleScale,
        calculateReticleOpacity,
        calculateRouteOpacity,
        calculateMinDistance,
        getProvenance,
        updateRouteMarkerVisibility,
        getPhotosphereParams,
        calculateReducedMotionTime,
        calculateInspectionScale
    };
}
