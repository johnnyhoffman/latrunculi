/*jshint strict:false */
/*jshint esversion: 6 */
'use strict';

const request = require('request'),
    testConfig = require('./test-config.json'),
    Q = require('Q'),
    host = testConfig.serverEndpoint;

let post = (route, obj) => {
    return Q.Promise((resolve, reject) => {
        request.post(
            host + "/api/" + route,
            { json:  obj},
            (err, response, body) => {
                if (err) {
                    reject(err);
                } else if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(body);
                } else {
                    resolve(body);
                }
            });   
    });
},
    // minimal http client for the service
    postNew = (configStr) => post('new', {config: configStr}),
    postJoin = (gameId, name) => post('join', { id: gameId, name: name }),
    postState = (gameId, playerId) =>  post("state", { gameId: gameId, playerId: playerId }),
    postMove = (gameId, playerId, move) => post("move", {gameId: gameId, playerId: playerId, move: move }),
    postWaitState = (gameId, playerId) => post("waitstate", {gameId: gameId, playerId: playerId });

exports.testValid = test => {
    let gameId, blackId, whiteId,
        newGameConfig = '5,5,3,2',
        moves = ['0,0,1,0', '4,4,3,4', '1,0,1,1'],
        concurrentJoins = 100;

    test.expect(17);

    postNew(newGameConfig)
    // join many times
        .then(body => {
            gameId = body.id;
            test.ok(gameId, "Missing gameId");

            let promises = [],
                makePromise = i => Q.Promise((resolve, reject) => {
                    postJoin(gameId, "p" + i)
                        .then(res => resolve(res))
                        .catch(err => {
                            // expecting all but two to fail with GameFullError
                            if (err.error === 'GameFullError') {
                                resolve(err);
                            } else {
                                reject(err);
                            }
                        });
                });
            for (let i = 0; i < concurrentJoins; i++) {
                promises.push(makePromise(i));
            }
            return Q.all(promises);
        })
    // ensure only 2 players make it into the game
        .then(all => {
            let successes = 0,
                failures = 0;
            all.forEach(result => {
                if (result.error  === 'GameFullError') {
                    failures += 1;
                } else {
                    successes += 1;
                    if (result.playerColor === 'white' && !whiteId) {
                        whiteId = result.playerId;
                    } else if (result.playerColor === 'black' && !blackId) {
                        blackId = result.playerId;
                    } else {
                        throw Error("encountered id but id of corresponding color has already been set.");
                    } 
                }
            });

            test.ok(successes === 2, "Expected exactly 2 successful joins");
            test.ok(failures === (concurrentJoins - 2), "Expected all but two joins to be failures");
            test.ok(blackId, "expecting blackId.");
            test.ok(whiteId, "expecting whiteId.");
            return postState(gameId, blackId);
        })
    // ensure we get back the right states after a series of moves
        .then(body => {
            test.ok(body.gameId === gameId, "mismatching gameId");
            test.ok(body.playerId === blackId, "mismatching playerId");
            test.ok(body.turn === 'black', "expecting first turn to be black");
            return postMove(gameId, blackId, moves[0]);
        })
        .then(body => {
            test.ok(body.gameId === gameId, "mismatching gameId");
            test.ok(body.playerId === blackId, "mismatching playerId");
            test.ok(body.turn === 'white', "expecting first turn to be white");
            return postMove(gameId, whiteId, moves[1]);
        })
        .then(body => {
            test.ok(body.gameId === gameId, "mismatching gameId");
            test.ok(body.playerId === whiteId, "mismatching playerId");
            test.ok(body.turn === 'black', "expecting first turn to be black");
            return postMove(gameId, blackId, moves[2]);
        })
        .then(body => {
            test.ok(body.gameId === gameId, "mismatching gameId");
            test.ok(body.playerId === blackId, "mismatching playerId");
            test.ok(body.turn === 'white', "expecting first turn to be white");
        })
        .catch(err => test.ok(false, JSON.stringify(err).toString()))
        .fin(test.done);
};

exports.testWait = test => {
    let gameId, whiteId, blackId, 
        setTurn = false,
        newGameConfig = '5,5,3,2';

    test.expect(1);

    postNew(newGameConfig)
    // join
        .then(body => {
            gameId = body.id;
            return postJoin(gameId, "human");
        })
        .then(body => {
            if (body.playerColor === 'white') {
                whiteId = body.playerId;
            } else {
                blackId = body.playerId;
            }
            return postJoin(gameId, "person");
        })
        .then(body => {
            if (body.playerColor === 'white') {
                whiteId = body.playerId;
            } else {
                blackId = body.playerId;
            }

            return Q.Promise((resolve, reject) => {
                postWaitState(gameId, whiteId)
                //should only finish after the deleay and post move completes
                    .then(() => {
                        if (!setTurn) {
                            reject("Got turn without it being set");
                        } else {
                            test.ok(true);
                            resolve();
                        }
                    })
                    .catch(error => reject(error));

                // delay and post move
                Q.delay(1000)
                    .then(() => {
                        setTurn = true;
                        postMove(gameId, blackId, '0,0,1,0');
                    })
                    .catch((error) => reject(error));
            });
        })
        .catch(err => test.ok(false, err.toString()))
        .done(test.done);
};

exports.testUnauth = test => {
    let gameId,
        newGameConfig = '5,5,3,2';

    test.expect(1);

    postNew(newGameConfig)
        .then(body => {
            gameId = body.id;
            return postJoin(gameId, 'name');
        })
        .then((body) => {
            return postState(gameId, body.playerId + "X");
        })
        .then(() => test.ok(false, "should not have gotten gamestate with wrong player id"))
        .catch(err => test.ok(err.error === 'UnauthorizedError', "Expected UnauthorizedError"))
        .fin(test.done);

};
