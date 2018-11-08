const dgram = require('dgram');
const socketMainboard = dgram.createSocket('udp4');
const socketModule = dgram.createSocket('udp4');
const publicConf = require('./public-conf');

const mbedPort = publicConf.mbedPort;
const mbedAddress = publicConf.mbedIpAddress;

/**
 * @typedef {Object} CommandObject
 * @property {number[]} speeds
 * @property {string} fieldID
 * @property {string} robotID
 * @property {boolean} shouldSendAck
 */

const commandBuffer = Buffer.alloc(13);
const defaultCommandObject =  {
    speeds: [0, 0, 0, 0, 0],
    fieldID: 'Z',
    robotID: 'Z',
    shouldSendAck: false,
};

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

    sendCommandToMainboard(defaultCommandObject);
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

/**
 * @param {CommandObject} commandObject
 */
function updateCommandBuffer(commandObject) {
    const speeds = commandObject.speeds;

    for (let i = 0; i < speeds.length; i++) {
        commandBuffer.writeInt16LE(speeds[i], 2 * i);
    }

    commandBuffer.writeUInt8(commandObject.fieldID.charCodeAt(0), 10);
    commandBuffer.writeUInt8(commandObject.robotID.charCodeAt(0), 11);
    commandBuffer.writeUInt8(commandObject.shouldSendAck ? 1 : 0, 12);
}

function handleInfo(info, address, port) {
    console.log('handleInfo', info);
    if (info.topic === 'mainboard_command') {
        sendCommandToMainboard(info.command);
    }
}

/**
 * @param {CommandObject} command
 */
function sendCommandToMainboard(command) {
    updateCommandBuffer(command);

    socketMainboard.send(commandBuffer, 0, commandBuffer.length, mbedPort, mbedAddress);
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
        refereeCommand: String.fromCharCode(message.readUInt8(15)),
        time: message.readInt32LE(16)
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