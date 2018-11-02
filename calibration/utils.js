const interpolateArray = require('2d-bicubic-interpolate').default;

exports.interpolate = function interpolate (interpolation, x, y) {
    let closestObj = interpolation[0];
    let dist = Math.abs(interpolation[0].x - x);
    for (let obj of interpolation) {
        if (Math.abs(obj.x - x )< dist) {
            dist = Math.abs(obj.x - x );
            closestObj = obj;
        }
    }
    return closestObj.z;
};

exports.getInterpolator = function getInterpolator (json, n=10) {
    const data = [];

    for (let x in json) {
        for (let y in json[x]) {
            data.push({
                x: parseInt(x),
                y: parseInt(y),
                z: json[x][y]
            });
        }
    }

    const interpolation = interpolateArray(data, n);

    return exports.interpolate.bind(exports, data);
};
