const Commands = require('./commands');
const EVENTS = require('../events');

class Avatar extends Commands {
	standings() {
		return this._sendCommand({type:"avatardrive",command:"get avatar drive standings"}, EVENTS.AVATAR_DRIVE_STANDINGS);		
	}

	change(avatarId, colorId, optionActive, backgroundAvatarId=avatarId, backgroundColorId=colorId) {
		const data = {avatar: {avatarId, colorId, optionActive}, background: {avatarId: backgroundAvatarId, colorId: backgroundColorId}}
		return this._sendCommand({type:"avatar",command:"use avatar", data}, EVENTS.USE_AVATAR);				
	}
	
	addFavorite(avatarId, colorId, optionActive, backgroundAvatarId=avatarId, backgroundColorId=colorId) {
		const data = {avatar: {avatarId, colorId, optionActive}, background: {avatarId: backgroundAvatarId, colorId: backgroundColorId}}
		this._sendCommand({type:"avatar",command:"new favorite avatar", data});				
	}

	removeFavorite(favoriteId) {
		this._sendCommand({type:"avatar",command:"remove favorite avatar", data: {favoriteId}});						
	}

	unlock(avatarId, colorId) {
		return this._sendCommand({type:"avatar",command:"unlock avatar", data: {avatarId, colorId}}, EVENTS.UNLOCK_AVATAR);						
	}

	patreonUnlock(avatarId) {
		this._sendCommand({type:"patreon",command:"unlock buyable avatar", data: {avatarId}});								
	}
	
	ticketRoll(amount) {
		this._sendCommand({type:"patreon",command:"ticket roll", data: {amount}});								
	}

	outfits(avatarId) {
		return this._sendCommand({type:"avatar",command:"get outfit designs", data: {avatarId}}, EVENTS.OUTFIT_DESIGNS);				
	}
}

module.exports = Avatar;