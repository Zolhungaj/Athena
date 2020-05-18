const {SocketWrapper, getToken, EVENTS, sleep} = require('./node/amq-api')
class SocialManager {
    constructor(socket, events){
        this.socket = socket
        this.events = events
        this.friendRequestSentListener = socket.on(EVENTS.FRIEND_REQUEST, () => this.startFailed())
        this.friendRequestRecievedListener = socket.on(EVENTS.NEW_FRIEND_REQUEST_RECEIVED, ({name}) => socket.social.answerFriendRequest(name, true))
    }
}
module.exports = {SocialManager}