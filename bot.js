const {SocketWrapper, getToken, EVENTS, sleep} = require('node/amq-api')
const fs = require('fs');

async function main() {
    const debug = true
	let token = await getToken("juvian", "xxx", '../data.json')
	let socket = new SocketWrapper()

    if (debug) {
        var listener = socket.on(EVENTS.ALL, (data, listener, fullData) => {
            console.log(data)
            console.log(listener)
            console.log(fullData)
        })
    }

	await socket.connect(token)


    if (debug) {
        listener.destroy()
    }

	await sleep(1000)

	socket.disconnect()
}

class Room {
	constructor() {
        this.players = {}
        this.spectators = {}
	}
}

main()