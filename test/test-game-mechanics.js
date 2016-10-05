/*jshint strict:false */
/*jshint esversion: 6 */
'use strict';

const 
    malformedGameStates = require('./data/malformed-game-states.json'),
    malformedMoves = require('./data/malformed-moves.json'),
    validGameStates = require('./data/valid-game-states.json'),
    validMoves = require('./data/valid-moves.json'),
    moveSequenceCompressions = require('./data/move-sequence-compressions.json'),
    gamePlays = require('./data/game-plays.json'),
    illegalGamePlays = require('./data/illegal-game-plays.json'),
    gameMechanics = require('../lib/game-mechanics.js');

exports.testMalformedGameStateStructures = test => {
    test.expect(malformedGameStates.length);
    malformedGameStates.forEach(malformed => {
        try {
           gameMechanics.gameState().fromObject(malformed);
        } catch (err) {
            if (err.name === 'MalformedError') {
                 test.ok(true, "Malformed game state as expected, with message '" + err.message + "'.");
            } else {
                 test.ok(false, err.toString());
            }
        }
    });
    test.done();
};

exports.testValidGameStateStructures = test => {
    test.expect(validGameStates.length);
    validGameStates.forEach(valid => {
        try {
            gameMechanics.gameState().fromObject(valid);
            test.ok(true, "Confirmed valid game state structure");
        } catch (err) {
            test.ok(false, err.toString());
        }
    });
    test.done();
};

exports.testMalformedMoveStructures = test => {
    test.expect(malformedMoves.length);
    
    malformedMoves.forEach(malformed => {
        try {
           gameMechanics.move().fromObject(malformed);
        } catch (err) {
            if (err.name === 'MalformedError') {
                 test.ok(true, "Malformed move as expected, with message '" + err.message + "'.");
            } else {
                 test.ok(false, err.toString());
            }
        }
    });
    test.done();   
};

exports.testValidMoveStructures = test => {
    test.expect(validMoves.length);
    
    validMoves.forEach(valid => {
        try {
            gameMechanics.move().fromObject(valid);
            test.ok(true, "Confirmed valid move structure");
        } catch (err) {
            test.ok(false, err.toString());
        }
    });
    test.done();
};

exports.testMoveSequenceCompression = test => {
    test.expect(2 * moveSequenceCompressions.length);
    moveSequenceCompressions.forEach(item => {
        let decompressedExpected = gameMechanics.moveSequence().fromObject(item.decompressed),
            compressedExpected = item.compressed,
            decompressedActual = gameMechanics.moveSequence().fromCompressed(compressedExpected),
            compressedActual = decompressedExpected.toCompressed();

        test.strictEqual(compressedActual, compressedExpected, "Compressing move sequence did not result in expected string.");
        test.ok(decompressedActual.equivalentTo(decompressedExpected), "Decompressing move sequence did not result in expected object");
    });
    test.done();
};

exports.testGamePlays = test => {
    test.expect(gamePlays.length);
    gamePlays.forEach(gp => {
        try {
            let moves = gameMechanics.moveSequence().fromCompressed(gp.moveSeq),
                expected = gameMechanics.gameState().fromObject(gp.end),
                actual = gameMechanics.gameState().fromObject(gp.start).applyMoveSequence(moves);

            test.ok(actual.equivalentTo(expected));
        } catch (err) {
            test.ok(false, err.toString());
        }
    });
    test.done();
};

exports.testIllegalGamePlays = test => {
    test.expect(illegalGamePlays.length);
    illegalGamePlays.forEach(gp => {
        try {
            let moves = gameMechanics.moveSequence().fromCompressed(gp.moveSeq);

            gameMechanics.gameState()
                .fromObject(gp.start)
                .applyMoveSequence(moves);
            test.ok(false, "Should have encountered illegal move error.");
        } catch (err) {
            if (err.name === 'IllegalMoveError') {
                test.ok(true, "Encountered illegal move error as expected.");
            } else {
                test.ok(false, err.toString());
            }
        }
    });
    test.done();
};
