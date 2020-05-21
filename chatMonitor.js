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
        const senderIsPrivileged = this.isPrivileged(sender)
        const reason = this.isBad(message)
        if(reason) {
            if(senderIsPrivileged) {
                this.autoChat("scorn_admin", [sender])
            }else {
                this.kick(sender, reason)
                this.socket.social.report("Verbal Abuse", reason, sender)
                return
            }
        }
        if(message[0] === "/"){
            this.handleCommand(sender, message.slice(1))
        }

    }

    handleCommand = (sender, command) => {
        const parts = command.split(" ")
        const isAdmin = this.isAdmin(sender)
        const isModerator = this.isModerator(sender)

        switch(parts[0].toLowerCase()) {
            case "help":
                const possibility = this.premadeMessages[("help_"+parts[1]).toLowerCase()]
                if(possibility){
                    console.log(possibility)
                    this.chat(possibility[0])
                }else{
                    this.autoChat("help")
                    if(isAdmin){
                        this.autoChat("help_admin")
                    }
                    if(isModerator){
                        this.autoChat("help_moderator")
                    }
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
                if(isAdmin){
                    this.events.emit("terminate")
                }else{
                    this.autoChat("permission_denied", [sender])
                }
                break
            case "addadmin":
                if(isAdmin){
                    this.autoChat("not_implemented")
                }else{
                    this.autoChat("permission_denied", [sender])
                }
                break
            case "ban":
                if(isAdmin) {
                    this.ban(parts[1], parts.slice(2).join(""), sender)
                }else{
                    this.autoChat("permission_denied", [sender])
                }
                break
            case "elo":
                if(parts[1]){
                    if(isModerator){
                        this.autoChat("elo", [parts[1], this.db.get_or_create_elo(parts[i]), "cheese"])
                    }else{
                        this.autoChat("permission_denied", [sender])
                    }
                }else{
                    this.autoChat("elo", [sender, this.db.get_or_create_elo(parts[i]), "cheese"])
                }
                break
            case "forceevent":
                if(isModerator){
                    this.events.emit("forceevent")
                }else{
                    this.autoChat("permission_denied", [sender])
                }
                break
            case "kick":
                if(isModerator){
                    this.kick(parts[1], parts.slice(2).join(""), sender)
                }else{
                    this.autoChat("permission_denied", [sender])
                }
                break
            case "setchattiness":
                if(isModerator){
                    if(isNaN(parts[1])){
                        this.autoChat("nan", [parts[1]])
                    }else{ 
                        this.events.emit("setchattiness", Number(parts[1]))
                    }
                }else{
                    this.autoChat("permission_denied", [sender])
                }
                break
            default:
                this.autoChat("unknown_command")
                break
        }
        
    }

    isPrivileged(name){
        return this.isAdmin(name) || this.isModerator(name)
    }

    isAdmin(name){
        return this.db.is_administrator(name)
    }

    isModerator(name){
        return this.db.is_moderator(name)
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
}
module.exports = {ChatMonitor}