const childProcess = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const components = {
    hub: {
        name: 'hub',
        type: 'node',
        path: '../hub/hub.js',
        process: null
    },
    mainboard: {
        name: 'mainboard',
        type: 'node',
        path: '../mainboard/mainboard.js',
        process: null
    },
    vision: {
        name: 'vision',
        type: 'exe',
        path: '../vision/cmake-build-release/bbr18_vision.exe',
        process: null
    },
    ai: {
        name: 'ai',
        type: 'node',
        path: '../ai/ai.js',
        process: null
    }
};

app.use(express.static('public'));
app.use(express.json());

app.get('/components', (request, response) => {
    const componentInfo = {};

    for (let id in components) {
        const component = components[id];

        componentInfo[id] = {
            name: component.name,
            isRunning: component.process !== null
        }
    }

    response.json(componentInfo);
});

app.get('/start/:name', (request, response) => {
    startComponent(request.params.name);

    response.sendStatus(200);
});

app.get('/stop/:name', (request, response) => {
    stopComponent(request.params.name);

    response.sendStatus(200);
});

app.get('/conf/:name', (request, response) => {
    if (!components[request.params.name]) {
        return response.sendStatus(404);
    }

    fs.readFile(`../${request.params.name}/public-conf.json`, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return response.sendStatus(404);
        }

        try {
            response.json(JSON.parse(data));
        } catch (e) {
            console.error(err);
            return response.sendStatus(404);
        }
    });
});

app.put('/conf/:name', (request, response) => {
    console.log(request.method, request.url);

    console.log(request.body);

    if (!components[request.params.name]) {
        return response.sendStatus(404);
    }

    if (!request.body) {
        return response.sendStatus(400);
    }

    fs.writeFile(`../${request.params.name}/public-conf.json`, JSON.stringify(request.body, null, 2), 'utf8', function (err) {
        if (err) {
            console.error(err);
            return response.sendStatus(404);
        }

        response.sendStatus(200);
    });
});

wss.on('connection', function connection(ws, req) {
    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
    });

    ws.send('something');
});

server.listen(8079, function listening() {
    console.log('Listening on %d', server.address().port);
});

function startComponent(name) {
    const component = components[name];

    if (component && component.process === null) {
        console.log(path.dirname(path.resolve(__dirname, component.path)));

        if (component.type === 'exe') {
            component.process = childProcess.spawn(path.resolve(__dirname, component.path), {
                cwd: path.dirname(path.resolve(__dirname, component.path))
            });

        } else if (component.type === 'node') {
            component.process = childProcess.spawn('node', [path.resolve(__dirname, component.path)], {
                cwd: path.dirname(path.resolve(__dirname, component.path))
            });
        }

        if (component.process) {
            component.process.on('error', (err) => {
                console.log('Failed to start', component.name, err);
            });

            component.process.stdout.on('data', (data) => {
                console.log(`${component.name} stdout:\n${data}`);
            });

            component.process.stderr.on('data', (data) => {
                console.error(`${component.name} stderr:\n${data}`);
            });

            component.process.on('exit', function (code, signal) {
                console.log(`${component.name} exited with code ${code} and signal ${signal}`);
            });
        }
    }
}

function stopComponent(name) {
    const component = components[name];

    if (component && component.process !== null) {
        component.process.kill();
        component.process = null;
    }
}