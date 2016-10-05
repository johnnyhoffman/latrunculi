/*jshint strict:false */
/*jshint esversion: 6 */
'use strict';

const couchStorage = require('../lib/couch-storage.js'),
    dynamoStorage = require('../lib/dynamo-storage.js'),
    gameMechanics = require('../lib/game-mechanics.js'),
    testConfig = require('./test-config.json'),
    Q = require('Q'),

    testMoves = (test, storage) => {
        let newGameConf = gameMechanics.newGameConfig().fromInts(8,12,6,5),
            moveSeq1 = gameMechanics.moveSequence().fromCompressed('0,0,0,0/1,2,3,4/0,3,4,5'),
            moveSeq2 = gameMechanics.moveSequence().fromCompressed('0,0,0,0'),
            gameId1, gameId2, gameId3, whiteId1, whiteId2;

        test.expect(11);
        storage.init()
        // create three games
            .then(() => {
                return Q.all([
                    storage.addGame(newGameConf),
                    storage.addGame(newGameConf),
                    storage.addGame(newGameConf)]);
            })
        // set moves for first game
            .then(all => {
                gameId1 = all[0].gameEntry.id;
                whiteId1 = all[0].gameEntry.whiteId;
                gameId2 = all[1].gameEntry.id;
                whiteId2 = all[1].gameEntry.whiteId;
                gameId3 = all[2].gameEntry.id;
                test.ok(true);
              
                return storage.setMoveSeq(gameId1, moveSeq1);
            })
        // check that all games have correct state
            .then(res => {
                test.ok(res.gameEntry.id === gameId1, "setting moveSeq for gameId1 resolves to a game entry with a different id");
                test.ok(res.gameEntry.moveSeq === moveSeq1.toCompressed(), "move seq not correctly set");
                return Q.all([
                    storage.getGame(gameId1),
                    storage.getGame(gameId2),
                    storage.getGame(gameId3)]);
            })
        // while one player awaits a turn, the other delays then makes a move - ensure they happen in the right order
            .then(all => {
                test.ok(all[0].gameEntry.id === gameId1, "getting first game resolved to game with wrong id.");
                test.ok(all[1].gameEntry.id === gameId2, "getting second game resolved to game with wrong id.");
                test.ok(all[2].gameEntry.id === gameId3, "getting third game resolved to game with wrong id.");
                test.ok(all[0].gameEntry.moveSeq === moveSeq1.toCompressed(), "getting first game resolved to game with wrong moveSeq.");
                test.ok(all[1].gameEntry.moveSeq === '', "getting second game resolved to game with wrong moveSeq.");
                test.ok(all[2].gameEntry.moveSeq === '', "getting third game resolved to game with wrong moveSeq.");

                let promise1 = storage.awaitTurn(gameId1, whiteId1, {closed: false} ),

                    promise2 = Q.Promise((resolve, reject) => {
                        let beenSet = false;
                        setTimeout(() => {
                            beenSet = true; // more like "is about to be set"
                            storage.setMoveSeq(gameId2, moveSeq2)
                                .catch(reject);
                        }, 500);

                        storage.awaitTurn(gameId2, whiteId2, {closed: false})
                            .then(res => {
                                return Q.Promise((resolveInner, reject) => {
                                    if (beenSet) {
                                        resolve(res);
                                    } else {
                                        reject(new Error("Awaited turn from game 2 triggered before move sequence set to white."));
                                    }
                                });
                            })
                            .catch(reject);
                    });

                return Q.all([promise1, promise2]);
            })
            .then(all => {
                test.ok(all[0].gameEntry.id === gameId1, "awaiting turn for first game resolved to game with wrong id.");
                test.ok(all[1].gameEntry.id === gameId2, "awaiting turn for second game resolved to game with wrong id.");
            })
            .catch(err => test.ok(false, err.toString()))
            .fin(() =>
                    storage.destroy()
                .then(function() {
                    test.done();
                }).catch(function(err) {
                    test.ok(false, err.toString());
                    test.done();
                }));
    },

    testJoin = function(test, storage) {
        let newGameConf = gameMechanics.newGameConfig().fromInts(8,12,6,5),
            gameId,
            concurrentJoins = 100; 

        test.expect(2);

        storage.init()
            .then(() => storage.addGame(newGameConf))
        // many players join a game at once
            .then(res => {
                let promises = [],
                    makePromise = i => Q.Promise((resolve, reject) => {
                        storage.joinGame(gameId, "p" + i)
                            .then(resolve)
                            .catch(err => {
                                // expecting all but two to fail with GameFullError
                                if (err.name === 'GameFullError') {
                                    resolve(err);
                                } else {
                                    reject(err);
                                }
                            });
                    });



                gameId = res.gameEntry.id;
                for (let i = 0; i < concurrentJoins; i++) {
                    promises.push(makePromise(i));
                }
                return Q.all(promises);
            })
        // check that only 2 players got in
            .then(all => {
                let successes = 0, failures = 0;
                all.forEach(result => {
                    if (result.name === 'GameFullError') {
                        failures += 1;
                    } else {
                        successes += 1;
                    }
                });

                test.ok(successes === 2, "Expected exactly 2 successful joins");
                test.ok(failures === (concurrentJoins - 2), "Expected all but two joins to be failures");
            })
            .catch(err => test.ok(false, err.toString()))
            .fin(() => storage.destroy()
                    .then(test.done)
                    .catch(err => {
                        test.ok(false, err.toString());
                        test.done();
                    }));

    };

exports.testMovesCouch = test => testMoves(test, couchStorage(testConfig.couch.endpoint, testConfig.couch.dbname));

exports.testJoinCouch = test => testJoin(test, couchStorage(testConfig.couch.endpoint, testConfig.couch.dbname));

exports.testMovesDynamo = test => testMoves(test, dynamoStorage(testConfig.dynamo.tableName, testConfig.dynamo.aws, testConfig.dynamo.provisionedThroughput));

exports.testJoinDynamo = test => testJoin(test, dynamoStorage(testConfig.dynamo.tableName, testConfig.dynamo.aws, testConfig.dynamo.provisionedThroughput));
