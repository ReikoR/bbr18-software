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
    average: arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length,
    arrayMax: arr => Math.max.apply(Math, arr),
    getSampler: (count, reducer) => {
        const values = [];

        return function (value) {
            if (value !== undefined) {
                values.push(value);

                if (values.length > count) {
                    values.splice(0, 1);
                }
            }

            return reducer(values);
        };
    }
};
