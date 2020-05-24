class Player{
    constructor(username, level, avatar, ready, gamePlayerId){
        this.score = 0
        this.name = username
        this.level = level
        this.avatar = avatar
        this.ready = ready
        this.gamePlayerId = gamePlayerId
        this.wrong_songs = []
        this.correct_songs = []
    }
}
module.exports = {Player}