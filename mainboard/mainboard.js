const dgram = require('dgram');
const socketMainboard = dgram.createSocket('udp4');
const socketModule = dgram.createSocket('udp4');
const publicConf = require('./public-conf');

const mbedPort = publicConf.mbedPort;
const mbedAddress = publicConf.mbedIpAddress;

socketMainboard.on('error', (err) => {
    console.log(`socketMainboard error:\n${err.stack}`);
    socketMainboard.close();
});

socketMainboard.on('message', (message, rinfo) => {
    handleMainboardMessage(message);
});

socketMainboard.on('listening', () => {
    const address = socketMainboard.address();
    console.log(`socketMainboard listening ${address.address}:${address.port}`);

    sendCommandToMainboard([0, 0, 0, 0, 0]);
});

socketMainboard.bind(publicConf.mbedPort, () => {
    socketMainboard.setMulticastInterface('127.0.0.1');
});

socketModule.on('error', (err) => {
    console.log(`socketModule error:\n${err.stack}`);
    socketModule.close();
});

socketModule.on('message', (message, rinfo) => {
    console.log(`socketModule got: ${message} from ${rinfo.address}:${rinfo.port}`);

    const info = JSON.parse(message.toString());
    handleInfo(info, rinfo.address, rinfo.port);
});

socketModule.on('listening', () => {
    const address = socketModule.address();
    console.log(`socketModule listening ${address.address}:${address.port}`);
});

socketModule.bind(publicConf.port, () => {
    socketModule.setMulticastInterface('127.0.0.1');
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

    socketMainboard.close();

    sendToHub({type: 'unsubscribe'}, () => {
        socketModule.close();
        process.exit();
    });
}

function handleInfo(info, address, port) {
    console.log('handleInfo', info);
    if (info.topic === 'mainboard_command') {
        sendCommandToMainboard(info.command);
    }
}

function sendToMainboard(command) {
    const message = Buffer.from(command);
    //console.log('send:', command, 'to', '192.168.4.1', 8042);

    socketMainboard.send(message, mbedPort, mbedAddress, (err) => {
        if (err) {
            console.error(err);
        }
    });
}

/**
 *
 * @param {Array.<number>} speeds
 */
function sendCommandToMainboard(speeds) {
    const command = new Int16Array(5);

    for (let i = 0; i < speeds.length && i < command.length; i++) {
        command[i] = speeds[i];
    }

    let message = new Buffer.from(command.buffer);
    socketMainboard.send(message, 0, message.length, mbedPort, mbedAddress);
}

function handleMainboardMessage(message) {
    const data = {
        speed1: message.readInt16LE(0),
        speed2: message.readInt16LE(2),
        speed3: message.readInt16LE(4),
        speed4: message.readInt16LE(6),
        speed5: message.readInt16LE(8),
        ball1: message.readUInt8(10) === 1,
        ball2: message.readUInt8(11) === 1,
        distance: message.readUInt16LE(12),
        isSpeedChanged: message.readUInt8(14) === 1,
        time: message.readInt32LE(15)
    };

    console.log(data);

    const info = {type: 'message', topic: 'mainboard_feedback', message: data};
    sendToHub(info);
}

function sendToHub(info, onSent) {
    const message = Buffer.from(JSON.stringify(info));
    //console.log('send:', info, 'to', '127.0.0.1', 8091);

    socketModule.send(message, publicConf.hubPort, publicConf.hubIpAddress, (err) => {
        if (err) {
            console.error(err);
        }

        if (typeof onSent === 'function') {
            onSent(err);
        }
    });
}

sendToHub({type: 'subscribe', topics: ['mainboard_command']});