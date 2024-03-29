const {SocketWrapper, getToken, EVENTS, sleep} = require('./node/amq-api')
const Player = require("./player").Player
class Room {
    //this handles events that concern the room
	constructor(socket, events, nameResolver, db, minLevel=0, maxLevel=0, debug=true) {
        this.players = {}
        this.activePlayers = {}
        this.spectators = {}
        this.queue = []
        this.socket = socket
        this.debug = debug
        this.events = events
        this.target = 45
        this.counter = this.target
        this.time = 0
        this.startBlocked = true
        this.db = db
        this.nameResolver = nameResolver

        this.minLevel = Number(minLevel) // 0=guests can join, otherwise the player must have at least minLevel as level
        this.maxLevel = Number(maxLevel) // 0=no limit, inclusive

        this.levelWarnList = []
        this.levelWarnLimit = 3

        this.lockQueue = []
        this.isLocked = 0

        this.ingame = false

        //this.ready_backup = {} //this fixes a race condition with the database

        this.gameId = -1

        this.playerJoinedListener = socket.on(EVENTS.NEW_PLAYER, (data) => this.playerJoined(data))
        
        
        
        this.spectatorJoinedListener = socket.on(EVENTS.NEW_SPECTATOR, (data) => this.spectatorJoined(data))
        this.spectatorLeftListener = socket.on(EVENTS.SPECTATOR_LEFT, (data) => this.spectatorLeft(data))
        this.spectatorChangedToPlayerListener = socket.on(EVENTS.SPECTATOR_CHANGED_TO_PLAYER, (data) => this.spectatorChangedToPlayer(data))
        
        this.newPlayerInQueueListener = socket.on(EVENTS.NEW_PLAYER_IN_GAME_QUEUE, (data) => this.newPlayerInQueue(data))
        this.playerLeftQueueListener = socket.on(EVENTS.PLAYER_LEFT_QUEUE, (data) => this.playerLeftQueue(data))
        
        this.playerNameChangedListener = socket.on(EVENTS.PLAYER_NAME_CHANGE, (data) => this.playerNameChanged(data))
        this.globalNameChangedListener = socket.on(EVENTS.ALL_PLAYER_NAME_CHANGE, (data) => this.globalNameChanged(data))
        this.spectatorNameChangedListener = socket.on(EVENTS.SPECTATOR_NAME_CHANGE, (data) => this.spectatorNameChanged(data))
        
        this.avatarChangedListener = socket.on(EVENTS.AVATAR_CHANGE, (data) => this.avatarChanged(data))
        
        this.hostGameResponseListener = socket.on(EVENTS.HOST_GAME, (data) => this.hostGameResponse(data))

        this.noPlayersListener = socket.on(EVENTS.QUIZ_NO_PLAYERS, () => this.roomClosed()) //haha not implemented
        this.gameClosedListener = socket.on(EVENTS.GAME_CLOSED, (data) => this.roomClosed(data))


        this.quizReadyListener = socket.on(EVENTS.QUIZ_READY, (data) => { this.ingame = true })
        this.quizOverListener = socket.on(EVENTS.QUIZ_OVER, (data) => {
            //console.log(data)
            const {players, spectators, inQueue} = data
            const previousPlayers = this.players
            this.players = {}
            //this.ready_backup = {}
            this.activePlayers = {}
            this.spectators = {}
            this.counter = this.target
            this.ingame = false
            this.queue = []
            for(let i = 0; i < players.length; i++) {
                const player = players[i]
                this.playerJoined(player, false, true)
                this.counter--
            }
            for(let i = 0; i < spectators.length; i++) {
                const spectator = spectators[i]
                this.spectatorJoined(spectator, true, false)
            }
            for(let i = 0; i < inQueue.length; i++){
                const q = inQueue[i]
                this.newPlayerInQueue(q)
            }
        })

        this.playerLeftListener = socket.on(EVENTS.PLAYER_LEFT, (data) => this.playerLeft(data))
        this.playerChangedToSpectatorListener = socket.on(EVENTS.PLAYER_CHANGED_TO_SPECTATOR, (data) => this.playerChangedToSpectator(data))
        
        this.playerReadyChangedListener = socket.on(EVENTS.PLAYER_READY_CHANGE, (data) => this.playerReadyChanged(data))
        this.tickListener = events.on("tick", () => this.tick())
        this.forceeventListener = events.on("forceevent", () => {this.counter = 1})

    }

    destroy = () => {
        this.playerJoinedListener.destroy()
        this.playerLeftListener.destroy()
        this.playerChangedToSpectatorListener.destroy()

        this.spectatorJoinedListener.destroy()
        this.spectatorLeftListener.destroy()
        this.spectatorChangedToPlayerListener.destroy()
        
        this.newPlayerInQueueListener.destroy()
        this.playerLeftQueueListener.destroy()

        this.spectatorNameChangedListener.destroy()
        this.globalNameChangedListener.destroy()
        this.playerNameChangedListener.destroy()

        this.avatarChangedListener.destroy()

        this.hostGameResponseListener.destroy()

        this.noPlayersListener.destroy()
        this.gameClosedListener.destroy()

        this.quizReadyListener.destroy()
        this.quizOverListener.destroy()
        this.playerReadyChangedListener.destroy()
        
        this.events.removeAllListeners("tick")
        this.events.removeAllListeners("forceevent")
    }

    roomClosed(){}

    chat = (msg) => {
        this.events.emit("chat", msg)
    }

    autoChat = (msg, replacements=[]) => {
        this.events.emit("auto chat", msg, replacements)
    }

    lock = async () => {
        //console.log(this.isLocked)
        if(!this.isLocked){
            this.isLocked++
            //console.log("locked", this.isLocked)
            return Promise.resolve()
        }else{
            //console.log("waiting")
            this.isLocked++
            return new Promise((resolve, reject) => {
                this.lockQueue.push(resolve)
            })
        }
    }

    unlock = () => {
        //console.log("unlocked")
        this.isLocked--
        if(this.lockQueue.length){
            this.lockQueue.shift()()
        }
    }

    tick = async() => {
        await this.lock()
        if(this.debug){
            //console.log("tick", this.ingame, this.counter, this.time)
        }
        if(this.ingame){
            this.unlock()
            return
        }
        if (Object.keys(this.players).length > 0){
            if(this.counter <= 0){
                const offenders = []
                for(let name in this.players){
                    if(!this.players[name].ready) {
                        /*if(this.ready_backup[""+this.players[name].gamePlayerId]){
                            console.log("weird bug found?")
                        }else{
                            offenders.push(name)
                        }*/
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
                if(this.counter % 10 === 0 || this.counter < 5) {
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
        this.unlock()
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
        //this.ready_backup = {}

        
        for(let i = 0; i < data.players.length; i++){
            this.playerJoined(data.players[i])
        }
        this.socket.lobby.changeToSpectator(data.hostName)
    }

    avatarChanged = async (data) => {
        //data.
        //     gamePlayerId
        //     avatar // same type of data as in playerJoined's avatar
        await this.lock()
        for (let name in this.players){
            if(this.players[name].gamePlayerId === data.gamePlayerId){
                this.players[name].avatar = data.avatar
                this.db.get_player_id(name).then(player_id => {
                    this.db.update_player_avatar(player_id, data.avatar)
                })
                this.events.emit("player changed avatar", name, data.avatar)
            }
        }
        this.unlock()
    }

    playerReadyChanged = async (data) => {
        //data.
        //     gamePlayerId
        //     ready // boolean
        await this.lock()
        let success = false
        for (let name in this.players){
            if(this.players[name].gamePlayerId === data.gamePlayerId){
                if(this.debug && success){
                    console.log("ERROR: multiple players share the same gamePlayerId", data.gamePlayerId, name)
                }
                this.players[name].ready = data.ready
                console.log(name, "is now", data.ready?"ready":"not ready")
                success = true
            }
        }
        if(this.debug && !success){
            console.log("unmatched gamePlayerId", data.gamePlayerId)
            console.log(JSON.stringify(this.players))
        }
        this.unlock()
        //this.ready_backup[""+data.gamePlayerId] = data.ready
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

    removePlayer = async (name) => {
        await this.lock()
        delete this.players[name]
        this.unlock()
    }

    removeSpectator = async (name) => {
        await this.lock()
        delete this.spectators[name]
        this.unlock()
    }

    kick = (name) => {
        this.socket.lobby.kick(name)
    }

    playerJoined = async (playerData, wasSpectator=false, wasPlayer=false) => {
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
        if(this.debug){
            console.log("playerJoined")
            console.log({playerData, wasPlayer, wasSpectator})
            console.log({minlevel: this.minLevel, maxLevel: this.maxLevel, level: playerData.level})
        }
        await this.lock()
        if(this.minLevel){
            const guestMatcher = new RegExp("^Guest-\\d{5}$")
            const isGuest = guestMatcher.test(playerData.name)
            if(isGuest || playerData.level < this.minLevel){
                this.levelWarnList.push(playerData.name)
                const warningsReceived = this.levelWarnList.filter(entry => entry === playerData.name).length
                if(warningsReceived >= this.levelWarnLimit){
                    this.kick(playerData.name)
                }else{
                    this.forceToSpectator(playerData.name)
                    this.autoChat(`warn_${isGuest? "guest" : "level_low"}`, [playerData.name, warningsReceived, this.levelWarnLimit, this.minLevel])
                }
                this.unlock()
                return
            }
        }
        if(this.maxLevel){
            if(playerData.level > this.maxLevel){
                this.levelWarnList.push(playerData.name)
                const warningsReceived = this.levelWarnList.filter(entry => entry === playerData.name).length
                if(warningsReceived >= this.levelWarnLimit){
                    this.kick(playerData.name)
                }else{
                    this.forceToSpectator(playerData.name)
                    this.autoChat(`warn_level_high`, [playerData.name, warningsReceived, this.levelWarnLimit, this.maxLevel])
                }
                this.unlock()
                return
            }
        }

        this.nameResolver.getOriginalName(playerData.name).then(({name, originalName}) => {
            const player = new Player(name, originalName, playerData.level, playerData.avatar, playerData.ready, playerData.gamePlayerId)
            this.players[player.name] = player
            //this.ready_backup["" + player.gamePlayerId]
            this.db.get_player(originalName).then(async ({player_id, banned, level, avatar}) => {
                if(banned) {
                    this.kick(player.name)
                    this.unlock()
                    return
                }
                const newPlayer = !player_id
                player_id = player_id || await this.db.create_player(originalName)
                //console.log(playerData)
                
                let changedLevel = 0
                if (player.level !== level){
                    this.db.update_player_level(player_id, player.level)
                    if(level){
                        changedLevel = player.level - level 
                    }
                }
                let changedAvatar = false
                //console.log(JSON.stringify(player.avatar))
                //console.log(JSON.stringify(avatar))
                if (JSON.stringify(player.avatar) !== JSON.stringify(avatar)){
                    this.db.update_player_avatar(player_id, player.avatar)
                    if(avatar){
                        changedAvatar = true
                    }
                }
                this.events.emit("new player", {player, wasSpectator, changedLevel, changedAvatar, wasPlayer, newPlayer})
                this.unlock()
            }).catch(() => {
                this.unlock()
            })
        }).catch(() => {
            this.unlock()
            this.socket.lobby.changeToSpectator(playerData.name)
            this.autoChat("retry_name_fetch", [playerData.name])
        })  
    }
    
    spectatorJoined = async (spectator, wasSpectator=false, wasPlayer=false) => {
        //spectator.
        //          name         // string
        //          gamePlayerId // integer but always null
        //player = database.getSpectator(spectator.name)
        await this.lock()
        this.nameResolver.getOriginalName(spectator.name)
            .then(({name, originalName}) => {
                this.spectators[spectator.name] = {name: spectator.name}
                this.db.get_player(originalName)
                    .then(async ({player_id, banned}) => {
                        if(banned) {
                            this.kick(spectator.name)
                            this.unlock()
                            return
                        }
                        const newPlayer = !player_id
                        player_id = player_id || await this.db.create_player(originalName)
                        this.events.emit("new spectator", {name: spectator.name, wasSpectator, wasPlayer, newPlayer})
                        this.unlock()
                    })
                    .catch(() => {
                        this.unlock()
                    })
            })
            .catch(() => {
                this.unlock()
                this.autoChat("rejoin", [spectator.name])
            })
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
        this.spectatorJoined(data.spectatorDescription, false, true)
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

    playerNameChanged = async (data) => {
        //data.
        //     oldName      //string
        //     newName      //string
        //     gamePlayerId //integer
        await this.lock()
        const oldName = data.oldName
        const newName = data.newName
        //this.db.change_name(oldName, newName)
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
        this.unlock()
    }

    spectatorNameChanged = async (data) => {
        //data.
        //     oldName //string
        //     newName //string
        await this.lock()
        const oldName = data.oldName
        const newName = data.newName
        //this.db.change_name(oldName, newName)
        if(this.spectators[oldName]) {
            this.spectators[oldName].name = newName
            this.spectators[newName] = this.spectators[oldName]
            delete this.spectators[oldName]
        }
        this.unlock()
    }

    globalNameChanged = (data) => {
        //this is related to the all players list, and thus includes all online players
        //data.
        //     oldName //string
        //     newName //string
        const oldName = data.oldName
        const newName = data.newName
        //this.db.change_name(oldName, newName)
    }

    start = async () => {
        await this.lock()
        this.activePlayers = clone(this.players)
        this.socket.lobby.start()
        this.events.emit("game start", this.activePlayers)
        this.counter = 35
        this.unlock()
    }
}
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

module.exports = {Room}