/*jshint esversion: 6 */
"use strict";

const gameMechanics = require('./game-mechanics.js'),
    shortid = require('shortid');

let GameFullError = function(players) {
    this.name = "GameFullError";
    this.players = players;
    this.message = "You cannot join that game because it is already joined by players named '" + players[0] + "' and '" + players[1] + "'.";
};
GameFullError.prototype = Error.prototype;

let GameDoesntExistError = function() {
    this.name = "GameDoesntExistError";
    this.message = "No game exists with the given ID. Maybe you aren't using the full link?";
};
GameDoesntExistError.prototype = Error.prototype;     

module.exports = {
    GameDoesntExistError: GameDoesntExistError,
    GameFullError: GameFullError,
    turnColor: moveSeqStr => {
        return (gameMechanics.moveSequence().fromCompressed(moveSeqStr).array.length % 2) ? 'white' : 'black';
    },
    newGameEntry: gameConfig => {
        return { 
            id: shortid.generate(),
            blackId: shortid.generate(),
            whiteId: shortid.generate(),
            blackName: '',
            whiteName: '',
            newGameConfig: gameConfig.toCompressed(),
            moveSeq: ''
        };
    }
};
