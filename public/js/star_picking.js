(function (root, factory) {
    if (typeof exports === 'object' && typeof module === 'object') {
        module.exports = factory();
    } else {
        root.StarPicking = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    function pickStarScreenSpace(positions, starData, viewProj, bounds, pointerX, pointerY, pointerType) {
        let radius = 12;
        if (pointerType === 'pen') {
            radius = 16;
        } else if (pointerType === 'touch') {
            radius = 24;
        }

        const radiusSq = radius * radius;

        const px = pointerX - bounds.left;
        const py = pointerY - bounds.top;

        if (px < 0 || py < 0 || px > bounds.width || py > bounds.height) {
            return -1;
        }

        const m0 = viewProj[0], m4 = viewProj[4], m8 = viewProj[8], m12 = viewProj[12];
        const m1 = viewProj[1], m5 = viewProj[5], m9 = viewProj[9], m13 = viewProj[13];
        const m2 = viewProj[2], m6 = viewProj[6], m10 = viewProj[10], m14 = viewProj[14];
        const m3 = viewProj[3], m7 = viewProj[7], m11 = viewProj[11], m15 = viewProj[15];

        let bestIndex = -1;
        let minDistSq = Infinity;
        let bestDepth = Infinity;

        const numStars = starData.length;
        for (let i = 0; i < numStars; i++) {
            const data = starData[i];
            if (!data) continue;

            if (data.n && data.n.startsWith('GAL-')) continue;

            const idx3 = i * 3;
            const x = positions[idx3];
            const y = positions[idx3 + 1];
            const z = positions[idx3 + 2];

            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

            const clipW = x * m3 + y * m7 + z * m11 + m15;
            if (clipW <= 0) continue;

            const clipZ = x * m2 + y * m6 + z * m10 + m14;
            if (clipZ < -clipW || clipZ > clipW) continue;

            const clipX = x * m0 + y * m4 + z * m8 + m12;
            if (clipX < -clipW || clipX > clipW) continue;
            const ndcX = clipX / clipW;
            const screenX = (ndcX + 1.0) * 0.5 * bounds.width;

            const dx = screenX - px;
            if (Math.abs(dx) > radius) continue;

            const clipY = x * m1 + y * m5 + z * m9 + m13;
            if (clipY < -clipW || clipY > clipW) continue;
            const ndcY = clipY / clipW;
            const screenY = (-ndcY + 1.0) * 0.5 * bounds.height;

            const dy = screenY - py;
            if (Math.abs(dy) > radius) continue;

            const distSq = dx * dx + dy * dy;
            if (distSq <= radiusSq) {
                const depth = clipZ / clipW;

                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    bestDepth = depth;
                    bestIndex = i;
                } else if (distSq === minDistSq) {
                    if (depth < bestDepth) {
                        bestDepth = depth;
                        bestIndex = i;
                    } else if (depth === bestDepth) {
                        if (i < bestIndex) {
                            bestIndex = i;
                        }
                    }
                }
            }
        }

        return bestIndex;
    }

    return { pickStarScreenSpace };
});
