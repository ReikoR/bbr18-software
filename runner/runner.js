const childProcess = require('child_process');
const path = require('path');

const components = [
    {
        name: 'hub',
        type: 'node',
        path: '../hub/hub.js'
    },
    {
        name: 'mainboard',
        type: 'node',
        path: '../mainboard/mainboard.js'
    },
    {
        name: 'vision',
        type: 'exe',
        path: '../vision/cmake-build-release/bbr18_vision.exe'
    },
    {
        name: 'mainboard',
        type: 'node',
        path: '../mainboard/mainboard.js'
    }
];

components.forEach((component) => {
    if (component.type === 'exe') {
        console.log(path.dirname(path.resolve(__dirname, component.path)));
        const process = childProcess.spawn(path.resolve(__dirname, component.path), {
            cwd: path.dirname(path.resolve(__dirname, component.path))
        });

        process.on('error', (err) => {
            console.log('Failed to start subprocess.', err);
        });

        process.stdout.on('data', (data) => {
            console.log(`child stdout:\n${data}`);
        });

        process.stderr.on('data', (data) => {
            console.error(`child stderr:\n${data}`);
        });

        process.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
        });

        process.on('exit', function (code, signal) {
            console.log(`child process exited with code ${code} and signal ${signal}`);
        });
    } else if (component.type === 'node') {

    }
});