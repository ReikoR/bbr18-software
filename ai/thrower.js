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
    return trainingUtils.getThrowerSpeed(distance);
}

const aimOffset = 16;

const distanceToSpeedMapClose = [
    /*[0.26, 7700],
    [0.49, 8700],
    [0.80, 9700],
    [1.05, 11000],
    [1.45, 13000],
    [1.92, 14100],
    [2.45, 16500]*/
    [26, 7100],
    [49, 8350],
    [80, 9500],
    [105, 10730],
    [124, 11230],
    [145, 12500],
    [192, 14100],
    [245, 17100]
];

const distanceToSpeedMapFar = [
    [124, 8550],
    [144, 9200],
    [176, 9950],
    [215, 11000],
    [265, 11950],
    [355, 13800],
    [440, 15500],
    [520, 18000]
];

function getAimOffset(distance) {
    if(distance < 200)
        return 0;
    return Math.round(distance / 300 * aimOffset);
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

    return lowerSpeed + speedDiff * percentage;
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
