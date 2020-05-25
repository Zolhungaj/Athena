const {EVENTS, sleep} = require('./node/amq-api')
const player = require('./player')
const Song = require("./song").Song
class Game {
    constructor(socket, events){
        this.socket = socket
        this.events = events

        this.active = false
        this.players = {}
        this.songList = []

        

        events.on("game start", (players) => this.start(players))
        this.noSongsListener = socket.on(EVENTS.QUIZ_NO_SONGS, () => this.startFailedNoSongs())
        this.quizFatalErrorListener = socket.on(EVENTS.QUIZ_FATAL_ERROR, () => this.startFailed())
        this.quizReturnLobbyResultListener = socket.on(EVENTS.QUIZ_RETURN_LOBBY_VOTE_RESULT, ({passed, reason}) => this.returnLobby(passed, reason))
        this.quizOverListener = socket.on(EVENTS.QUIZ_OVER, (data) => this.quizOver(data))
        this.quizReadyListener = socket.on(EVENTS.QUIZ_READY, ({numberOfSongs}) => this.quizReady(numberOfSongs))
    
        this.playerLeftListener = socket.on(EVENTS.PLAYER_LEFT, (data) => this.playerLeft(data))

        this.quizEndResultListener = socket.on(EVENTS.QUIZ_END_RESULT, (data) => this.quizEndResult(data))
        this.answerResultsListener = socket.on(EVENTS.ANSWER_RESULTS, (data) => this.answerResults(data))
    }

    answerResults = ({players, groupMap, songInfo}) => {
        //groupMap [] //list of lists of gamePlayerIds, tells us who is in each box
        //players [] //list of players
        //       correct
        //       gamePlayerId
        //       level
        //       pose
        //       position
        //       positionSlot
        //       score
        //songInfo.
        //         animeNames.
        //                    english
        //                    romaji
        //         artist
        //         songName
        //         type
        //         typeNumber
        //         urlMap.
        //                (animethemes.
        //                             (1080
        //                             (720
        //                             (480
        //                (openingsmoe.
        //                             (1080
        //                             (720
        //                             (480
        //                (catbox.
        //                        (720
        //                        (480
        //                        (0
        const animeName = songInfo.animeNames.english || ongInfo.animeNames.romaji
        const artist = songInfo.artist
        const songName = songInfo.songName
        let type
        switch(songInfo.type){
            case 1:
                type = "Opening " + songInfo.typeNumber
                break
            case 2:
                type = "Ending " + songInfo.typeNumber
                break
            case 3:
                type = "Insert"
                break
            default:
                type = "Unkown " + songInfo.typeNumber
                break
        }
        const urlMap = songInfo.urlMap
        let url
        const catbox = urlMap.catbox
        const animethemes = urlMap.animethemes
        const openingsmoe = urlMap.openingsmoe
        if(catbox){
            if(catbox["0"]){
                url = catbox["0"]
            }
            if(catbox["480"]){
                url = catbox["480"]
            }
            if(catbox["720"]){
                url = catbox["720"]
            }
        }
        if(animethemes){
            if(animethemes["480"]){
                url = animethemes["480"]
            }
            if(animethemes["720"]){
                url = animethemes["720"]
            }
            if(animethemes["1080"]){
                url = animethemes["1080"]
            }
        }
        if(openingsmoe){
            if(openingsmoe["480"]){
                url = openingsmoe["480"]
            }
            if(openingsmoe["720"]){
                url = openingsmoe["720"]
            }
            if(openingsmoe["1080"]){
                url = openingsmoe["1080"]
            }
        }
        const song = new Song(animeName, songName, artist, type, url)
        this.songList.push(song)
        for(let i = 0; i < players.length; i++){
            const {correct, gamePlayerId, level, pose, position, positionSlot, score} = players[i]
            let player
            for(let name in players){
                if (gamePlayerId === players[name]){
                    player = players[name]
                }
            }
            if(!player){
                console.log("missing player", players[i])
                continue
            }
            if(correct){
                player.correct_songs.push({song, answer})
            }else{
                player.wrong_songs.push({song, answer})
            }
        }

    }

    chat = (msg) => {
        this.events.emit("chat", msg)
    }

    autoChat = (msg, replacements=[]) => {
        this.events.emit("auto chat", msg, replacements)
    }

    start(players) {
        this.players = players
        this.songList = []
    }

    quizReady(numberOfSongs) {
        this.active = true
    }

    startFailedNoSongs() {
        this.autoChat("no_songs")
        this.quizDone()
    }

    startFailed() {
        this.autoChat("quiz_error")
        this.quizDone()
    }

    returnLobby(passed, reason){
        if(passed){
            this.earlyEnd()
        }
    }

    earlyEnd(){
        this.events.emit("auto chat", "early_end")
        //this.events.emit("record game", this.players)
        this.db.record_game(this.songList, this.players)
        this.active = false
        this.quizDone()
    }

    quizEndResult(data) {
        this.active = false
        //this.events.emit("record game", this.players)
        this.db.record_game(this.songList, this.players)
    }

    quizOver({spectators, inLobby, settings, inQueue, hostName, gameId, players}){
        if(this.active){
            this.earlyEnd()
        }else{
            this.autoChat("game_complete")
            this.quizDone()
        }
    }

    playerLeft(data) {
        
    }

    quizDone(){
        this.players = {}
        this.events.emit("quiz done")
    }
}
module.exports = {Game}