/*jshint esversion: 6 */
'use strict';

const
      nano = require('nano'),
      Q = require('q'),
      utils = require('./storage-utils.js'),
      timeout = 1000;
    

var storage = function(host, databaseName) {
    var self = {},
        connection = nano(host || 'http://localhost:5984'),

        db,

        copyPublicValues = function(doc) {
            return {
                id: doc.id,
                blackId: doc.blackId,
                whiteId: doc.whiteId,
                blackName: doc.blackName,
                whiteName: doc.whiteName,
                newGameConfig: doc.newGameConfig,
                moveSeq: doc.moveSeq
            };
        };

    self.init = function () {
        return Q.Promise(function(resolve, reject) {
            connection.db.list(function (err, body) {
                if (err) {
                    reject(err);
                } else {
                    resolve(body.find(function(n) { return n === databaseName;}));
                }
            });
        })
        .then(function(exists) {
            return Q.promise(function(resolve, reject) {
                if (exists) {
                    db = connection.db.use(databaseName);
                    resolve();
                } else {
                    connection.db.create(databaseName, function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            db = connection.db.use(databaseName);
                            resolve();
                        }
                    });
                }
            });
        });
    };

    self.getGame = function(gameId) {
        return Q.Promise(function(resolve, reject) {
            db.get(gameId, { revs_info: true }, function (err, doc) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ gameEntry: copyPublicValues(doc) });
                }
            });
        });
    };

    self.destroy = function() {
        return Q.Promise(function(resolve, reject) {
            connection.db.destroy(databaseName, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    };

    self.addGame = function(gameConfig) {
        let gameEntry = utils.newGameEntry(gameConfig);

        return Q.Promise(function(resolve, reject) {
            db.insert(gameEntry, gameEntry.id, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ gameEntry: gameEntry });
                }
            });
        });
    };

    self.setMoveSeq = function(gameId, moveSeq) {
        return Q.Promise(function(resolve, reject) {
            db.get(gameId, { revs_info: true }, function(err, doc) {
                if (err) {
                    reject(err);
                } else {
                    let gameEntryPublic = copyPublicValues(doc);
                    
                    doc.moveSeq = moveSeq.toCompressed();
                    gameEntryPublic.moveSeq = moveSeq.toCompressed();

                    db.insert(doc, function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({gameEntry: gameEntryPublic});
                        }
                    });
                }
            });
        });
    };

    self.joinGame = function(gameId, playerName) {
        let deferred = Q.defer();
        if (!playerName) {
            deferred.reject(new Error("No falsey player names!"));
        } else {
            let attempts = 0,
                attempt = function() {
                    attempts += 1;
                    db.get(gameId, { revs_info: true }, function (err, doc) {
                        if (err) {
                            deferred.reject(err);
                        } else {
                            let nameField = (doc.whiteName ? null : 'whiteName') || (doc.blackName ? null : 'blackName');

                            if (!nameField) {
                                deferred.reject(new utils.GameFullError([doc.whiteName, doc.blackName]));
                            } else {
                                doc[nameField] = playerName;
                                db.insert(doc, function(err) {
                                    if (err) { // assumes the error is a document confllict error
                                        if (attempts > 3) {
                                            deferred.reject(err);
                                        } else {
                                            attempt();
                                        }
                                    } else {
                                        let gameEntry = copyPublicValues(doc);
                                        deferred.resolve({
                                            gameEntry: gameEntry,
                                            playerId: nameField === 'whiteName' ? gameEntry.whiteId : gameEntry.blackId
                                        });
                                    }
                                });                   
                            }
                        }
                    });
                };

            attempt();
        }
    
        return deferred.promise;
    };

    self.awaitTurn = function(gameId, playerId, status) {
        let deferred = Q.defer(),
            check = function() {
                if (status.closed) {
                    deferred.resolve();
                    return;
                }
                db.get(gameId, { revs_info: true }, function (err, doc) {
                    if (err) {
                        deferred.reject(err);
                    } else {
                        if (doc[utils.turnColor(doc.moveSeq) + 'Id'] === playerId) {
                            deferred.resolve({ gameEntry: copyPublicValues(doc) });
                        } else {
                            setTimeout(check, timeout);
                        }
                    }
                });
            };

        check();
        return deferred.promise;
    };

    return self;
};

module.exports = storage;

