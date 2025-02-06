const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 1000;
canvas.height = 600;

const socket = new WebSocket("ws://localhost:3000");

const startBtn = document.getElementById("startBtn");
startBtn.addEventListener("click", () => {
  socket.send(JSON.stringify({ type: "startGame", gameId }));
});

const pauseBtn = document.getElementById("pauseBtn");
pauseBtn.addEventListener("click", () => {
  socket.send(JSON.stringify({ type: "togglePause", gameId }));
});

let playerId = null;
let playerColor = null;
let gameId = null;
let scores = { player1: 0, player2: 0 };

let players = {
  1: {
    x: 60,
    y: canvas.height / 2 - 30,
    width: 20,
    height: 60,
    color: "red",
    speed: 6,
  },
  2: {
    x: canvas.width - 80,
    y: canvas.height / 2 - 30,
    width: 20,
    height: 60,
    color: "blue",
    speed: 6,
  },
};

let ball = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 10,
  color: "green",
  speedX: 5,
  speedY: 3,
};

let isRunning = false;
let animationFrameId;

socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "assignPlayer") {
    playerId = data.playerId;
    playerColor = data.color;
    gameId = data.gameId;
    console.log(`Player ${playerId} assigned, Color: ${playerColor}`);
  }

  if (data.type === "updateGameState") {
    scores = data.scores;
    ball = data.ball;
    data.players.forEach((player) => {
      players[player.playerId].y = player.y;
    });
  }

  if (data.type === "gameResumed") {
    if (!isRunning) {
      isRunning = true;
      gameLoop(); // Resume the game loop
    }
  }

  if (data.type === "gamePaused") {
    isRunning = !data.paused;
    if (data.paused) {
      cancelAnimationFrame(animationFrameId); // Stop the game loop
    } else {
      gameLoop(); // Resume the game loop
    }
  }
});

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  updateBall();
  drawPlayer(players[1]);
  drawPlayer(players[2]);
  drawBall();
  drawScores();
  displayPlayerInfo();

  animationFrameId = requestAnimationFrame(gameLoop);
}

function drawPlayer(player) {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawBall() {
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = ball.color;
  ctx.fill();
  ctx.closePath();
}

function drawScores() {
  ctx.font = "20px Arial";
  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.fillText(`Player 1: ${scores.player1}`, canvas.width / 4, 30);
  ctx.fillText(`Player 2: ${scores.player2}`, (3 * canvas.width) / 4, 30);
}

function displayPlayerInfo() {
  ctx.font = "18px Arial";
  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.fillText(
    `You are Player ${playerId}, Color: ${playerColor}`,
    canvas.width / 2,
    canvas.height - 20
  );
}

function updateBall() {
  ball.x += ball.speedX;
  ball.y += ball.speedY;

  if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) {
    ball.speedY *= -1;
  }

  checkCollision(players[1]);
  checkCollision(players[2]);

  if (ball.x - ball.radius < 0) {
    scores.player2++;
    resetGame();
  } else if (ball.x + ball.radius > canvas.width) {
    scores.player1++;
    resetGame();
  }
}

function checkCollision(player) {
  if (
    ball.x + ball.radius > player.x &&
    ball.x - ball.radius < player.x + player.width &&
    ball.y + ball.radius > player.y &&
    ball.y - ball.radius < player.y + player.height
  ) {
    ball.speedX *= -1; // Reverse ball direction
    // Add slight randomness to the Y direction to make gameplay dynamic
    ball.speedY += Math.random() * 2 - 1;
  }
}

function resetGame() {
  ball.x = canvas.width / 2;
  ball.y = canvas.height / 2;
  ball.speedX *= -1;
  ball.speedY = (Math.random() > 0.5 ? 1 : -1) * 3;
  players[1].y = canvas.height / 2 - players[1].height / 2;
  players[2].y = canvas.height / 2 - players[2].height / 2;

  socket.send(JSON.stringify({ type: "updateGameState", gameId }));
}

const keys = {};
window.addEventListener("keydown", (event) => {
  keys[event.key] = true;
});
window.addEventListener("keyup", (event) => {
  keys[event.key] = false;
});

function updatePlayerPosition() {
  if (playerId === 1) {
    if (keys["ArrowUp"] && players[1].y > 0) players[1].y -= players[1].speed;
    if (keys["ArrowDown"] && players[1].y < canvas.height - players[1].height)
      players[1].y += players[1].speed;
  } else if (playerId === 2) {
    if (keys["w"] && players[2].y > 0) players[2].y -= players[2].speed;
    if (keys["s"] && players[2].y < canvas.height - players[2].height)
      players[2].y += players[2].speed;
  }

  socket.send(
    JSON.stringify({
      type: "updatePosition",
      playerId: playerId,
      y: players[playerId].y,
    })
  );
}

function initGame() {
  isRunning = true;
  gameLoop();
  setInterval(updatePlayerPosition, 1000 / 60);
}

initGame();
