const dgram = require('dgram');
const socketMainBoard = dgram.createSocket('udp4');
const socketModule = dgram.createSocket('udp4');

socketMainBoard.on('error', (err) => {
    console.log(`socketPublisher error:\n${err.stack}`);
    socketPublisher.close();
});

socketMainBoard.on('message', (message, rinfo) => {
    console.log(`socketMainBoard got: ${message} from ${rinfo.address}:${rinfo.port}`);
});

socketMainBoard.on('listening', () => {
    const address = socketMainBoard.address();
    console.log(`socketMainBoard listening ${address.address}:${address.port}`);
});

socketMainBoard.bind(8041, () => {
    socketMainBoard.setMulticastInterface('127.0.0.1');
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
    if (info.topic === 'hardware') {
        sendToMainBoard(info.command);
    }
}

function sendToMainBoard(command) {
    const message = Buffer.from(command);
    console.log('send:', command, 'to', '192.168.4.1', 8042);

    socketMainBoard.send(message, 8042, '192.168.4.1', (err) => {
        if (err) {
            console.error(err);
        }
    });
}

function sendToHub(info) {
    const message = Buffer.from(JSON.stringify(info));
    console.log('send:', info, 'to', '127.0.0.1', 8091);

    socketModule.send(message, 8091, '127.0.0.1', (err) => {
        if (err) {
            console.error(err);
        }
    });
}

sendToHub({type: 'subscribe', topics: ['hardware']});