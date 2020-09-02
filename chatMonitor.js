const {SocketWrapper, getToken, EVENTS, sleep} = require('./node/amq-api')
const fs = require("fs")
const util = require('util');
class ChatMonitor {
    constructor(socket, events, db, selfName, leaderboardType) {
        this.socket = socket
        this.events = events
        this.db = db
        this.selfName = selfName
        this.leaderboardType = leaderboardType
        this.premadeMessages = {}
        this.grudges = [] //players that will be kicked as soon as they rejoin
        this.playerJoinedListener = socket.on(EVENTS.NEW_PLAYER, ({name}) => this.onJoin(name))
        this.handleChatListener = socket.on(EVENTS.NEW_SPECTATOR, ({name}) => this.onJoin(name))
        this.handleChatListener = socket.on(EVENTS.GAME_CHAT_MESSAGE, (data) => this.handleChat(data))
        this.blacklistedWords = []
        this.last_generated = -1
        this.tiers = {}
        this.tiers.champion = -1
        this.tiers.grandmaster = -1
        this.tiers.master = -1
        this.tiers.diamond = -1
        this.tiers.platinum = -1
        this.tiers.gold = -1
        this.tiers.silver = -1
        this.tiers.bronze = -1
        this.tiers.iron = -1

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
        db.create_player(selfName).then(() => {db.add_administrator(selfName).catch(() =>{})}) //make sure bot doesn't do something stupid like banning itself
    }

    destroy = () => {
        this.playerJoinedListener.destroy()
        this.handleChatListener.destroy()
        this.handleChatListener.destroy()
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
        this.grudges.push({name, reason, kicker})
        
        const successListener = this.socket.on(EVENTS.PLAYER_LEFT, (data) => {
            if(data.player.name === name && data.kicked){
                this.autoChat("kick_chat", [name, reason])
                this.autopm(name, "kick_pm", [reason])
            }
        })
        this.socket.lobby.kick(name)
        setTimeout(() => {successListener.destroy()}, 3000)
    }

    ban(name, reason, kicker="System") {
        this.db.ban_player(name, reason, kicker)
        this.grudges.push({name, reason, kicker})
        
        const successListener = this.socket.on(EVENTS.PLAYER_LEFT, (data) => {
            if(data.player.name === name && data.kicked){
                this.autoChat("ban_chat", [name, reason])
                this.autopm(name, "ban_pm", [reason])
            }
        })
        this.socket.lobby.kick(name)
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
        this.db.save_message(sender, message)
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

    handleCommand = async (sender, command) => {
        const parts = command.split(" ")

        switch(parts[0].toLowerCase()) {
            case "0\\":
            case "o\\":
                this.chat("( ͡° ͜ʖ ͡°)")
                break
            case "help":
                const possibility = this.premadeMessages[("help_"+parts[1]).toLowerCase()]
                if(possibility){
                    //console.log(possibility)
                    this.chat(possibility[0])
                }else{
                    this.autoChat("help")
                    if (await this.isAdmin(sender))
                        this.autoChat("help_admin")
                    if (await this.isModerator(sender))
                        this.autoChat("help_moderator")
                }
                break
            case "lobby":
                this.socket.quiz.returnToLobby()
                break
            case "about":
                this.autoChat("about")
                if(Math.random()*100 < 10){
                    this.autoChat("about_joke_intro")
                    this.autoChat("about_joke")
                }
                break
            case "missed":
                this.db.get_missed_last_game(sender).then(rows => {
                    for(let i = 0; i < rows.length; i++){
                        const {anime, type, title, artist, link, answer} = rows[i]
                        this.autopm(sender, "song", [anime, type, title, artist, link])
                        this.autopm(sender, "you_answered",[answer] )
                    }
                })
                break
            case "list":
                this.db.get_last_game(sender).then(rows => {
                    for(let i = 0; i < rows.length; i++){
                        const {anime, type, title, artist, link} = rows[i]
                        this.autopm(sender, "song", [anime, type, title, artist, link])
                    }
                })
                break
            case "answer":
            case "a":
                if(parts[1]){
                    const answer = parts.slice(1).join(" ").trim()
                    if(answer){
                        const answers = answer.split("|")
                        const answeranime = (answers[0] || "").trim()
                        const answersong = (answers[1] || "").trim()
                        const answerartist = (answers[2] || "").trim()
                        if(answeranime){
                            this.events.emit("bonus anime", sender, answeranime)
                        }
                        if(answersong){
                            this.events.emit("bonus song", sender, answersong)
                        }
                        if(answerartist){
                            this.events.emit("bonus artist", sender, answerartist)
                        }
                    }else{
                        this.autoChat("usage_answer")
                    }
                }else{
                    this.autoChat("usage_answer")
                }
                break
            case "answeranime": //since anime is at the front of the answer command it doesn't need its own shortening
                if(parts[1]){
                    const answer = parts.slice(1).join(" ").trim()
                    if(answer){
                        this.events.emit("bonus anime", sender, answer)
                    }
                    else{
                        this.autoChat("usage_answeranime")
                    }
                }else{
                    this.autoChat("usage_answeranime")
                }
                break
            case "answersong":
            case "answers":
            case "as":
                if(parts[1]){
                    const answer = parts.slice(1).join(" ").trim()
                    if(answer){
                        this.events.emit("bonus song", sender, answer)
                    }
                    else{
                        this.autoChat("usage_answersong")
                    }
                }else{
                    this.autoChat("usage_answersong")
                }
                break
            case "answerartist":
            case "answera":
            case "aa":
                if(parts[1]){
                    const answer = parts.slice(1).join(" ").trim()
                    if(answer){
                        this.events.emit("bonus artist", sender, answer)
                    }
                    else{
                        this.autoChat("usage_answerartist")
                    }
                }else{
                    this.autoChat("usage_answerartist")
                }
                break
            case "profile":
                if(parts[1]){
                    if(await this.isModerator(sender))
                        this.profile(parts[1])
                    else
                        this.autoChat("permission_denied", [sender])
                }else{
                    this.profile(sender)
                }
                break
            case "leaderboard":
                let leaderboardfunc = async () => {return []} //empty func so not everything dies if this doesn't get defined
                switch(this.leaderboardType){
                    case "rating": //this is the elo rating
                        leaderboardfunc = this.db.get_elo_leaderboard
                        break
                    case "result": //this is the correct songs count
                        leaderboardfunc = this.db.get_result_leaderboard
                        break
                    case "score": //this is a custom score factor the bot can use, not implemented yet
                        //leaderboardfunc = this.db.get_score_leaderboard
                        //break
                    default:
                        leaderboardfunc = async () => { this.autoChat("leaderboard_disabled"); return []}
                }
                let rows = []
                if(parts[1]){
                    if(await this.isModerator(sender) || await this.isAdmin(sender)){
                        if(isNaN(parts[1]))
                            this.autoChat("nan", [parts[1]])
                        else
                            rows = await leaderboardfunc(Number(parts[1]))
                    }
                    else
                        this.autoChat("permission_denied", [sender])
                }else
                    rows = await leaderboardfunc()
                
                if(rows){
                    this.autoChat("leaderboard", [rows.length])
                    for(let i = 0; i < rows.length; i++){
                        const pos = i + 1
                        const truename = rows[i].truename
                        const score = rows[i][this.leaderboardType]
                        this.chat(pos + ":" + " " + truename + ", " + score)
                    }
                }
                break
            case "say":
                if(await this.isAdmin(sender))
                    this.chat(parts.slice(1).join(" "))
                else
                    this.autoChat("permission_denied", [sender])
                break
            case "stop":
                if(await this.isAdmin(sender))
                    this.events.emit("terminate")
                else
                    this.autoChat("permission_denied", [sender])
                break
            case "addadmin":
                if(await this.isAdmin(sender)){
                    if(parts[1]){
                        this.db.add_administrator(parts[1], sender).then(() => {this.autoChat("success", [sender])}).catch(err => {this.autoChat("error", [sender, err])})
                    }else {
                        this.autoChat("error", [sender, "invalid username"])
                    }
                }else{
                    this.autoChat("permission_denied", [sender])
                }
                break
            case "addmoderator":
                if(await this.isAdmin(sender)){
                    if(parts[1]){
                        this.db.add_moderator(parts[1], sender).then(() => {this.autoChat("success", [sender])}).catch(err => {this.autoChat("error", [sender, err])})
                    }else {
                        this.autoChat("error", [sender, "invalid username"])
                    }
                }else{
                    this.autoChat("permission_denied", [sender])
                }
                break
            case "ban":
                if(await this.isAdmin(sender)){
                    this.ban(parts[1], parts.slice(2).join(" "), sender)
                }else
                    this.autoChat("permission_denied", [sender])
                break
            case "elo":
                let target = undefined
                if(parts[1]){
                    if(await this.isModerator(sender) || await this.isAdmin(sender)){
                        target = parts[1]
                    }else
                        this.autoChat("permission_denied", [sender])
                }else{
                    target = sender
                }
                if (target){
                    this.db.get_player_id(target).then(player_id => {
                        if(player_id){
                            this.db.get_or_create_elo(player_id).then(elo => {
                                this.elo_to_tier(elo).then(tier => {
                                    this.autoChat("elo", [target, elo, this.premadeMessages[tier][0]])
                                })
                            })
                        }else{
                            this.autoChat("unknown_player", [target])
                        }
                    })
                }
                break
            case "forceevent":
                if(await this.isModerator(sender) || await this.isAdmin(sender))
                    this.events.emit("forceevent")
                else
                    this.autoChat("permission_denied", [sender])
                break
            case "kick":
                if((await this.isModerator(sender) || await this.isAdmin(sender)) && ! await this.isPrivileged(parts[1]))
                    this.kick(parts[1], parts.slice(2).join(" "))
                else
                    this.autoChat("permission_denied", [sender])
                break
            case "setchattiness":
                if(await this.isModerator(sender) || await this.isAdmin(sender)){
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

    async isPrivileged(name){
        return await this.isModerator(name) || await this.isAdmin(name)
    }

    async isAdmin(name){
        return await this.db.is_administrator(name)
    }

    async isModerator(name){
        return await this.db.is_moderator(name)
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

    generate_tiers(){
        /*generates the tiers
        by level:
        Champion: the best player(s) on the bot
        Grandmaster: top 0.5%
        Master: top 2%
        Diamond: top 5%
        Platinum: top 20%
        Gold: top 40%
        Silver: top 80%
        Bronze: top 95%
        Iron: the rest*/
        return new Promise((resolve, reject) => {
            this.db.get_total_games().then(total_games => {
                if(this.last_generated >= total_games){
                    resolve()
                    return
                }
                this.tiers.champion = -1
                this.tiers.grandmaster = -1
                this.tiers.master = -1
                this.tiers.diamond = -1
                this.tiers.platinum = -1
                this.tiers.gold = -1
                this.tiers.silver = -1
                this.tiers.bronze = -1
                this.tiers.iron = -1
                this.db.get_all_ratings().then(player_ratings => {
                    const total = player_ratings.length
                    let count = 0
                    for (let i = 0; i < total; i++){
                        const {rating} = player_ratings[i]
                        if(this.tiers.champion == -1 && count == 0){
                            this.tiers.champion = rating
                        }else if(this.tiers.grandmaster == -1 && count >= total*0.005){
                            this.tiers.grandmaster = rating
                        }else if(this.tiers.master == -1 && count >= total*0.02){
                            this.tiers.master = rating
                        }else if(this.tiers.diamond == -1 && count >= total*0.05){
                            this.tiers.diamond = rating
                        }else if(this.tiers.platinum == -1 && count >= total*0.20){
                            this.tiers.platinum = rating
                        }else if(this.tiers.gold == -1 && count >= total-total*0.40){
                            this.tiers.gold = rating
                        }else if(this.tiers.silver == -1 && count >= total*0.80){
                            this.tiers.silver = rating
                        }else if(this.tiers.bronze == -1 && count >= total*0.95){
                            this.tiers.bronze = rating
                        }
                        count += 1
                    }
                    resolve()
                })
            })
        })
    }

    elo_to_tier(elo, callback){
        return new Promise((resolve) => {
            //returns the tier equivalent
            this.generate_tiers().then(() => {
                if(elo >= this.tiers.champion){
                    resolve("champion")
                }else if(elo >= this.tiers.grandmaster){
                    resolve("grandmaster")
                }else if(elo >= this.tiers.master){
                    resolve("master")
                }else if(elo >= this.tiers.diamond){
                    resolve("diamond")
                }else if(elo >= this.tiers.platinum){
                    resolve("platinum")
                }else if(elo >= this.tiers.gold){
                    resolve("gold")
                }else if(elo >= this.tiers.silver){
                    resolve("silver")
                }else if(elo >= this.tiers.bronze){
                    resolve("bronze")
                }else if(elo >= this.tiers.iron){
                    resolve("iron")
                }else{
                    resolve("undefined")
                }
            })
        })
    }
    async profile(username){
        const player_id = await this.db.get_player_id(username)
        if(!player_id){
            this.autoChat("profile_unknown")
            return
        }
        const truename = await this.db.get_player_truename(player_id)
        this.autoChat("profile_username", [truename])

        const elo = await this.db.get_or_create_elo(player_id)
        const tier = await this.elo_to_tier(elo)
        this.autoChat("profile_elo", [elo, this.premadeMessages[tier][0]])    

        const play_count = await this.db.get_player_game_count(player_id)
        this.autoChat("profile_play_count", [play_count])

        const wins = await this.db.get_player_win_count(player_id)
        this.autoChat("profile_wins", [wins])

        const song_count = await this.db.get_player_song_count(player_id)
        this.autoChat("profile_song_count", [song_count])

        const hit_count = await this.db.get_player_hit_count(player_id)
        this.autoChat("profile_hit_count", [hit_count])

        const hit_rate = await this.db.get_player_hit_rate(player_id)
        this.autoChat("profile_play_rate", [hit_rate])
    }
}
module.exports = {ChatMonitor}