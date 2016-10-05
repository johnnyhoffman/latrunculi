/*jshint esversion:6*/
'use strict';

const gameMechanics = require('./lib/game-mechanics.js'),
    net = require('./lib/client-networking.js'),
    Q = require('q'),
    $ = require('jquery');

$(document).ready(function() {

    let 
    // state variables
    playState,
        $selectedPiece,

        // clonable images
        $manImg = $('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50%" cy="50%" r="25%"/></svg>'),
        $duxImgUp = $('<div><svg xmlns="http://www.w3.org/2000/svg "width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,24 22,76, 78,76"/></svg></div>'),
        $duxImgDown = $('<div><svg xmlns="http://www.w3.org/2000/svg "width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,76 78,24, 22,24"/></svg></div>'),
        $moveImg = $('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50%" cy="50%" r="12%"/></svg>'),

        // elements
        $body = $('body'),
        $newGamePane = $('#new-game-pane'),
        $newGameButton = $('#new-game-button'),
        $joinPane = $('#join-pane'),
        $joinButton = $('#join-button'),
        $joinNameInput = $('#join-input'),
        $joinShareLink = $joinPane.find('.share-link'),
        $playPane = $('#play-pane'),
        $board = $('#board'),
        $playShareLink = $playPane.find('.share-link'),
        $playShareDesc = $playPane.find('.share-link-desc'),
        $selfTurnIndicator = $('#self-turn-indicator'),
        $opponentTurnIndicator = $('#opponent-turn-indicator'),
        $footer = $('#footer'),
        $aboutFooter = $('#about-footer'),
        $rulesFooter = $('#rules-footer'),
        $homeFooter = $('#home-footer'),
        $overlay = $('#overlay'),
        $overlayX = $('#overlay-x'),
        $aboutOverlay = $('#about-overlay'),
        $rulesOverlay = $('#rules-overlay'),
        $winnerOverlay = $('#winner-overlay'),
        $winnerOverlayTitle = $('#winner-title'),
        $winnerOverlayNewGameButton = $('#winner-new-game-button'),
        $errorOverlay = $('#error-overlay'),
        $errorOverlayTitle = $('#error-title'),
        $errorDesc = $('#error-desc'),
        $errorOkayButton = $('#error-okay-button'),
        $errorHomeButton = $('#error-home-button'),
        

        // reorganize server response into state for play pane
        respToPlayState = function (resp) {
            return {
                gameId: resp.gameId,
                opponentName: resp.opponentName,
                playerColor: resp.playerColor,
                playerId: resp.playerId,
                playerName: resp.playerName,
                gameState: gameMechanics.gameState().fromObject({
                    turn: resp.turn,
                    winner: resp.winner,
                    board: resp.board
                })
            };
        },

        // handle an error if not otherwise handled
        onUnhandledError = function(err) { 
            console.log(err);
            let message = err.message,
                title = 'Error';
            if (err.xmlhttprequest && err.xmlhttprequest.responseText) {
                try {
                    let parsedError = JSON.parse(err.xmlhttprequest.responseText);
                    message = parsedError.message || message;
                    title = parsedError.error === "GameFullError" ? 'Game full' : title;
                } catch (err) {
                    // ignore parsing error and use the original err message
                }
            }
            showErrorOverlay(title, message, true);
        },

        // when new game button is clicked
        newGameClick = function() {
            $newGameButton.attr('disabled', true);
            Q.fcall(() => { return gameMechanics.newGameConfig(); })
                .then((config) => { return net.newgame(config); })
                .then((resp) => {
                    window.location.hash = resp.id;
                })
                .catch(onUnhandledError);
        },

        // long poll server to wait for players turn
        listenForTurn = function () {
            if (playState.gameState.turn !== playState.playerColor) {
                let ids = idsFromHash();
                net.waitstate(ids.gameId, ids.playerId)
                    .then(function(resp) {
                        let ids = idsFromHash();
                        // Check for special case: User joins game, presses back, joins game again, makes move.
                        // The original game waits for it's turn, then sends response for wrong player
                        //  to new game.
                        if (ids.gameId === resp.gameId && ids.playerId === resp.playerId) {
                            playState = respToPlayState(resp);
                            setBoard();
                        }
                    })
                    .catch(onUnhandledError);
            }
        },

        // when join button is clicked
        joinClick = function() {
            let ids = idsFromHash();
            $joinButton.attr('disabled', true);
            $joinNameInput.attr('disabled', true);
            net.join(ids.gameId, $joinNameInput.val())
                .then(function(resp) {
                    playState = respToPlayState(resp);
                    window.location.hash = playState.gameId + "/" + playState.playerId;
                })
                .catch(onUnhandledError); 
        },

        // if available, pull the gameId and playerId form the url hash route
        idsFromHash = function() {
            let hash = window.location.hash,
                justGameIDregex = /^#?([^/]+)$/,
                bothRegex = /^#?([^/]+)\/([^/]+)$/;

            if (!hash) {
                return {};
            } else if (bothRegex.test(hash)) {
                let matches = bothRegex.exec(hash);
                return {gameId: matches[1], playerId: matches[2]};
            } else if (justGameIDregex.test(hash)) {
                let matches = justGameIDregex.exec(hash);
                return {gameId: matches[1]};
            }
            return {};
        },

        // validation for join name - for now just making sure it isn't empty
        onJoinNameChange = function(event) {
            if (event.target.value) {
                $joinButton.removeAttr('disabled');
            } else {
                $joinButton.attr('disabled', true);
            }
        },

        // hide everything on the screen
        clearPanes = function() {
            $joinPane.fadeOut(100);
            $newGamePane.fadeOut(100);
            $playPane.fadeOut(100);
            closeOverlay();

            $body.removeAttr('data-pane');
            $footer.removeAttr('data-pane');

            $board.removeAttr('data-rank-count');
            $board.removeAttr('data-file-count');
            $board.empty();
        },

        // hide overlay
        closeOverlay = function() {
            $overlay.fadeOut(150).removeAttr('data-piece-color');
            $footer.removeAttr('data-overlay-active');
            cleanOverlay();
        },

        // remove overlay contents
        cleanOverlay = function() {
            $aboutOverlay.hide();
            $rulesOverlay.hide();
            $winnerOverlay.hide();
            $errorOverlay.hide();
        },

        showAboutOverlay = function() {
            cleanOverlay();
            $aboutOverlay.show();
            $footer.attr('data-overlay-active', true);
            $overlay.attr('data-piece-color', 'white');
            if (!$overlay.is(':visible')) {
                $overlay.fadeIn(150);
            }
        },

        showRulesOverlay = function() {
            cleanOverlay();
            $rulesOverlay.show();
            $footer.attr('data-overlay-active', true);
            $overlay.attr('data-piece-color', 'black');
            if (!$overlay.is(':visible')) {
                $overlay.fadeIn(150);
            }
        },

        showWinnerOverlay = function(name, color) {
            cleanOverlay();
            $winnerOverlay.show();
            $winnerOverlayTitle.html(name + " won!");
            $footer.attr('data-overlay-active', true);
            $overlay.attr('data-piece-color', color);
            
            if (!$overlay.is(':visible')) {
                $overlay.fadeIn(150);
            }
        },

        showErrorOverlay = function(title, message, showHomeButton) {
            cleanOverlay();
            if (showHomeButton) {
                $errorOkayButton.removeAttr('data-solo'); 
                $errorHomeButton.show();
            } else {
                $errorOkayButton.attr('data-solo', true);
                $errorHomeButton.hide();
            }
            $errorOverlay.show();
            $errorOverlayTitle.html(title);
            $errorDesc.html(message);
            $footer.attr('data-overlay-active', true);
            $overlay.attr('data-piece-color', 'white');
            if (!$overlay.is(':visible')) {
                $overlay.fadeIn(150);
            }
        },

        // show the correct pane dependent on if we know the gameId and playerId
        loadFromHash = function() {
            clearPanes();
            let ids = idsFromHash();
            if (ids.gameId && ids.playerId) {
                showPlayPane();
            } else if (ids.gameId) {
                showJoinPane();
            } else {
                showNewGamePane();
            }
        },

        // navigate to the initial new game pane
        showNewGamePane = function() {
            $body.attr('data-pane', 'new-game');
            $footer.attr('data-pane', 'new-game');
            $newGameButton.removeAttr('disabled');
            $newGamePane.fadeIn(200);
        },

        // navigate to the join pane
        showJoinPane = function() { 
            $body.attr('data-pane', 'join');
            $footer.attr('data-pane', 'join');
            $joinNameInput.val("");
            $joinButton.attr('disabled', true);
            $joinNameInput.removeAttr('disabled');
            $joinShareLink.html(window.location.href.replace(/https?:\/\//, ''));
            $joinPane.fadeIn(200); 
        },

        // navigate to the play pane
        showPlayPane = function() {
            if (playState) {
                $body.attr('data-pane', 'play');
                $footer.attr('data-pane', 'play');
                setBoard();
                listenForTurn();
                $playShareLink.html(window.location.href
                    .replace(/https?:\/\//, '')
                    .replace(/\/[^/]+$/, ''));

                $playPane.fadeIn(200);
            } else {
                let ids = idsFromHash();
                net.state(ids.gameId, ids.playerId)
                    .then(function(resp) { 
                        playState = respToPlayState(resp);
                        showPlayPane();
                    })
                    .catch(onUnhandledError);
            }
        },

        // set appropriate attributes when a piece is hovered over
        pieceMouseOn = function($piece, piece) {
            if (playState.gameState.winner) { return; }

            if (piece.color === playState.gameState.turn &&
                piece.color === playState.playerColor) {
                    $piece.attr('data-hover', true);
                }
        },

        pieceMouseOff = function($piece) {
            $piece.removeAttr('data-hover');
        },

        // behavior for when any pice is clicked, even invisible placeholder pieces
        pieceClick = function($piece, piece) {
            if (playState.gameState.winner) { 
                let name = playState.gameState.winner === playState.playerColor ? playState.playerName : playState.opponentName;
                showWinnerOverlay(name, playState.gameState.winner);
                return;
            }

            let $previouslySelected = $selectedPiece;
            if ($selectedPiece && piece.color === playState.playerColor) {
                $selectedPiece.removeAttr('data-selected');
                clearValidMoves();
                $selectedPiece = null;
            }
            if ($piece !== $previouslySelected &&
                piece.color === playState.gameState.turn &&
                piece.color === playState.playerColor) {

                    $selectedPiece = $piece;
                    $piece.attr('data-selected', true);
                    markValidMoves();
            }
            if (playState.gameState.turn !== playState.playerColor) {
                showErrorOverlay("Hold up!", "It is your opponent's turn right now!");
            }
        }, 

        moveClick = function($move) {
            let move = gameMechanics.move().fromCoordinates(
                parseInt($selectedPiece.attr('data-rank-num')),
                parseInt($selectedPiece.attr('data-file-num')), 
                parseInt($move.attr('data-rank-num')),
                parseInt($move.attr('data-file-num'))),
                ids = idsFromHash();

            net.move(ids.gameId, ids.playerId, move)
                .then(function(resp) { 
                    playState = respToPlayState(resp);
                    listenForTurn();
                    setBoard();
                })
                .catch(onUnhandledError);

        },

        // add an attribute to all valid moves
        markValidMoves = function() {
            let rankNum = parseInt($selectedPiece.attr('data-rank-num')),
                fileNum = parseInt($selectedPiece.attr('data-file-num')),
                validCoords = playState.gameState.unblockedMoveCoordinates(rankNum, fileNum);
            validCoords.forEach(coord => getMoveElement(coord[0], coord[1]).show());
        },

        // get the html element for a piece with given coordinates
        getMoveElement = function(rank, file) {
            return $board.children().eq(rank).children().eq(file).find('.board-move');
        },


        // unshow valid moves
        clearValidMoves = function() {
            $board.find('.board-move').hide();
        },

        // set all pieces on a board (building the board only if necessary)
        setBoard = function() {
            let rankCount = playState.gameState.board.length,
                fileCount = playState.gameState.board[0].length,
                divRankCount = $board.attr('data-rank-num'),
                divFileCount = $board.attr('data-file-num');

            clearValidMoves();

            if ((rankCount !== divRankCount) || (fileCount !== divFileCount)) {
                $board.empty();
                createBoard();
            }

            if (playState.opponentName) {
                $playShareDesc.hide();
                $playShareLink.hide();
            } else {
                $playShareDesc.show();
                $playShareLink.show();
            }

            $selfTurnIndicator.find('p').html(playState.playerName);
            $opponentTurnIndicator.find('p').html(playState.opponentName || "");
            $selfTurnIndicator.attr('data-piece-color', playState.playerColor);
            $opponentTurnIndicator.attr('data-piece-color', playState.playerColor === 'white' ? 'black' : 'white');

            if (playState.gameState.winner) {
                let name = playState.gameState.winner === playState.playerColor ? playState.playerName : playState.opponentName;
                showWinnerOverlay(name, playState.gameState.winner);
            } else {
                let selfTurn = playState.gameState.turn === playState.playerColor,
                    $activeTurnIndicator = (selfTurn ? $selfTurnIndicator : $opponentTurnIndicator),
                    $inactiveTurnIndicator = (selfTurn ? $opponentTurnIndicator : $selfTurnIndicator);
                $activeTurnIndicator.attr('data-is-turn', true);
                $inactiveTurnIndicator.removeAttr('data-is-turn');
            }
            $board.children().each(function(rankNum) {
                $(this).children().each(function(fileNum) { 
                    let $square = $(this),
                        piece = playState.gameState.board[rankNum][fileNum];
                    if (piece) {
                        let $piece;
                        if (piece && piece.type === 'dux') {
                            if (piece.color === 'white') {
                                $piece = $duxImgUp.clone();
                            } else {
                                $piece = $duxImgDown.clone();
                            }
                        } else {
                            $piece = $manImg.clone();
                        }
                        $piece
                            .addClass('board-piece')
                            .attr('data-rank-num', rankNum)
                            .attr('data-file-num', fileNum)
                            .attr('data-piece-type', piece.type)
                            .attr('data-piece-color', piece.color)
                            .mouseover(() => pieceMouseOn($piece, piece))
                            .mouseout(() => pieceMouseOff($piece, piece))
                            .click(() => pieceClick($piece, piece));
                        $square.append($piece);
                    } else {
                        let $move = $moveImg.clone();
                        $move
                            .addClass('board-move')
                            .attr('data-rank-num', rankNum)
                            .attr('data-file-num', fileNum)
                            .hide()
                            .mouseover(() => $move.attr('data-hover', true))
                            .mouseout(() => $move.removeAttr('data-hover'))
                            .click(() => moveClick($move));
                        $square.append($move); 
                    }
                });
            });
        },

        // create all squares for a board (but don't add any pieces)
        createBoard = function() {
            let rankNum = 0;
            $board.attr('data-rank-count', playState.gameState.board.length);
            $board.attr('data-file-count', playState.gameState.board[0].length);
            playState.gameState.board.forEach((rank) => {
                let fileNum = 0,
                    $rankDiv = $("<div>").addClass('board-rank');
                $board.append($rankDiv);
                rank.forEach(() => {
                    let odd = ((fileNum + rankNum) % 2),
                        $square = $('<div></div>');

                    $square.addClass('board-square')
                        .attr('data-parity', odd ? 'odd' : 'even');

                    $rankDiv.append($square);
                    fileNum += 1;
                });
                rankNum += 1;
            });

        };

    // initalize app

    $newGameButton.click(newGameClick);
    $winnerOverlayNewGameButton.click(newGameClick);
    $joinButton.click(joinClick);
    $joinNameInput.on('input', onJoinNameChange);
    $overlayX.click(closeOverlay);
    $errorOkayButton.click(closeOverlay);
    $errorHomeButton.click(() => {closeOverlay(); window.location.hash = ""; });
    $homeFooter.click(() => { closeOverlay(); window.location.hash = ""; });
    $aboutFooter.click(showAboutOverlay);
    $rulesFooter.click(showRulesOverlay);
    $('.dimming-text').mouseover(function() { $(this).attr('data-hover', true); });
    $('.dimming-text').mouseout(function() { $(this).removeAttr('data-hover'); });
    $overlayX.mouseover(function() { $(this).attr('data-hover', true); });
    $overlayX.mouseout(function() { $(this).removeAttr('data-hover'); });
    $joinNameInput.keypress(e => {
        // 13 = enter key
        if (e.which === 13 && $joinNameInput.val()) {
            joinClick();
        }
    }); 

    // changing the hash, either manually from the user or from within the app reloads page
    window.onhashchange = loadFromHash;

    // show app
    loadFromHash();
});

