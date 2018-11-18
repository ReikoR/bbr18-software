module.exports = {
    clamped: (value, min, max) => {
        return Math.min(Math.max(value, min), max);
    },
    clampedMin: (value, minValue) => {
        return Math.sign(value) * Math.max(Math.abs(value), (Math.abs(minValue)));
    },
    mapFromRangeToRange: function(value, inMin, inMax, outMin, outMax) {
        if (value < inMin) {
            return outMin;
        } else if (value > inMax) {
            return outMax;
        }

        return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    },
    average: arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length
};