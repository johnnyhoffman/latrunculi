/*jshint esversion: 6*/
'use strict';

const 
Q = require('q'),
    $ = require('jquery'),

    post = function(actionStr, obj) {
        return Q.Promise((resolve, reject) => {
            $.ajax({
                type: 'POST',
                url:'/api/' + actionStr,
                data: JSON.stringify(obj),
                contentType: 'application/json',
                success: (game) => resolve(game),
                error: (xmlhttprequest, textstatus, message) => reject(
                    {
                        xmlhttprequest: xmlhttprequest,
                        textstatus: textstatus,
                        message: message
                    })
            });
        });
    };

module.exports = {
    newgame: config => post('new', config ? {config: config.toCompressed()} : {}),

    join: (gameId, playerName) => post('join', {id: gameId, name: playerName}),

    state: (gameId, playerId) => post('state', { gameId: gameId, playerId: playerId }),

    move: (gameId, playerId, moveSeq) => post('move', { gameId: gameId, playerId: playerId, move: moveSeq.toCompressed() }),

    waitstate: (gameId, playerId) => {
        let attempt = (resolve, reject) => {
            post('waitstate', { gameId: gameId, playerId: playerId })
                .then(resp => resolve(resp))
                .catch(err => {
                    if (err.textstatus === 'timeout') {
                        attempt(resolve, reject);
                    }
                });
        };

        return Q.Promise(attempt);

    },
};
