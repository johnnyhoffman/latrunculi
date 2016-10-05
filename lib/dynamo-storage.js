/*jshint esversion: 6 */
'use strict';

const
    aws = require('aws-sdk'),
    utils = require('./storage-utils.js'),
    Q = require('q'),
    awaitTimeout = 1000;

var storage = function(tableName, awsconfig, provisionedThroughput) {
    provisionedThroughput = provisionedThroughput || { ReadCapacityUnits: 1, WriteCapacityUnits: 1 };
    aws.config.update(awsconfig);
    var self = {},

        dynamodb = new aws.DynamoDB(),
        
        gameEntryToDDBItem = function(gameEntry) {
            let item = {
                id: {
                    S: gameEntry.id
                },
                blackId: {
                    S: gameEntry.blackId
                },
                whiteId: {       
                    S: gameEntry.whiteId
                },
            };

            if (gameEntry.blackName) {
                item.blackName = {
                    S: gameEntry.blackName
                };
            }

            if (gameEntry.whiteName) {
                item.whiteName = {
                    S: gameEntry.whiteName
                };
            }

            if (gameEntry.newGameConfig) {
                item.newGameConfig = {
                    S: gameEntry.newGameConfig
                };
            }

            if (gameEntry.moveSeq) {
                item.moveSeq = {
                    S: gameEntry.moveSeq
                };
            }
            return item;
        }, 

        ddbItemToGameEntry = function(item) {
            return {
                id: item.id.S,
                whiteId: item.whiteId.S,
                blackId: item.blackId.S,
                newGameConfig: item.newGameConfig.S,
                whiteName: (item.whiteName && item.whiteName.S) || "",
                blackName: (item.blackName && item.blackName.S) || "",
                moveSeq: (item.moveSeq && item.moveSeq.S) || "",
            };
        },
        
        tableExists = function() {
            return Q.Promise(function(resolve, reject) {
                dynamodb.listTables({}, function(err, data) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(data.TableNames.find(function(n) { return n === tableName;}));
                    }
                });
            });
        };


    self.init = function () {
        let checkReady = function(resolve, reject) {
            dynamodb.describeTable({ TableName: tableName }, function(err, data) {
                if (err) {
                    reject(err);
                } else {
                    if (data.Table.TableStatus === 'ACTIVE') {
                        resolve();
                    } else if (data.Table.TableStatus === 'CREATING') {
                        checkReady(resolve, reject);
                    } else {
                        reject(new Error("Table in unexpected state '" + data.Table.TableStatus + "'."));
                    }
                }
            });
        };
        return tableExists()
        .then(function(exists) {
            return Q.promise(function(resolve, reject) {
                if (exists) {
                    checkReady(resolve, reject);
                } else {
                    let params = {
                        AttributeDefinitions: [{
                            AttributeName: 'id',
                            AttributeType: 'S'
                        }],
                        KeySchema: [{
                            AttributeName: 'id',
                            KeyType: 'HASH'
                        }],
                        ProvisionedThroughput: provisionedThroughput,
                        TableName: tableName 
                    };
                    dynamodb.createTable(params, function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            checkReady(resolve, reject);
                        }
                    });
                }
            });
        });
    };

    self.getGame = function(gameId, consistentRead) {
        return Q.Promise(function(resolve, reject) {
            let params = {
                Key: { id: { S: gameId } },
                TableName: tableName,
                ConsistentRead: consistentRead ? true : false
            };
            dynamodb.getItem(params, function(err, data) {
                if (err) {
                    reject(err);
                } else if (!data.Item) {
                    reject(new utils.GameDoesntExistError());
                } else {
                    resolve({ gameEntry: ddbItemToGameEntry(data.Item) });
                }
            });
        });
    };

    self.destroy = function() {
        let checkDeleted = function(resolve, reject) {
            dynamodb.describeTable({ TableName: tableName }, function(err, data) {
                if (err) {
                    if (err.code === 'ResourceNotFoundException') {
                        resolve();
                    }
                    else {
                        reject(err);
                    }
                } else {
                    if (data.Table.TableStatus === 'DELETING') {
                        checkDeleted(resolve, reject);
                    } else {
                        reject(new Error("Table in unexpected state '" + data.Table.TableStatus + "'."));
                    }
                }
            });
        };
        return Q.promise(function(resolve, reject) {
            dynamodb.deleteTable({ TableName: tableName }, function(err) {
                if (err) {
                    reject(err);
                } else {
                    checkDeleted(resolve, reject);
                }
            });
        });
    };

    self.addGame = function(gameConfig) {
        let gameEntry = utils.newGameEntry(gameConfig); 

        return Q.Promise(function(resolve, reject) {
            var params = {
                Item: gameEntryToDDBItem(gameEntry),
                TableName: tableName
            };
            dynamodb.putItem(params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ gameEntry: gameEntry });
                }
            });
        });
    };

    self.setMoveSeq = function(gameId, moveSeq) {
        // get game to ensure it exists
        return self.getGame(gameId)
        .then(function() {
            return Q.Promise(function(resolve, reject) {
                let params = {
                    Key: {
                        id: { S: gameId }
                    },
                    TableName: tableName,
                    ExpressionAttributeValues: {
                        ":ms": { S: moveSeq.toCompressed() }
                    },
                    UpdateExpression: "SET moveSeq = :ms",
                    ReturnValues: "ALL_NEW"
                };

                dynamodb.updateItem(params, function(err, data) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ gameEntry: ddbItemToGameEntry(data.Attributes) });
                    }
                });
            });
        });
    };

    self.joinGame = function(gameId, playerName) {
        let gameEntry,
            
            // recursive promise until we can set a name or we both names are full
            trySetAvailable = function() {
                return self.getGame(gameId, true)
                .then(function(gameData) {
                    gameEntry = gameData.gameEntry;
                    return Q.Promise(function(resolve, reject) {
                        if (gameEntry.whiteName && gameEntry.blackName) {
                            reject(new utils.GameFullError([gameEntry.whiteName, gameEntry.blackName]));
                        } else {
                            // color to try to set the name for
                            let color = gameEntry.whiteName ? 'black' : 'white',
                                params = {
                                    Key: {
                                        id: { S: gameId }
                                    },
                                    TableName: tableName,
                                    ExpressionAttributeValues: {
                                        ":pname": { S: playerName }
                                    },
                                    // if a value for the name for the given color doesn't exist, we set it to playerName
                                    UpdateExpression: "SET " + color + "Name = if_not_exists(" + color + "Name, :pname)",
                                    // return the value that was 'updated': nothing if it didn't exist (meaning a sucessful update),
                                    // and the original value if it did already exist (meaning an unsucessful update)
                                    ReturnValues: "UPDATED_OLD"
                                };

                            dynamodb.updateItem(params, function(err, data) {
                                if (err) {
                                    reject(err);
                                } else {
                                    // if the original value was empty, i.e. we did not set it to itself
                                    if (!data.Attributes) {
                                        gameEntry[color + "Name"] = playerName;
                                        // i.e. success
                                        resolve({
                                            gameEntry: gameEntry,
                                            playerId: gameEntry[color + "Id"]
                                        });
                                    } else {
                                        // i.e. try again
                                        resolve();
                                    }
                                }
                            });
                        }
                    });
                })
                .then(function(result) {
                    if (result) {
                        // got a result, we are done
                        return Q.Promise(function(resolve) {
                            resolve(result);
                        });
                    } else {
                        // got no result, try again
                        return trySetAvailable();
                    }
                });
            };

        return trySetAvailable();
    };

    self.awaitTurn = function(gameId, playerId, status) {
        let deferred = Q.defer(),
            check = function() {
                if (status.closed) {
                    deferred.resolve();
                    return;
                }
                self.getGame(gameId)
                .then(function(gameData) {
                    if (gameData.gameEntry[utils.turnColor(gameData.gameEntry.moveSeq) + 'Id'] === playerId) {
                        deferred.resolve({ gameEntry: gameData.gameEntry });
                    } else {
                        setTimeout(check, awaitTimeout);
                    }
                })
                .catch(function(err){
                    deferred.reject(err);
                });
            };

        check();
        return deferred.promise;
    };

    return self;
};

module.exports = storage;

