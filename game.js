const {EVENTS, sleep} = require('./node/amq-api')
const player = require('./player')
const Song = require("./song").Song
class Game {
    constructor(socket, events, db, leaderboardType, debug=false){
        this.socket = socket
        this.events = events
        this.db = db
        this.leaderboardType = leaderboardType // to do custom score reports inbetween songs
        this.debug = debug

        this.active = false
        this.players = {}
        this.songList = []
        this.answers = {}

        this.bonusAnime = {}
        this.bonusArtist = {}
        this.bonusSong = {}
        
        this.bonusAnimeScore = {}
        this.bonusArtistScore = {}
        this.bonusSongScore = {}

        this.globalSongId = 0 // this is a counter to keep the database from crashing if the same song plays twice

        this.songStartTime = 0

        this.noSongsListener = socket.on(EVENTS.QUIZ_NO_SONGS, () => this.startFailedNoSongs())
        this.answersListener = socket.on(EVENTS.QUIZ_PLAYER_ANSWERS, ({answers}) => {
            answers.forEach(answer => {
                this.answers[answer.gamePlayerId] = {answer: answer.answer, answerNumber : answer.answerNumber}
            });
        })
        this.quizFatalErrorListener = socket.on(EVENTS.QUIZ_FATAL_ERROR, () => this.startFailed())
        this.quizReturnLobbyResultListener = socket.on(EVENTS.QUIZ_RETURN_LOBBY_VOTE_RESULT, ({passed, reason}) => this.returnLobby(passed, reason))
        this.quizOverListener = socket.on(EVENTS.QUIZ_OVER, (data) => this.quizOver(data))
        this.quizReadyListener = socket.on(EVENTS.QUIZ_READY, ({numberOfSongs}) => this.quizReady(numberOfSongs))
        
        this.playerLeftListener = socket.on(EVENTS.PLAYER_LEFT, (data) => this.playerLeft(data))
        
        this.quizEndResultListener = socket.on(EVENTS.QUIZ_END_RESULT, (data) => this.quizEndResult(data))
        this.answerResultsListener = socket.on(EVENTS.ANSWER_RESULTS, (data) => this.answerResults(data))
        
        this.gameStartListener = events.on("game start", (players) => this.start(players))

        this.bonusArtistListener = events.on("bonus artist", (player, answer) => { this.bonusArtist[player] = answer })
        this.bonusAnimeListener = events.on("bonus anime", (player, answer) => { this.bonusAnime[player] = answer })
        this.bonusSongListener = events.on("bonus song", (player, answer) => { this.bonusSong[player] = answer })

        this.playNextSongListener = socket.on(EVENTS.PLAY_NEXT_SONG, () => { this.songStartTime = Date.now() })
        this.playerAnsweredListener = socket.on(EVENTS.QUIZ_PLAYER_ANSWERED, (data) => {
            data.forEach(gamePlayerId => {
                const player = Object.values(this.players).find(entry => entry.gamePlayerId === gamePlayerId)
                if(!player){
                    console.log("missing player", gamePlayerId)
                    return
                }
                player.time = Date.now()
                if(this.debug){
                    console.log(player.name, "answered after", player.time-this.songStartTime, "milliseconds")
                }
            })
        })
    }

    destroy = () => {
        this.noSongsListener.destroy()
        this.answersListener.destroy()
        
        this.quizFatalErrorListener.destroy()
        this.quizReturnLobbyResultListener.destroy()
        this.quizOverListener.destroy()
        this.quizReadyListener.destroy()

        this.playerLeftListener.destroy()
        
        this.quizEndResultListener.destroy()
        this.answerResultsListener.destroy()
        
        
        this.events.removeAllListeners("game start")
        this.events.removeAllListeners("bonus artist")
        this.events.removeAllListeners("bonus anime")
        this.events.removeAllListeners("bonus song")

        this.playNextSongListener.destroy()
        this.playerAnsweredListener.destroy()
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
        const validAnswers = [songInfo.animeNames.english, songInfo.animeNames.romaji]
        const animeName = songInfo.animeNames.english || songInfo.animeNames.romaji
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
        const song = new Song(animeName, songName, artist, type, url, this.globalSongId++)
        this.songList.push(song)
        const customScoreReport = []
        for(let i = 0; i < players.length; i++){
            const {correct, gamePlayerId, level, pose, position, positionSlot, score} = players[i]
            const player = Object.values(this.players).find(entry => entry.gamePlayerId === gamePlayerId)
            if(!player){
                console.log("missing player", players[i])
                continue
            }
            let answer = ""
            let answerNumber = Infinity
            const pckg = this.answers[player.gamePlayerId]
            if(pckg){
                answer = pckg.answer
                answerNumber = pckg.answerNumber
            }
            if(!answer){
                player.time = null //prevents garbage data from forming
            }
            const time = player.time?player.time-this.songStartTime:null
            player.time = null
            const newData = {song, answer, time}
            if(correct){
                validAnswers.push(answer)
                player.correct_songs.push(newData)
                if(this.leaderboardType === "speedrun"){
                    customScoreReport.push({name: player.name, time})
                }
            }else{
                player.wrong_songs.push(newData)
            }
        }
        if(this.leaderboardType === "speedrun"){
            customScoreReport.sort((entry1, entry2) => entry1.time - entry2.time)
            customScoreReport.forEach((entry) => {
                this.chat(entry.name + ": " + entry.time + "ms")
            })
        }
        this.answers = {}
        let plusnames = []
        for(let name in this.bonusAnime){
            const answer = this.bonusAnime[name]
            for(let i = 0; i < validAnswers.length; i++){
                if(validAnswers[i].toLowerCase() === answer.toLowerCase()){
                    this.bonusAnimeScore[name] = (this.bonusAnimeScore[name] || 0) + 1
                    plusnames.push(name)
                    break
                }
            }
        }
        if(plusnames.length){
            this.chat("+anime+ " + plusnames.join(", "))
            plusnames = []
        }
        for(let name in this.bonusSong){
            const answer = this.bonusSong[name]
            if(answer.toLowerCase() === songName.toLowerCase()){
                this.bonusSongScore[name] = (this.bonusSongScore[name] || 0) + 1
                plusnames.push(name)
            }
        }
        if(plusnames.length){
            this.chat("+song+ " + plusnames.join(", "))
            plusnames = []
        }
        for(let name in this.bonusArtist){
            const answer = this.bonusArtist[name]
            if(answer.toLowerCase() === artist.toLowerCase()){
                this.bonusArtistScore[name] = (this.bonusArtistScore[name] || 0) + 1
                plusnames.push(name)
            }
        }
        if(plusnames.length){
            this.chat("+artist+ " + plusnames.join(", "))
            plusnames = []
        }
        this.bonusAnime = {}
        this.bonusSong = {}
        this.bonusArtist = {}
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
        if(!this.active){
            return
        }
        this.active = false
        this.events.emit("auto chat", "early_end")
        //this.events.emit("record game", this.players)
        const playerList = []
        for(let name in this.players){
            playerList.push(this.players[name])
        }
        this.printBonus()
        this.db.record_game(this.songList, playerList).catch((err) => {this.autoChat("recording_failed", [err])})
        this.quizDone()
    }

    quizEndResult(data) {
        if(!this.active){
            return
        }
        this.active = false
        //this.events.emit("record game", this.players)
        const playerList = []
        for(let name in this.players){
            playerList.push(this.players[name])
        }
        this.printBonus()
        this.db.record_game(this.songList, playerList).catch((err) => {this.autoChat("recording_failed", [err])})
    }

    printBonus = () => {
        if(Object.keys(this.bonusAnimeScore).length || Object.keys(this.bonusArtistScore).length || Object.keys(this.bonusSongScore).length){
            this.chat("bonus game scores:")
            if(Object.keys(this.bonusAnimeScore).length){
                const arr = []
                for(let name in this.bonusAnimeScore){
                    arr.push({name: name, score: this.bonusAnimeScore[name]})
                }
                arr.sort((a, b) => a.score - b.score)
                this.chat("+anime+ " + arr.map(a => a.name + ": " + a.score).join(", "))
            }
            if(Object.keys(this.bonusArtistScore).length){
                const arr = []
                for(let name in this.bonusArtistScore){
                    arr.push({name: name, score: this.bonusArtistScore[name]})
                }
                arr.sort((a, b) => a.score - b.score)
                this.chat("+artist+ " + arr.map(a => a.name + ": " + a.score).join(", "))
            }
            if(Object.keys(this.bonusSongScore).length){
                const arr = []
                for(let name in this.bonusSongScore){
                    arr.push({name: name, score: this.bonusSongScore[name]})
                }
                arr.sort((a, b) => a.score - b.score)
                this.chat("+song+ " + arr.map(a => a.name + ": " + a.score).join(", "))
            }
        }
        this.bonusAnimeScore = {}
        this.bonusArtistScore = {}
        this.bonusSongScore = {}
        this.bonusAnime = {}
        this.bonusArtist = {}
        this.bonusSong = {}
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