const {SocketWrapper, getToken, EVENTS, sleep} = require('./node/amq-api')
const fs = require("fs")
class ChatMonitor {
    constructor(socket, events, db) {
        this.socket = socket
        this.events = events
        this.db = db
        this.premadeMessages = {}
        this.grudges = [] //players that will be kicked as soon as they rejoin
        this.playerJoinedListener = socket.on(EVENTS.NEW_PLAYER, ({name}) => this.onJoin(name))
        this.handleChatListener = socket.on(EVENTS.NEW_SPECTATOR, ({name}) => this.onJoin(name))
        this.handleChatListener = socket.on(EVENTS.GAME_CHAT_MESSAGE, (data) => this.handleChat(data))
        this.blacklistedWords = []

        fs.readFile("en_UK.json", (err, data) => {
            console.log(data)
            this.premadeMessages = JSON.parse(data)
        })

        fs.readFile("blacklisted_words.json", (err, data) => {
            const banned_words = JSON.parse(data).banned_words
            for(let i = 0; i < banned_words.length; i++){
                const regex = new RegExp(banned_words[i].regex, "gi")
                const reason = banned_words[i].reason
                this.blacklistedWords.push({regex, reason})
            }
        })
    }


    chat = (msg) => {
        this.events.emit("chat", msg)
    }

    autoChat = (msg, replacements=[]) => {
        this.events.emit("auto chat", msg, replacements)
    }

    pm = (target, msg) => {
        this.events.emit("pm", target, msg)
    }

    autopm = (target, message, replacements=[]) => {
        this.events.emit("auto pm", target, message, replacements)
    }

    kick(name, reason, kicker="System") {
        this.socket.lobby.kick(name)
        this.grudges.push({name, reason, kicker})

        const successListener = this.socket.on(EVENTS.PLAYER_LEFT, (data) => {
            if(data.player.name === name && data.kicked){
                this.autoChat("kick_chat", [name, reason])
                this.autopm(name, "kick_pm", [reason])
            }
        })
        setTimeout(() => {successListener.destroy()}, 3000)
    }

    ban(name, reason, kicker="System") {
        this.socket.lobby.kick(name)
        this.db.ban_player(name, reason, kicker)
        this.grudges.push({name, reason, kicker})

        const successListener = this.socket.on(EVENTS.PLAYER_LEFT, (data) => {
            if(data.player.name === name && data.kicked){
                this.autoChat("ban_chat", [name, reason])
                this.autopm(name, "ban_pm", [reason])
            }
        })
        setTimeout(() => {successListener.destroy()}, 3000)
    }

    onJoin = (name) => {
        const reason = this.isBad(name)
        if(reason){
            this.socket.social.report("Offensive Name", reason, name)
            this.kick(name, reason)
            return
        }
        for(let i = 0; i < this.grudges.length; i++){
            const grudge = this.grudges[i]
            if (name === grudge.name){
                this.kick(name, grudge.reason)
            }
        }
    }

    handleChat = ({sender, message, messageId, emojis: {emotes, customEmojis}, badges, atEveryone}) => {
        if(!message) {
            return
        }
        const reason = this.isBad(message)
        if(reason) {
            this.isPrivileged(sender, ()=>{this.autoChat("scorn_admin", [sender])}, () => {
                this.kick(sender, reason)
                this.socket.social.report("Verbal Abuse", reason, sender)
            })
        }
        if(message[0] === "/"){
            this.handleCommand(sender, message.slice(1))
        }

    }

    handleCommand = (sender, command) => {
        const parts = command.split(" ")

        switch(parts[0].toLowerCase()) {
            case "help":
                const possibility = this.premadeMessages[("help_"+parts[1]).toLowerCase()]
                if(possibility){
                    console.log(possibility)
                    this.chat(possibility[0])
                }else{
                    this.autoChat("help")
                    this.isAdmin(sender, () => {this.autoChat("help_admin")})
                    this.isModerator(sender, () => {this.autoChat("help_moderator")})
                }
                break
            case "about":
                this.autoChat("about")
                if(Math.random()*100 < 10){
                    this.autoChat("about_joke_intro")
                    this.autoChat("about_joke")
                }
                break
            case "missed":

            case "list":

            case "answer":
            
            case "answeranime":

            case "answersong":

            case "answerartist":

            case "profile":

            case "leaderboard":

                this.autoChat("not_implemented")
                break

            case "stop":
                this.isAdmin(sender, () => {this.events.emit("terminate")}, () => {this.autoChat("permission_denied", [sender])})
                break
            case "addadmin":
                this.isAdmin(sender, () => {this.autoChat("not_implemented")}, () => {this.autoChat("permission_denied", [sender])})
                break
            case "ban":
                this.isAdmin(sender, () => {this.ban(parts[1], parts.slice(2).join(""), sender)}, () => {this.autoChat("permission_denied", [sender])})
                break
            case "elo":
                if(parts[1]){
                    this.isModerator(sender, () => {
                        const ret = (player_id) => {
                            if(player_id){
                                this.db.get_or_create_elo(player_id, (elo) => {this.autoChat("elo", [parts[1], elo, "TBD"])})
                            }else{
                                this.autoChat("unknown_player", [sender])
                            }
                        }
                        this.db.get_player_id(parts[1], ret)
                    }, () => { this.autoChat("permission_denied", [sender] )})
                }else{
                    const ret = (player_id) => {
                        if(player_id){
                            this.db.get_or_create_elo(player_id, (elo) => {this.autoChat("elo", [sender, elo, "TBD"])})
                        }else{
                            this.autoChat("unknown_player", [sender])
                        }
                    }
                    this.db.get_player_id(sender, ret)
                }
                break
            case "forceevent":
                this.isModerator(sender, () => {this.events.emit("forceevent")}, () => {this.autoChat("permission_denied", [sender])})
                break
            case "kick":
                this.isModerator(sender, () => {
                    this.isPrivileged(parts[1], () => {this.autoChat("permission_denied", [sender])}, () => {this.kick(parts[1], parts.slice(2).join(""), sender)})
                }, () => {this.autoChat("permission_denied", [sender])})
                break
            case "setchattiness":
                this.isModerator(sender, () => {
                    if(isNaN(parts[1])){
                        this.autoChat("nan", [parts[1]])
                    }else{ 
                        this.events.emit("setchattiness", Number(parts[1]))
                    }
                }, () => {this.autoChat("permission_denied", [sender])})
                break
            default:
                this.autoChat("unknown_command")
                break
        }
        
    }

    isPrivileged(name, callback_true=this.dud, callback_false=this.dud){
        let ret = () => {
            this.isAdmin(callback_true, callback_false)
        }
        this.isModerator(name, callback_true, ret)
    }

    isAdmin(name, callback_true=this.dud, callback_false=this.dud){
        let ret = (bool) => {
            if(bool){
                callback_true(name)
            }else{
                callback_false(name)
            }
        }
        this.db.is_administrator(name, ret)
    }

    isModerator(name, callback_true=this.dud, callback_false=this.dud){
        let ret = (bool) => {
            if(bool){
                callback_true(name)
            }else{
                callback_false(name)
            }
        }
        this.db.is_moderator(name, ret)
    }

    isBad = (message) => {
        for(let i = 0; i < this.blacklistedWords.length; i++){
            const match = message.match(this.blacklistedWords[i].regex)
            if(match) {
                return this.blacklistedWords[i].reason
            }
        }
        return ""
    }
    dud = () => {}
}
module.exports = {ChatMonitor}