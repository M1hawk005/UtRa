const OPACITY_FLOOR = 0.15;
const OPACITY_RANGE = 1.0 - OPACITY_FLOOR;

function getMapPose(x, y, z, frame) {
    if (!frame || !frame.viewOut || !Number.isFinite(frame.distance)) {
        throw new Error('Galaxy frame is unavailable for transition');
    }

    const target = { x, y, z };
    const cam = {
        x: x + frame.viewOut.x * frame.distance,
        y: y + frame.viewOut.y * frame.distance,
        z: z + frame.viewOut.z * frame.distance,
    };
    return { target, cam };
}

function createTransition(options = {}) {
    return {
        progress: 0,
        isFlying: false,
        isActive: false,
        phase: 'IDLE',
        opacity: 1.0,
        mapArcT: 0.0,
        arrivalT: 0.0,
        duration: options.duration || 1000,
        fadeFraction: options.fadeFraction || 0.2,
        reducedMotion: options.reducedMotion || false,
    };
}

function startTransition(state, options = {}) {
    state.isFlying = true;
    state.isActive = true;
    state.reducedMotion = options.reducedMotion ?? state.reducedMotion;

    let clampedOpacity = Math.max(OPACITY_FLOOR, state.opacity);

    if (state.reducedMotion) {
        state.phase = 'DEPARTURE';
        // Shorter fade for reduced motion
        state.progress = ((1.0 - clampedOpacity) / OPACITY_RANGE) * 0.1;
    } else {
        state.phase = 'DEPARTURE';
        state.progress = ((1.0 - clampedOpacity) / OPACITY_RANGE) * state.fadeFraction;
    }
    state.mapArcT = 0.0;
    state.arrivalT = 0.0;
    return state;
}

function interruptTransition(state) {
    if (!state.isActive) return;
    state.isFlying = false;
    state.phase = 'ARRIVAL';
    let clampedOpacity = Math.max(OPACITY_FLOOR, state.opacity);
    if (state.reducedMotion) {
        state.progress = ((clampedOpacity - OPACITY_FLOOR) / OPACITY_RANGE) * 0.1 + 0.9;
    } else {
        state.progress = ((clampedOpacity - OPACITY_FLOOR) / OPACITY_RANGE) * state.fadeFraction + (1.0 - state.fadeFraction);
    }
}

function updateTransition(state, deltaMs) {
    if (!state.isActive) return state;

    if (state.progress >= 1.0) {
        state.isFlying = false;
        state.isActive = false;
        state.phase = 'IDLE';
        state.opacity = 1.0;
        state.mapArcT = 1.0;
        state.arrivalT = 1.0;
        return state;
    }

    let newProgress = state.progress + (deltaMs / state.duration);
    if (newProgress >= 1.0) {
        newProgress = 1.0;
    }

    if (state.reducedMotion) {
        let opacity = 1.0;
        let mapArcT = 0.0;
        if (newProgress < 0.1) {
            opacity = 1.0 - OPACITY_RANGE * (newProgress / 0.1);
        } else if (newProgress < 0.9) {
            opacity = OPACITY_FLOOR;
            mapArcT = newProgress >= 0.5 ? 1.0 : 0.0;
        } else {
            opacity = OPACITY_FLOOR + OPACITY_RANGE * ((newProgress - 0.9) / 0.1);
            mapArcT = 1.0;
        }
        state.progress = newProgress;
        state.phase = newProgress < 0.1 ? 'DEPARTURE' : (newProgress < 0.9 ? 'MAP_ARC' : 'ARRIVAL');
        state.opacity = Math.max(0, Math.min(1, opacity));
        state.mapArcT = mapArcT;
        state.arrivalT = newProgress >= 0.9 ? ((newProgress - 0.9) / 0.1) : 0.0;
        return state;
    }

    const fadeOutEnd = state.fadeFraction;
    const fadeInStart = 1.0 - state.fadeFraction;

    let opacity = 1.0;
    let mapArcT = 0.0;
    let arrivalT = 0.0;
    let phase = state.phase;

    if (newProgress < fadeOutEnd) {
        phase = 'DEPARTURE';
        opacity = 1.0 - OPACITY_RANGE * (newProgress / fadeOutEnd);
        mapArcT = 0.0;
        arrivalT = 0.0;
    } else if (newProgress < fadeInStart) {
        phase = 'MAP_ARC';
        opacity = OPACITY_FLOOR;
        mapArcT = (newProgress - fadeOutEnd) / (fadeInStart - fadeOutEnd);
        arrivalT = 0.0;
    } else {
        phase = 'ARRIVAL';
        opacity = OPACITY_FLOOR + OPACITY_RANGE * ((newProgress - fadeInStart) / state.fadeFraction);
        mapArcT = 1.0;
        arrivalT = (newProgress - fadeInStart) / state.fadeFraction;
    }

    state.progress = newProgress;
    state.phase = phase;
    state.opacity = Math.max(0, Math.min(1, opacity));
    state.mapArcT = mapArcT;
    state.arrivalT = arrivalT;

    return state;
}

const transitionApi = { createTransition, startTransition, interruptTransition, updateTransition, getMapPose, OPACITY_FLOOR };

if (typeof window !== 'undefined') {
    Object.assign(window, transitionApi);
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = transitionApi;
}
