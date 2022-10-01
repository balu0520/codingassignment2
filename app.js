const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3001, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        //console.log(payload.username);
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE 
    username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const postUserQuery = `INSERT INTO user(username,password,name,gender)
            VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
      await db.run(postUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user 
    WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT user_id from user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const realUserId = userId.user_id;
  const getFeedsQuery = `SELECT user.username as username,
  tweet.tweet as tweet,tweet.date_time as dateTime
  FROM (follower join tweet on follower.following_user_id = tweet.user_id) AS T
  join user on T.user_id = user.user_id
  WHERE follower.follower_user_id = ${realUserId}
  ORDER BY tweet.date_time DESC 
  LIMIT 4 ;`;
  const booksArray = await db.all(getFeedsQuery);
  response.send(booksArray);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT user_id from user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const realUserId = userId.user_id;
  const getUserFollowQuery = `SELECT user.name as name 
  FROM user INNER JOIN follower on user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${realUserId};`;
  const getUserFollow = await db.all(getUserFollowQuery);
  response.send(getUserFollow);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT user_id from user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  console.log(userId);
  const realUserId = userId.user_id;
  const getUserFollowerQuery = `SELECT user.name as name
  FROM user INNER JOIN follower on user.user_id = follower.follower_user_id
  WHERE follower.following_user_id = ${realUserId};`;
  const getUserFollower = await db.all(getUserFollowerQuery);
  response.send(getUserFollower);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const getUserIdQuery = `SELECT user_id from user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  console.log(userId);
  const realUserId = userId.user_id;
  const getUserFollowQuery = `SELECT user.user_id 
  FROM user INNER JOIN follower on user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${realUserId};`;
  const getUserFollow = await db.all(getUserFollowQuery);
  const getUserId = `SELECT user_id from tweet where tweet_id = ${tweetId};`;
  const tweetUserId = await db.get(getUserId);
  let k = tweetUserId.user_id;
  if (k === []) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let result = -1;
    for (let item of getUserFollow) {
      if (item.user_id === k) {
        result = 1;
        break;
      }
    }
    if (result === -1) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetQuery = `
      SELECT tweet.tweet as tweet,
      COUNT(DISTINCT like.like_id) as likes,
      COUNT(DISTINCT reply.reply_id) as replies,
      tweet.date_time as dateTime
      FROM (tweet JOIN like on tweet.tweet_id = like.tweet_id) as T
      JOIN reply on T.tweet_id = reply.tweet_id
      WHERE tweet.tweet_id = ${tweetId};`;
      const getTweet = await db.get(getTweetQuery);
      response.send(getTweet);
    }
  }
});

const authenticateQuery = async (request, response, next) => {
  const { tweetId } = request.params;
  const username = request.username;
  const getUserIdQuery = `SELECT user_id from user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  //console.log(userId);
  const realUserId = userId.user_id;
  const getUserFollowQuery = `SELECT user.user_id 
  FROM user INNER JOIN follower on user.user_id = follower.follower_user_id
  WHERE follower.following_user_id = ${realUserId};`;
  const getUserFollow = await db.all(getUserFollowQuery);
  const getUserId = `SELECT user_id from tweet where tweet_id = ${tweetId};`;
  const tweetUserId = await db.get(getUserId);
  let k = tweetUserId.user_id;
  if (k === []) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let result = -1;
    for (let item of getUserFollow) {
      if (item.user_id === k) {
        result = 1;
        break;
      }
    }
    if (result === -1) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      next();
    }
  }
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  authenticateQuery,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `
    SELECT DISTINCT(user.username) as username
    FROM (tweet join like on tweet.tweet_id = like.tweet_id) AS T
    join user on user.user_id = T.user_id
    WHERE T.tweet_id = ${tweetId};`;
    const getLikes = await db.all(getLikesQuery);
    let getLikesArray = [];
    for (let item of getLikes) {
      getLikesArray.push(item.username);
    }
    response.send({
      likes: getLikesArray,
    });
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  authenticateQuery,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `
    SELECT DISTINCT(user.name) as name,
    reply.reply as reply
    FROM (tweet join reply on tweet.tweet_id = reply.tweet_id) AS T
    join user on user.user_id = T.user_id
    WHERE T.tweet_id = ${tweetId};`;
    const getReplies = await db.all(getRepliesQuery);
    //console.log(getReplies);
    let getRepliesArray = [];
    for (let item of getReplies) {
      getRepliesArray.push({ name: item.name, reply: item.reply });
    }
    response.send({
      replies: getRepliesArray,
    });
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const getuserId = await db.get(getUserIdQuery);
  const userId = getuserId.user_id;
  const getTweetsQuery = `SELECT tweet.tweet as tweet,
    count(distinct like.like_id) as likes,
    count(distinct reply.reply_id) as replies,
    tweet.date_time as dateTime FROM
    (tweet join like on
    tweet.tweet_id = like.tweet_id) as T 
    join reply on reply.tweet_id = T.tweet_id
    where tweet.user_id = ${userId};`;
  const getTweets = await db.all(getTweetsQuery);
  response.send(getTweets);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;
  const { tweet } = request.body;
  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const getuserId = await db.get(getUserIdQuery);
  const userId = getuserId.user_id;
  const getTweetIdQuery = `SELECT tweet_id from tweet order by tweet_id DESC limit 1;`;
  const getTweetId = await db.get(getTweetIdQuery);
  const tweetId = parseInt(getTweetId.tweet_id) + 1;
  const postTweetQuery = `INSERT INTO tweet(tweet_id,tweet,user_id)
    values(${tweetId},'${tweet}',${userId});`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const getUserIdQuery = `SELECT user_id from user WHERE username = '${username}';`;
    const getuserId = await db.get(getUserIdQuery);
    const userId = getuserId.user_id;
    const getUserTweetsQuery = `SELECT tweet_id from tweet where 
    user_id = ${userId};`;
    const getUserTweets = await db.all(getUserTweetsQuery);
    let k = -1;
    for (let item of getUserTweets) {
      if (item.tweet_id == tweetId) {
        k = 1;
        break;
      }
    }
    if (k === -1) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM TWEET WHERE tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
