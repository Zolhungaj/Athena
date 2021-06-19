const {SocketWrapper, getToken, EVENTS, sleep} = require('./node/amq-api')
const fs = require("fs")
const util = require('util');
const { COPYFILE_FICLONE_FORCE } = require('constants');
class ChatMonitor {
    constructor(socket, events, db, nameResolver, selfName, leaderboardType) {
        this.socket = socket
        this.events = events
        this.db = db
        this.nameResolver = nameResolver
        this.selfName = selfName
        this.leaderboardType = leaderboardType
        this.premadeMessages = {}
        this.grudges = [] //players that will be kicked as soon as they rejoin

        this.playerJoinedListener = socket.on(EVENTS.NEW_PLAYER, ({name}) => this.onJoin(name))
        this.spectatorJoinedListener = socket.on(EVENTS.NEW_SPECTATOR, ({name}) => this.onJoin(name))
        this.handleChatListener = socket.on(EVENTS.GAME_CHAT_MESSAGE, (data) => this.handleChat(data))
        this.handleNewChatListener = socket.on(EVENTS.GAME_CHAT_UPDATE, ({messages, bubles}) => messages.forEach(message => this.handleChat(message)))
        
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

        this.dangerousActions = {
            CLEAR_SCORES: 1,
        }

        this.warnings = {
            1: "warning_clear_scores",
        }

        this.confirmations = {}

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
        this.spectatorJoinedListener.destroy()
        this.handleChatListener.destroy()
        this.handleNewChatListener.destroy()
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

    kick(nickname, reason, kicker="System") {
        this.nameResolver.getOriginalName(nickname).then(({name, originalName}) => {
            this.grudges.push({originalName, reason, kicker})
            const successListener = this.socket.on(EVENTS.PLAYER_LEFT, (data) => {
                if(data.player.name === name && data.kicked){
                    this.autoChat("kick_chat", [name, reason])
                    this.autopm(name, "kick_pm", [reason])
                }
            })
            this.socket.lobby.kick(name)
            setTimeout(() => {successListener.destroy()}, 3000)
        })
    }

    ban(nickname, reason, kicker="<System>") {
        this.nameResolver.getOriginalName(nickname)
            .then(({name, originalName}) => {
                this.db.get_player_id(originalName)
                    .then(player_id => {
                        if(!player_id){
                            this.autoChat("error", [kicker, "unknown player"])
                            return
                        }
                        this.db.get_player_truename(player_id)
                            .then(truename => {
                                this.db.ban_player(truename, reason, kicker)
                                    .catch((err) => {this.autoChat("error", [kicker, err])})
                                this.grudges.push({truename, reason, kicker})
                                
                                const successListener = this.socket.on(EVENTS.PLAYER_LEFT, (data) => {
                                    if(data.player.name === name && data.kicked){
                                        this.autoChat("ban_chat", [name, reason])
                                        this.autopm(name, "ban_pm", [reason])
                                    }
                                })
                                this.socket.lobby.kick(name)
                                setTimeout(() => {
                                    successListener.destroy()
                                    this.socket.social.block(name)
                                }, 3000)
                            })
                    })
            })
            .catch(() => {
                this.autoChat("error", [kicker, "unknown player"])
            })
    }

    unban(nickname, sender) {
        this.nameResolver.getOriginalName(nickname)
            .then(({name, originalName}) => {
                this.db.get_player_id(originalName)
                    .then(player_id => {
                        if(!player_id){
                            this.autoChat("error", [sender, "unknown player"])
                            return
                        }
                        this.db.get_player_truename(player_id)
                            .then(truename => {
                                this.db.unban_player(truename).catch((err) => {this.autoChat("error", [sender, err])})
                                this.grudges = this.grudges.filter(x => x.name !== truename)
                                this.socket.social.unblock(name)
                            })
                    })
            })
    }

    onJoin = (nickname) => {
        this.nameResolver.getOriginalName(nickname)
            .then(({name, originalName}) => {
                const reason = this.isBad(name) || this.isBad(originalName)
                if(reason){
                    this.socket.social.report("Offensive Name", reason, name)
                    this.kick(name, reason)
                    return
                }
                this.grudges.forEach((grudge) =>{
                    if (originalName === grudge.name){
                        this.kick(name, grudge.reason)
                    }
                })
            })
    }

    handleChat = ({sender, message, messageId, emojis: {emotes, customEmojis}, badges, atEveryone, teamMessage}) => {
        if(!message) {
            return
        }
        this.nameResolver.getOriginalName(sender)
        .then(({name, originalName}) => {
            this.db.save_message(originalName, message)
            const reason = this.isBad(message)
            if(reason) {
                this.isPrivileged(originalName).then((hasPrivilege) => {
                    if(hasPrivilege){
                        this.autoChat("scorn_admin", [name])
                    }else{
                        this.kick(name, reason)
                        this.socket.social.report("Verbal Abuse", reason, name)
                    }
                })
            }
            if(message[0] === "/"){
                this.handleCommandWrapper(originalName, message.slice(1), name)
            }
        })
        .catch(() => {
            console.log("unable to get name for", sender)
        })

    }

    
    requestConfirmation(username, action, payload){
        this.autoChat(this.warnings[action])
        if(this.confirmations[username]){
            this.abortConfirmation(username)
        }
        this.confirmations[username] = {action, payload, timeout: setTimeout(() => {
            this.abortConfirmation(username)
        }, 2 * 1000*60)}
    }

    abortConfirmation(username){
        if(this.confirmations[username]){
            clearTimeout(this.confirmations[username].timeout)
            delete this.confirmations[username]
        }
    }

    handleConfirmation(username){
        if(!this.confirmations[username]){
            this.autoChat("no_pending_confirmation")
            return
        }
        const {action, payload} = this.confirmations[username]
        this.abortConfirmation(username)
        switch(action){
            case this.dangerousActions.CLEAR_SCORES:
                const {startDate, endDate} = payload
                this.db.clearScores(startDate, endDate, username)
                    .then((value) => {this.autoChat("clear_score_success", [value, startDate, endDate])})
                    .catch((err) => {this.autoChat("clear_score_failure", [err])})
                break
            default:
                this.chat("if you see this open an issue on github plz CODE=" + action)

        }
    }

    handleCommandWrapper = (sender, command, senderNickname) => {
        this.handleCommand(sender, command, senderNickname).then(() => {})
        .catch(e => {
            //console.log(e)
            this.chat(e.message)
        })
    }

    handleCommand = async (sender, command, senderNickname) => {
        const parts = command.split(" ")
        let leaderboardrange = null

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
                    if (await this.db.has_valour(sender)){
                        this.autoChat("help_valour_commands")
                    }
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
                        this.autopm(senderNickname, "song", [anime, type, title, artist, link])
                        this.autopm(senderNickname, "you_answered",[answer] )
                    }
                })
                break
            case "list":
                this.db.get_last_game(sender).then(rows => {
                    for(let i = 0; i < rows.length; i++){
                        const {anime, type, title, artist, link} = rows[i]
                        this.autopm(senderNickname, "song", [anime, type, title, artist, link])
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
                            this.events.emit("bonus anime", senderNickname, answeranime)
                        }
                        if(answersong){
                            this.events.emit("bonus song", senderNickname, answersong)
                        }
                        if(answerartist){
                            this.events.emit("bonus artist", senderNickname, answerartist)
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
                        this.events.emit("bonus anime", senderNickname, answer)
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
                        this.events.emit("bonus song", senderNickname, answer)
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
                        this.events.emit("bonus artist", senderNickname, answer)
                    }
                    else{
                        this.autoChat("usage_answerartist")
                    }
                }else{
                    this.autoChat("usage_answerartist")
                }
                break
            case "friend":
                this.socket.social.addFriend(senderNickname)
                break
            case "profile":
                if(parts[1]){
                    if(await this.isModerator(sender))
                        this.profile(parts[1])
                    else
                        this.autoChat("permission_denied", [sender])
                }else{
                    this.profile(senderNickname)
                }
                break
            case "leaderboard":
            case "lb":
                this.autoChat("leaderboardrangeinfo")
                leaderboardrange = leaderboardrange ?? "monthly"
            case "leaderboardall":
            case "lba":
                leaderboardrange = leaderboardrange ?? "alltime"
            case "leaderboardyearly":
            case "lby":
                leaderboardrange = leaderboardrange ?? "yearly"
            case "leaderboardmonthly":
            case "lbm":
                leaderboardrange = leaderboardrange ?? "monthly"
            case "leaderboardweekly":
            case "lbw":
                leaderboardrange = leaderboardrange ?? "weekly"
            case "leaderboarddaily":
            case "lbd":
                leaderboardrange = leaderboardrange ?? "daily"

                let leaderboardfunc = async () => {return []} //empty func so not everything dies if this doesn't get defined
                let lowerLimit
                let upperLimit
                const oneday = 24 * 60  *60 * 1000 //one day in milliseconds
                const now = new Date(Date.now())
                const year = now.getUTCFullYear().toString()
                const month = (now.getUTCMonth + 1).toString().padStart(2, "0")
                const day = now.getUTCDate().toString().padStart(2, "0")
                const currentDayOfWeek = now.getUTCDay() == 0 ? 6 : now.getUTCDay() - 1 //by default sunday is day 0, that is wrong however, the calender week should start on Monday
                const weekStart = new Date(now.getTime - (currentDayOfWeek * oneday)) //this is the monday of the current week UTC time
                const weekEnd = new Date(weekStart.getTime() + oneday * 6) //this is the sunday of the current week UTC time
                switch(leaderboardrange){
                    case "alltime":
                        lowerLimit = undefined
                        upperLimit = undefined
                        break
                    case "yearly":
                        lowerLimit = `${year}` //text comparison, so start of year can be expressed as such
                        upperLimit = `${year}-12-31 23:59:59`
                        break
                    case "monthly":
                        lowerLimit = `${year}-${month}`
                        upperLimit = `${year}-${month}-31 23:59:59` //this is a text comparison, so doesn't matter if there are fewer days in the month
                        break
                    case "daily":
                        lowerLimit = `${year}-${month}-${day}`
                        upperLimit = `${year}-${month}-${day} 23:59:59`
                        break
                    case "weekly":
                        lowerLimit = `${weekStart.getUTCFullYear()}-${weekStart.getUTCMonth().toString().padStart(2, "0")}-${weekStart.getUTCDate().toString().padStart(2, "0")}`
                        upperLimit = `${weekEnd.getUTCFullYear()}-${weekEnd.getUTCMonth().toString().padStart(2, "0")}-${weekEnd.getUTCDate().toString().padStart(2, "0")} 23:59:59`
                        break
                    default:
                        this.chat("error, unknown leaderboardrange")
                        break
                }
                switch(this.leaderboardType){
                    case "rating": //this is the elo rating
                        leaderboardfunc = this.db.get_elo_leaderboard
                        break
                    case "result": //this is the correct songs count
                        leaderboardfunc = this.db.get_result_leaderboard
                        break
                    case "speedrun":
                        leaderboardfunc = this.db.get_result_leaderboard_speedrun
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
                            rows = await leaderboardfunc(Number(parts[1]), lowerLimit, upperLimit)
                    }
                    else
                        this.autoChat("permission_denied", [senderNickname])
                }else
                    rows = await leaderboardfunc(undefined, lowerLimit, upperLimit)
                
                if(rows){
                    this.autoChat("leaderboard"+leaderboardrange, [rows.length])
                    for(let i = 0; i < rows.length; i++){
                        const pos = i + 1
                        const truename = rows[i].truename
                        const score = rows[i][this.leaderboardType]
                        const count = rows[i].count
                        const time = rows[i].time
                        if(count && time){
                            this.chat(pos + ":" + " " + truename + ", " + score + ((count>1)?(" x" + count):"") + " [" + time + "]")
                        }else{
                            this.chat(pos + ":" + " " + truename + ", " + score)
                        }
                    }
                }
                break
            case "say":
                if(await this.isAdmin(sender))
                    this.chat(parts.slice(1).join(" "))
                else
                    this.autoChat("permission_denied", [senderNickname])
                break
            case "stop":
                if(await this.isAdmin(sender))
                    this.events.emit("terminate")
                else
                    this.autoChat("permission_denied", [senderNickname])
                break
            case "addadmin":
                if(await this.isAdmin(sender)){
                    if(parts[1]){
                        this.nameResolver.getOriginalName(parts[1])
                            .then(({name, originalName}) => {
                                this.db.add_administrator(originalName, sender)
                                    .then(() => {
                                        this.autoChat("success", [sender])
                                    })
                                    .catch(err => {
                                        this.autoChat("error", [sender, err])
                                    })

                            })
                            .catch(() => {
                                this.autoChat("error", [senderNickname, "unable to resolve username"])
                            })
                    }else {
                        this.autoChat("error", [senderNickname, "invalid username"])
                    }
                }else{
                    this.autoChat("permission_denied", [senderNickname])
                }
                break
            case "addmoderator":
                if(await this.isAdmin(sender)){
                    if(parts[1]){
                        this.nameResolver.getOriginalName(parts[1])
                            .then(({name, originalName}) => {
                                this.db.add_moderator(originalName, sender)
                                    .then(() => {
                                        this.autoChat("success", [senderNickname])
                                    })
                                    .catch(err => {
                                        this.autoChat("error", [senderNickname, err])
                                    })
                            })
                            .catch(() => {
                                this.autoChat("error", [senderNickname, "unable to resolve username"])
                            })
                    }else {
                        this.autoChat("error", [senderNickname, "invalid username"])
                    }
                }else{
                    this.autoChat("permission_denied", [senderNickname])
                }
                break
            case "ban":
                if(await this.isAdmin(sender)){
                    this.ban(parts[1], parts.slice(2).join(" "), sender)
                }else
                    this.autoChat("permission_denied", [senderNickname])
                break
            case "elo":
                let target = undefined
                if(parts[1]){
                    if(await this.isModerator(sender) || await this.isAdmin(sender)){
                        target = parts[1]
                    }else
                        this.autoChat("permission_denied", [senderNickname])
                }else{
                    target = senderNickname
                }
                if (target){
                    this.nameResolver.getOriginalName(target)
                        .then(({name, originalName}) => {
                            this.db.get_player_id(originalName)
                                .then(player_id => {
                                    if(player_id){
                                        this.db.get_or_create_elo(player_id)
                                            .then(elo => {
                                                this.elo_to_tier(elo)
                                                    .then(tier => {
                                                        let displayName = name
                                                        if(name !== originalName){
                                                            displayName += "(" + originalName + ")"
                                                        }
                                                        this.autoChat("elo", [displayName, elo, this.premadeMessages[tier][0]])
                                                    })
                                            })
                                    }else{
                                        this.autoChat("unknown_player", [target])
                                    }
                                })
                        })
                        .catch(() => {
                            this.autoChat("error", [senderNickname, "unable to resolve username"])
                        })
                }
                break
            case "forceevent":
                if(await this.isModerator(sender) || await this.isAdmin(sender))
                    this.events.emit("forceevent")
                else
                    this.autoChat("permission_denied", [senderNickname])
                break
            case "kick":
                if((await this.isModerator(sender) || await this.isAdmin(sender)) && ! await this.isPrivileged(parts[1]))
                    this.kick(parts[1], parts.slice(2).join(" "))
                else
                    this.autoChat("permission_denied", [senderNickname])
                break
            case "setchattiness":
                if(await this.isModerator(sender) || await this.isAdmin(sender)){
                    if(isNaN(parts[1])){
                        this.autoChat("nan", [parts[1]])
                    }else{ 
                        this.events.emit("setchattiness", Number(parts[1]))
                    }
                }else{
                    this.autoChat("permission_denied", [senderNickname])
                }
                break
            case "unban":
                if(await this.isAdmin(sender)){
                    this.unban(parts[1], sender)
                }else
                    this.autoChat("permission_denied", [senderNickname])
                break
            case "pause":
                this.chat("disabled due to bug")
                //this.socket.quiz.pause()
                break
            case "unpause":
                this.chat("disabled due to bug")
                //this.socket.quiz.unpause()
                break
            case "clearscores":
                if(await this.isAdmin(sender)){
                    const dateRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
                    const startDate = parts[1] + " " + parts[2]
                    const endDate = parts[3] + " " + parts[4]
                    if(dateRegex.test(startDate) && dateRegex.test(endDate)){
                        this.requestConfirmation(sender, this.dangerousActions.CLEAR_SCORES, {startDate, endDate})
                    }else{
                        this.autoChat("invalid_dates")
                    }
                }else{
                    this.autoChat("permission_denied", [senderNickname])
                }

                break
            case "confirm":
                this.handleConfirmation(sender)
                break

            case "abort":
                this.abortConfirmation(sender)
                break

            case "ping":
                if(parts[1]){
                    const currentTime = Date.now()
                    const timeDiff = currentTime - parts[1]
                    this.autoChat("pong", [timeDiff])
                }else{
                    const startTime = Date.now()
                    const sentMessage = "Ping@" + startTime
                    const listener = this.socket.on(EVENTS.GAME_CHAT_UPDATE, ({messages, bubles}) => messages.forEach(({sender, message}) => {
                        if(sender === this.selfName && message === sentMessage){
                            const endTime = Date.now()
                            const timeDiff = endTime - startTime
                            this.autoChat("ping", [timeDiff])
                            listener.destroy()
                        }
                    }))
                    this.chat(sentMessage)
                }
                break
            
            case "valour":
                if(await this.db.has_valour(sender)){
                    const level = this.number_to_roman_numeral(await this.db.get_valour_level(sender))
                    const surplus = this.number_to_roman_numeral(await this.db.get_valour_surplus(sender))
                    const parent = await this.db.get_valour_parent(sender)
                    const childrenCount = this.number_to_roman_numeral(await this.db.get_valour_child_count(sender))
                    this.autoChat("valour_status", [senderNickname, level, surplus, parent, childrenCount])
                }else{
                    this.autoChat("valour_negative", [senderNickname])
                }
                break
            case "roman":
                if(Number(parts[1]) < 100000 && Number(parts[1]) > -100000){
                    this.chat(this.number_to_roman_numeral(Number(parts[1])))
                }
                break
            case "givemevalour":
                if(await this.isAdmin(sender)){
                    await this.db.add_valour(sender)
                }else{
                    this.autoChat("permission_denied", [senderNickname])
                }
                break
            case "grantvalour":
                if(await this.isAdmin(sender)){
                    await this.db.add_valour(parts[1])
                }else{
                    this.autoChat("permission_denied", [senderNickname])
                }
                break
            case "givevalour":
                await this.db.add_valour(parts[1], sender)
                break
            case "listvalour":
                if(await this.isAdmin(sender)){
                    this.db.valour_readable().then(rows => rows.forEach(row => this.chat(`${row.player_truename} | ${row.level} | ${row.referer_truename}`)))
                }else{
                    this.autoChat("permission_denied", [senderNickname])
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

    elo_to_tier(elo){
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

    number_to_roman_numeral(num){
        if(num === 0){
            return '☆'
        }
        const thousand = 'Ⅿ'
        const fivehundred = 'Ⅾ'
        const hundred = 'Ⅽ'
        const fifty = 'Ⅼ'
        const onetotwelve = ['','Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ','Ⅹ','Ⅺ','Ⅻ']
        let output = ""
        if(num < 0){
            output += "÷"
            num *= -1
        }
        output += thousand.repeat(num/1000)
        num %= 1000
        if(num === 999){
            output += onetotwelve[1] + thousand
            return output
        }
        if(num >= 990){
            output += onetotwelve[10] + thousand
            num -= 990
        }
        if(num >= 900){
            output += hundred + thousand
            num -= 900
        }
        if(num >= 500){
            output += fivehundred
            num -= 500
        }
        if(num === 499){
            output += onetotwelve[1] + fivehundred
            return output
        }
        if(num >= 490){
            output += onetotwelve[10] + fivehundred
            num -= 490
        }
        if(num >= 400){
            output += hundred + fivehundred
            num -= 400
        }
        output += hundred.repeat(num/100)
        num %= 100
        if(num === 99){
            output += onetotwelve[1] + hundred
            return output
        }
        if(num >= 90){
            output += onetotwelve[10] + hundred
            num -= 90
        }
        if(num >= 50){
            output += fifty
            num -= 50
        }
        if(num === 49){
            output += onetotwelve[1] + fifty
            return output
        }
        if(num >= 40){
            output += onetotwelve[10] + fifty
            num -= 40
        }
        let remainder = Math.round((num - Math.floor(num))*12) //should be a number in the range 0-12
        num = Math.floor(num)
        if(remainder === 12){
            remainder = 0
            num++
        }
        if(num <= 0){
        }
        else if(num <= 12){
            output += onetotwelve[num]
        }else{
            output += onetotwelve[10].repeat(num/10)
            num %= 10
            output += onetotwelve[num]
        }
        if(remainder !== 0){
            //fractions in roman numerals are given as number of dots/12, S represents 6 dots
            const representations = ["", "·", ":", "∴", "∷", "⁙", "S"]
            if(remainder >= 6){
                output += representations[6]
                remainder -= 6
            }
            output += representations[remainder]
        }
        return output
    }

    async profile(username){
        try{
            var {name, originalName} = await this.nameResolver.getOriginalName(username) //a very rare var
        }catch(e){
            this.autoChat("profile_unknown")
            return
        }
        const player_id = await this.db.get_player_id(originalName)
        if(!player_id){
            this.autoChat("profile_unknown")
            return
        }
        this.autoChat("profile_username", [originalName])
        this.autoChat("profile_nickname", [name])
        if(await this.db.has_valour(originalName)){
            const level = this.number_to_roman_numeral(await this.db.get_valour_level(originalName))
            const count = this.number_to_roman_numeral(await this.db.get_valour_child_count(originalName))
            this.autoChat("profile_valour", [level, count])
        }
        switch(this.leaderboardType){
            case "rating":
                const elo = await this.db.get_or_create_elo(player_id)
                const tier = await this.elo_to_tier(elo)
                this.autoChat("profile_elo", [elo, this.premadeMessages[tier][0]])
                break
            case "result":
                {
                    const {result, time, count} = await this.db.get_best_result(player_id)
                    this.autoChat("profile_best_result", [result, count, time?time:this.premadeMessages["never"]])
                }
                break
            case "speedrun":
                {
                    const {result, total_time, time, count} = await this.db.get_best_result_speedrun(player_id)
                    this.autoChat("profile_best_result_speedrun", [result, total_time, count, time?time:this.premadeMessages["never"]])
                }
                break

        }

        const play_count = await this.db.get_player_game_count(player_id)
        const wins = await this.db.get_player_win_count(player_id)
        const song_count = await this.db.get_player_song_count(player_id)
        const hit_count = await this.db.get_player_hit_count(player_id)
        const hit_rate = await this.db.get_player_hit_rate(player_id)
        const play_time = await this.db.get_guess_time(player_id)
        const average_correct = await this.db.get_average_answer_time_correct(player_id)
        const average_wrong = await this.db.get_average_answer_time_wrong(player_id)


        this.autoChat("profile_play_count", [play_count])
        this.autoChat("profile_song_count", [song_count])
        this.autoChat("profile_hit_count", [hit_count])
        this.autoChat("profile_wins", [wins])
        this.autoChat("profile_play_rate", [hit_rate])
        this.autoChat("profile_play_time", [play_time])
        this.autoChat("profile_average_correct", [average_correct])
        this.autoChat("profile_average_wrong", [average_wrong])
    }
}
module.exports = {ChatMonitor}