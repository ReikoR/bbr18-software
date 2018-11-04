const interpolateArray = require('2d-bicubic-interpolate').default;

exports.interpolate1 = function interpolate (interpolation, x, y) {
    let closestObj;
    let closestDist;

    for (let obj of interpolation) {
        // Rescale x and y to between 0-1 before calculating distance
        // TODO: is this needed?
        const dist = exports.getDistanceSquared(obj, { x, y });

        if (!closestObj || dist < closestDist) {
            closestObj = obj;
            closestDist = dist;
        }
    }

    return closestObj.z;
};

exports.interpolate = function interpolate (data, x, y) {
    const sortedData = [ ...data ].sort((a, b) =>
        Math.abs(a.x - x) - Math.abs(b.x - x)
    );

    // Find two closest objects with different x-positions
    const obj1 = sortedData[0];
    const obj2 = sortedData.find(obj => obj.x !== obj1.x);

    // Get 2 closest object interpolation
    const a = (obj1.z - obj2.z) / (obj1.x - obj2.x);
    const b = obj1.z - a*obj1.x; 
    const z = a*x + b; 

    return z;
};

exports.getInterpolator = function getInterpolator (data, n=10) {
    const interpolation = interpolateArray(data, n);

    return exports.interpolate1.bind(exports, interpolation);
};

exports.getDistance = function (obj1, obj2) {
    return Math.sqrt(exports.getDistanceSquared(obj1, obj2));
};

exports.getDistanceSquared = function (obj1, obj2) {
    return Math.pow(obj1.x - obj2.x, 2) + Math.pow(obj1.y - obj2.y, 2);
};
