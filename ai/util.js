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
    },
    getRampUpper: (startValue, maxValue, rampUpTime = 1000, isLinear = true) => {
        let startTime = Date.now();

        return function(newStartTime) {
            if (newStartTime) {
                startTime = newStartTime;
            }

            const currentTime = Date.now();
            const timeDiff = currentTime - startTime;
            const startEndDiff = maxValue - startValue;
            const timePassedPercent = timeDiff / rampUpTime;

            if (timeDiff >= rampUpTime) {
                return maxValue;
            }

            if (isLinear) {
                return startValue + startEndDiff * timePassedPercent;
            }

            return startValue + startEndDiff * Math.pow(timePassedPercent, 2);
        };
    }
};
