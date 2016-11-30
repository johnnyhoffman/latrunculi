## Latrunculi

Web app for playing the game Latrunculi (aka Ludus Latrunculorum). Check out the [wikipedia article](https://en.wikipedia.org/wiki/Ludus_latrunculorum) for more about the ancient board game.

### Motivation

On a quest to learn new skills and make myself more valuable in the job market, I wanted to make a web app with full-stack JavaScript. The idea was to learn the stack and produce an example app that others could learn from too.

Generally, when I embark on learning a new technology, my first thought is *can I make a game with it?* Instead of designing a new game, I decided it could be cool to make a tribute to the history of games. During my research of ancient games, Latrunculi called out to me.

### Project Structure

The appliction has the following components:

* Node.js Express Server
* Swappable database, including implementations for using DynamoDB or CouchDB
* Front end JavaScript, HTML, and CSS - all served up via Express.

Elements of these components are spread across the repo:

* The server logic is mostly contained in `server.js`. Additionally, `lib/game-mechanics.js` is used on the both the server and client for managing and validating game state. 
* The client logic is contained in `client.js`, `lib/client-networking.js`, and `lib/game-mechanics.js`. 
* Database logic is contained in `lib/storage.js` (which simply uses `config.js` to chose which database to use), `lib/couch-storage.js`, `lib/dynamo-storage.js`, and `lib/storage-utils.js`.

### Building, Running, Testing
I will assume you have `npm` installed. If not, install that first and spend a few minutes learning about its basic usage.

##### Building
Within the repo, run `npm install` to pull in both runtime and dev dependencies. 

You can now use `npm run webpack` to cross-compile to ES5, pack, and uglify the client-side JavaScript.

##### Config
Before you run the server, you'll have to set up your database and set some config values.

Currently, there are two database options: DynamoDB and CouchDB. I am not going to go into detail of how to get started with these products in general, but basically:

* If you want to use CouchDB as the latrunculi database, you'll need to have CouchDB running at an HTTP endpoint accessible from your latrunculi server (the easiest place is port 5984 on your localhost). In `config.js` set 
 * `exports.storage` to `couch`
 * `exports.couch.endpoint` to your CouchDB endpoint
 * `exports.couch.dbname` to whatever you would like the latrunculi database to be named
* If you want to use DynamoDB as the latrunculi database, you'll need an AWS account and an identity with DynamoDB permissions (e.g. an IAM user with carefully scoped permissions, or your root AWS permissions if you aren't familiar with AWS and aren't worried about the security risks). In `config.js` set
 * `exports.storage` to `dynamo`
 * `exports.dynamo.aws` to a config object that is approprate for [`aws.config.update`](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html#Hard-Coding_Credentials). For example 
  ```javascript
  { 
    region: "us-west-2",
    accessKeyId: 'YOUR_KEY_ID',
    secretAccessKey: 'YOUR_SECRET_KEY'
  }
  ```
 * `exports.dynamo.provisionedThroughput` to an object describing the table's throughput capacity, e.g. 
  ```javascript
  {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10
  }
  ```
 * `exports.dynamo.tableName` to whatever you would like the the latrunculi table to be named

##### Running
With the config set, you can finally run `npm start` to start the server. 

##### Testing
The tests cover game mechanics, both databases, and the server api. If you do not have both database types up or don't have the server spinning, the corresponding tests will fail. You also have to fill in `test/test-config.json`, where 

* `serverEndpoint` is the address for the server
* `couch` is the same form as `config.js`'s `exports.couch`
* `dynamo` is the same form as `config.js`'s `exports.dynamo`

With the config set, you can run the tests with `npm test`.

###REST API
The server supports a minimal set of REST operations. All of the operations use HTTP Post, and all expect and return JSON, so make sure to set `content-type` to `application/json`.

The following forms are used in the requests and responses:

* `NEW_GAME_CONFIG`: a string of form `"a,b,c,d"`, where `a` is the number of ranks, `b` is the number of files, `c` is the file of the white dux, and `d` is the file of black dux.
* `GAME_ID`: a uuid string used to refer to a specific game.
* `PLAYER_ID`: a uuid string used to refer to a specific player in a single game.
* `PLAYER_NAME`: a non-empty string used as a player's public name.
* `COLOR`: The color of a piece, or the player that controls pieces of the color. Either `"white"` or `"black"`.
* `PIECE_TYPE`: Type of a piece on the board. Either `"dux"` or `"man"`.
* `INDEX`: a zero-based index for either the rank or file (i.e. row or column) of a board.
* `PIECE`: an object of the form
  ```javascript
  {
    rank: INDEX,
    file: INDEX,
    type: PIECE_TYPE,
    color: COLOR
  }
  ```

* `BOARD`: an array of arrays, where each inner array is a rank (i.e. board row). Each rank array element is a `PIECE` if there is a piece at that position on the board, or null otherwise.
* `GAME_VIEW`: a complete representation of the game's state, from a specific player's perspective. Follows this form:
  ```javascript
  {
    gameId: GAME_ID,
    playerId: PLAYER_ID,
    playerName: PLAYER_NAME,
    opponentName: PLAYER_NAME,
    playerColor: COLOR,
    turn: COLOR,
    winner: COLOR,
    board: BOARD
  }			
  ```

* `MOVE`: a string of form `"r1,f1,r2,f2"` where is (`r1`,`f1`) is the coordinates of piece's origin and (`r2`,`f2`) is the coordinates of piece's destination.

The API supports the following operations:

* `/api/new`
 * Create a new game
 * Expects 
  ```javascript
  {
    config: NEW_GAME_CONFIG // optional
  }			
  ```
 * Returns 
  ```javascript
  {
    id: GAME_ID
  }
  ```
* `/api/join`
 * Join an existing game
 * Expects 
  ```javascript
  {
    id: GAME_ID,
    name: PLAYER_NAME
  }			
  ```
 * Returns `GAME_VIEW`
* `/api/state`
 * Gets the state of a game
 * Expects 
  ```javascript
  {
    gameId: GAME_ID,
    playerId: PLAYER_ID
  }			
  ```
 * Returns `GAME_VIEW`
* `/api/waitstate`
 * Gets the state of a game when it is the given player's turn (meant to be long-polled)
 * Expects 
  ```javascript
  {
    gameId: GAME_ID,
    playerId: PLAYER_ID
  }			
  ```
 * Returns `GAME_VIEW`
* `/api/move`
 * Make a move
 * Expects 
  ```javascript
  {
    gameId: GAME_ID,
    playerId: PLAYER_ID,
    move: MOVE
  }
  ```
 * Returns `GAME_VIEW`

Errors manifest in an error status code, and an error object of the form 
```javascript
{
  error: ERROR_NAME,
  message: STRING
}
```

`ERROR_NAME` could be

* `MalformedError` (status code 400)
* `IllegalMoveError` (status code 400)
* `InvalidConfigError` (status code 400)
* `GameFullError` (status code 400)
* `GameDoesntExistError` (status code 400)
* `UnauthorizedError` (status code 403)
* `InternalServerError` (status code 500)

### Thanks
Thanks to [Amelia Barlow](http://amelia-barlow.com/) for visual design direction. 

### Quality Stadards
I want to note that this is my first web application and furthermore my first time writing more than 50 or so lines of JavaScript at once. I think most of the code is well written, and most of the tools are utilized effectively - considering the scope of this project. However, I recognize that it is inevitable that a better understanding and awareness of the JavaScript stack and tools would seriously improve some parts of this app. So, if you see a part of the code that screams *there is a much better way of doing this*, **please let me know** - I would love to learn from my mistakes.

### License
MIT License.

So, include the `LICENSE.md` file that includes my name and the copyright intact, for all copies or substantial portions of this repo that you redistribute.
