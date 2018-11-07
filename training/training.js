const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const fs = require('fs');
const publicConf = require('./public-conf.json');
const measurements = require('./measurements.json');
const utils = require('./utils');

const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const interpolateArray = require('2d-bicubic-interpolate').default;

const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));
app.use(express.json());

wss.on('connection', function connection(ws, req) {
    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
        try {
            handleWsMessage(JSON.parse(message));
        } catch (error) {
            console.info(error);
        }
    });

    //const values = interpolateArray(measurements, 10);

    ws.send(JSON.stringify({ type: 'measurements', measurements }));
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

        const x = message.x;
        const y = message.y;
        const r = 25; // proximity radius
        const correctionRatio = 0.9;

        // Calculate new measurement correction
        const c = correctionRatio * utils.interpolate(
            measurements.map(obj => ({ ...obj, z: obj.c })), x, y
        );

        // Find measurements within proximity
        const closeObjs = measurements.filter(
            obj => obj.c > 0 && Math.abs(obj.x - x) < r
        );

        
        // Remove previous measurements within proximity
        closeObjs.forEach(obj =>
            measurements.splice(measurements.indexOf(obj), 1)
        );

        // TODO: Check if the new mesurement position is duplicated if c = 0, if so then calculate mean value.

        // Add new measurement
        measurements.push({
            x,
            y,
            z: message.z + message.feedback * c,
            c: message.feedback ? c : 0,
            n: closeObjs.reduce((sum, obj) => sum + obj.n, 1)
        });

        // Save and send to training dashboard as well as hub
        fs.writeFileSync('measurements.json', JSON.stringify(measurements, null, 2));

        wss.broadcast(JSON.stringify({ type: 'measurements', measurements }));
        
        sendToHub({
            type: 'measurements_changed',
            topic: 'training'
        });
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