const distanceToSpeedMap = [
    [32, 7500],
    [41, 7500],
    [50, 7500],
    [61, 7500],
    [71, 7500],
    [80, 7500],
    [90, 7600],
    [100, 8000],
    [110, 8300],
    [120, 8500],
    [130, 8900],
    [176, 9600],
    [197, 10200],
    [214, 10700],
    [228, 11100],
    [257, 11700],
    [299, 12500]
];

function getSpeed(distance) {
    let lowerDistance = distanceToSpeedMap[0][0];
    let higherDistance = distanceToSpeedMap[distanceToSpeedMap.length - 1][0];
    let lowerSpeed = distanceToSpeedMap[0][1];
    let higherSpeed = distanceToSpeedMap[distanceToSpeedMap.length - 1][1];

    if (distance <= lowerDistance) {
        return lowerSpeed;
    }

    if (distance >= higherDistance) {
        return higherSpeed;
    }

    for (let i = 0; i < distanceToSpeedMap.length - 1; i++) {
        lowerDistance = distanceToSpeedMap[i][0];
        higherDistance = distanceToSpeedMap[i + 1][0];
        lowerSpeed = distanceToSpeedMap[i][1];
        higherSpeed = distanceToSpeedMap[i + 1][1];

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
    getSpeed: getSpeed
};