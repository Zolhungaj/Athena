const fs = require("fs")
const {EVENTS, sleep} = require('./node/amq-api')
class ChatController {
    constructor(socket, events, selfName, debug=false) {
        this.messageQueue = []
        this.socket = socket
        this.events = events

        this.run = false
        this.debug = debug

        this.chattiness = 25

        this.banned_words = [] //these are words the bot itself are not allowed to say

        this.premadeMessages = {}

        fs.readFile("banned_words.json", (err, data) => {
            const banned_words = JSON.parse(data).banned_words
            for(let i = 0; i < banned_words.length; i++){
                const regex = new RegExp(banned_words[i].regex, "gi")
                const replacement = banned_words[i].replacement
                this.banned_words.push({regex, replacement})
            }
        })

        fs.readFile("en_UK.json", (err, data) => {
            console.log(data)
            this.premadeMessages = JSON.parse(data)
        })

        events.on("new player", (data) => this.newPlayer(data))
        //events.on("early end", (data) => this.autoChat("early_end"))
        events.on("auto chat", (name, replacements=[]) => this.autoChat(name,replacements))
        events.on("chat", (msg) => this.chat(msg))
        events.on("terminate", () => {this.autoChat("stop")})
        events.on("setchattiness", (newValue) => {this.chattiness = newValue})

        socket.on(EVENTS.ANSWER_RESULTS, (data) => this.answerResults(data))
    }

    answerResults = (data) => {
        //data.
        //     players []
        //     songInfo.
        //              animeNames.
        //                         romaji
        //                         english
        //              songName
        //              urlMap.
        //              type
        //              typenumber
        if(Math.random()*100 < this.chattiness) {
            let animename = data.songInfo.animeNames.romaji
            if(Math.random()>0.5){
                animename = data.songInfo.animeNames.english
            }
            this.autoChat("answer_reveal", [animename])
        }
    }

    start = () => {
        this.run = true
        this.chatLoop()
    }

    chatLoop = () => {
        if (!this.run){
            return
        }
        const msg = this.messageQueue.shift()
        if(msg) {
            if(this.debug){
                console.log("chatLoop", "sent message:", msg)
            }
            this.socket.quiz.chat.send(msg)
        }
        setTimeout(this.chatLoop, 500)
    }

    chat = (msg) => {
        if (!msg) {
            return
        }
        msg = this.wordCensor(msg)
        const MESSAGE_LENGTH_LIMIT = 200
        const words = msg.split(" ")
        let currentMessage = ""
        if (words[0].length > MESSAGE_LENGTH_LIMIT) {
            words.splice(0,1,words[0].slice(0,MESSAGE_LENGTH_LIMIT), words[0].slice(MESSAGE_LENGTH_LIMIT))
        }
        currentMessage = words[0] //this is to avoid all messages starting with a space
        for(let i = 1; i < words.length; i++){
            if(words[i].length > MESSAGE_LENGTH_LIMIT){
                let slicepoint = MESSAGE_LENGTH_LIMIT - currentMessage.length - 1
                words.splice(i,1,words[i].slice(0,slicepoint), words[i].slice(slicepoint))
            }
            if(currentMessage.length + 1 + words[i].length > MESSAGE_LENGTH_LIMIT){
                this.messageQueue.push(currentMessage)
                currentMessage = words[i]
            }else{
                currentMessage += " " + words[i]
            }
        }
        if (currentMessage){
            this.messageQueue.push(currentMessage)
        }
    }

    wordCensor = (msg) => {
        let newMsg = msg
        let newMsg2 = msg
        for(let i = 0; i < 10; i++){
            for(let j = 0; j < this.banned_words.length; j++){
                const {regex, replacement} = this.banned_words[j]
                newMsg = newMsg.replace(regex, replacement)
            }
            if (newMsg === newMsg2){
                break
            }
            newMsg2 = newMsg
        }
        return newMsg
    }

    autoChat(messagename, replacements=[]){
        this.chat(this.getRandomMessage(messagename, replacements))
    }

    getRandomMessage = (messagename, replacements=[]) => {
        const arr = this.premadeMessages[messagename]
        if (arr && arr.length > 0) {
            let item = arr[Math.floor(Math.random() * arr.length)]
            for(let i = 0; i < replacements.length; i++) {
                item = item.replace(new RegExp("&"+(i+1), "g"), replacements[i])
            }
            return item
        }else {
            return "There appears to be an error in the message storage system for name \"" + messagename + "\""
        }
    }

    newPlayer = ({player, wasSpectator, changedLevel, changedAvatar, wasPlayer, newPlayer}) => {
        const name = player.name
        const level = player.level
        let the_milestone = 0
        let huge_milestone = 0
        let big_milestone = 0
        let milestone = 0
        for(let i = level - changedLevel + 1; i <= level; i++){
            if(i % 1000 === 0){
                the_milestone = i
            }
            if(i % 100 === 0){
                huge_milestone = i
            }
            if(i % 50 === 0){
                big_milestone = i
            }
            if (i % 10 === 0){
                milestone = i
            }
        }
        if(newPlayer){
            this.autoChat("greeting_new_player", [name, selfName])
        }else if(wasPlayer) {
            if(the_milestone){
                this.autoChat("comment_on_the_milestone_in_room", [name, the_milestone])
            }else if(huge_milestone) {
                this.autoChat("comment_on_huge_milestone_in_room", [name, level])
            }else if(big_milestone) {
                this.autoChat("comment_on_big_milestone_in_room", [name, level])
            }else if(milestone) {
                this.autoChat("comment_on_milestone_in_room", [name, level])
            }else if(changedLevel > 1) {
                this.autoChat("comment_on_big_level_up_in_room", [name, level, changedLevel])
            }else if(changedLevel) {
                this.autoChat("comment_on_level_up_in_room", [name, level])
            }else{
                if(Math.random()*100 < this.chattiness/16){
                    this.autoChat("comment_player", [name])
                }
            }
        }else if(the_milestone){
            this.autoChat("comment_on_the_milestone", [name, the_milestone])
        }else if(huge_milestone) {
            this.autoChat("comment_on_huge_milestone", [name, level])
        }else if(big_milestone) {
            this.autoChat("comment_on_big_milestone", [name, level])
        }else if(milestone) {
            this.autoChat("comment_on_milestone", [name, level])
        }else if(changedLevel > 1) {
            this.autoChat("comment_on_big_level_up", [name, level, changedLevel])
        }else if(changedLevel) {
            this.autoChat("comment_on_level_up", [name, level])
        }else if(changedAvatar){
            this.autoChat("comment_on_avatar", [name])
        }else if(wasSpectator){
            this.autoChat("spectator_to_player", [name])
        }else {
            this.autoChat("greeting_player", [name])
        }
    }

    newSpectator = ({spectator, wasSpectator, wasPlayer, newPlayer}) => {
        const name = spectator.name
        if(newPlayer){
            this.autoChat("greeting_new_player", [name, selfName])
        }else if(wasPlayer) {
            if(Math.random()*100 < this.chattiness/8){
                this.autoChat("player_to_spectator", [name])
            }
        }else if(wasSpectator){
            if(Math.random()*100 < this.chattiness/16){
                this.autoChat("comment_specator", [name])
            }
        }else {
            this.autoChat("greeting_spectator", [name])
        }
    }
}
module.exports = {ChatController}