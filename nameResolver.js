const {EVENTS, sleep} = require('./node/amq-api')
class NameResolver {
    constructor(socket, events, debug=false){
        this.socket = socket
        this.events = events
        this.debug = debug
        this.nameToOriginalNameMap = {}
        this.profileLock = 0
        this.lockoutTime = 1000
        this.timeoutTime = 5000 //server is known to be particularly slow with guests

        this.listeners = [socket.on(EVENTS.PLAYER_NAME_CHANGE, ({oldName, newName}) => this.updateName(oldName, newName)),
            socket.on(EVENTS.SPECTATOR_NAME_CHANGE, ({oldName, newName}) => this.updateName(oldName, newName)),
            socket.on(EVENTS.FRIEND_NAME_CHANGE, ({oldName, newName}) => this.updateName(oldName, newName)),
            socket.on(EVENTS.ALL_PLAYER_NAME_CHANGE, ({oldName, newName}) => this.updateName(oldName, newName)),
            socket.on(EVENTS.PLAYER_PROFILE, (payload) => {
                if(!payload.error){
                    this.nameToOriginalNameMap[payload.name.toLowerCase()] = {name: payload.name, originalName: payload.originalName} //this keeps the list nice and updated, especially if I get profiles for something else
                }
            })
        ]
    }

    destroy = () => {
        this.listeners.forEach(listener => {
            listener.destroy()
        })
    }

    getOriginalName = async (name) => {
        name = name.toLowerCase() //this is to help with the obvious case 
        //console.log(name)
        //console.log(this.nameToOriginalNameMap)
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
                const profileListener = this.socket.on(EVENTS.PLAYER_PROFILE, (payload) => {
                    if(payload.error){
                        return
                    }
                    if(payload.name.toLowerCase() !== name){ //it is known that nicknames are unique even when lower case
                        //this will only happen if the server misses the package
                    }else{
                        profileListener.destroy()
                        clearTimeout(timeOut)
                        resolve({name: payload.name, originalName: payload.originalName})
                    }
                })
                timeOut = setTimeout(() => {
                    profileListener.destroy()
                    reject("timeout")
                }, this.timeoutTime)
                this.socket.social.profile.get(name) //it's not possible to await on this, despite what the examples might suggest
            })
        }
    }
    updateName = (oldName, newName) => {
        const oldNameLower = oldName.toLowerCase()
        const newNameLower = newName.toLowerCase()
        this.getOriginalName(newName) //in case this player was never scanned before
        .then(({name, originalName}) => { 
            //this.nameToOriginalNameMap[newNameLower] = {name, originalName} // this should have been set by getOriginalName, but who knows
        })
        .catch((reason) => {
            if(this.debug){
                console.log("updateName", "getOriginalName failed with reason:", reason)
            }
            //we could try to recover from this.nameToOriginalNameMap[oldNameLower], but it's safer to just retry later
        })
        .finally(() => {
            delete this.nameToOriginalNameMap[oldNameLower] //no matter if we find the replacement, we now know that this is invalid
        })
    }
}
module.exports = {NameResolver}