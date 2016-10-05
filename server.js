/*jshint esversion: 6 */
'use strict';

const
express = require('express'),
    bodyParser = require('body-parser'),
    gameMechanics = require('./lib/game-mechanics.js'),
    storage = require('./lib/storage.js'),
    morgan = require('morgan'),
    app = express(),
    Q = require('q');

let handleError = (res, err) => {
    let status;
    if (['MalformedError', 'IllegalMoveError', 'InvalidConfigError', 'GameFullError', 'GameDoesntExistError'].indexOf(err.name) >= 0) {
        status = 400;
    } else if (err.name === 'UnauthorizedError') {
        status = 403;
    } else {
        status = 500;
        console.log(err);
        console.log(err.stack);
        err.name = "InternalServerError";
        err.message = "InternalServerError";
    }
    res.status(status).json({ error: err.name, message: err.message });
},

    dbRespToGameState = data => gameMechanics.gameState()
                .init(gameMechanics.newGameConfig().fromCompressed(data.gameEntry.newGameConfig))
                .applyMoveSequence(gameMechanics.moveSequence().fromCompressed(data.gameEntry.moveSeq)),

    extrapolateDBResp = (data, playerId, prebuiltGameState) => {
            let playerColor = (data.gameEntry.whiteId === playerId ? 'white' : null) ||
                (data.gameEntry.blackId === playerId ? 'black' : null),
                gameState = prebuiltGameState || dbRespToGameState(data);

            return {
                gameId: data.gameEntry.id,
                playerId: playerId,
                playerName: playerColor === 'white' ? data.gameEntry.whiteName : data.gameEntry.blackName,
                opponentName: playerColor === 'white' ? data.gameEntry.blackName : data.gameEntry.whiteName,
                playerColor: playerColor,
                turn: gameState.turn,
                winner: gameState.winner,
                board: gameState.board
            };
    };

app.use(morgan('dev'));
app.use(bodyParser.json());

app.use(express.static(__dirname + '/static'));

// create new game
app.post('/api/new', (req, res) => {
    let config = gameMechanics.newGameConfig();
    // wrapped in promise to propogate errors
    Q.promise(resolve => {
        if (req.body.config) {
            config.fromCompressed(req.body.config);
        }
        resolve();
    })
        .then(() => storage.addGame(config))
        .then(data => res.status(200).json({ 
            id: data.gameEntry.id
        }))
        .catch(err => handleError(res, err));
});

app.post('/api/join', (req, res) => {
    let gameId = req.body.id,
        playerName = req.body.name;

    Q.Promise((resolve, reject) => {
        if (!gameId || !playerName) {
            reject({name: "MalformedError", message: "Must provide id and name in json."});
        } else {
            resolve();
        }
    })
        .then(() => storage.joinGame(gameId, playerName))
        .then(data => res.status(200).json(extrapolateDBResp(data, data.playerId)))
        .catch((err) => handleError(res, err));
});

app.post('/api/state', (req, res) => {
    let gameId = req.body.gameId,
        playerId = req.body.playerId;

    Q.Promise((resolve, reject) => {
        if (!gameId || !playerId) {
            reject({name: "MalformedError", message: "Must provide gameId and playerId in json."});
        } else {
            resolve();
        }
    })
        .then(() => storage.getGame(gameId, playerId))
        .then(data => {
            let ext = extrapolateDBResp(data, playerId);  
            if (!ext.playerColor) {
                throw {name: "UnauthorizedError", message: "Player with given id does not have access to game with given id." };
            }
            res.status(200).json(ext); 
        })
        .catch(err => handleError(res, err));
});

app.post('/api/waitstate', (req, res) => {

    let gameId = req.body.gameId,
        playerId = req.body.playerId,
        status = {closed: false},
        onDone = () => {
            status.closed = true;
        };
    
    res.on('finish', onDone);
    res.on('close', onDone);

    Q.Promise((resolve, reject) => {
        if (!gameId || !playerId) {
            reject({name: "MalformedError", message: "Must provide gameId and playerId in json."});
        } else {
            resolve();
        }
    })
        .then(() => storage.awaitTurn(gameId, playerId, status))
        .then((data) => {
            if (!data) {
                return;
            }

            let ext = extrapolateDBResp(data, playerId); 

            if (!ext.playerColor) {
                throw {name: "UnauthorizedError", message: "Player with given id does not have access to game with given id." };
            }

            res.status(200).json(ext);
        })
        .catch(err => handleError(res, err));
});

app.post('/api/move', (req, res) => { 
    let gameId = req.body.gameId,
        playerId = req.body.playerId,
        moveStr = req.body.move,
        gameState, moveSeq, playerColor;

    Q.Promise((resolve, reject) => {
        if (!gameId || !playerId || !moveStr) {
            reject({name: "MalformedError", message: "Must provide gameId, playerId and move in json."});
        } else {
            resolve();
        }
    })
        .then(() => storage.getGame(gameId))
        .then(data => {
            gameState = dbRespToGameState(data);
            let ext = extrapolateDBResp(data, playerId, gameState); 
 
            playerColor = ext.playerColor;
            moveSeq = gameMechanics.moveSequence().fromCompressed(data.gameEntry.moveSeq);

            if (!playerColor) {
                throw {name: "UnauthorizedError", message: "Player with given id does not have access to game with given id." };
            }
            if (playerColor !== gameState.turn) {
                throw {name: "IllegalMoveError", message: "Cannot make move on " + gameState.turn + "'s turn." }; 
            }

            let move = gameMechanics.move().fromCompressed(moveStr);
            gameState.applyMove(move);
            moveSeq.array.push(move);
            return storage.setMoveSeq(gameId, moveSeq);
        })
        .then(data => res.status(200).json(extrapolateDBResp(data, playerId)))
        .catch(err => handleError(res, err));
});

var port = process.env.PORT || 3000;

storage.init()
    .then(() => app.listen(port, () => console.log("server up.")))
    .catch(console.log);
