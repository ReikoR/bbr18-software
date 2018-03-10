const dgram = require('dgram');
const socketMainboard = dgram.createSocket('udp4');
const socketModule = dgram.createSocket('udp4');

socketMainboard.on('error', (err) => {
    console.log(`socketPublisher error:\n${err.stack}`);
    socketPublisher.close();
});

socketMainboard.on('message', (message, rinfo) => {
    console.log(`socketMainboard got: ${message} from ${rinfo.address}:${rinfo.port}`);

    handleMainboardMessage(message.toString());
});

socketMainboard.on('listening', () => {
    const address = socketMainboard.address();
    console.log(`socketMainboard listening ${address.address}:${address.port}`);
});

socketMainboard.bind(8041, () => {
    socketMainboard.setMulticastInterface('127.0.0.1');
});

socketModule.on('error', (err) => {
    console.log(`socketSubscriber error:\n${err.stack}`);
    socketSubscriber.close();
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

socketModule.bind(8093, () => {
    socketModule.setMulticastInterface('127.0.0.1');
});

function handleInfo(info, address, port) {
    console.log('handleInfo', info);
    if (info.topic === 'mainboard_command') {
        sendToMainboard(info.command);
    }
}

function sendToMainboard(command) {
    const message = Buffer.from(command);
    //console.log('send:', command, 'to', '192.168.4.1', 8042);

    socketMainboard.send(message, 8042, '192.168.4.1', (err) => {
        if (err) {
            console.error(err);
        }
    });
}

function handleMainboardMessage(message) {
    const info = {type: 'message', topic: 'mainboard_feedback', message: message};
    sendToHub(info);
}

function sendToHub(info) {
    const message = Buffer.from(JSON.stringify(info));
    //console.log('send:', info, 'to', '127.0.0.1', 8091);

    socketModule.send(message, 8091, '127.0.0.1', (err) => {
        if (err) {
            console.error(err);
        }
    });
}

sendToHub({type: 'subscribe', topics: ['mainboard_command']});