const {EVENTS, sleep} = require('./node/amq-api')
const player = require('./player')
const Song = require("./song").Song
class Game {
    constructor(socket, events, db){
        this.socket = socket
        this.events = events
        this.db = db

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

        

        this.noSongsListener = socket.on(EVENTS.QUIZ_NO_SONGS, () => this.startFailedNoSongs())
        this.answersListener = socket.on(EVENTS.QUIZ_PLAYER_ANSWERS, ({answers}) => {
            answers.forEach(answer => {
                this.answers[answer.gamePlayerId] = {answer: answer.answer, answerNumber : answer.answerNumber}
            });
        })
        this.gameStartListener = events.on("game start", (players) => this.start(players))
        this.quizFatalErrorListener = socket.on(EVENTS.QUIZ_FATAL_ERROR, () => this.startFailed())
        this.quizReturnLobbyResultListener = socket.on(EVENTS.QUIZ_RETURN_LOBBY_VOTE_RESULT, ({passed, reason}) => this.returnLobby(passed, reason))
        this.quizOverListener = socket.on(EVENTS.QUIZ_OVER, (data) => this.quizOver(data))
        this.quizReadyListener = socket.on(EVENTS.QUIZ_READY, ({numberOfSongs}) => this.quizReady(numberOfSongs))
    
        this.playerLeftListener = socket.on(EVENTS.PLAYER_LEFT, (data) => this.playerLeft(data))

        this.quizEndResultListener = socket.on(EVENTS.QUIZ_END_RESULT, (data) => this.quizEndResult(data))
        this.answerResultsListener = socket.on(EVENTS.ANSWER_RESULTS, (data) => this.answerResults(data))

        this.bonusAnimeListener = events.on("bonus anime", (player, answer) => { this.bonusAnime[player] = answer })
        this.bonusSongListener = events.on("bonus song", (player, answer) => { this.bonusSong[player] = answer })
        this.bonusArtistListener = events.on("bonus artist", (player, answer) => { this.bonusArtist[player] = answer })
    }

    destroy = () => {
        this.quizReturnLobbyResultListener.destroy()
        this.quizFatalErrorListener.destroy()
        this.quizEndResultListener.destroy()
        this.answerResultsListener.destroy()
        this.bonusArtistListener.destroy()
        this.playerLeftListener.destroy()
        this.bonusAnimeListener.destroy()
        this.gameStartListener.destroy()
        this.quizReadyListener.destroy()
        this.bonusSongListener.destroy()
        this.quizOverListener.destroy()
        this.noSongsListener.destroy()
        this.answersListener.destroy()
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
        const song = new Song(animeName, songName, artist, type, url)
        this.songList.push(song)
        for(let i = 0; i < players.length; i++){
            const {correct, gamePlayerId, level, pose, position, positionSlot, score} = players[i]
            let player
            for(let name in this.players){
                if (gamePlayerId === this.players[name].gamePlayerId){
                    player = this.players[name]
                }
            }
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
            if(correct){
                validAnswers.push(answer)
                player.correct_songs.push({song, answer})
            }else{
                player.wrong_songs.push({song, answer})
            }
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
        this.bonusArtistScore = {}
        this.bonusSongScore = {}
        for(let name in this.bonusSong){
            const answer = this.bonusSong[name]
            if(answer.toLowerCase() === songName){
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
            if(answer.toLowerCase() === artist){
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
        this.db.record_game(this.songList, playerList)
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
        this.db.record_game(this.songList, playerList)
    }

    printBonus = () => {
        if(this.bonusAnimeScore || this.bonusArtistScore || this.bonusSongScore){
            this.chat("bonus game scores:")
            if(this.bonusAnimeScore){
                const arr = []
                for(let name in this.bonusAnimeScore){
                    arr.push({name: name, score: this.bonusAnimeScore[name]})
                }
                arr.sort((a, b) => a.score - b.score)
                this.chat("+anime+ " + arr.map(a => a.name + ": " + a.score).join(", "))
            }
            if(this.bonusArtistScore){
                const arr = []
                for(let name in this.bonusArtistScore){
                    arr.push({name: name, score: this.bonusArtistScore[name]})
                }
                arr.sort((a, b) => a.score - b.score)
                this.chat("+artist+ " + arr.map(a => a.name + ": " + a.score).join(", "))
            }
            if(this.bonusSongScore){
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