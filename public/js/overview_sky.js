function overviewRandom(seed) {
    return function() {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function randomSpherePoint(rnd) {
    const theta = rnd() * 2 * Math.PI;
    const phi = Math.acos(2 * rnd() - 1);
    return {
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi)
    };
}

function generateOverviewDescriptors(seed = 0x054321) {
    const rnd = overviewRandom(seed);
    const sources = [];
    const smudges = [];
    const companions = [];

    // 1. Unresolved sources (2500)
    while (sources.length < 2500) {
        const pt = randomSpherePoint(rnd);
        // Mild clustering: broad low-order density modulation
        const density = (Math.sin(3.5 * pt.x) * Math.cos(3.5 * pt.y) + Math.sin(3.5 * pt.z) + 2.0) / 4.0;
        if (rnd() > Math.pow(density, 1.5)) continue;

        const isWarm = rnd() < 0.65;
        // Warm/neutral redshifted vs cool/star-forming
        let r, g, b;
        if (isWarm) {
            r = 0.9 + rnd() * 0.1;
            g = 0.7 + rnd() * 0.2;
            b = 0.5 + rnd() * 0.2;
        } else {
            r = 0.6 + rnd() * 0.2;
            g = 0.8 + rnd() * 0.2;
            b = 0.9 + rnd() * 0.1;
        }

        // Heavy faint tail, small brighter tail
        const alpha = 0.10 + Math.pow(rnd(), 4.0) * 0.24; // 0.10 to 0.34

        sources.push({
            x: pt.x, y: pt.y, z: pt.z,
            size: 2.2 + rnd() * 2.0, // 2.2 to 4.2
            alpha: alpha,
            r: r, g: g, b: b,
            rotation: 0.0,
            aspect: 1.0,
            classType: 0.0 // Source
        });
    }

    // 2. Smudges (300)
    while (smudges.length < 300) {
        const pt = randomSpherePoint(rnd);
        const density = (Math.sin(3.5 * pt.x) * Math.cos(3.5 * pt.y) + Math.sin(3.5 * pt.z) + 2.0) / 4.0;
        if (rnd() > Math.pow(density, 1.5)) continue;

        const isWarm = rnd() < 0.75;
        let r, g, b;
        if (isWarm) {
            r = 0.85 + rnd() * 0.15;
            g = 0.75 + rnd() * 0.15;
            b = 0.65 + rnd() * 0.15;
        } else {
            r = 0.65 + rnd() * 0.15;
            g = 0.75 + rnd() * 0.15;
            b = 0.85 + rnd() * 0.15;
        }

        const alpha = 0.10 + Math.pow(rnd(), 3.0) * 0.20; // 0.10 to 0.30

        smudges.push({
            x: pt.x, y: pt.y, z: pt.z,
            size: 9.0 + rnd() * 17.0, // 9 to 26
            alpha: alpha,
            r: r, g: g, b: b,
            rotation: rnd() * Math.PI,
            aspect: 0.2 + rnd() * 0.6, // 0.2 to 0.8
            classType: 1.0 // Smudge
        });
    }

    // 3. Companions (3)
    // Place them explicitly inside the default camera frustum, derived from default camera target orientation.
    // C1: Top Right of screen (M31-like)
    // C2: Bottom Right of screen (M33/dwarf-like)
    // C3: Offscreen Top Left (for orbiting)
    const companionCoords = [
        { theta: 1.1657, phi: 1.6105, sizeMin: 65.0, sizeRange: 30.0, aspectMin: 0.12, aspectRange: 0.15, alphaMin: 0.14, alphaRange: 0.10, rot: 0.3 }, // M31-like
        { theta: 0.8824, phi: 2.2655, sizeMin: 38.0, sizeRange: 22.0, aspectMin: 0.45, aspectRange: 0.2, alphaMin: 0.12, alphaRange: 0.08, rot: null }, // smaller dwarf-like
        { theta: 2.5674, phi: 1.7613, sizeMin: 30.0, sizeRange: 25.0, aspectMin: 0.4, aspectRange: 0.4, alphaMin: 0.10, alphaRange: 0.12, rot: null }  // offscreen
    ];
    for (let i = 0; i < 3; i++) {
        const c = companionCoords[i];
        const cx = Math.sin(c.phi) * Math.cos(c.theta);
        const cy = Math.sin(c.phi) * Math.sin(c.theta);
        const cz = Math.cos(c.phi);

        companions.push({
            x: cx, y: cy, z: cz,
            size: c.sizeMin + rnd() * c.sizeRange,
            alpha: c.alphaMin + rnd() * c.alphaRange,
            r: 0.85 + rnd() * 0.15, g: 0.9 + rnd() * 0.1, b: 0.95 + rnd() * 0.05,
            rotation: c.rot !== null ? c.rot + (rnd() - 0.5) * 0.4 : rnd() * Math.PI,
            aspect: c.aspectMin + rnd() * c.aspectRange,
            classType: 2.0 + i // Companion variant
        });
    }

    return { sources, smudges, companions };
}

if (typeof module !== 'undefined') {
    module.exports = {
        generateOverviewDescriptors
    };
}
