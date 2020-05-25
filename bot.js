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
    const debug = true
    const events = new EventEmitter()
    const selfName = "xx"
    let token = await getToken(selfName, "xx", 'data.json')
    console.log(token)
    //return
    let socket = new SocketWrapper()
    
    const defaultSettings = JSON.parse(`{"roomName":"Athena Unstable","privateRoom":false,"password":"","roomSize":24,"numberOfSongs":25,"modifiers":{"skipGuessing":true,"skipReplay":true,"duplicates":true,"queueing":true,"lootDropping":true},"songSelection":{"advancedOn":false,"standardValue":3,"advancedValue":{"watched":30,"unwatched":0,"random":0}},"showSelection":{"watched":80,"unwatched":20,"random":0},"songType":{"advancedOn":false,"standardValue":{"openings":true,"endings":false,"inserts":false},"advancedValue":{"openings":0,"endings":0,"inserts":0,"random":20}},"guessTime":{"randomOn":false,"standardValue":25,"randomValue":[5,60]},"inventorySize":{"randomOn":false,"standardValue":20,"randomValue":[1,99]},"lootingTime":{"randomOn":false,"standardValue":90,"randomValue":[10,150]},"lives":3,"samplePoint":{"randomOn":true,"standardValue":1,"randomValue":[0,100]},"playbackSpeed":{"randomOn":false,"standardValue":1,"randomValue":[true,true,true,true]},"songDifficulity":{"advancedOn":false,"standardValue":{"easy":true,"medium":true,"hard":true},"advancedValue":[0,100]},"songPopularity":{"advancedOn":false,"standardValue":{"disliked":true,"mixed":true,"liked":true},"advancedValue":[0,100]},"playerScore":{"advancedOn":false,"standardValue":[1,10],"advancedValue":[true,true,true,true,true,true,true,true,true,true]},"animeScore":{"advancedOn":false,"standardValue":[2,10],"advancedValue":[true,true,true,true,true,true,true,true,true]},"vintage":{"standardValue":{"years":[1950,2020],"seasons":[0,3]},"advancedValueList":[]},"type":{"tv":true,"movie":true,"ova":true,"ona":true,"special":true},"genre":[],"tags":[],"gameMode":"Standard"}`)



    if (debug) {
        var listener = socket.on(EVENTS.ALL, (data, listener, fullData) => {
            //console.log(data)
            //console.log(listener)
            console.log(fullData)
        })
    }

	await socket.connect(token)

    const db = new Database("default.db")
    const theChat = new ChatController(socket, events, selfName, true)
    theChat.start()
    const theRoom = new Room(socket, events, db)
    const theGame = new Game(socket, events, db)
    const theChatMonitor = new ChatMonitor(socket, events, db, selfName, "rating")
    const theSocialManager = new SocialManager(socket, events, db)
    socket.roomBrowser.host(defaultSettings)
    let stillon = true
    events.on("terminate", () => {stillon = false})
    socket.on(EVENTS.FORCED_LOGOFF, ({reason}) => {
        events.emit("terminate")
        console.log("forced logged off", reason)
    })
    socket.on(EVENTS.SERVER_RESTART, ({time, msg}) => {
        const milliseconds = (time*60-30)*1000
        setTimeout(() => {
            events.emit("terminate")
            console.log("server restarted", msg)
        }, milliseconds)
    })
    while(stillon){
        events.emit("tick")
        await sleep(1000)
    }
    await sleep(2000)
    theRoom.destroy()
    if (debug) {
        listener.destroy()
    }

	await sleep(1000)

	socket.disconnect()
}

class Bot{
    constructor(username, password, settings, slaves=[], isSlave=false){

    }
}

main()
