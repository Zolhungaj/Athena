class Song{
    constructor(anime, name, artist, type, link, id){
        this.anime = anime
        this.name = name
        this.artist = artist
        this.type = type
        this.link = link
        this.id = id //unique identifier so that the "same" song played twice has unique signature
    }
}
module.exports = {Song}