const thrower = require('./thrower');

for (let i = 0; i <= 310; i += 10) {
    console.log(i, thrower.getSpeed(i));
}