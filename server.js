const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Define the host and port
const PORT = process.env.PORT || 3000;
const HOST = "localhost"; // IPv4 Address

// Create an HTTP server
const server = http.createServer((req, res) => {
  const filePath = path.join(
    __dirname,
    "public",
    req.url === "/" ? "index.html" : req.url
  );
  const extname = path.extname(filePath);
  const contentType = getContentType(extname);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end("Server Error");
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

// Create a WebSocket server
const wss = new WebSocket.Server({ server });

let games = {}; // Store game sessions by game ID
let playerCount = 0;

// Broadcast a message to all players in a game session
function broadcast(gameId, data) {
  games[gameId].players.forEach((player) => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  });
}

wss.on("connection", (ws) => {
  playerCount++;
  const playerId = playerCount; // Assign player ID (1 or 2)
  let gameId = null;

  // When the first player connects, create a new game
  if (playerCount % 2 !== 0) {
    gameId = `game_${Math.floor(playerCount / 2) + 1}`; // Correcting game ID for each pair
    games[gameId] = {
      players: [],
      ball: {
        x: 500,
        y: 300,
        radius: 10,
        speedX: 5,
        speedY: 3,
      },
      scores: { player1: 0, player2: 0 },
      paused: false, // New property
    };
  } else {
    gameId = `game_${Math.floor(playerCount / 2)}`; // Ensure game ID is correct
  }

  // Add the player to the game session
  if (!games[gameId]) {
    console.error(`Error: Game ${gameId} is not initialized.`);
    return; // Don't proceed if gameId doesn't exist
  }

  games[gameId].players.push({
    ws: ws,
    playerId: playerId,
    y: 300, // Initial Y position for both players
    color: playerId === 1 ? "red" : "blue",
  });

  // Send initial game state to the players
  ws.send(
    JSON.stringify({
      type: "assignPlayer",
      playerId: playerId,
      color: playerId === 1 ? "red" : "blue",
      gameId: gameId,
    })
  );

  // When both players are connected, start the game
  if (games[gameId].players.length === 2) {
    startGameLoop(gameId);
  }

  // Handle incoming messages from players
  ws.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.type === "updatePosition") {
      // Update the player's position
      const player = games[gameId].players.find(
        (p) => p.playerId === data.playerId
      );
      if (player) {
        player.y = data.y;

        // Broadcast the updated game state
        broadcast(
          gameId,
          JSON.stringify({
            type: "updateGameState",
            gameId: gameId,
            ball: games[gameId].ball,
            scores: games[gameId].scores,
            players: games[gameId].players.map((p) => ({
              playerId: p.playerId,
              y: p.y,
              color: p.color,
            })),
          })
        );
      } else {
        console.error(
          `Error: Player ${data.playerId} not found in game ${gameId}`
        );
      }
    }

    if (data.type === "startGame") {
      const game = games[data.gameId];
      if (game && game.paused) {
        game.paused = false; // Unpause the game
        broadcast(
          data.gameId,
          JSON.stringify({
            type: "gameResumed",
          })
        );
      }
    }

    if (data.type === "togglePause") {
      const game = games[data.gameId];
      if (game) {
        game.paused = !game.paused; // Toggle the pause state
        broadcast(
          data.gameId,
          JSON.stringify({
            type: "gamePaused",
            paused: game.paused,
          })
        );
      }
    }
  });

  // Remove player from the game when they disconnect
  ws.on("close", () => {
    const index = games[gameId].players.findIndex((p) => p.ws === ws);
    games[gameId].players.splice(index, 1);

    // If both players disconnected, remove the game
    if (games[gameId].players.length === 0) {
      delete games[gameId];
    }
  });
});

function startGameLoop(gameId) {
  const game = games[gameId];

  setInterval(() => {
    if (game.paused) return; // Skip updating if the game is paused

    // Update ball position
    game.ball.x += game.ball.speedX;
    game.ball.y += game.ball.speedY;

    // Check for ball-wall collisions
    if (
      game.ball.y - game.ball.radius < 0 ||
      game.ball.y + game.ball.radius > 600
    ) {
      game.ball.speedY *= -1;
    }

    // Check for ball-player collisions
    game.players.forEach((player) => {
      const paddleX = player.playerId === 1 ? 60 : 940; // Paddle positions
      const paddleY = player.y;
      const paddleWidth = 20;
      const paddleHeight = 60;

      if (
        game.ball.x + game.ball.radius > paddleX &&
        game.ball.x - game.ball.radius < paddleX + paddleWidth &&
        game.ball.y > paddleY &&
        game.ball.y < paddleY + paddleHeight
      ) {
        game.ball.speedX *= -1; // Reverse ball direction
        game.ball.speedY += Math.random() * 2 - 1;
      }
    });

    // Check for scoring
    if (game.ball.x - game.ball.radius < 0) {
      game.scores.player2++; // Player 2 scores
      resetBall(game);
    } else if (game.ball.x + game.ball.radius > 1000) {
      game.scores.player1++; // Player 1 scores
      resetBall(game);
    }

    // Broadcast the updated game state
    broadcast(
      gameId,
      JSON.stringify({
        type: "updateGameState",
        gameId: gameId,
        ball: game.ball,
        scores: game.scores,
        players: game.players.map((p) => ({
          playerId: p.playerId,
          y: p.y,
          color: p.color,
        })),
      })
    );
  }, 1000 / 60); // 60 FPS
}

// Reset the ball to the center after a point is scored
function resetBall(game) {
  game.ball.x = 500;
  game.ball.y = 300;
  game.ball.speedX *= -1; // Reverse direction
  game.ball.speedY = (Math.random() > 0.5 ? 1 : -1) * 3;
}

// Helper function to determine content type based on file extension
function getContentType(extname) {
  switch (extname) {
    case ".html":
      return "text/html";
    case ".js":
      return "application/javascript";
    case ".css":
      return "text/css";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

// Start the HTTP server listening on 192.168.0.20 and port 3000
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
