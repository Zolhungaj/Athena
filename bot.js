const {SocketWrapper, getToken, EVENTS, sleep} = require('./node/amq-api')
const EventEmitter = require("events").EventEmitter
const Room = require("./room").Room
const ChatMonitor = require("./chatMonitor").ChatMonitor
const ChatController = require("./chatController").ChatController
const Game = require("./game").Game
const SocialManager = require("./socialManager").SocialManager
const Database = require("./database").Database
const parse = require('csv-parse/lib/sync')

const fs = require('fs');

async function main() {
    const data = fs.readFileSync("bots.csv")
    const fields = parse(data, {
        columns: true, 
        delimiter: "|",
        trim: true
    })
    const bots = []
    const slaves = []

    for(let i = 0; i < fields.length; i++){
        const field = fields[i]
        const bot = new Bot(field.username, field.password, field.database, field.settings, field.leaderboard, slaves, field.isSlave)
        bots.push(bot)
        await bot.connect()
        if(field.isSlave){
            slaves.push(bot)
        }else{
            bot.start()
        }
    }
}

class Bot{
    constructor(username, password, database, settings, leaderboard="rating", slaves=[], isSlave=false, debug=true){
        this.username = username
        this.password = password
        this.database = database
        this.settings = settings
        this.leaderboard = leaderboard
        this.slaves = slaves
        this.isSlave = isSlave
        this.debug = debug


        this.events = new EventEmitter()
        this.socket = new SocketWrapper()
        
        if (debug) {
            this.listener = socket.on(EVENTS.ALL, (data, listener, fullData) => {
                //console.log(data)
                //console.log(listener)
                console.log(fullData)
            })
        }
    }

    connect = async () =>{
        fs.unlinkSync(username + 'data.json')
        let token = await getToken(username, password, username + 'data.json')
        console.log(token)
        await this.socket.connect(token)
    }

    start = (settings=this.settings, database=this.database, leaderboard=this.leaderboard) => {
        this.socket.roomBrowser.host(settings)
        let stillon = true
        const terminateListener = this.events.on("terminate", () => {stillon = false})
        const db = new Database(database)
        const theChat = new ChatController(this.socket, this.events, this.username, this.debug)
        theChat.start()
        const theRoom = new Room(this.socket, this.events, db)
        const theGame = new Game(this.socket, this.events, db)
        const theChatMonitor = new ChatMonitor(this.socket, this.events, db, this.username, leaderboard)
        const theSocialManager = new SocialManager(this.socket, this.events, db)
        const forcedLogOffListener = socket.on(EVENTS.FORCED_LOGOFF, ({reason}) => {
            events.emit("terminate")
            console.log("forced logged off", reason)
        })
        const serverRestartListener = socket.on(EVENTS.SERVER_RESTART, ({time, msg}) => {
            serverRestartListener.destroy()
            const milliseconds = (time*60-30)*1000
            setTimeout(() => {
                events.emit("terminate")
                console.log("server restarted", msg)
            }, milliseconds)
        })

        const destroy = () => {
            terminateListener.destroy()
            db.destroy()
            theChat.destroy()
            theRoom.destroy()
            theGame.destroy()
            theChatMonitor.destroy()
            theSocialManager.destroy()
            forcedLogOffListener.destroy()
            serverRestartListener.destroy()
        }

        const tick = () =>{
            if(stillon){
                events.emit("tick")
                setTimeout(tick, 1000)
                return
            }else{
                destroy()
            }
        }
    }

    destroy(){
        this.events.emit("terminate")
        if(this.debug){
            this.listener.destroy()
        }
        this.socket.disconnect()
    }
}

main()
