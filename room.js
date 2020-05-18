const {SocketWrapper, getToken, EVENTS, sleep} = require('./node/amq-api')
class Room {
    //this handles events that concern the room
	constructor(socket, events) {
        this.players = {}
        this.activePlayers = {}
        this.spectators = {}
        this.queue = []
        this.socket = socket
        this.debug = true
        this.events = events
        this.target = 45
        this.counter = this.target
        this.time = 0
        this.startBlocked = true

        this.ingame = false

        this.gameId = -1

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

        this.noPlayersListener = socket.on(EVENTS.QUIZ_NO_PLAYERS, () => this.roomClosed()) //haha not implemented
        this.gameClosedListener = socket.on(EVENTS.GAME_CLOSED, (data) => this.roomClosed(data))


        this.quizReadyListener = socket.on(EVENTS.QUIZ_READY, (data) => { this.ingame = true })
        this.quizOverListener = socket.on(EVENTS.QUIZ_OVER, (data) => {
            //console.log(data)
            const {players, spectators, inQueue} = data
            this.players = {}
            this.activePlayers = {}
            this.spectators = {}
            this.counter = this.target
            this.ingame = false
            this.queue = []
            for(let i = 0; i < players.length; i++) {
                const player = players[i]
                this.playerJoined(player, true)
                this.counter--
            }
            for(let i = 0; i < spectators.length; i++) {
                const spectator = spectators[i]
                this.spectatorJoined(spectator, true)
            }
            for(let i = 0; i < inQueue.length; i++){
                const q = inQueue[i]
                this.newPlayerInQueue(q)
            }
        })
        

        events.on("tick", () => this.tick())

    }

    chat = (msg) => {
        this.events.emit("chat", msg)
    }

    autoChat = (msg, replacements=[]) => {
        this.events.emit("auto chat", msg, replacements)
    }

    tick = () => {
        if(this.debug){
            console.log("tick", this.ingame, this.counter, this.time)
        }
        if(this.ingame){
            return
        }
        if (Object.keys(this.players).length > 0){
            if(this.counter <= 0){
                const offenders = []
                for(let name in this.players){
                    if(!this.players[name].ready) {
                        offenders.push(name)
                    }
                }
                if (offenders.length === 0){
                    this.start()
                }else {
                    if(this.counter === 0){
                        const p = "@" + offenders.join(" @")
                        this.autoChat("get_ready")
                        this.chat(p)
                    }else if(this.counter > -10) {
                        this.chat(this.counter+10 + "")
                    }else if(this.counter === -10){
                        for(let i = 0; i < offenders.length; i++){
                            this.forceToSpectator(offenders[i])
                        }
                    }else if(this.counter > -20) {
                        this.chat(this.counter+20 + "!")
                    }else {
                        if(offenders.length === Object.keys(this.players).length){
                            this.counter = this.target
                        }else{
                            this.start()
                        }
                    }
                }
            }else {
                if(this.counter % 10 === 0 || this.counter < 10) {
                    this.autoChat("starting", [this.counter, this.counter===1?"":"s"])
                }
            }
            this.counter--
        }else{
            if(this.time % 100 === 0){
                this.autoChat("idle")
            }
            this.counter = this.target
        }
        this.time++
    }

    forceToSpectator = (name) => {
        this.socket.lobby.changeToSpectator(name)
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
        this.queue = []
        this.gameId = data.gameId

        
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
                //this.database.updateAvatar(name, data.avatar)
                this.events.emit("player changed avatar", name, data.avatar)
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
        console.log(playerData)
        //let {banned, elo, level, avatar} = this.database.getPlayer(player.name)
        let {level, avatar} = player
        const banned = false
        const elo = 1400
        if (!level) {
            player.elo = this.database.newPlayer(player)
            player.banned = false
            level = player.level
            avatar = player.avatar
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
        this.events.emit("new player", {player, wasSpectator, changedLevel, changedAvatar})
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
            this.events.emit("new spectator", spectator, wasPlayer)
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
        this.noPlayersListener.destroy()
        this.gameClosedListener.destroy()
    }

    start = () => {
        this.activePlayers = clone(this.players)
        this.socket.lobby.start()
        this.events.emit("game start", this.activePlayers)
        this.counter = 35
    }
}
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

module.exports = {Room}