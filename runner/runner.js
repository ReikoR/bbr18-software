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
        name: 'ai',
        type: 'node',
        path: '../ai/ai.js'
    }
];

components.forEach((component) => {
    if (component.type === 'exe') {
        console.log(path.dirname(path.resolve(__dirname, component.path)));

        const process = childProcess.spawn(path.resolve(__dirname, component.path), {
            cwd: path.dirname(path.resolve(__dirname, component.path))
        });

        process.on('error', (err) => {
			console.log('Failed to start', component.name, err);
        });

        process.stdout.on('data', (data) => {
            console.log(`${component.name} stdout:\n${data}`);
        });

        process.stderr.on('data', (data) => {
            console.error(`${component.name} stderr:\n${data}`);
        });

        process.on('exit', function (code, signal) {
            console.log(`${component.name} exited with code ${code} and signal ${signal}`);
        });
    } else if (component.type === 'node') {
		console.log(path.dirname(path.resolve(__dirname, component.path)));

		const process = childProcess.spawn('node', [path.resolve(__dirname, component.path)], {
			cwd: path.dirname(path.resolve(__dirname, component.path))
		});

		process.on('error', (err) => {
			console.log('Failed to start', component.name, err);
		});

		process.stdout.on('data', (data) => {
			console.log(`${component.name} stdout:\n${data}`);
		});

		process.stderr.on('data', (data) => {
			console.error(`${component.name} stderr:\n${data}`);
		});

		process.on('exit', function (code, signal) {
			console.log(`${component.name} exited with code ${code} and signal ${signal}`);
		});
    }
});