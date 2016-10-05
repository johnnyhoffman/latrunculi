'use strict';

// I wrote this before I realized I could easily transpile
// es6=>es5 for the browser, but I'm going to just leave it
// in es5 instead of refactoring.

var MalformedError = function(message) {
    this.name = "MalformedError";
    this.message = (message || "");
};
MalformedError.prototype = Error.prototype;

var IllegalMoveError = function(message) {
    this.name = "IllegalMoveError";
    this.message = (message || "");
};
IllegalMoveError.prototype = Error.prototype;

var InvalidConfigError = function(message) {
    this.name = "InvalidConfigError";
    this.message = (message || "");
};
InvalidConfigError.prototype = Error.prototype;

var newGameConfig = function() {
    var self = {
        rankCount: 8,
        fileCount: 12,
        whiteDuxFile: 6,
        blackDuxFile: 5
    };

    self.fromInts = function(rankCount, fileCount, whiteDuxFile, blackDuxFile) {
        if (rankCount < 4) {
            throw new InvalidConfigError("Rank count must be 4 or greater.");
        }
        if (fileCount < 4) {
            throw new InvalidConfigError("File count must be 4 or greater.");
        }
        if (whiteDuxFile >= fileCount || whiteDuxFile < 0) {
            throw new InvalidConfigError("White dux file must be at least 0, and less than file count.");
        }
        if (blackDuxFile >= fileCount || blackDuxFile < 0) {
            throw new InvalidConfigError("Black dux file must be at least 0, and less than file count.");
        }

        self.rankCount = rankCount;
        self.fileCount = fileCount;
        self.whiteDuxFile = whiteDuxFile;
        self.blackDuxFile = blackDuxFile;

        return self;
    };

    self.fromCompressed = function(compressed) {
        if (typeof compressed !== 'string') {
            throw new TypeError("newGameConfig.fromCompressed() only accepts strings.");
        }
        var 
            regex = /^(\d+),(\d+),(\d+),(\d+)$/,
            matches = regex.exec(compressed);
        if (!matches) {
            throw new MalformedError("Malformed new game config.");
        }
        return self.fromInts(
            parseInt(matches[1]),
            parseInt(matches[2]),
            parseInt(matches[3]),
            parseInt(matches[4]));
    };

    self.toCompressed = function() {
        return [self.rankCount, self.fileCount, self.whiteDuxFile, self.blackDuxFile].join(','); 
    };

    return self;
};

var move = function() {
    var self = {};
    self.origin = { rank: 0, file: 0 };
    self.destination = { rank: 0, file: 0};

    self.fromCoordinates = function (origRank, origFile, destRank, destFile) {
        self.origin.rank = origRank;
        self.origin.file = origFile;
        self.destination.rank = destRank;
        self.destination.file = destFile;
        return self;
    };

    self.fromObject = function(obj) {
        if (!(obj &&
              obj.origin &&
              obj.destination && 
              typeof obj.origin.file === 'number' &&
              typeof obj.origin.rank === 'number' &&
              typeof obj.destination.file === 'number' &&
              typeof obj.destination.rank === 'number')) {
            throw new MalformedError("Malformed move.");
        }
        return self.fromCoordinates(obj.origin.rank, obj.origin.file, obj.destination.rank, obj.destination.file);
    };

    self.fromJson = function(json) {
        if (typeof json !== 'string') {
            throw new TypeError("move.fromJson() only accepts strings.");
        }
        return self.fromObject(JSON.parse(json));
    };

    self.fromCompressed = function(compressed) {
        if (typeof compressed !== 'string') {
            throw new TypeError("move.fromCompressed() only accepts strings.");
        }
        var
            regex = /^(\d+),(\d+),(\d+),(\d+)$/,
            matches = regex.exec(compressed);
        if (!matches) {
            throw new MalformedError("Malformed move.");
        }
        return self.fromCoordinates(
                parseInt(matches[1]),
                parseInt(matches[2]),
                parseInt(matches[3]),
                parseInt(matches[4]));
    };

    self.toJson = function() {
        return JSON.stringify(self.repr());
    };

    self.repr = function() {
        return {
            origin: self.origin,
            destination: self.destination
        };
    };

    self.toCompressed = function() {
        return [self.origin.rank, self.origin.file, self.destination.rank, self.destination.file].join(','); 
    };

    self.equivalentTo = function(other) { 
        return self.origin.rank === other.origin.rank &&
               self.origin.file === other.origin.file &&
               self.destination.file === other.destination.file &&
               self.destination.rank === other.destination.rank;
    };

    return self;
};

var moveSequence = function() {
    var self = {};
    self.array = [];

    self.fromObject = function(obj) {
        if (!Array.isArray(obj)) {
            throw new TypeError("moveSequence.fromObject() only accepts arrays.");
        }
        self.array = obj.map(function(m) {
            return move().fromObject(m);
        });
        return self;
    };

    self.repr = function() {
        return self.array.map(function (m) {
            return m.repr();
        }); 
    };

    self.fromJson = function(json) { 
        if (typeof json !== 'string') {
            throw new TypeError("moveSequence.fromJson() only accepts strings.");
        }
        return self.fromObject(JSON.parse(json));
    };

    self.fromCompressed = function(compressed) {
        self.array = compressed ? compressed.split('/').map(function(moveString) {
            return move().fromCompressed(moveString);
        }) : [];   
        return self;
    };

    self.toJson = function() {
        return JSON.stringify(self.repr());
    };

    self.toCompressed = function() {
        return self.array.map(function(m) {
            return m.toCompressed();
        }).join('/');
    };

    self.equivalentTo = function(other) {
        var i;
        if (self.array.length !== other.array.length) {
            return false;
        }
        for (i = 0; i < self.array.length; i++) {
            if (!self.array[i].equivalentTo(other.array[i])) {
                return false;
            }
        }
        return true;
    };

    return self;
};

var gameState = function() {
    var 
        self = {},

        validateBoardLocation = function(boardLocation, r, f) {
            if (boardLocation && 
                    (boardLocation.rank !== r ||
                     boardLocation.file !== f ||
                     (boardLocation.color !== 'white' && boardLocation.color !== 'black') ||
                     (boardLocation.type !== 'man' && boardLocation.type !== 'dux'))) {
                throw new MalformedError("Malformed board location.");
            }
        },

        validateBoardStructure = function(board) {
            var 
                err = new MalformedError("Malformed board."),
                fileCount = -1,
                r, f; 
        
            if (!Array.isArray(board)) { throw err; }
            for (r = 0; r < board.length; r++) {
                if (!Array.isArray(board[r])) { throw err; }
                if (fileCount === -1) {
                    fileCount = board[r].length;
                } else if (fileCount !== board[r].length) {
                    throw err;
                }
                for (f = 0; f < fileCount; f++) {
                    validateBoardLocation(board[r][f], r, f);
                }
            }
        },

        validateGameStateStructure = function(obj) {
            if (!(obj &&
                 ((!obj.winner) || (obj.winner === 'white') || (obj.winner === 'black')) &&
                 ((obj.turn === 'white') || (obj.turn === 'black')))) {
                throw new MalformedError("Malformed gameState.");
            }
            validateBoardStructure(obj.board);
        },

        throwIllegalMove = function (move) {
            var 
                turn = self.turn,
                board = self.board,
                rankCount = board.length,
                fileCount = board[0].length,
                piece = board[move.origin.rank] && board[move.origin.rank][move.origin.file],
                i; 

            if (self.winner) {
                throw new IllegalMoveError("Cannot move after game has been won.");
            }

            if ((move.origin.file < 0 || move.origin.file >= fileCount) ||
                (move.origin.rank < 0 || move.origin.rank >= rankCount)) {
                throw new IllegalMoveError("Out of bounds origin posiition.");
            }

            if ((move.destination.file < 0 || move.destination.file >= fileCount) ||
                (move.destination.rank < 0 || move.destination.rank >= rankCount)) {
                throw new IllegalMoveError("Out of bounds destination posiition.");
            }

            if (!piece) {
                throw new IllegalMoveError("No piece at origin position");
            }

            if (turn !== piece.color) {
                throw new IllegalMoveError("Attempt destination move " + piece.color + " piece on " + turn + "'s turn.");
            }

            if (move.origin.file === move.destination.file && move.origin.rank === move.destination.rank) {
                throw new IllegalMoveError("Move must have different destination and origin.");
            }

            if (move.origin.file !== move.destination.file && move.origin.rank !== move.destination.rank) {
                throw new IllegalMoveError("Move cannot have both horizontal and vertical components.");
            }

            if (move.origin.rank !== move.destination.rank) {
                for (i = move.origin.rank; i !== move.destination.rank;) {
                    if (move.origin.rank < move.destination.rank) {
                        i++;
                    } else {
                        i--;
                    }

                    if (board[i][move.origin.file]) {
                        throw new IllegalMoveError("Move is obstructed.");
                    }
                }
            } else {
                // implied distinct files and same ranks
                for (i = move.origin.file; i !== move.destination.file;) {
                    if (move.origin.file < move.destination.file) {
                        i++;
                    } else {
                        i--;
                    }

                    if (board[move.origin.rank][i]) {
                        throw new IllegalMoveError("Move is obstructed.");
                    }
                }
            }
        },

        attemptCaptures = function(updatedPos) {    
            var
                board = self.board,
                rankCount = board.length,
                fileCount = board[0].length,
                offsets = [[0, 1], [0, -1], [1, 0], [-1, 0]],
                capturedPoss = [];

            offsets.forEach(function(offset) {
                var
                    capturablePos = {
                        rank: offset[0] + updatedPos.rank,
                        file: offset[1] + updatedPos.file
                    },
                    capturable = board[capturablePos.rank] && board[capturablePos.rank][capturablePos.file],
                    surrounderA, surrounderB, rank;

                if (capturable && 
                    capturablePos.file >= 0 && capturablePos.file < fileCount && 
                    capturablePos.rank >= 0 && capturablePos.rank < rankCount) {
                    if (capturablePos.file === 0 && capturablePos.rank === 0) { 
                        surrounderA = board[1][0];
                        surrounderB = board[0][1];
                    } else if (capturablePos.file === 0 && capturablePos.rank === rankCount - 1) { 
                        surrounderA = board[rankCount - 1][1];
                        surrounderB = board[rankCount - 2][0];
                    } else if (capturablePos.file === fileCount - 1 && capturablePos.rank === 0) { 
                        surrounderA = board[0][fileCount - 2];
                        surrounderB = board[1][fileCount - 1];
                    } else if (capturablePos.file === fileCount - 1 && capturablePos.rank === rankCount - 1) { 
                        surrounderA = board[rankCount - 1][fileCount - 2];
                        surrounderB = board[rankCount - 2][fileCount - 1]; 
                    } else {
                        surrounderA = board[updatedPos.rank][updatedPos.file];
                        rank = board[offset[0] * 2 + updatedPos.rank];
                        surrounderB = rank && rank[offset[1] * 2 + updatedPos.file];
                    }
                    
                    if (surrounderA &&
                        surrounderB &&
                        capturable &&    
                        surrounderA.color === surrounderB.color && 
                        surrounderA.color !== capturable.color &&
                        capturable.type === 'man') {
                        capturedPoss.push(capturablePos);
                    }
                }
               
                capturedPoss.forEach(function(cp) {
                    board[cp.rank][cp.file] = null;
                });
            });
        },

        updateWinner = function() {
            var
                blocks = function(rank, file) {
                    return rank < 0 || file < 0 ||
                            rank >= self.board.length || file >= self.board[0].length ||
                            self.board[rank][file];
                },

                isBlockedDuc = function(gridItem) {
                    return gridItem && 
                        gridItem.type === 'dux' &&
                        blocks(gridItem.rank + 1, gridItem.file) &&
                        blocks(gridItem.rank - 1, gridItem.file) &&
                        blocks(gridItem.rank, gridItem.file + 1) &&
                        blocks(gridItem.rank, gridItem.file - 1);
                },

                i, found;

            for (i = 0; i < self.board.length; i++) {
                found = self.board[i].find(isBlockedDuc);
                if (found) {
                    self.winner = found.color === 'white' ? 'black' : 'white'; 
                    return;
                }
            }

            self.winner = null;
        };

    // fresh game
    self.init = function(newGameConf) {
        var rankIdx, rank, fileIdx;
        newGameConf = newGameConf || newGameConfig();
        self.board = [];
        self.turn = 'black';
        for (rankIdx = 0; rankIdx < newGameConf.rankCount; rankIdx++) {
            rank = [];
            for (fileIdx = 0; fileIdx < newGameConf.fileCount; fileIdx++) {
                rank[fileIdx] =
                    rankIdx === 0 ? { rank: rankIdx, file: fileIdx, type: 'man', color: 'black' } :
                    rankIdx === newGameConf.rankCount - 1 ? { rank: rankIdx, file: fileIdx, type: 'man', color: 'white' } :
                    rankIdx === 1 && fileIdx === newGameConf.blackDuxFile ? { rank: rankIdx, file: fileIdx, type: 'dux', color: 'black' } :
                    rankIdx === newGameConf.rankCount - 2 && fileIdx === newGameConf.whiteDuxFile ? { rank: rankIdx, file: fileIdx, type: 'dux', color: 'white' } :
                    null;
            }
            self.board[rankIdx] = rank;
        }
        return self;       
    };

    self.fromObject = function(obj) {
        validateGameStateStructure(obj);
        self.turn = obj.turn;
        self.winner = obj.winner;
        self.board = obj.board;
        return self;
    };

    self.fromJson = function(json) {
        if (typeof json !== 'string') {
            throw new TypeError("moveSequence.fromJson() only accepts strings.");
        }
        return self.fromObject(JSON.parse(json));
    };

    self.toJson = function() {
        return JSON.stringify({
            turn: self.turn,
            winner: self.winner,
            board: self.board
        });
    };

    self.applyMove = function(move) {
        throwIllegalMove(move);
        var piece = self.board[move.origin.rank][move.origin.file];
    
        // move piece
        self.board[move.origin.rank][move.origin.file] = null;
        self.board[move.destination.rank][move.destination.file] = {
            rank: move.destination.rank,
            file: move.destination.file,
            type: piece.type,
            color: piece.color
        };
    
        // modifies state - no return
        attemptCaptures(move.destination);
    
        self.turn = self.turn === 'white' ? 'black' : 'white';
        updateWinner();
        return self;
    };

    self.applyMoveSequence = function(moveSeq) {
        moveSeq.array.forEach(function(m) {
            self.applyMove(m);
        });

        return self;
    };
    
    // get all positions that a hypothetics piece at the given rank and file could move.
    self.unblockedMoveCoordinates = function(pieceRank, pieceFile) {
        var coordinates = [],
            rankCount = self.board.length,
            fileCount = self.board[0].length,
            i;

        for (i = pieceRank - 1; i>= 0; i--) {
            if(!self.board[i][pieceFile]) {
                coordinates[coordinates.length] = [i, pieceFile];
            } else {
                break;
            }
        }

        for (i = pieceRank + 1; i < rankCount; i++) {
            if(!self.board[i][pieceFile]) {
                coordinates[coordinates.length] = [i, pieceFile];
            } else {
                break;
            }
        }

        for (i = pieceFile - 1; i >= 0; i--) {
            if(!self.board[pieceRank][i]) {
                coordinates[coordinates.length] = [pieceRank, i];
            } else {
                break;
            }
        }

        for ( i = pieceFile + 1; i < fileCount; i++) {
            if(!self.board[pieceRank][i]) {
                coordinates[coordinates.length] = [pieceRank, i];
            } else {
                break;
            }
        }

        return coordinates;
    };

    // text visual representation
    self.asciiRepr = function() {
        var repr = "";

        self.board.forEach(function(rank) {
            rank.forEach(function(piece) {
                if (piece) {
                    if (piece.color === 'white') {
                        if (piece.type === 'man') {
                            repr += 'O';
                        } else {
                            repr += '@';
                        }
                    } else {
                        if (piece.type === 'man') {
                            repr += 'X';
                        } else {
                            repr += '#';
                        }
                    }
                } else {
                    repr += '·';
                }
            });
            repr += '\n';
        });

        repr += "turn: " + self.turn + "\n" + 
                "winner: " + (self.winner || "none") + "\n" +
                "white: O@, black: X#";

        return repr;
    };

    self.equivalentTo = function(other) {
        return self.asciiRepr() === other.asciiRepr();
    };

    self.copy = function() {
        return gameState().fromJson(self.toJson());
    };

    return self;
};

module.exports = {
    // calling any of these functions initiaizes them, but they still
    // need to have their values set, e.g. move().fromCompressed('0,0,1,0')
    newGameConfig: newGameConfig,
    move: move,
    moveSequence: moveSequence,
    gameState: gameState
};

