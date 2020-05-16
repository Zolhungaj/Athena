const {SocketWrapper, getToken, EVENTS, sleep} = require('./node/amq-api')
const fs = require('fs');

async function main() {
    const debug = false
    let token = await getToken("xx", "xx", 'data.json')
    console.log(token)
    //return
    let socket = new SocketWrapper()
    
    const defaultSettings = JSON.parse(`{"roomName":"Athena Alpha","privateRoom":true,"password":"pass","roomSize":8,"numberOfSongs":20,"modifiers":{"skipGuessing":true,"skipReplay":true,"duplicates":true,"queueing":true,"lootDropping":true},"songSelection":{"advancedOn":false,"standardValue":3,"advancedValue":{"watched":20,"unwatched":0,"random":0}},"showSelection":{"watched":80,"unwatched":20,"random":0},"songType":{"advancedOn":false,"standardValue":{"openings":true,"endings":false,"inserts":false},"advancedValue":{"openings":0,"endings":0,"inserts":0,"random":20}},"guessTime":{"randomOn":false,"standardValue":20,"randomValue":[5,60]},"inventorySize":{"randomOn":false,"standardValue":20,"randomValue":[1,99]},"lootingTime":{"randomOn":false,"standardValue":90,"randomValue":[10,150]},"lives":3,"samplePoint":{"randomOn":true,"standardValue":1,"randomValue":[0,100]},"playbackSpeed":{"randomOn":false,"standardValue":1,"randomValue":[true,true,true,true]},"songDifficulity":{"advancedOn":false,"standardValue":{"easy":true,"medium":true,"hard":true},"advancedValue":[0,100]},"songPopularity":{"advancedOn":false,"standardValue":{"disliked":true,"mixed":true,"liked":true},"advancedValue":[0,100]},"playerScore":{"advancedOn":false,"standardValue":[1,10],"advancedValue":[true,true,true,true,true,true,true,true,true,true]},"animeScore":{"advancedOn":false,"standardValue":[2,10],"advancedValue":[true,true,true,true,true,true,true,true,true]},"vintage":{"standardValue":{"years":[1950,2020],"seasons":[0,3]},"advancedValueList":[]},"type":{"tv":true,"movie":true,"ova":true,"ona":true,"special":true},"genre":[],"tags":[],"gameMode":"Standard"}`)



    if (debug) {
        var listener = socket.on(EVENTS.ALL, (data, listener, fullData) => {
            console.log(data)
            console.log(listener)
            console.log(fullData)
        })
    }

	await socket.connect(token)

    const theRoom = new Room(socket)
    socket.roomBrowser.host(defaultSettings)
    await sleep(60000)

    theRoom.destroy()
    if (debug) {
        listener.destroy()
    }

	await sleep(1000)

	socket.disconnect()
}

class Room {
    //this handles events that concern the room
	constructor(socket) {
        this.players = {}
        this.activePlayers = {}
        this.spectators = {}
        this.queue = {}
        this.socket = socket
        this.debug = true

        this.playerJoinedListener = socket.on(EVENTS.NEW_PLAYER, (data) => this.playerJoined(data))
        this.playerLeftListener = socket.on(EVENTS.PLAYER_LEFT, (data) => this.playerLeft(data))
        this.playerChangedToSpectatorListener = socket.on(EVENTS.PLAYER_CHANGED_TO_SPECTATOR, (data) => this.playerChangedToSpectator(data))
        
        this.spectatorJoinedListener = socket.on(EVENTS.NEW_SPECTATOR, (data) => this.spectatorJoined(data))
        this.spectatorLeftListener = socket.on(EVENTS.SPECTATOR_LEFT, (data) => this.spectatorLeft(data))
        this.spectatorChangedToPlayerListener = socket.on(EVENTS.SPECTATOR_CHANGED_TO_PLAYER, (data) => this.spectatorChangedToPlayer(data))
        
        this.playerLeftQueueListener = socket.on(EVENTS.PLAYER_LEFT_QUEUE, (data) => this.playerLeftQueue(data))
        this.newPlayerInQueueListener = socket.on(EVENTS.NEW_PLAYER_IN_GAME_QUEUE, (data) => this.newPlayerInQueue(data))
        
        this.playerNameChangedListener = socket.on(EVENTS.PLAYER_NAME_CHANGE, (data) => this.playerNameChanged(data))
        this.spectatorNameChangedListener = socket.on(EVENTS.SPECTATOR_NAME_CHANGE, (data) => this.spectatorNameChanged(data))
        this.globalNameChangedListener = socket.on(EVENTS.ALL_PLAYER_NAME_CHANGE, (data) => this.globalNameChanged(data))
        
        this.avatarChangedListener = socket.on(EVENTS.AVATAR_CHANGE, (data) => this.avatarChanged(data))
        this.playerReadyChangedListener = socket.on(EVENTS.PLAYER_READY_CHANGE, (data) => this.playerReadyChanged(data))
        
        this.hostGameResponseListener = socket.on(EVENTS.HOST_GAME, (data) => this.hostGameResponse(data))

    }

    hostGameResponse = (data) => {
        //data.
        //     gameId     // integer
        //     hostName   // string
        //     inLobby    // boolean
        //     inQueue    // Array //empty
        //     players    // Array //contains host
        //     settings   // Object { roomName: "fds", privateRoom: true, password: "fdsfsdfsdfsdf", … }
        //     spectators // Array //empty
        this.players = {}
        this.activePlayers = {}
        this.spectators = {}
        this.queue = {}

        
        for(let i = 0; i < data.players.length; i++){
            this.playerJoined(data.players[i])
        }
        this.socket.lobby.changeToSpectator(data.hostName)
    }

    avatarChanged = (data) => {
        //data.
        //     gamePlayerId
        //     avatar // same type of data as in playerJoined's avatar
        for (let name in this.players){
            if(this.players[name].gamePlayerId === data.gamePlayerId){
                this.players[name].avatar = data.avatar
            }
        }
    }

    playerReadyChanged = (data) => {
        //data.
        //     gamePlayerId
        //     ready // boolean
        for (let name in this.players){
            if(this.players[name].gamePlayerId === data.gamePlayerId){
                this.players[name].ready = data.ready
                console.log(name, "is now", data.ready?"ready":"not ready")
            }
        }
    }
    
    playerLeft = (data) => {
        //data.
        //     newHost
        //     kicked
        //     player.
        //            gamePlayerId
        //            name
        this.removePlayer(data.player.name)
    }

    spectatorLeft = (data) => {
        //data.
        //     newHost   //string
        //     kicked    //boolean
        //     spectator //string
        //
        this.removeSpectator(data.spectator)
        
    }

    removePlayer = (name) => {
        delete this.players[name]
    }

    removeSpectator = (name) => {
        delete this.spectators[name]
    }

    playerJoined = (playerData, wasSpectator=false) => {
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
        const player = playerData
        //const {banned, elo, level, avatar} = this.database.getPlayer(player.name)
        const {level, avatar} = player
        const banned = false
        const elo = 1400
        if (!level) {
            player.elo = this.database.newPlayer(player)
            player.banned = false
        }else{
            player.banned = banned
            player.elo = elo
        }
        if(player.banned) {
            this.kick(player.name)
            return
        }else{
            this.players[player.name] = player
        }
        let changedLevel = false
        if (player.level !== level){
            this.database.updateLevel(player.name, player.level)
            changedLevel = true
        }
        let changedAvatar = false
        if (player.avatar !== avatar){
            this.database.updateAvatar(player.name, player.avatar)
            changedAvatar = true
        }
        //this.chatEvent.newPlayer(wasSpectator, changedLevel, changedAvatar)
    }
    
    spectatorJoined = (spectator, wasPlayer=false) => {
        //spectator.
        //          name         // string
        //          gamePlayerId // integer but always null
        //player = database.getSpectator(spectator.name)
        let player = {name: spectator.name, banned: false}
        if (!player) {
            player = {name: spectator.name, banned: false}
            this.database.newSpectator(spectator.name)
        }
        if(player.banned) {
            this.kick(player.name)
        }else{
            this.spectators[player.name] = player
        }
    }

    spectatorChangedToPlayer = (player) => {
        //same kind of data as playerJoined
        this.removeSpectator(player.name)
        this.playerJoined(player, true)
    }

    playerChangedToSpectator = (data) => {
        //data.
        //     isHost // boolean
        //     playerDescription.
        //                       gamePlayerId // integer
        //                       name         // string
        //     spectatorDescription.
        //                          gamePlayerId // null
        //                          name         // string
        this.removePlayer(data.playerDescription.name)
        this.spectatorJoined(data.spectatorDescription, true)
    }

    playerLeftQueue = ({name}) => {
        for(let i = this.queue.length; i > -1 ; i--) {
            if (this.queue[i] === name) {
                this.queue.splice(i, 1)
            }
        }
    }

    newPlayerInQueue = ({name}) => {
        this.playerLeftQueue({name: name})
        this.queue.push(name)
    }

    playerNameChanged = (data) => {
        //data.
        //     oldName      //string
        //     newName      //string
        //     gamePlayerId //integer
        const oldName = data.oldName
        const newName = data.newName
        this.database.changeName(oldName, newName)
        if(this.players[oldName]) {
            this.players[oldName].name = newName
            this.players[newName] = this.players[oldName]
            delete this.players[oldName]
        }
        if(this.activePlayers[oldName]) {
            this.activePlayers[oldName].name = newName
            this.activePlayers[newName] = this.activePlayers[oldName]
            delete this.activePlayers[oldName]
        }
    }

    specatorNameChanged = (data) => {
        //data.
        //     oldName //string
        //     newName //string
        const oldName = data.oldName
        const newName = data.newName
        this.database.changeName(oldName, newName)
        if(spectators[oldName]) {
            this.spectators[oldName].name = newName
            this.spectators[newName] = this.spectators[oldName]
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
        this.database.changeName(oldName, newName)
    }

    destroy = () => {
        this.playerJoinedListener.destroy()
        this.playerLeftListener.destroy()
        this.playerChangedToSpectatorListener.destroy()
        this.spectatorJoinedListener.destroy()
        this.spectatorLeftListener.destroy()
        this.spectatorChangedToPlayerListener.destroy()
        this.playerLeftQueueListener.destroy()
        this.newPlayerInQueueListener.destroy()
        this.playerNameChangedListener.destroy()
        this.spectatorNameChangedListener.destroy()
        this.globalNameChangedListener.destroy()
        this.avatarChangedListener.destroy()
        this.playerReadyChangedListener.destroy()
        this.hostGameResponseListener.destroy()
    }

    start = () => {
        this.activePlayers = clone(this.players)
    }
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
 }

main()
