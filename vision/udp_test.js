const dgram = require('dgram');
const socket = dgram.createSocket('udp4');

socket.on('error', (err) => {
    console.log(`socket error:\n${err.stack}`);
    socket.close();
});

socket.on('message', (msg, rinfo) => {
    console.log(`socket got: ${msg} from ${rinfo.address}:${rinfo.port}`);
});

socket.on('listening', () => {
    const address = socket.address();
    console.log(`socket listening ${address.address}:${address.port}`);
});

socket.bind(8091, () => {
    socket.setMulticastInterface('127.0.0.1');
});

const message = Buffer.from('Some bytes');

socket.send(message, 8092, '127.0.0.1', (err) => {
    //socket.close();
});