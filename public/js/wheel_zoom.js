let accumulatedWheelDelta = 0;

function accumulateWheelDelta(deltaY, deltaMode, viewportHeight = 800) {
    let normalizedPixels = deltaY;
    if (deltaMode === 1) { // Line mode
        normalizedPixels *= 16;
    } else if (deltaMode === 2) { // Page mode
        normalizedPixels *= viewportHeight;
    }

    accumulatedWheelDelta += normalizedPixels;

    if (Math.abs(accumulatedWheelDelta) >= 0.999) {
        const applyDelta = accumulatedWheelDelta;
        accumulatedWheelDelta = 0;
        return applyDelta;
    }

    return 0;
}

function resetWheelAccumulator() {
    accumulatedWheelDelta = 0;
}

function calculateZoom({
    cameraPos,
    targetPos,
    cursorRayDir,
    deltaY,
    deltaMode,
    viewportHeight = 800,
    zoomSpeed,
    minDistance,
    maxDistance,
    out
}) {
    if (deltaY === 0) return null;

    let normalizedPixels = Math.abs(deltaY);
    if (deltaMode === 1) { // Line mode
        normalizedPixels *= 16;
    } else if (deltaMode === 2) { // Page mode
        normalizedPixels *= viewportHeight;
    }

    let exponent = normalizedPixels / 100.0;
    if (exponent > 4) {
        exponent = 4; // Cap single event
    }

    const dx = cameraPos[0] - targetPos[0];
    const dy = cameraPos[1] - targetPos[1];
    const dz = cameraPos[2] - targetPos[2];
    const oldDistance = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (oldDistance === 0) return null;

    // Use sign to determine scale
    let factor = Math.pow(0.95, zoomSpeed * exponent);
    if (deltaY > 0) factor = 1.0 / factor;

    let newDistance = oldDistance * factor;
    if (newDistance < minDistance) newDistance = minDistance;
    if (newDistance > maxDistance) newDistance = maxDistance;

    const deltaDist = oldDistance - newDistance;
    if (deltaDist === 0) return null;

    if (!out) out = { newCameraPos: [0,0,0], newTarget: [0,0,0] };

    out.newCameraPos[0] = cameraPos[0] + cursorRayDir[0] * deltaDist;
    out.newCameraPos[1] = cameraPos[1] + cursorRayDir[1] * deltaDist;
    out.newCameraPos[2] = cameraPos[2] + cursorRayDir[2] * deltaDist;

    // forward is target - camera -> (-dx, -dy, -dz)
    const fwdX = -dx / oldDistance;
    const fwdY = -dy / oldDistance;
    const fwdZ = -dz / oldDistance;

    out.newTarget[0] = out.newCameraPos[0] + fwdX * newDistance;
    out.newTarget[1] = out.newCameraPos[1] + fwdY * newDistance;
    out.newTarget[2] = out.newCameraPos[2] + fwdZ * newDistance;
    out.newDistance = newDistance;

    return out;
}

if (typeof module !== 'undefined') {
    module.exports = { calculateZoom, accumulateWheelDelta, resetWheelAccumulator };
}
