const {EVENTS, sleep} = require('./node/amq-api')
class NameResolver {
    constructor(socket, events, debug=false){
        this.socket = socket
        this.events = events
        this.debug = debug
        this.nameToOriginalNameMap = {}
        this.profileLock = 0
        this.lockoutTime = 1000

        socket.on(EVENTS.PLAYER_NAME_CHANGE, ({oldName, newName}) => this.updateName(oldName, newName))
        socket.on(EVENTS.SPECTATOR_NAME_CHANGE, ({oldName, newName}) => this.updateName(oldName, newName))
        socket.on(EVENTS.FRIEND_NAME_CHANGE, ({oldName, newName}) => this.updateName(oldName, newName))
        socket.on(EVENTS.ALL_PLAYER_NAME_CHANGE, ({oldName, newName}) => this.updateName(oldName, newName))
        socket.on(EVENTS.PLAYER_PROFILE, (payload) => {
            this.nameToOriginalNameMap[payload.name] = payload.originalName //this keeps the list nice and updated, especially if I get profiles for something else
        })
    }

    getOriginalName = async (name) => {
        if(this.nameToOriginalNameMap[name]){
            return this.nameToOriginalNameMap[name]
        }else{
            const now = new Date().getTime()
            if(now < this.profileLock){
                this.profileLock = Math.max(this.profileLock + this.lockoutTime, now + this.lockoutTime) //adds additional time for next to wait, cumulative but always at least lockoutTime seconds
                await sleep(this.profileLock - this.lockoutTime - now)
            }else{
                this.profileLock = now + this.lockoutTime
            }
            return new Promise((resolve, reject) => {
                let timeOut
                const profileListener = socket.on(EVENTS.PLAYER_PROFILE, (payload) => {
                    if(payload.name !== name){
                        //this will only happen if the server misses the package
                    }else{
                        profileListener.destroy()
                        clearTimeout(timeOut)
                        resolve(payload.originalName)
                    }
                })
                timeOut = setTimeout(() => {
                    profileListener.destroy()
                    reject("timeout")
                }, this.lockoutTime)
                this.socket.social.profile.get(name) //it's not possible to await on this, despite what the examples might suggest
            })
        }
    }
    updateName = (oldName, newName) => {
        this.getOriginalName(newName) //in case this player was never scanned before
        .then((originalName) => { 
            this.nameToOriginalNameMap[newName] = originalName // this should have been set by getOriginalName, but who knows
        })
        .catch((reason) => {
            if(this.debug){
                console.log("updateName", "getOriginalName failed with reason:", reason)
            }
            //do nothing, we know that this.nameToOriginalNameMap[oldName] does not exist
        })
        .finally(() => {
            delete this.nameToOriginalNameMap[oldName] //no matter if we find the replacement, we now know that this is invalid
        })
    }
}
module.exports = {NameResolver}