const trainingUtils = require('../calibration/calibration');
let measurements = require('../calibration/measurements.json');

const minServo = 1085;
const maxServo = 1650;

function reloadMeasurements () {
    delete require.cache[require.resolve('../training/measurements.json')];
    measurements = require('../calibration/measurements.json');

    console.log('RELOADED MEASUREMENTS', measurements.length);
}

function getSpeed (distance) {
    return trainingUtils.interpolate(measurements, distance);
}

const distanceToSpeedMapClose = [
    [0.26, 7700],
    [0.49, 8700],
    [0.80, 9700],
    [1.05, 11000],
    [1.45, 13000],
    [1.92, 14100],
    [2.45, 16500]
];

const distanceToSpeedMapFar = [
    [1.44, 8500],
    [1.76, 9500],
    [2.15, 10650],
    [2.65, 11700],
    [3.55, 13700],
    [4.40, 14920],
    [5.20, 17000]
];

const angleSwapDistance = 2.2;

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

    return lowerSpeed + speedDiff * percentage;
}

module.exports = {
    getSpeed,
    getSpeedPrev,
    getAngle,
    reloadMeasurements,
    getServoMin,
    getServoMax
};
