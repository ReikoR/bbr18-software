module.exports = {
    clamp: (value, min, max) => {
        return Math.min(Math.max(value, min), max);
    },
    average: arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length
};