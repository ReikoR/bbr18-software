const trainingUtils = require('../calibration/calibration');
let measurements = require('../calibration/measurements.json');

const minServo = 1085;
const maxServo = 1650;

const speedOffset = 560;

function reloadMeasurements () {
    delete require.cache[require.resolve('../training/measurements.json')];
    measurements = require('../calibration/measurements.json');

    console.log('RELOADED MEASUREMENTS', measurements.length);
}

function getSpeed (distance) {
    return trainingUtils.getThrowerSpeed(distance);
}

const aimOffset = 21;

const distanceToSpeedMapClose = [
    [26, 7200],
    [49, 8740],
    [80, 9800],
    [105, 10800],
    [124, 11400],
    [135, 12000],
    [145, 12450],
    [192, 13850],
    [245, 17020]
];

const distanceToSpeedMapFar = [
    [124, 8450],
    [144, 9200],
    [176, 9000],
    [215, 11050],
    [265, 12100],
    [355, 13850],
    [440, 15100],
    [520, 18100]
];

function getAimOffset(distance) {
    if (distance < 200)
        return Math.round(distance / 120 * aimOffset);
    else
        return Math.round(distance / 320 * aimOffset);
}


const angleSwapDistance = 200;

function getServoMin() {
    return minServo;
}

function getServoMax() {
    return maxServo;
}


function getAngle(distance) {
    return distance > angleSwapDistance ? minServo : maxServo;
}

function getSpeedPrev(distance) {

    let map;

    if(distance > angleSwapDistance){
        map = distanceToSpeedMapFar;
    } else {
        map = distanceToSpeedMapClose;
    }

    let lowerDistance = map[0][0];
    let higherDistance = map[map.length - 1][0];
    let lowerSpeed = map[0][1];
    let higherSpeed = map[map.length - 1][1];

    if (distance <= lowerDistance) {
        return lowerSpeed;
    }

    if (distance >= higherDistance) {
        return higherSpeed;
    }

    for (let i = 0; i < map.length - 1; i++) {
        lowerDistance = map[i][0];
        higherDistance = map[i + 1][0];
        lowerSpeed = map[i][1];
        higherSpeed = map[i + 1][1];

        if (distance === lowerDistance) {
            return lowerSpeed;
        }

        if (distance === higherDistance) {
            return higherSpeed;
        }

        if (distance > lowerDistance && distance < higherDistance) {
            break;
        }
    }

    const distanceDiff = higherDistance - lowerDistance;
    const speedDiff = higherSpeed - lowerSpeed;
    const percentage = (distance - lowerDistance) / distanceDiff;

    return ((lowerSpeed + speedDiff * percentage) + speedOffset);
}

module.exports = {
    getSpeed,
    getSpeedPrev,
    getAimOffset,
    getAngle,
    reloadMeasurements,
    getServoMin,
    getServoMax
};
