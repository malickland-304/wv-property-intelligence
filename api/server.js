require('dotenv').config()

const express = require('express')
const session = require('express-session')
const { createClient } = require('redis')
const { RedisStore } = require('connect-redis')

async function start() {
  const app = express()

  const redisClient = createClient({
    url: process.env.REDIS_URL
  })

  redisClient.on('error', (err) => {
    console.error('Redis error:', err)
  })

  await redisClient.connect()

  app.set('trust proxy', 1)

  app.use(
    session({
      store: new RedisStore({ client: redisClient }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7
      }
    })
  )

  app.get('/', (req, res) => {
    req.session.views = (req.session.views || 0) + 1
    res.json({
      ok: true,
      views: req.session.views
    })
  })

  const port = process.env.PORT || 3000
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`)
  })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
