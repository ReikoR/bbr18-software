#include <iostream>
#include "HubCom.h"

void HubCom::run() {
    //receive();

    ioService.run();
}

void HubCom::receive() {
    socket.async_receive_from(
            boost::asio::buffer(data, max_length), serverEndpoint,
            [this](std::error_code ec, std::size_t bytes_recvd) {
                if (!ec && bytes_recvd > 0) {
                    std::cout << data << std::endl;
                    //send(bytes_recvd);
                } /*else {
                    receive();
                }*/
            });
}

void HubCom::send(char* data, std::size_t length) {
    socket.async_send_to(
            boost::asio::buffer(data, length), serverEndpoint,
            [this](std::error_code ec, std::size_t bytes_sent) {
                std::cout << "sent " << ec << " " << +bytes_sent << std::endl;
                //receive();
            });
}
