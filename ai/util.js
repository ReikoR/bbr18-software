module.exports = {
    clamped: (value, min, max) => {
        return Math.min(Math.max(value, min), max);
    },
    clampedMin: (value, minValue) => {
        return Math.sign(value) * Math.max(Math.abs(value), (Math.abs(minValue)));
    },
    average: arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length
};