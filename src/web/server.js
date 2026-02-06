const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('../utils/logger');

const app = express();

/** @type {import('discord.js').Client|null} */
let discordClient = null;

/** Get the stored Discord client reference. */
function getClient() {
  return discordClient;
}

// ---------------------------------------------------------------------------
// Passport configuration
// ---------------------------------------------------------------------------

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL}/auth/callback`,
      scope: ['identify', 'guilds'],
    },
    (accessToken, refreshToken, profile, done) => {
      return done(null, profile);
    }
  )
);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'https://s2.coinmarketcap.com', 'data:'],
      },
    },
  })
);

app.use(compression());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// ---------------------------------------------------------------------------
// View engine & static files
// ---------------------------------------------------------------------------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Auth middleware helper
// ---------------------------------------------------------------------------

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.redirect('/auth/login');
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

app.use('/auth', authRoutes);
app.use('/', dashboardRoutes);
app.use('/api', apiRoutes);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.use((err, req, res, _next) => {
  logger.error('Web server error', { error: err.message, stack: err.stack });
  res.status(500).send('Internal server error');
});

// ---------------------------------------------------------------------------
// Start function
// ---------------------------------------------------------------------------

/**
 * Start the web dashboard server.
 * @param {import('discord.js').Client} client - The Discord.js client instance
 */
function startWebServer(client) {
  discordClient = client;

  const port = process.env.WEB_PORT || 3000;
  app.listen(port, () => {
    logger.info(`Web dashboard listening on port ${port}`);
  });
}

module.exports = { startWebServer, getClient, ensureAuth, app };
