const {SocketWrapper, getToken, EVENTS, sleep} = require('./node/amq-api')
const fs = require("fs")
class ChatMonitor {
    constructor(socket, events) {
        this.socket = socket
        this.events = events
    }

    kick(name, reason) {

    }

    ban(name, reason) {

    }
}
module.exports = {ChatMonitor}