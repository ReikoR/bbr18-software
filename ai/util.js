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
    arrayMin: arr => Math.min.apply(Math, arr),
    arrayMax: arr => Math.max.apply(Math, arr),
    getSampler: (count, reducer) => {
        let values = [];

        return function (value, clear = false) {
            if (value !== undefined) {
                values.push(value);

                if (values.length > count) {
                    values.splice(0, 1);
                }
            }

            if (clear) {
                values = [];
            }

            return reducer(values);
        };
    },
    getRampUpper: (startValue, maxValue, rampUpTime = 1000, isLinear = true) => {
        let startTime = Date.now();

        /**
         * @param [Object] newValues
         * @param [number] newValues.startTime
         * @param [number] newValues.startValue
         * @param [number] newValues.maxValue
         * @param [number] newValues.rampUpTime
         */
        return function(newValues) {
            if (newValues) {
                if (newValues.startTime) {
                    startTime = newValues.startTime;
                }

                if (newValues.startValue) {
                    startValue = newValues.startValue;
                }

                if (newValues.maxValue) {
                    maxValue = newValues.maxValue;
                }

                if (newValues.rampUpTime) {
                    rampUpTime = newValues.rampUpTime;
                }
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
    },
    getNormalizedMetrics: function (metrics) {
        const metricsLength = Math.sqrt(metrics[0]*metrics[0] + metrics[1]*metrics[1]);

        if (metricsLength) {
            return [
                metrics[0] / metricsLength, metrics[1] / metricsLength
            ];
        }

        return [0, 0];
    },
    getNormalizedMetricsDifference: function (metrics) {
        const metricsLength = Math.sqrt(metrics[0]*metrics[0] + metrics[1]*metrics[1]);

        if (metricsLength) {
            const normalizedMetrics = [
                metrics[0] / metricsLength, metrics[1] / metricsLength
            ];

            return normalizedMetrics[0] - normalizedMetrics[1];
        }

        return 0;
    }
};
