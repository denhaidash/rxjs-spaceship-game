import {
  map,
  toArray,
  switchMap,
  filter,
  pluck,
  throttleTime,
  startWith,
  scan,
  shareReplay,
  takeUntil,
  delay,
  share
} from "rxjs/operators";
import { interval, range, fromEvent, combineLatest, Subject } from "rxjs";

document.addEventListener("DOMContentLoaded", initGame);

function initGame() {
  const WIDTH = window.innerWidth;
  const HEIGHT = window.innerHeight;
  const GAME_SPEED = 40;
  const STAR_NUMBER = 250;
  const SPACESHIP_MOVE_STEP = 20;
  const ENEMIES_FREQ = 1500;
  const SHOOT_SPEED = 15;
  const SCORE_FOR_ENEMY = 10;

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const heroDefaultPosition = {
    x: WIDTH / 2,
    y: HEIGHT - 30
  };

  const gameOverSubject = new Subject();
  const gameOver$ = gameOverSubject.pipe(delay(300));

  const gameTicker$ = interval(GAME_SPEED).pipe(share());

  const stars$ = range(1, STAR_NUMBER).pipe(
    map(() => ({
      x: getRandX(),
      y: getRandY(),
      size: getRandInt(1, 4)
    })),
    toArray(),
    switchMap(stars =>
      gameTicker$.pipe(
        map(() => {
          stars.forEach((star, i) => {
            if (star.y >= HEIGHT) {
              star.y = 0;
            }
            star.y += i % 3 === 0 ? 6 : 3;
          });

          return stars;
        })
      )
    )
  );

  const keyPress$ = fromEvent(document, "keydown").pipe(
    throttleTime(50),
    pluck("code")
  );

  const keyboardArrows$ = keyPress$.pipe(
    filter(key => key === "ArrowLeft" || key === "ArrowRight")
  );

  const keyboardSpace$ = keyPress$.pipe(filter(key => key === "Space"));

  const playerMoves$ = keyboardArrows$.pipe(
    map(key =>
      key === "ArrowLeft" ? -SPACESHIP_MOVE_STEP : SPACESHIP_MOVE_STEP
    )
  );

  const spaceShip$ = playerMoves$.pipe(
    scan((position, move) => {
      let x = position.x + move;
      if (x < 0) {
        x = 0;
      }

      if (x > WIDTH) {
        x = WIDTH;
      }

      return {
        x,
        y: position.y
      };
    }, heroDefaultPosition),
    startWith(heroDefaultPosition),
    shareReplay(1)
  );

  const playerShots$ = spaceShip$.pipe(
    switchMap(spaceship =>
      keyboardSpace$.pipe(
        map(() => ({
          x: spaceship.x,
          y: spaceship.y - 15
        }))
      )
    ),
    scan((shots, shot) => {
      shots.push(shot);
      return shots.filter(s => !s.isDestroyed).filter(s => s.y >= 0);
    }, []),
    switchMap(shots =>
      gameTicker$.pipe(
        map(() => {
          shots.forEach(s => {
            s.y -= SHOOT_SPEED;
          });
          return shots.filter(s => !s.isDestroyed);
        })
      )
    ),
    startWith([])
  );

  const newEnemy$ = interval(ENEMIES_FREQ).pipe(
    map(() => ({
      x: getRandX(),
      y: -15
    }))
  );

  const enemies$ = newEnemy$.pipe(
    scan((enemies, enemy) => {
      enemies.push(enemy);
      return enemies
        .filter(enemy => !enemy.isDestroyed)
        .filter(enemy => enemy.y <= HEIGHT);
    }, []),
    switchMap(enemies =>
      gameTicker$.pipe(
        map(i => {
          enemies.forEach(enemy => {
            (enemy.x += i % 10 === 0 ? getRandInt(-5, 5) : 0), (enemy.y += 3);
          });

          return enemies
            .filter(enemy => !enemy.isDestroyed)
            .filter(enemy => enemy.y <= HEIGHT);
        })
      )
    ),
    shareReplay(1)
  );

  const enemyShots$ = combineLatest(spaceShip$, enemies$).pipe(
    throttleTime(500),
    map(([spaceship, enemies]) =>
      enemies.filter(enemy => Math.abs(enemy.x - spaceship.x) < 100)
    ),
    switchMap(enemies =>
      interval(GAME_SPEED * 10).pipe(
        map(() => {
          const enemy = enemies[getRandInt(0, enemies.length - 1)];

          return enemy
            ? {
                x: enemy.x,
                y: enemy.y + 15
              }
            : null;
        }),
        filter(Boolean)
      )
    ),
    scan((shots, shot) => {
      shots.push(shot);
      return shots.filter(s => !s.isDestroyed).filter(s => s.y <= HEIGHT);
    }, []),
    switchMap(shots =>
      gameTicker$.pipe(
        map(() => {
          shots.forEach(s => {
            s.y += SHOOT_SPEED / 2;
          });
          return shots.filter(s => !s.isDestroyed);
        })
      )
    ),
    startWith([])
  );

  const game$ = combineLatest(
    stars$,
    spaceShip$,
    enemies$,
    playerShots$,
    enemyShots$
  ).pipe(
    map(([stars, spaceship, enemies, playerShots, enemyShots]) => {
      const score = detectEnemiesCollision(enemies, playerShots);
      detectSpaceshipCollition(spaceship, enemies, enemyShots);

      return {
        stars,
        spaceship,
        enemies,
        playerShots,
        enemyShots,
        score
      };
    }),
    scan(
      (state, actors) => {
        return {
          ...actors,
          score: state.score + actors.score
        };
      },
      {
        score: 0
      }
    ),
    takeUntil(gameOver$)
  );

  game$.subscribe(renderScene, null, showGameOverAlert);

  function renderScene(actors) {
    paintStarts(actors.stars);
    paintEnemies(actors.enemies);
    paintShots(actors.playerShots, "player");
    paintShots(actors.enemyShots, "enemy");
    paintSpaceShip(actors.spaceship);
    paintScore(actors.score);

    if (actors.spaceship.isDestroyed) {
      gameOverSubject.next();
    }
  }

  function showGameOverAlert() {
    alert("Game over");
  }

  function detectCollision(target1, target2) {
    return (
      Math.abs(target1.x - target2.x) < 20 &&
      Math.abs(target1.y - target2.y) < 20
    );
  }

  function detectEnemiesCollision(enemies, shots) {
    let score = 0;

    enemies
      .filter(enemy => !enemy.isDestroyed)
      .forEach(enemy => {
        shots
          .filter(shot => !shot.isDestroyed)
          .forEach(shot => {
            if (detectCollision(enemy, shot)) {
              enemy.isDestroyed = true;
              shot.isDestroyed = true;

              score += SCORE_FOR_ENEMY;
            }
          });
      });

    return score;
  }

  function detectSpaceshipCollition(spaceship, enemies, enemyShots) {
    enemies
      .filter(enemy => !enemy.isDestroyed)
      .forEach(enemy => {
        if (detectCollision(enemy, spaceship)) {
          spaceship.isDestroyed = true;
          enemy.isDestroyed = true;
        }
      });

    enemyShots
      .filter(shot => !shot.isDestroyed)
      .forEach(shot => {
        if (detectCollision(shot, spaceship)) {
          spaceship.isDestroyed = true;
          shot.isDestroyed = true;
        }
      });
  }

  function paintStarts(stars) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#fff";
    stars.forEach(star => {
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });
  }

  function paintSpaceShip(spaceship) {
    if (!spaceship.isDestroyed) {
      drawTriangle(spaceship.x, spaceship.y, 20, "#ff0000", "up");
    } else {
      drawRect(spaceship.x, spaceship.y, 25, 25, "#ff0000");
    }
  }

  function paintEnemies(enemies) {
    enemies.forEach(enemy => {
      if (!enemy.isDestroyed) {
        drawTriangle(enemy.x, enemy.y, 20, "#00ff00");
      } else {
        drawRect(enemy.x, enemy.y, 20, 20, "#ff0000");
      }
    });
  }

  function paintShots(shots, type = "player") {
    shots
      .filter(shot => !shot.isDestroyed)
      .forEach(shot => {
        drawTriangle(
          shot.x,
          shot.y,
          5,
          "#ff7700",
          type === "player" ? "up" : "down"
        );
      });
  }

  function paintScore(score) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(`Score: ${score}`, 40, 43);
  }

  function drawTriangle(x, y, width, color, direction) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - width, y);
    ctx.lineTo(x, direction === "up" ? y - width : y + width);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x - width, y);
    ctx.fill();
  }

  function drawRect(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  }

  function getRandInt(min, max) {
    return ~~(Math.random() * (max - min + 1) + min);
  }

  function getRandX() {
    return getRandInt(0, WIDTH);
  }

  function getRandY() {
    return getRandInt(0, HEIGHT);
  }
}
