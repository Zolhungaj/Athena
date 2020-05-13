const {SocketWrapper, getToken, EVENTS, sleep} = require('node/amq-api')
const fs = require('fs');
const { KICKED_FROM_GAME } = require('./node/eventstodo');

async function main() {
    const debug = true
	let token = await getToken("juvian", "xxx", 'data.json')
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
	constructor(socket) {
        this.players = {}
        this.activePlayers = {}
        this.spectators = {}
        this.playerLeftListener = socket.on(EVENTS.PLAYER_LEFT, (data) => playerLeft(data))
        this.playerJoinedListener = socket.on(EVENTS.NEW_PLAYER, (data) => playerJoined(data))
        this.spectatorJoinedListener = socket.on(EVENTS.NEW_SPECTATOR, (data) => spectatorJoined(data))
        this.spectatorLeftListener = socket.on(EVENTS.SPECTATOR_LEFT, (data) => spectatorLeft(data))
        this.spectatorChangedToPlayerListener = socket.on(EVENTS.SPECTATOR_CHANGED_TO_PLAYER, (data) => spectatorChangedToPlayer(data))
        this.playerNameChangedListener = socket.on(EVENTS.PLAYER_NAME_CHANGE, (data) => playerNameChanged(data))
        this.spectatorNameChangedListener = socket.on(EVENTS.SPECTATOR_NAME_CHANGE, (data) => spectatorNameChanged(data))
        this.globalNameChangedListener = socket.on(EVENTS.ALL_PLAYER_NAME_CHANGE, (data) => globalNameChanged(data))
    }
    
    playerLeft = (data) => {
        //data.
        //     newHost
        //     kicked
        //     player.
        //            gamePlayerId
        //
        delete players[data.player.gamePlayerId]
    }

    spectatorLeft = (data) => {
        //data.
        //     newHost   //string
        //     kicked    //boolean
        //     spectator //string
        //
        delete spectators[data.spectator]
    }

    playerJoined = (playerData) => {
        //playerData.
        //           name          //string, unique
        //           level         //integer
        //           gamePlayerId  //integer, position
        //           ready         //boolean
        //           inGame        //boolean
        //           avatar.       
        //                  avatar.
        //                         active             //integer/boolean
        //                         avatarId           //integer
        //                         avatarName         //string
        //                         backgroundFileName //string/filename
        //                         characterId        //integer
        //                         colorActive        //integer
        //                         colorId            //integer
        //                         colorName          //string
        //                         editor             //null?
        //                         optionActive       //boolean
        //                         optionName         //string
        //                         outfitName         //string
        //                  background.
        //                             avatarName     //string
        //                             backgroundHori //string/filename
        //                             backgroundVert //string/filename
        //                             outfitName     //string
        player = database.getPlayer(playerData.name)
        if (!player) {
            player = data
            database.newPlayer(player)
        }
        if(player.banned) {
            kick(playerData.name)
        }else{
            players[playerData.name] = player
        }
    }
    
    spectatorJoined = (spectator) => {
        //spectator.
        //          name         // string
        //          gamePlayerId // integer but always null
        player = database.getSpectator(spectator.name)
        if (!player) {
            player = {name: spectator.name, banned: false}
            database.newSpectator(spectator.name)
        }
        if(player.banned) {
            kick(player.name)
        }else{
            spectators[player.name] = player
        }
    }

    spectatorChangedToPlayer = (player) => {
        //same kind of data as playerJoined
        delete spectators[player.name]
        playerJoined(player)
    }

    playerNameChanged = (data) => {
        //data.
        //     oldName      //string
        //     newName      //string
        //     gamePlayerId //integer
        const oldName = data.oldName
        const newName = data.newName
        database.changeName(oldName, newName)
        if(players[oldName]) {
            players[oldName].name = newName
            players[newName] = players[oldName]
            delete players[oldName]
        }
        if(this.activePlayers[oldName]) {
            activePlayers[oldName].name = newName
            activePlayers[newName] = activePlayers[oldName]
            delete activePlayers[oldName]
        }
    }

    specatorNameChanged = (data) => {
        //data.
        //     oldName //string
        //     newName //string
        const oldName = data.oldName
        const newName = data.newName
        database.changeName(oldName, newName)
        if(spectators[oldName]) {
            spectators[oldName].name = newName
            spectators[newName] = spectators[oldName]
            delete spectators[oldName]
        }
    }

    globalNameChanged = (data) => {
        //this is related to the all players list, and thus includes all online players
        //data.
        //     oldName //string
        //     newName //string
        const oldName = data.oldName
        const newName = data.newName
        database.changeName(oldName, newName)
    }

    destroy = () => {
        playerLeftListener.destroy()
        playerJoinedListener.destroy()
    }

    start = () => {
        activePlayers = clone(players)
    }
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
 }

main()