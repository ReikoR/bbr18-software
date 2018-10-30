const childProcess = require('child_process');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const robotName = process.argv[2];

socket.on('error', (err) => {
    console.log(`socket error:\n${err.stack}`);
    socket.close();
});

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
    goal_distance: {
        name: 'goal_distance',
        type: 'python',
        path: '../goal_distance/goal_distance.py',
        process: null
    },
    ai: {
        name: 'ai',
        type: 'node',
        path: '../ai/ai.js',
        process: null
    },
    dashboard: {
        name: 'dashboard',
        type: 'node',
        path: '../dashboard/dashboard.js',
        process: null
    },
    'manual-control': {
        name: 'manual-control',
        type: 'node',
        path: '../manual-control/manual-control.js',
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
        };
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

    readComponentConf(request.params.name, (err, conf) => {
        if (err) {
            return response.sendStatus(404);
        }

        response.json(conf);
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

wss.broadcast = function broadcast(data) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

server.listen(8079, function listening() {
    console.log('Listening on %d', server.address().port);
    console.log('http://localhost:' + server.address().port);
});

function startComponent(name) {
    const component = components[name];

    if (component && component.process === null) {
        const absolutePath = path.join(__dirname, component.path);

        if (component.type === 'exe') {
            component.process = childProcess.spawn(absolutePath, {
                cwd: path.dirname(absolutePath),
                shell: true
            });

        } else if (component.type === 'node') {
            component.process = childProcess.fork(absolutePath, [robotName], {
                cwd: path.dirname(absolutePath),
                silent: true
            });
        } else if (component.type === 'python') {
            console.log("Start python ", absolutePath);
            component.process = childProcess.spawn('python', [absolutePath]);
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

                component.process = null;

                wss.broadcast('updated');
            });
        }
    }
}

function stopComponent(name) {
    const component = components[name];

    if (component && component.process !== null) {
        if (component.type === 'node') {
            component.process.send({type: 'close'});
        } else {
            readComponentConf(name, (err, conf) => {
                if (err) {
                    component.process.kill();
                    return;
                }

                sendUDPMessage('127.0.0.1', conf.port, {type: 'message', topic: name + '_close'});
            });
        }
    }
}

function readComponentConf(name, callback) {
    fs.readFile(`../${name}/public-conf.json`, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            callback(err);
            return;
        }

        try {
            callback(null, JSON.parse(data));

        } catch (e) {
            console.error(e);
            callback(e);
        }
    });
}

function sendUDPMessage(ipAddress, port, info, onSent) {
    const message = Buffer.from(JSON.stringify(info));

    socket.send(message, port, ipAddress, (err) => {
        if (err) {
            console.error(err);
        }

        if (typeof onSent === 'function') {
            onSent(err);
        }
    });
}