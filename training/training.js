const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const publicConf = require('./public-conf.json');
const measurements = require('./measurements.json');
const corrections = require('./corrections.json');
const calibration = require('../calibration/utils');

const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const interpolateArray = require('2d-bicubic-interpolate').default;

const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));
app.use(express.json());

// Initialize training measurements as copy of best measurements
const trainingMeasurements = {};

for (let x in measurements) {
    trainingMeasurements[x] = {};

    for (let y in measurements[x]) {
        trainingMeasurements[x][y] = measurements[x][y];
    }
}

let correctionsInterpolator = calibration.getInterpolator(corrections);

wss.on('connection', function connection(ws, req) {
    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
        try {
            handleWsMessage(JSON.parse(message));
        } catch (error) {
            console.info(error);
        }
    });

    const data = [];

    for (let x in measurements) {
        for (let y in measurements[x]) {
            data.push({
                x: parseInt(x),
                y: parseInt(y),
                z: measurements[x][y]
            });
        }
    }

    const values = interpolateArray(data, 10);

    ws.send(JSON.stringify({ type: 'measurements', measurements, values }));
});

wss.broadcast = function broadcast(data) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

server.listen(8077, function listening() {
    console.log('Listening on %d', server.address().port);
    console.log('http://localhost:' + server.address().port);
});

socket.on('error', (err) => {
    console.log(`socketPublisher error:\n${err.stack}`);
    socket.close();
});

socket.on('message', (message, rinfo) => {
    console.log(`socket got: ${message} from ${rinfo.address}:${rinfo.port}`);

    const info = JSON.parse(message.toString());
    handleInfo(info);
});

socket.on('listening', () => {
    const address = socket.address();
    console.log(`socket listening ${address.address}:${address.port}`);
});

socket.bind(publicConf.port, () => {
    socket.setMulticastInterface('127.0.0.1');
});

process.on('SIGINT', close);

process.on('message', (message) => {
    console.log('CHILD got message:', message);

    if (message.type === 'close') {
        close();
    }
});

function close() {
    console.log('closing');

    sendToHub({type: 'unsubscribe'}, () => {
        socket.close();
        process.exit();
    });
}

function handleWsMessage(message) {
    if (message.type === 'ai_command') {
        sendToHub({
            type: 'message',
            topic: 'ai_command',
            commandInfo: message.info
        });
    } else if (message.type === 'mainboard_command') {
        sendToHub({
            type: 'message',
            topic: 'mainboard_command',
            command: message.info
        });
    } else if (message.type === 'training_feedback') {
        console.log('record Mesurement', message);
        const xKey = Math.round(message.x) + '';
        const yKey = Math.round(message.y) + '';

        if (!measurements.hasOwnProperty(xKey)) {
            measurements[xKey] = {};
        }

        if (!measurements[xKey].hasOwnProperty(yKey)) {
            measurements[xKey][yKey] = {};
        }

        if (message.feedback === 0) {
            measurements[xKey][yKey] = message.z;
            corrections[xKey][yKey] = 0;
        } else {
            corrections[xKey][yKey] -= 10;
        }

        trainingMeasurements[xKey][yKey] = message.z + message.feedback * correctionsInterpolator(message.x, message.y);

        correctionsInterpolator = calibration.getInterpolator(corrections);

        // Save objects to files.
    }
}

function sendToHub(info, onSent) {
    console.log('sendToHub', info);

    const message = Buffer.from(JSON.stringify(info));

    socket.send(message, publicConf.hubPort, publicConf.hubIpAddress, (err) => {
        if (err) {
            console.error(err);
        }

        if (typeof onSent === 'function') {
            onSent(err);
        }
    });
}

function handleInfo(info) {
    if (info.topic === 'ai_state') {
        wss.broadcast(JSON.stringify({type: 'ai_state', state: info.state}));
    }

    console.log(info);
}

sendToHub({type: 'subscribe', topics: ['ai_state']});