const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const publicConf = require('./public-conf.json');
const calibration = require('../calibration/calibration');

const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let selectedTechniques = [];

app.use(express.static(__dirname + '/public'));
app.use(express.json());

wss.on('connection', function connection (ws, req) {
    ws.on('message', function incoming (message) {
        console.log('received: %s', message);

        try {
            handleWsMessage(JSON.parse(message));
        } catch (error) {
            console.info(error);
        }
    });
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
    //console.log(`socket got: ${message} from ${rinfo.address}:${rinfo.port}`);

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
    //console.log('CHILD got message:', message);

    if (message.type === 'close') {
        close();
    }
});

function close() {
    console.log('closing');

    // Allow usage of any throwing technique when shutting down training
    sendToHub({
        type: 'message',
        topic: 'training',
        event: 'change_technique',
        techniques: ['hoop', 'dunk']
    });

    sendToHub({type: 'unsubscribe'}, () => {
        socket.close();
        process.exit();
    });
}

function handleWsMessage(message) {
    if (message.type === 'training_feedback') {
        calibration.recordFeedback({
            technique: message.technique,
            distance: message.distance,
            throwerSpeed: message.throwerSpeed,
            centerOffset: message.centerOffset
        }, message.feedback);
    } else if (message.type === 'delete_measurement') {
        calibration.deleteMeasurement(message);
    } else if (message.type === 'change_technique') {
        selectedTechniques = message.techniques;

        sendToHub({
            type: 'message',
            topic: 'training',
            event: 'change_technique',
            techniques: message.techniques
        });
    }

    wss.broadcast(JSON.stringify({
        type: 'measurements',
        hoop: selectedTechniques.includes('hoop') ? calibration.getMeasurements('hoop') : undefined,
        dunk: selectedTechniques.includes('dunk') ? calibration.getMeasurements('dunk') : undefined
    }));
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
        console.log(Date.now(), info.state.ballSensors);
        if (info.state.ballThrown) {
            console.log('THROW!');
        }
        wss.broadcast(JSON.stringify({
            type: 'ai_state',
            state: info.state /* {
                ...info.state,
                technique: calibration.getThrowerTechnique(info.state.lidarDistance),
                //throwerSpeed: calibration.getThrowerSpeed(info.state.lidarDistance),
                //centerOffset: calibration.getCenterOffset(info.state.lidarDistance)
            }*/
        }));
    }

    //console.log(info);
}

// Training interval
let trainingN = 0;

setInterval(() => {
    const update = calibration.updateNets(selectedTechniques);

    if (++trainingN % 10 === 0) {
        wss.broadcast(JSON.stringify({
            type: 'nets',
            ...update
        }));

        sendToHub({
            type: 'message',
            topic: 'training',
            event: 'nets_changed'
        });
    }
}, 1000);

sendToHub({type: 'subscribe', topics: ['ai_state']});